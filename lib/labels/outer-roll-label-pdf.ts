import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";

import type { QrVectorGeometry } from "../qr/qr-vector";
import type { OuterRollLabelViewModel } from "./outer-roll-label-plan";
import {
  OUTER_ROLL_MACHINE_CODE_RENDER_SCALE,
  buildOuterRollProductBarcodeGeometry,
  buildOuterRollQrGeometry,
  type BwipVectorGeometry,
} from "./outer-roll-machine-codes";
import { OUTER_ROLL_LABEL_TEMPLATE } from "./outer-roll-label-template";
import type { OuterRollPrintLayoutPlan } from "./outer-roll-print-layout";

const POINTS_PER_MM = 72 / 25.4;
const BLACK = rgb(0, 0, 0);
const WHITE = rgb(1, 1, 1);
const MUTED = rgb(0.34, 0.34, 0.34);
const FIXED_METADATA_DATE = new Date("2000-01-01T00:00:00.000Z");

export type OuterRollLabelPdfFonts = {
  regular: PDFFont;
  bold: PDFFont;
};

export class OuterRollLabelPdfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OuterRollLabelPdfError";
  }
}

export function millimetresToPdfPoints(value: number): number {
  return value * POINTS_PER_MM;
}

import { embedCairoBoldFont } from "./fonts/cairo-bold-font";
import { drawMixedText } from "./warranty-qr-label-pdf";

function assertPrintableProductName(value: string): string {
  if (!value || typeof value !== "string") {
    throw new OuterRollLabelPdfError("Product name is required for outer-roll-label-v1.");
  }
  const trimmed = value.trim();
  if (trimmed.length < 2 || trimmed.length > 120) {
    throw new OuterRollLabelPdfError(
      "Product name length must be between 2 and 120 characters to satisfy authoritative Product contract."
    );
  }
  return trimmed;
}

function assertPrintableProductVersion(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    throw new OuterRollLabelPdfError("Product version must be a string if provided.");
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > 80) {
    throw new OuterRollLabelPdfError(
      "Product version length cannot exceed 80 characters to satisfy authoritative Product contract."
    );
  }
  return trimmed;
}


function assertPrintableCode(value: string, field: string): string {
  if (!value || !/^[\x20-\x7E]+$/.test(value)) {
    throw new OuterRollLabelPdfError(
      `${field} contains unsupported print characters for outer-roll-label-v1.`,
    );
  }
  return value;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new OuterRollLabelPdfError("Outer Roll label contains a non-finite Product measurement.");
  }
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
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
): number {
  let size = maxSizePt;
  while (size > minSizePt && font.widthOfTextAtSize(text, size) > maxWidthPt) {
    size -= 0.25;
  }

  if (font.widthOfTextAtSize(text, size) > maxWidthPt) {
    throw new OuterRollLabelPdfError(
      `Required label text does not fit the fixed V1 geometry at minimum size ${minSizePt}pt: ${text}`
    );
  }

  drawMixedText(page, font, text, xPt, yPt, size, color);
  return size;
}

function drawField(
  page: PDFPage,
  fonts: OuterRollLabelPdfFonts,
  originXPt: number,
  originYPt: number,
  label: string,
  value: string,
  xMm: number,
  yMm: number,
  widthMm: number,
  valueSizePt = 12,
  minValueSizePt = 5,
) {
  const xPt = originXPt + millimetresToPdfPoints(xMm);
  const yPt = originYPt + millimetresToPdfPoints(yMm);
  const labelSizePt = 6.5;
  const labelYPt = yPt + Math.max(valueSizePt * 0.9, 11.5);
  page.drawText(label, {
    x: xPt,
    y: labelYPt,
    size: labelSizePt,
    font: fonts.bold,
    color: MUTED,
  });
  drawFittedText(
    page,
    fonts.bold,
    value,
    xPt,
    yPt,
    millimetresToPdfPoints(widthMm),
    valueSizePt,
    minValueSizePt,
  );
}

function polygonPath(points: readonly [number, number][]): string {
  const first = points[0];
  if (!first) throw new OuterRollLabelPdfError("Machine-code polygon has no points.");
  return [
    `M ${first[0]} ${first[1]}`,
    ...points.slice(1).map(([x, y]) => `L ${x} ${y}`),
    "Z",
  ].join(" ");
}

