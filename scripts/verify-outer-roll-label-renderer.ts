import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";

import {
  buildOuterRollProductBarcodeGeometry,
  buildOuterRollQrVector,
} from "../lib/labels/outer-roll-machine-codes";
import {
  millimetresToPdfPoints,
  renderOuterRollLabelMasterPdf,
  renderOuterRollPrintPdf,
} from "../lib/labels/outer-roll-label-pdf";
import { planOuterRollPrintLayout } from "../lib/labels/outer-roll-print-layout";
import type { OuterRollLabelViewModel } from "../lib/labels/outer-roll-label-plan";
import { QR_QUIET_ZONE_MODULES } from "../lib/qr/qr-vector";

function model(index: number): OuterRollLabelViewModel {
  const suffix = String(index).padStart(4, "0");
  const rollSerial = `PG-R-20260814-00000001-01-${suffix}`;
  return {
    templateId: "outer-roll-label-v1",
    productName: "AI Pro",
    productVersion: "7.5 mil",
    sku: "AI-PRO-75",
    gtin: "1234567890",
    widthMm: 1524,
    lengthM: 15,
    thicknessMil: 7.5,
    productionOrderNumber: "PG-PO-20260814-00000001",
    productionDate: "2026-08-14",
    lotNumber: "PG-L-20260814-00000001-01",
    lotSequence: 1,
    rollId: `44444444-4444-4444-8444-${String(index).padStart(12, "0")}`,
    rollSerial,
    rollIndex: index,
    qrPayload: `https://platform.example/r/${rollSerial}`,
  };
}

