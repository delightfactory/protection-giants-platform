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

function printable(value: string, field: string): string {
  if (!value || !/^[\x20-\x7E]+$/.test(value)) {
    throw new WarrantyQrLabelPdfError(`${field} contains unsupported print characters for warranty-qr-label-v1.`);
  }
  return value;
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
  page.drawText(text, { x: xPt, y: yPt, size, font, color });
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
    pdfDoc.embedFont(StandardFonts.HelveticaBold),
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
    size: 7,
    font: bold,
    color: WHITE,
  });

  page.drawText("WARRANTY", {
    x: mm(template.title.xMm),
    y: mm(template.title.yMm),
    size: 13,
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
  drawFittedText(
    page,
    regular,
    productName,
    mm(template.productName.xMm),
    mm(template.productName.yMm),
    mm(template.productName.widthMm),
    7.5,
    5.25,
    BLACK,
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
    size: 5.25,
    font: regular,
    color: MUTED,
  });

  return pdfDoc.save();
}