function drawVectorGeometry(
  page: PDFPage,
  geometry: BwipVectorGeometry,
  box: { xPt: number; yPt: number; widthPt: number; heightPt: number },
  mode: "physical-max" | "fit",
) {
  if (!(geometry.width > 0) || !(geometry.height > 0)) {
    throw new OuterRollLabelPdfError("Machine-code vector geometry has invalid dimensions.");
  }

  const naturalPointScale = 1 / OUTER_ROLL_MACHINE_CODE_RENDER_SCALE;
  const fitPointScale = Math.min(box.widthPt / geometry.width, box.heightPt / geometry.height);
  const pointScale = mode === "fit"
    ? fitPointScale
    : Math.min(naturalPointScale, fitPointScale);

  if (!(pointScale > 0) || !Number.isFinite(pointScale)) {
    throw new OuterRollLabelPdfError("Machine-code vector geometry cannot fit the fixed label box.");
  }

  const renderedWidthPt = geometry.width * pointScale;
  const renderedHeightPt = geometry.height * pointScale;
  const offsetXPt = box.xPt + (box.widthPt - renderedWidthPt) / 2;
  const offsetYPt = box.yPt + (box.heightPt - renderedHeightPt) / 2;
  const topYPt = offsetYPt + renderedHeightPt;

  for (const line of geometry.lines) {
    const lineWidthPt = Math.max(line.lineWidth * pointScale, 0.2);
    const x0Pt = offsetXPt + line.x0 * pointScale;
    const x1Pt = offsetXPt + line.x1 * pointScale;
    const y0Pt = topYPt - line.y0 * pointScale;
    const y1Pt = topYPt - line.y1 * pointScale;

    if (Math.abs(x0Pt - x1Pt) < 0.001) {
      page.drawRectangle({
        x: x0Pt - lineWidthPt / 2,
        y: Math.min(y0Pt, y1Pt),
        width: lineWidthPt,
        height: Math.max(Math.abs(y1Pt - y0Pt), 0.2),
        color: BLACK,
      });
    } else if (Math.abs(y0Pt - y1Pt) < 0.001) {
      page.drawRectangle({
        x: Math.min(x0Pt, x1Pt),
        y: y0Pt - lineWidthPt / 2,
        width: Math.max(Math.abs(x1Pt - x0Pt), 0.2),
        height: lineWidthPt,
        color: BLACK,
      });
    } else {
      page.drawLine({
        start: { x: x0Pt, y: y0Pt },
        end: { x: x1Pt, y: y1Pt },
        thickness: lineWidthPt,
        color: BLACK,
      });
    }
  }

  for (const polygon of geometry.polygons) {
    page.drawSvgPath(polygonPath(polygon.points), {
      x: offsetXPt,
      y: topYPt,
      scale: pointScale,
      color: BLACK,
    });
  }
}

function drawQrVectorGeometry(
  page: PDFPage,
  geometry: QrVectorGeometry,
  box: { xPt: number; yPt: number; widthPt: number; heightPt: number },
) {
  if (!(geometry.width > 0) || !(geometry.height > 0) || geometry.fills.length === 0) {
    throw new OuterRollLabelPdfError("QR vector geometry has invalid dimensions or no filled paths.");
  }

  const pointScale = Math.min(box.widthPt / geometry.width, box.heightPt / geometry.height);
  if (!(pointScale > 0) || !Number.isFinite(pointScale)) {
    throw new OuterRollLabelPdfError("QR vector geometry cannot fit the fixed label box.");
  }

  const renderedWidthPt = geometry.width * pointScale;
  const renderedHeightPt = geometry.height * pointScale;
  const offsetXPt = box.xPt + (box.widthPt - renderedWidthPt) / 2;
  const offsetYPt = box.yPt + (box.heightPt - renderedHeightPt) / 2;
  const topYPt = offsetYPt + renderedHeightPt;

  for (const fill of geometry.fills) {
    page.drawSvgPath(fill.path, {
      x: offsetXPt,
      y: topYPt,
      scale: pointScale,
      color: BLACK,
    });
  }
}