async function main() {
  for (const barcodeValue of [
    "1234567890",
    "4006381333932",
    "000012345678",
    "12345678901234567890123456789012",
  ]) {
    const barcode = buildOuterRollProductBarcodeGeometry(barcodeValue);
    assert.equal(barcode.payload, barcodeValue, "Linear barcode payload must remain the exact V1 Product Barcode.");
    assert.equal(barcode.symbology, "code128");
    assert.ok(barcode.geometry.width > 0 && barcode.geometry.height > 0);
    assert.ok(barcode.geometry.lines.length + barcode.geometry.polygons.length > 0);
  }

  assert.throws(() => buildOuterRollProductBarcodeGeometry(""));
  assert.throws(() => buildOuterRollProductBarcodeGeometry("ABC123"));
  assert.throws(() => buildOuterRollProductBarcodeGeometry("123456789012345678901234567890123"));

  const qrPayload = model(1).qrPayload;
  const qr = buildOuterRollQrVector(qrPayload);
  assert.equal(qr.payload, qrPayload, "QR vector payload must remain the exact contextual Roll URL.");
  assert.ok(qr.geometry.width > 0 && qr.geometry.height > 0);
  assert.ok(qr.geometry.fills.length > 0, "QR must be represented by compound vector fill paths.");
  assert.equal(qr.geometry.quietZoneModules, QR_QUIET_ZONE_MODULES);
  assert.equal(qr.geometry.quietZone, qr.geometry.moduleSize * QR_QUIET_ZONE_MODULES);
  assert.ok(
    qr.geometry.fills.some((fill) => (fill.path.match(/\bM\b/g) ?? []).length > 1),
    "QR must preserve multiple polygon subpaths within a single non-zero fill.",
  );

  const masterA = await renderOuterRollLabelMasterPdf(model(1));
  const masterB = await renderOuterRollLabelMasterPdf(model(1));
  assert.equal(Buffer.from(masterA).subarray(0, 4).toString("ascii"), "%PDF");
  assert.deepEqual(Buffer.from(masterA), Buffer.from(masterB), "Unchanged Roll master reprint must be byte-deterministic.");

  const masterDoc = await PDFDocument.load(masterA);
  assert.equal(masterDoc.getPageCount(), 1);
  const masterPage = masterDoc.getPage(0);
  assert.ok(Math.abs(masterPage.getWidth() - millimetresToPdfPoints(150)) < 0.01);
  assert.ok(Math.abs(masterPage.getHeight() - millimetresToPdfPoints(100)) < 0.01);

  const profile = {
    id: "synthetic-ci-2x2",
    mediaWidthMm: 310,
    mediaHeightMm: 210,
    marginTopMm: 0,
    marginRightMm: 0,
    marginBottomMm: 0,
    marginLeftMm: 0,
    gapXMm: 10,
    gapYMm: 10,
  };
  const layout = planOuterRollPrintLayout([model(1), model(2), model(3)], profile);
  assert.equal(layout.labelCount, 6);
  assert.equal(layout.pageCount, 2);

  const imposedA = await renderOuterRollPrintPdf(layout);
  const imposedB = await renderOuterRollPrintPdf(layout);
  assert.deepEqual(Buffer.from(imposedA), Buffer.from(imposedB), "Unchanged imposed output must be byte-deterministic.");

  const imposedDoc = await PDFDocument.load(imposedA);
  assert.equal(imposedDoc.getPageCount(), 2);
  for (const page of imposedDoc.getPages()) {
    assert.ok(Math.abs(page.getWidth() - millimetresToPdfPoints(profile.mediaWidthMm)) < 0.01);
    assert.ok(Math.abs(page.getHeight() - millimetresToPdfPoints(profile.mediaHeightMm)) < 0.01);
  }

  const tamperedLayout = { ...layout, labelCount: layout.labelCount + 1 };
  await assert.rejects(() => renderOuterRollPrintPdf(tamperedLayout));

  const longestValidModel: OuterRollLabelViewModel = {
    templateId: "outer-roll-label-v1",
    productName: "PROTECTION GIANTS ADVANCED DUAL LAYER ULTRA HIGH GLOSS CLEAR COAT AUTOMOTIVE PAINT PROTECTION FILM PROFESSIONAL SERIES 1",
    productVersion: "PREMIUM PLUS ULTRA THICK CERAMIC COATED EXTENDED WARRANTY EDITION SERIES 2026-X",
    sku: "PG-ULT-PLUS-CER-PPF-1524-75MIL-EXP-PRO-X",
    gtin: "12345678901234567890123456789012",
    widthMm: 1524,
    lengthM: 30,
    thicknessMil: 12.5,
    productionOrderNumber: "PG-PO-20260825-00000001",
    productionDate: "2026-08-25",
    lotNumber: "PG-L-20260825-00000001-99",
    lotSequence: 99,
    rollId: "44444444-4444-4444-8444-999999999999",
    rollSerial: "PG-R-20260825-00000001-99-9999",
    rollIndex: 9999,
    qrPayload: "https://protectiongiants.com/r/PG-R-20260825-00000001-99-9999",
  };
  const longestMasterA = await renderOuterRollLabelMasterPdf(longestValidModel);
  const longestMasterB = await renderOuterRollLabelMasterPdf(longestValidModel);
  assert.equal(Buffer.from(longestMasterA).subarray(0, 4).toString("ascii"), "%PDF");
  assert.deepEqual(Buffer.from(longestMasterA), Buffer.from(longestMasterB), "Longest valid values reprint must be byte-deterministic.");
  const longestDoc = await PDFDocument.load(longestMasterA);
  assert.equal(longestDoc.getPageCount(), 1);
  const longestPage = longestDoc.getPage(0);
  assert.ok(Math.abs(longestPage.getWidth() - millimetresToPdfPoints(150)) < 0.01);
  assert.ok(Math.abs(longestPage.getHeight() - millimetresToPdfPoints(100)) < 0.01);

  // Arabic Outer Roll label
  const arabicModel: OuterRollLabelViewModel = {
    ...longestValidModel,
    productName: "فيلم حماية عمالقة الحماية نانو سيراميك شفاف",
    productVersion: "إصدار بلس نانو سيراميك",
  };
  const arabicMasterA = await renderOuterRollLabelMasterPdf(arabicModel);
  const arabicMasterB = await renderOuterRollLabelMasterPdf(arabicModel);
  assert.equal(Buffer.from(arabicMasterA).subarray(0, 4).toString("ascii"), "%PDF");
  assert.deepEqual(Buffer.from(arabicMasterA), Buffer.from(arabicMasterB), "Arabic Outer Roll reprint must be byte-deterministic.");

  // Mixed Arabic/Latin Outer Roll label
  const mixedModel: OuterRollLabelViewModel = {
    ...longestValidModel,
    productName: "فيلم حماية PPF Super Clear 1524mm Pro",
    productVersion: "Ceramic Plus 2026",
  };
  const mixedMasterA = await renderOuterRollLabelMasterPdf(mixedModel);
  const mixedMasterB = await renderOuterRollLabelMasterPdf(mixedModel);
  assert.equal(Buffer.from(mixedMasterA).subarray(0, 4).toString("ascii"), "%PDF");
  assert.deepEqual(Buffer.from(mixedMasterA), Buffer.from(mixedMasterB), "Mixed Outer Roll reprint must be byte-deterministic.");

  // Product Version boundary tests: 1-char version ("X") and 80-char version
  const singleCharVersionModel: OuterRollLabelViewModel = {
    ...longestValidModel,
    productVersion: "X",
  };
  const singleCharPdf = await renderOuterRollLabelMasterPdf(singleCharVersionModel);
  assert.equal(Buffer.from(singleCharPdf).subarray(0, 4).toString("ascii"), "%PDF");

  const eightyCharVersionModel: OuterRollLabelViewModel = {
    ...longestValidModel,
    productVersion: "V".repeat(80),
  };
  const eightyCharPdf = await renderOuterRollLabelMasterPdf(eightyCharVersionModel);
  assert.equal(Buffer.from(eightyCharPdf).subarray(0, 4).toString("ascii"), "%PDF");

  // Rejections: >80-char version, <2-char name, >120-char name
  const overlongVersionModel: OuterRollLabelViewModel = {
    ...longestValidModel,
    productVersion: "V".repeat(81),
  };
  await assert.rejects(async () => renderOuterRollLabelMasterPdf(overlongVersionModel));

  const tooShortNameModel: OuterRollLabelViewModel = {
    ...longestValidModel,
    productName: "A",
  };
  await assert.rejects(async () => renderOuterRollLabelMasterPdf(tooShortNameModel));

  const overlongNameModel: OuterRollLabelViewModel = {
    ...longestValidModel,
    productName: "A".repeat(121),
  };
  await assert.rejects(async () => renderOuterRollLabelMasterPdf(overlongNameModel));

  console.log("Outer Roll V1 Product Barcode, QR quiet-zone, PDF dimension, version bounds, and deterministic export verification passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

