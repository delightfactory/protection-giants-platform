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
  buildOuterRollGtinBarcodeGeometry,
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

function assertPrintableText(value: string, field: string): string {
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
    throw new OuterRollLabelPdfError(`Required label text does not fit the fixed V1 geometry: ${text}`);
  }

  page.drawText(text, { x: xPt, y: yPt, size, font, color });
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
  valueSizePt = 8.5,
) {
  const xPt = originXPt + millimetresToPdfPoints(xMm);
  const yPt = originYPt + millimetresToPdfPoints(yMm);
  page.drawText(label, {
    x: xPt,
    y: yPt + 9,
    size: 5,
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
    5.5,
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

  const productName = assertPrintableText(model.productName, "Product name");
  const productVersion = model.productVersion
    ? assertPrintableText(model.productVersion, "Product version")
    : null;
  const sku = assertPrintableText(model.sku, "SKU");
  const gtin = assertPrintableText(model.gtin, "GTIN");
  const lotNumber = assertPrintableText(model.lotNumber, "Lot number");
  const rollSerial = assertPrintableText(model.rollSerial, "Roll serial");

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
    size: 7.5,
    font: fonts.bold,
    color: WHITE,
  });
  drawFittedText(
    page,
    fonts.bold,
    productName,
    x(template.productName.xMm),
    y(template.productName.yMm),
    millimetresToPdfPoints(template.productName.widthMm),
    18,
    10,
    WHITE,
  );

  if (productVersion) {
    drawFittedText(
      page,
      fonts.bold,
      productVersion,
      x(template.productVersion.xMm),
      y(template.productVersion.yMm),
      millimetresToPdfPoints(template.productVersion.widthMm),
      9,
      6,
      WHITE,
    );
  }
  page.drawText("PPF / OUTER ROLL", {
    x: x(template.sideLabel.xMm),
    y: y(template.sideLabel.yMm),
    size: 5.5,
    font: fonts.regular,
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
    9,
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
    9,
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
    9,
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
    8.25,
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
    7.2,
  );

  const barcode = buildOuterRollGtinBarcodeGeometry(
    gtin,
    template.barcodeBox.widthMm,
    template.barcodeBox.heightMm,
  );
  drawVectorGeometry(
    page,
    barcode.geometry,
    {
      xPt: x(template.barcodeBox.xMm),
      yPt: y(template.barcodeBox.yMm),
      widthPt: millimetresToPdfPoints(template.barcodeBox.widthMm),
      heightPt: millimetresToPdfPoints(template.barcodeBox.heightMm),
    },
    "physical-max",
  );

  page.drawText(`GTIN ${gtin}`, {
    x: x(template.gtinLabel.xMm),
    y: y(template.gtinLabel.yMm),
    size: 5.5,
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
    size: 5.5,
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

  page.drawText("SCAN ROLL", {
    x: x(template.scanLabel.xMm),
    y: y(template.scanLabel.yMm),
    size: 5,
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
    pdfDoc.embedFont(StandardFonts.HelveticaBold),
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