function drawOuterProductName(
  page: PDFPage,
  font: PDFFont,
  productName: string,
  xPt: number,
  baseYPt: number,
  maxWidthPt: number,
) {
  let singleLineSize = 18;
  while (singleLineSize >= 11 && font.widthOfTextAtSize(productName, singleLineSize) > maxWidthPt) {
    singleLineSize -= 0.5;
  }

  if (font.widthOfTextAtSize(productName, singleLineSize) <= maxWidthPt) {
    drawMixedText(page, font, productName, xPt, baseYPt, singleLineSize, WHITE);
    return;
  }

  const words = productName.split(/\s+/).filter(Boolean);
  let bestSplit = 1;
  let minDiff = Infinity;

  if (words.length <= 1) {
    const token = words[0] || productName;
    const mid = Math.ceil(token.length / 2);
    const l1 = token.slice(0, mid);
    const l2 = token.slice(mid);
    let size = 11;
    while (
      size > 5.5 &&
      (font.widthOfTextAtSize(l1, size) > maxWidthPt || font.widthOfTextAtSize(l2, size) > maxWidthPt)
    ) {
      size -= 0.25;
    }
    if (font.widthOfTextAtSize(l1, size) > maxWidthPt || font.widthOfTextAtSize(l2, size) > maxWidthPt) {
      throw new OuterRollLabelPdfError(
        `Product name "${productName}" does not fit Outer Roll label header at minimum 5.5pt.`
      );
    }
    const lineSpacing = Math.max(size * 1.2, 11);
    drawMixedText(page, font, l1, xPt, baseYPt + lineSpacing * 0.45, size, WHITE);
    drawMixedText(page, font, l2, xPt, baseYPt - lineSpacing * 0.55, size, WHITE);
    return;
  }

  for (let i = 1; i < words.length; i++) {
    const l1 = words.slice(0, i).join(" ");
    const l2 = words.slice(i).join(" ");
    const w1 = font.widthOfTextAtSize(l1, 10);
    const w2 = font.widthOfTextAtSize(l2, 10);
    const diff = Math.abs(w1 - w2);
    if (diff < minDiff) {
      minDiff = diff;
      bestSplit = i;
    }
  }

  const line1 = words.slice(0, bestSplit).join(" ");
  const line2 = words.slice(bestSplit).join(" ");

  let size = 11;
  while (
    size > 5.5 &&
    (font.widthOfTextAtSize(line1, size) > maxWidthPt || font.widthOfTextAtSize(line2, size) > maxWidthPt)
  ) {
    size -= 0.25;
  }

  if (font.widthOfTextAtSize(line1, size) > maxWidthPt || font.widthOfTextAtSize(line2, size) > maxWidthPt) {
    throw new OuterRollLabelPdfError(
      `Product name "${productName}" does not fit Outer Roll label header at minimum 5.5pt.`
    );
  }

  const lineSpacing = Math.max(size * 1.2, 11);
  drawMixedText(page, font, line1, xPt, baseYPt + lineSpacing * 0.45, size, WHITE);
  drawMixedText(page, font, line2, xPt, baseYPt - lineSpacing * 0.55, size, WHITE);
}

function drawOuterProductVersion(
  page: PDFPage,
  font: PDFFont,
  productVersion: string,
  xPt: number,
  baseYPt: number,
  maxWidthPt: number,
) {
  let singleLineSize = 11;
  while (singleLineSize >= 8 && font.widthOfTextAtSize(productVersion, singleLineSize) > maxWidthPt) {
    singleLineSize -= 0.25;
  }

  if (font.widthOfTextAtSize(productVersion, singleLineSize) <= maxWidthPt) {
    drawMixedText(page, font, productVersion, xPt, baseYPt, singleLineSize, WHITE);
    return;
  }

  const words = productVersion.split(/\s+/).filter(Boolean);
  let bestLayout: { lines: string[]; size: number; lineHeight: number } | null = null;
  const maxHeightPt = 32;

  for (let size = 8; size >= 4.5; size -= 0.25) {
    const lineHeight = Math.max(size * 1.25, 6);
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
          if (currentLine) lines.push(currentLine);
          currentLine = word;
        }
      }
      if (lines.length > maxAllowedLines) {
        fits = false;
        break;
      }
    }
    if (currentLine) lines.push(currentLine);

    if (fits && lines.length <= maxAllowedLines) {
      const allLinesFit = lines.every((l) => font.widthOfTextAtSize(l, size) <= maxWidthPt);
      if (allLinesFit) {
        bestLayout = { lines, size, lineHeight };
        break;
      }
    }
  }

  if (!bestLayout || bestLayout.lines.length === 0) {
    throw new OuterRollLabelPdfError(
      `Product version "${productVersion}" does not fit Outer Roll label header at minimum 4.5pt.`
    );
  }

  const { lines, size, lineHeight } = bestLayout;
  const totalHeight = (lines.length - 1) * lineHeight;
  const startY = baseYPt + totalHeight / 2;

  for (let i = 0; i < lines.length; i++) {
    const yLine = startY - i * lineHeight;
    drawMixedText(page, font, lines[i], xPt, yLine, size, WHITE);
  }
}

