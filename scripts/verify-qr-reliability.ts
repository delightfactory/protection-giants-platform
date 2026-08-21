// @ts-nocheck
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import sharp from "sharp";

import { renderOuterRollLabelMasterPdf } from "../lib/labels/outer-roll-label-pdf";
import { buildOuterRollQrVector } from "../lib/labels/outer-roll-machine-codes";
import {
  QR_QUIET_ZONE_MODULES,
  buildQrVectorGeometry,
  qrVectorGeometryToSvg,
} from "../lib/qr/qr-vector";
import { buildRollQrUrl } from "../lib/rolls/roll-qr";
import { buildTransferIdQrGeometry } from "../lib/transfers/transfer-id-qr";

function moveCount(pathValue) {
  return (pathValue.match(/\bM\b/g) ?? []).length;
}

function verifyGeometry(label, geometry) {
  assert.equal(geometry.width, geometry.height, `${label}: QR output must remain square.`);
  assert.equal(
    geometry.quietZoneModules,
    QR_QUIET_ZONE_MODULES,
    `${label}: QR quiet zone must remain four modules.`,
  );
  assert.equal(
    geometry.quietZone,
    geometry.moduleSize * QR_QUIET_ZONE_MODULES,
    `${label}: QR quiet zone must be module-relative, not CSS-relative.`,
  );
  assert.equal(
    geometry.width,
    (geometry.symbolModules + QR_QUIET_ZONE_MODULES * 2) * geometry.moduleSize,
    `${label}: total QR dimensions must include the internal quiet zone.`,
  );
  assert.ok(geometry.fills.length > 0, `${label}: QR must contain dark module paths.`);
  assert.ok(
    geometry.fills.some((fill) => moveCount(fill.path) > 1),
    `${label}: QR vector must preserve the complete encoded module matrix.`,
  );
}

function decodeWithZbar(filePath) {
  return execFileSync("zbarimg", ["--quiet", "--raw", filePath], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function decodeAllWithZbar(filePath) {
  return decodeWithZbar(filePath)
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
}

async function rasterize(svg, filePath, size, degraded = false) {
  let pipeline = sharp(Buffer.from(svg), { density: 300 })
    .resize(size, size, { fit: "fill", kernel: sharp.kernel.nearest })
    .flatten({ background: "#ffffff" });

  if (degraded) {
    pipeline = pipeline.rotate(4, { background: "#ffffff" });
    await pipeline.jpeg({ quality: 88, chromaSubsampling: "4:4:4" }).toFile(filePath);
    return;
  }

  await pipeline.png().toFile(filePath);
}

async function verifyDecodeCase(tempDir, { name, payload, geometry, size, degraded = false }) {
  verifyGeometry(name, geometry);
  const svg = qrVectorGeometryToSvg(geometry);
  assert.match(svg, /fill-rule="nonzero"/, `${name}: rendered SVG must explicitly preserve non-zero filling.`);
  assert.match(svg, /shape-rendering="crispEdges"/, `${name}: rendered SVG must request crisp module edges.`);

  const extension = degraded ? "jpg" : "png";
  const filePath = path.join(tempDir, `${name}.${extension}`);
  await rasterize(svg, filePath, size, degraded);
  const decoded = decodeWithZbar(filePath);
  assert.equal(decoded, payload, `${name}: independent decoder did not recover the exact QR payload.`);
}

async function verifyPrintableLabelDecode(tempDir, rollSerial, rollPayload) {
  const model = {
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
    rollId: "44444444-4444-4444-8444-000000010000",
    rollSerial,
    rollIndex: 10000,
    qrPayload: rollPayload,
  };

  const pdf = await renderOuterRollLabelMasterPdf(model);
  const pdfPath = path.join(tempDir, "outer-roll-master.pdf");
  const rasterPrefix = path.join(tempDir, "outer-roll-master");
  await writeFile(pdfPath, pdf);

  execFileSync("pdftoppm", ["-png", "-singlefile", "-r", "300", pdfPath, rasterPrefix], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  const decoded = decodeAllWithZbar(`${rasterPrefix}.png`);
  assert.ok(
    decoded.includes(rollPayload),
    `Printable Roll label PDF did not preserve a decodable QR payload. Decoded: ${decoded.join(" | ")}`,
  );
}

async function main() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "pg-qr-reliability-"));
  try {
    const transferPayload = "PG-C-H7QF-3M9X-T5VK";
    const transferGeometry = buildTransferIdQrGeometry(transferPayload);
    const genericTransferGeometry = buildQrVectorGeometry(transferPayload);
    assert.deepEqual(
      transferGeometry,
      genericTransferGeometry,
      "Transfer QR must use the shared QR foundation without a divergent renderer.",
    );

    const rollSerial = "PG-R-20260814-00000001-01-10000";
    const rollPayload = buildRollQrUrl("https://platform.protectiongiants.com", rollSerial);
    const rollVector = buildOuterRollQrVector(rollPayload);
    assert.equal(rollVector.payload, rollPayload, "Roll QR payload must remain the exact contextual Roll URL.");

    await verifyDecodeCase(tempDir, {
      name: "transfer-screen-160",
      payload: transferPayload,
      geometry: transferGeometry,
      size: 160,
    });
    await verifyDecodeCase(tempDir, {
      name: "transfer-small-120",
      payload: transferPayload,
      geometry: transferGeometry,
      size: 120,
    });
    await verifyDecodeCase(tempDir, {
      name: "roll-label-360",
      payload: rollPayload,
      geometry: rollVector.geometry,
      size: 360,
    });
    await verifyDecodeCase(tempDir, {
      name: "roll-compact-180",
      payload: rollPayload,
      geometry: rollVector.geometry,
      size: 180,
    });
    await verifyDecodeCase(tempDir, {
      name: "roll-camera-like-240",
      payload: rollPayload,
      geometry: rollVector.geometry,
      size: 240,
      degraded: true,
    });
    await verifyPrintableLabelDecode(tempDir, rollSerial, rollPayload);

    console.log("QR module-matrix, quiet-zone, screen/camera and printable-PDF independent decode verification passed.");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
