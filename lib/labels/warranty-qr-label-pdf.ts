import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import { buildQrVectorGeometry, type QrVectorGeometry } from "../qr/qr-vector";
import type { WarrantyQrLabelViewModel } from "./warranty-qr-label-plan";
import { WARRANTY_QR_LABEL_TEMPLATE } from "./warranty-qr-label-template";

const POINTS_PER_MM = 72 / 25.4;
const BLACK = rgb(0, 0, 0);
const WHITE = rgb(1, 1, 1);
const MUTED = rgb(0.34, 0.34, 0.34);
const FIXED_METADATA_DATE = new Date("2000-01-01T00:00:00.000Z");

export class WarrantyQrLabelPdfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WarrantyQrLabelPdfError";
  }
}

function mm(value: number): number {
  return value * POINTS_PER_MM;
}

import { embedCairoBoldFont } from "./fonts/cairo-bold-font";

function printable(value: string, field: string): string {
  if (!value || typeof value !== "string") {
    throw new WarrantyQrLabelPdfError(`${field} is required for warranty-qr-label-v1.`);
  }
  const trimmed = value.trim();
  if (trimmed.length < 2 || trimmed.length > 120) {
    throw new WarrantyQrLabelPdfError(
      `${field} length must be between 2 and 120 characters to satisfy authoritative Product contract.`
    );
  }
  return trimmed;
}

import { getVisualRuns } from "./bidi";

export function drawMixedText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  xPt: number,
  yPt: number,
  size: number,
  color = BLACK,
) {
  const runs = getVisualRuns(text);
  let curX = xPt;
  for (const run of runs) {
    page.drawText(run.text, { x: curX, y: yPt, size, font, color });
    curX += font.widthOfTextAtSize(run.text, size);
  }
}


function drawFittedText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  xPt: number,
  yPt: number,
  maxWidthPt: number,
  maxSizePt: number,
  minSizePt: number,
  color = BLACK,
) {
  let size = maxSizePt;
  while (size > minSizePt && font.widthOfTextAtSize(text, size) > maxWidthPt) size -= 0.25;
  if (font.widthOfTextAtSize(text, size) > maxWidthPt) {
    throw new WarrantyQrLabelPdfError(`Required Warranty sticker text does not fit: ${text}`);
  }
  drawMixedText(page, font, text, xPt, yPt, size, color);
}

function drawQrGeometry(
  page: PDFPage,
  geometry: QrVectorGeometry,
  box: { xPt: number; yPt: number; widthPt: number; heightPt: number },
) {
  if (!(geometry.width > 0) || geometry.width !== geometry.height || geometry.fills.length === 0) {
    throw new WarrantyQrLabelPdfError("Warranty QR vector geometry is invalid.");
  }

  const scale = Math.min(box.widthPt / geometry.width, box.heightPt / geometry.height);
  if (!(scale > 0) || !Number.isFinite(scale)) {
    throw new WarrantyQrLabelPdfError("Warranty QR cannot fit the configured proof box.");
  }

  const renderedWidth = geometry.width * scale;
  const renderedHeight = geometry.height * scale;
  const offsetX = box.xPt + (box.widthPt - renderedWidth) / 2;
  const offsetY = box.yPt + (box.heightPt - renderedHeight) / 2;
  const topY = offsetY + renderedHeight;

  page.drawRectangle({
    x: box.xPt,
    y: box.yPt,
    width: box.widthPt,
    height: box.heightPt,
    color: WHITE,
  });

  for (const fill of geometry.fills) {
    page.drawSvgPath(fill.path, {
      x: offsetX,
      y: topY,
      scale,
      color: BLACK,
    });
  }
}