function drawFixedOuterRollLabel(
  page: PDFPage,
  fonts: OuterRollLabelPdfFonts,
  model: OuterRollLabelViewModel,
  originXPt: number,
  originYPt: number,
) {
  const template = OUTER_ROLL_LABEL_TEMPLATE;
  const labelWidthPt = millimetresToPdfPoints(template.widthMm);
  const labelHeightPt = millimetresToPdfPoints(template.heightMm);
  const x = (mm: number) => originXPt + millimetresToPdfPoints(mm);
  const y = (mm: number) => originYPt + millimetresToPdfPoints(mm);

  const productName = assertPrintableProductName(model.productName);
  const productVersion = assertPrintableProductVersion(model.productVersion);
  const sku = assertPrintableCode(model.sku, "SKU");
  const barcode = assertPrintableCode(model.gtin, "Product Barcode");
  const lotNumber = assertPrintableCode(model.lotNumber, "Lot number");
  const rollSerial = assertPrintableCode(model.rollSerial, "Roll serial");

  page.drawRectangle({
    x: originXPt,
    y: originYPt,
    width: labelWidthPt,
    height: labelHeightPt,
    color: WHITE,
    borderColor: BLACK,
    borderWidth: 0.6,
  });

  page.drawRectangle({
    x: originXPt,
    y: y(template.headerDividerYMm),
    width: labelWidthPt,
    height: millimetresToPdfPoints(template.heightMm - template.headerDividerYMm),
    color: BLACK,
  });

  page.drawText("PROTECTION GIANTS", {
    x: x(template.brandLabel.xMm),
    y: y(template.brandLabel.yMm),
    size: 9.5,
    font: fonts.bold,
    color: WHITE,
  });

  drawOuterProductName(
    page,
    fonts.bold,
    productName,
    x(template.productName.xMm),
    y(template.productName.yMm),
    millimetresToPdfPoints(template.productName.widthMm),
  );

  if (productVersion) {
    drawOuterProductVersion(
      page,
      fonts.bold,
      productVersion,
      x(template.productVersion.xMm),
      y(template.productVersion.yMm),
      millimetresToPdfPoints(template.productVersion.widthMm),
    );
  }

  page.drawText("PPF / OUTER ROLL", {
    x: x(template.sideLabel.xMm),
    y: y(template.sideLabel.yMm),
    size: 7.5,
    font: fonts.bold,
    color: WHITE,
  });

  page.drawLine({
    start: { x: x(template.safeInsetMm), y: y(template.footerDividerYMm) },
    end: { x: x(template.widthMm - template.safeInsetMm), y: y(template.footerDividerYMm) },
    thickness: 0.5,
    color: BLACK,
  });

  drawField(
    page,
    fonts,
    originXPt,
    originYPt,
    "SKU",
    sku,
    template.fields.sku.xMm,
    template.fields.sku.yMm,
    template.fields.sku.widthMm,
    12.5,
    5,
  );
  drawField(
    page,
    fonts,
    originXPt,
    originYPt,
    "SIZE",
    `${formatNumber(model.widthMm)} mm x ${formatNumber(model.lengthM)} m`,
    template.fields.size.xMm,
    template.fields.size.yMm,
    template.fields.size.widthMm,
    12,
    6,
  );
  drawField(
    page,
    fonts,
    originXPt,
    originYPt,
    "THICKNESS",
    `${formatNumber(model.thicknessMil)} mil`,
    template.fields.thickness.xMm,
    template.fields.thickness.yMm,
    template.fields.thickness.widthMm,
    12,
    6,
  );
  drawField(
    page,
    fonts,
    originXPt,
    originYPt,
    "LOT",
    lotNumber,
    template.fields.lot.xMm,
    template.fields.lot.yMm,
    template.fields.lot.widthMm,
    11.5,
    5,
  );
  drawField(
    page,
    fonts,
    originXPt,
    originYPt,
    "ROLL",
    rollSerial,
    template.fields.roll.xMm,
    template.fields.roll.yMm,
    template.fields.roll.widthMm,
    12.5,
    5,
  );

  const barcodeVector = buildOuterRollProductBarcodeGeometry(
    barcode,
    template.barcodeBox.widthMm,
    template.barcodeBox.heightMm,
  );
  drawVectorGeometry(
    page,
    barcodeVector.geometry,
    {
      xPt: x(template.barcodeBox.xMm),
      yPt: y(template.barcodeBox.yMm),
      widthPt: millimetresToPdfPoints(template.barcodeBox.widthMm),
      heightPt: millimetresToPdfPoints(template.barcodeBox.heightMm),
    },
    "physical-max",
  );

  page.drawText(`BARCODE ${barcode}`, {
    x: x(template.gtinLabel.xMm),
    y: y(template.gtinLabel.yMm),
    size: 7.5,
    font: fonts.bold,
    color: BLACK,
  });

  const quietBox = template.qrQuietBox;
  page.drawRectangle({
    x: x(quietBox.xMm),
    y: y(quietBox.yMm),
    width: millimetresToPdfPoints(quietBox.widthMm),
    height: millimetresToPdfPoints(quietBox.heightMm),
    color: WHITE,
  });
  page.drawText("ROLL QR", {
    x: x(template.qrLabel.xMm),
    y: y(template.qrLabel.yMm),
    size: 7,
    font: fonts.bold,
    color: MUTED,
  });

  const qrGeometry = buildOuterRollQrGeometry(model.qrPayload);
  const qrInnerMm = quietBox.widthMm - template.qrInsetMm * 2;
  drawQrVectorGeometry(
    page,
    qrGeometry,
    {
      xPt: x(quietBox.xMm + template.qrInsetMm),
      yPt: y(quietBox.yMm + template.qrInsetMm),
      widthPt: millimetresToPdfPoints(qrInnerMm),
      heightPt: millimetresToPdfPoints(qrInnerMm),
    },
  );

  const scanText = "SCAN ROLL";
  const scanSize = 6.5;
  const scanWidthPt = fonts.bold.widthOfTextAtSize(scanText, scanSize);
  const quietBoxPt = millimetresToPdfPoints(quietBox.widthMm);
  const scanXPt = x(quietBox.xMm) + (quietBoxPt - scanWidthPt) / 2;
  page.drawText(scanText, {
    x: scanXPt,
    y: y(template.scanLabel.yMm),
    size: scanSize,
    font: fonts.bold,
    color: MUTED,
  });
}

