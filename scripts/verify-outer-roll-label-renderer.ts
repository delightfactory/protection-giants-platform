import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";

import {
  buildOuterRollGtinBarcodeGeometry,
  buildOuterRollQrVector,
  selectOuterRollGtinSymbology,
} from "../lib/labels/outer-roll-machine-codes";
import {
  millimetresToPdfPoints,
  renderOuterRollLabelMasterPdf,
  renderOuterRollPrintPdf,
} from "../lib/labels/outer-roll-label-pdf";
import { planOuterRollPrintLayout } from "../lib/labels/outer-roll-print-layout";
import type { OuterRollLabelViewModel } from "../lib/labels/outer-roll-label-plan";

function model(index: number): OuterRollLabelViewModel {
  const suffix = String(index).padStart(4, "0");
  const rollSerial = `PG-R-20260814-00000001-01-${suffix}`;
  return {
    templateId: "outer-roll-label-v1",
    productName: "AI Pro",
    productVersion: "7.5 mil",
    sku: "AI-PRO-75",
    gtin: "4006381333931",
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
  assert.equal(selectOuterRollGtinSymbology("96385074"), "ean8");
  assert.equal(selectOuterRollGtinSymbology("012345678905"), "upca");
  assert.equal(selectOuterRollGtinSymbology("4006381333931"), "ean13");
  assert.equal(selectOuterRollGtinSymbology("10012345000017"), "itf14");
  assert.throws(() => selectOuterRollGtinSymbology("4006381333932"));

  for (const gtin of ["96385074", "012345678905", "4006381333931", "10012345000017"]) {
    const barcode = buildOuterRollGtinBarcodeGeometry(gtin);
    assert.equal(barcode.payload, gtin, "Linear barcode payload must remain the exact Product GTIN.");
    assert.ok(barcode.geometry.width > 0 && barcode.geometry.height > 0);
    assert.ok(barcode.geometry.lines.length + barcode.geometry.polygons.length > 0);
  }

  const qrPayload = model(1).qrPayload;
  const qr = buildOuterRollQrVector(qrPayload);
  assert.equal(qr.payload, qrPayload, "QR vector payload must remain the exact contextual Roll URL.");
  assert.ok(qr.geometry.width > 0 && qr.geometry.height > 0);
  assert.ok(qr.geometry.polygons.length > 0, "QR must be represented by vector polygons/modules.");

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

  console.log("Outer Roll vector machine-code, PDF dimension and deterministic export verification passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