export function layoutWarrantyProductName(
  productName: string,
  font: PDFFont,
  maxWidthPt: number,
  maxHeightPt: number,
  minSizePt = 5.5,
  maxSizePt = 8.5,
): { lines: string[]; size: number; lineHeight: number } {
  const text = printable(productName, "Product name");
  const words = text.split(/\s+/).filter(Boolean);

  let bestLayout: { lines: string[]; size: number; lineHeight: number } | null = null;

  for (let size = maxSizePt; size >= minSizePt; size -= 0.25) {
    const lineHeight = Math.max(size * 1.25, 6.5);
    const maxAllowedLines = Math.floor(maxHeightPt / lineHeight);
    const lines: string[] = [];
    let currentLine = "";
    let fits = true;

    for (const word of words) {
      if (font.widthOfTextAtSize(word, size) > maxWidthPt) {
        if (currentLine) {
          lines.push(currentLine);
          currentLine = "";
        }
        let tokenPart = "";
        for (const char of word) {
          if (font.widthOfTextAtSize(tokenPart + char, size) <= maxWidthPt) {
            tokenPart += char;
          } else {
            if (tokenPart) lines.push(tokenPart);
            tokenPart = char;
          }
        }
        if (tokenPart) {
          currentLine = tokenPart;
        }
      } else {
        const candidate = currentLine ? `${currentLine} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= maxWidthPt) {
          currentLine = candidate;
        } else {
          lines.push(currentLine);
          currentLine = word;
        }
      }

      if (lines.length > maxAllowedLines) {
        fits = false;
        break;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    if (fits && lines.length <= maxAllowedLines && lines.length * lineHeight <= maxHeightPt) {
      bestLayout = { size, lines, lineHeight };
      break;
    }
  }

  if (!bestLayout) {
    throw new WarrantyQrLabelPdfError(
      `Product name "${text}" cannot fit within ${maxWidthPt.toFixed(1)}pt x ${maxHeightPt.toFixed(1)}pt ` +
        `even at minimum readable font size ${minSizePt}pt.`
    );
  }

  // Strict final geometry assertions
  if (bestLayout.lines.length === 0 || bestLayout.lines.length > 5) {
    throw new WarrantyQrLabelPdfError("Layout exceeded maximum allowable line count (5 lines).");
  }
  for (const line of bestLayout.lines) {
    const lineWidth = font.widthOfTextAtSize(line, bestLayout.size);
    if (lineWidth > maxWidthPt) {
      throw new WarrantyQrLabelPdfError(
        `Final-fit assertion failed: line "${line}" width ${lineWidth.toFixed(1)}pt exceeds maxWidth ${maxWidthPt.toFixed(1)}pt.`
      );
    }
  }

  return bestLayout;
}

export function drawWarrantyProductName(
  page: PDFPage,
  font: PDFFont,
  productName: string,
  xPt: number,
  baseYPt: number,
  maxWidthPt: number,
  maxHeightPt = mm(14.5),
): { lines: string[]; size: number } {
  const { lines, size, lineHeight } = layoutWarrantyProductName(
    productName,
    font,
    maxWidthPt,
    maxHeightPt,
  );

  const totalBlockHeight = (lines.length - 1) * lineHeight;
  const startY = baseYPt + totalBlockHeight * 0.5;

  lines.forEach((line, index) => {
    const lineY = startY - index * lineHeight;
    if (lineY < mm(3.0)) {
      throw new WarrantyQrLabelPdfError(
        `Final-fit assertion failed: line ${index + 1} y-coordinate ${lineY.toFixed(1)}pt falls below safe bottom inset.`
      );
    }
    drawMixedText(page, font, line, xPt, lineY, size, BLACK);
  });

  return { lines, size };
}

export async function renderWarrantyQrLabelMasterPdf(
  model: WarrantyQrLabelViewModel,
): Promise<Uint8Array> {
  const template = WARRANTY_QR_LABEL_TEMPLATE;
  const productName = printable(model.productName, "Product name");
  const geometry = buildQrVectorGeometry(model.qrPayload);
  if (geometry.quietZoneModules !== 4) {
    throw new WarrantyQrLabelPdfError("Warranty QR must preserve the shared four-module quiet zone.");
  }

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle("Protection Giants Warranty QR Label");
  pdfDoc.setSubject("Protection Giants permanent customer Warranty QR sticker");
  pdfDoc.setCreator("Protection Giants Platform");
  pdfDoc.setProducer("Protection Giants Platform / pdf-lib");
  pdfDoc.setCreationDate(FIXED_METADATA_DATE);
  pdfDoc.setModificationDate(FIXED_METADATA_DATE);

  const [regular, bold] = await Promise.all([
    pdfDoc.embedFont(StandardFonts.Helvetica),
    embedCairoBoldFont(pdfDoc),
  ]);

  const page = pdfDoc.addPage([mm(template.widthMm), mm(template.heightMm)]);
  page.drawRectangle({
    x: 0,
    y: 0,
    width: mm(template.widthMm),
    height: mm(template.heightMm),
    color: WHITE,
    borderColor: BLACK,
    borderWidth: 0.7,
  });

  page.drawRectangle({
    x: 0,
    y: mm(34),
    width: mm(34),
    height: mm(11),
    color: BLACK,
  });
  page.drawText("PROTECTION GIANTS", {
    x: mm(template.brand.xMm),
    y: mm(template.brand.yMm),
    size: 7.2,
    font: bold,
    color: WHITE,
  });

  page.drawText("WARRANTY", {
    x: mm(template.title.xMm),
    y: mm(template.title.yMm),
    size: 13.5,
    font: bold,
    color: BLACK,
  });
  page.drawText("SCAN TO VERIFY", {
    x: mm(template.instruction.xMm),
    y: mm(template.instruction.yMm),
    size: 7.5,
    font: bold,
    color: MUTED,
  });

  drawWarrantyProductName(
    page,
    bold,
    productName,
    mm(template.productName.xMm),
    mm(template.productName.yMm),
    mm(template.productName.widthMm),
  );

  drawQrGeometry(page, geometry, {
    xPt: mm(template.qrQuietBox.xMm),
    yPt: mm(template.qrQuietBox.yMm),
    widthPt: mm(template.qrQuietBox.widthMm),
    heightPt: mm(template.qrQuietBox.heightMm),
  });
  page.drawText("protectiongiants.com", {
    x: mm(template.qrCaption.xMm),
    y: mm(template.qrCaption.yMm),
    size: 6,
    font: regular,
    color: MUTED,
  });

  return pdfDoc.save();
}