async function createPdfDocument(title: string): Promise<{ pdfDoc: PDFDocument; fonts: OuterRollLabelPdfFonts }> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(title);
  pdfDoc.setSubject("Protection Giants outer Roll identity label");
  pdfDoc.setCreator("Protection Giants Platform");
  pdfDoc.setProducer("Protection Giants Platform / pdf-lib");
  pdfDoc.setCreationDate(FIXED_METADATA_DATE);
  pdfDoc.setModificationDate(FIXED_METADATA_DATE);

  const [regular, bold] = await Promise.all([
    pdfDoc.embedFont(StandardFonts.Helvetica),
    embedCairoBoldFont(pdfDoc),
  ]);

  return { pdfDoc, fonts: { regular, bold } };
}

export async function renderOuterRollLabelMasterPdf(
  model: OuterRollLabelViewModel,
): Promise<Uint8Array> {
  const { pdfDoc, fonts } = await createPdfDocument(`Outer Roll Label ${model.rollSerial}`);
  const page = pdfDoc.addPage([
    millimetresToPdfPoints(OUTER_ROLL_LABEL_TEMPLATE.widthMm),
    millimetresToPdfPoints(OUTER_ROLL_LABEL_TEMPLATE.heightMm),
  ]);
  drawFixedOuterRollLabel(page, fonts, model, 0, 0);
  return pdfDoc.save();
}

export async function renderOuterRollPrintPdf(
  layout: OuterRollPrintLayoutPlan,
): Promise<Uint8Array> {
  const placementCount = layout.pages.reduce((count, page) => count + page.placements.length, 0);
  if (placementCount !== layout.labelCount) {
    throw new OuterRollLabelPdfError("Print layout label count does not match its placements.");
  }

  const { pdfDoc, fonts } = await createPdfDocument(`Outer Roll Labels / ${layout.profile.id}`);
  const pageWidthPt = millimetresToPdfPoints(layout.profile.mediaWidthMm);
  const pageHeightPt = millimetresToPdfPoints(layout.profile.mediaHeightMm);

  for (const pagePlan of layout.pages) {
    const page = pdfDoc.addPage([pageWidthPt, pageHeightPt]);
    for (const placement of pagePlan.placements) {
      drawFixedOuterRollLabel(
        page,
        fonts,
        placement.model,
        millimetresToPdfPoints(placement.xMm),
        millimetresToPdfPoints(placement.yMm),
      );
    }
  }

  return pdfDoc.save();
}
