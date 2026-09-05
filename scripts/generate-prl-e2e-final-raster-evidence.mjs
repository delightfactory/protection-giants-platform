import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { PDFDocument } from "pdf-lib";

import { renderWarrantyQrLabelMasterPdf } from "../lib/labels/warranty-qr-label-pdf.ts";
import { renderOuterRollLabelMasterPdf } from "../lib/labels/outer-roll-label-pdf.ts";
import { buildOuterRollLabelPlan } from "../lib/labels/outer-roll-label-plan.ts";
import { buildRollPrintPackPlan } from "../lib/labels/roll-print-pack-plan.ts";
import { planRollPrintPackMasterLayout } from "../lib/labels/roll-print-pack-layout.ts";
import { renderRollPrintPackPdf } from "../lib/labels/roll-print-pack-pdf.ts";

const OUTPUT_DIR = "docs/prl-e2e-final-evidence";
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const cases = [
  {
    id: "case-1-normal",
    title: "Case 1: Normal Valid Values",
    productName: "Protection Giants Super Clear PPF",
    productVersion: "Ultra Gloss",
    sku: "PG-SC-1524-75",
    gtin: "4006381333931",
    thicknessMil: 7.5,
    widthMm: 1524,
    lengthM: 15,
    lotNumber: "PG-L-20260825-00000001-01",
    rollSerial: "PG-R-20260825-00000001-01-0001",
    publicCode: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  },
  {
    id: "case-2-longest-valid-latin",
    title: "Case 2: Longest Valid Latin (120-char Name, 40-char SKU, 79-char Version)",
    productName: "PROTECTION GIANTS ADVANCED DUAL LAYER ULTRA HIGH GLOSS CLEAR COAT AUTOMOTIVE PAINT PROTECTION FILM PROFESSIONAL SERIES 1",
    productVersion: "PREMIUM PLUS ULTRA THICK CERAMIC COATED EXTENDED WARRANTY EDITION SERIES 2026-X",
    sku: "PG-ULT-PLUS-CER-PPF-1524-75MIL-EXP-PRO-X",
    gtin: "12345678901234567890123456789012",
    thicknessMil: 12.5,
    widthMm: 1524,
    lengthM: 30,
    lotNumber: "PG-L-20260825-00000001-99",
    rollSerial: "PG-R-20260825-00000001-99-9999",
    publicCode: "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210",
  },
  {
    id: "case-3-120-char-single-token",
    title: "Case 3: 120-Character Single-Token Valid Name (Deterministic Hard-Break)",
    productName: "ULTRA-PROTECT-SUPER-GLOSS-FILM-SERIES-ADVANCED-CERAMIC-PLUS-COATING-EXTENDED-WARRANTY-PROFESSIONAL-EDITION-2026-X-1524MM-75MIL".slice(0, 120),
    productVersion: "CERAMIC-PLUS-COATING-2026",
    sku: "PG-UP-1524",
    gtin: "5012345678900",
    thicknessMil: 8.0,
    widthMm: 1524,
    lengthM: 15,
    lotNumber: "PG-L-20260825-00000001-02",
    rollSerial: "PG-R-20260825-00000001-02-0002",
    publicCode: "aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899",
  },
  {
    id: "case-4-arabic",
    title: "Case 4: Pure Arabic Product Name & Version",
    productName: "فيلم حماية عمالقة الحماية نانو سيراميك شفاف ذاتي المعالجة",
    productVersion: "إصدار بلس نانو سيراميك فائق اللمعان",
    sku: "PG-AR-1524-75",
    gtin: "6281000000012",
    thicknessMil: 8.5,
    widthMm: 1524,
    lengthM: 15,
    lotNumber: "PG-L-20260825-00000001-03",
    rollSerial: "PG-R-20260825-00000001-03-0003",
    publicCode: "11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff",
  },
  {
    id: "case-5-mixed-arabic-latin",
    title: "Case 5: Mixed Arabic/Latin Product Name & Version",
    productName: "فيلم حماية PPF Super Clear 1524mm Pro Edition",
    productVersion: "Ceramic Plus 8.5mil",
    sku: "PG-MIX-1524",
    gtin: "6281000000029",
    thicknessMil: 8.5,
    widthMm: 1524,
    lengthM: 15,
    lotNumber: "PG-L-20260825-00000001-04",
    rollSerial: "PG-R-20260825-00000001-04-0004",
    publicCode: "99887766554433221100ffeeddccbbaa99887766554433221100ffeeddccbbaa",
  },
];

async function rasterizePdf(browser, pdfBytes, outPngPath, scale = 2.0) {
  const page = await browser.newPage();
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
      <style>
        body { margin: 0; background: #ffffff; overflow: hidden; }
        canvas { display: block; }
      </style>
    </head>
    <body>
      <canvas id="pdf-canvas"></canvas>
      <script>
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        window.renderPdf = async function(base64, renderScale) {
          const binary = atob(base64);
          const len = binary.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
          const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
          const pdfPage = await pdf.getPage(1);
          const viewport = pdfPage.getViewport({ scale: renderScale });
          const canvas = document.getElementById('pdf-canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          await pdfPage.render({ canvasContext: ctx, viewport }).promise;
          return { width: viewport.width, height: viewport.height };
        };
      </script>
    </body>
    </html>
  `;
  await page.setContent(html);
  const base64 = Buffer.from(pdfBytes).toString("base64");
  const dims = await page.evaluate(({ b64, s }) => window.renderPdf(b64, s), { b64: base64, s: scale });
  await page.setViewportSize({ width: Math.ceil(dims.width), height: Math.ceil(dims.height) });
  const canvas = await page.$("#pdf-canvas");
  await canvas.screenshot({ path: outPngPath });
  await page.close();
}

async function main() {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch {
    browser = await chromium.launch({
      headless: true,
      executablePath: "C:/Users/DELL/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe",
    });
  }

  for (const c of cases) {
    console.log(`\nGenerating evidence for ${c.title}...`);

    // 1. Warranty QR Label PDF (70x45mm)
    const warrantyPdf = await renderWarrantyQrLabelMasterPdf({
      templateId: "warranty-qr-label-v1",
      productName: c.productName,
      qrPayload: `https://protectiongiants.com/w/${c.publicCode}`,
    });
    const warrantyPdfPath = path.join(OUTPUT_DIR, `${c.id}-warranty.pdf`);
    const warrantyPngPath = path.join(OUTPUT_DIR, `${c.id}-warranty.png`);
    fs.writeFileSync(warrantyPdfPath, Buffer.from(warrantyPdf));
    await rasterizePdf(browser, warrantyPdf, warrantyPngPath, 3.0);
    console.log(`  ✓ Warranty QR Label: ${warrantyPngPath} (${fs.statSync(warrantyPngPath).size} bytes)`);

    // 2. Outer Roll Label PDF (150x100mm)
    const outerModel = {
      templateId: "outer-roll-label-v1",
      productName: c.productName,
      productVersion: c.productVersion,
      sku: c.sku,
      gtin: c.gtin,
      widthMm: c.widthMm,
      lengthM: c.lengthM,
      thicknessMil: c.thicknessMil,
      productionOrderNumber: "PG-PO-20260825-00000001",
      productionDate: "2026-08-25",
      lotNumber: c.lotNumber,
      lotSequence: 1,
      rollId: "44444444-4444-4444-8444-000000000001",
      rollSerial: c.rollSerial,
      rollIndex: 1,
      qrPayload: `https://protectiongiants.com/r/${c.rollSerial}`,
    };
    const outerPdf = await renderOuterRollLabelMasterPdf(outerModel);
    const outerPdfPath = path.join(OUTPUT_DIR, `${c.id}-outer.pdf`);
    const outerPngPath = path.join(OUTPUT_DIR, `${c.id}-outer.png`);
    fs.writeFileSync(outerPdfPath, Buffer.from(outerPdf));
    await rasterizePdf(browser, outerPdf, outerPngPath, 2.5);
    console.log(`  ✓ Outer Roll Label: ${outerPngPath} (${fs.statSync(outerPngPath).size} bytes)`);

    // 3. Master Roll Print Pack PDF (318x181mm, 2 Outer + 3 Warranty)
    const orderId = "11111111-1111-4111-8111-111111111111";
    const productId = "22222222-2222-4222-8222-222222222222";
    const lotId = "33333333-3333-4333-8333-333333333331";
    const rollId = "44444444-4444-4444-8444-000000000001";
    const outerPlan = buildOuterRollLabelPlan({
      publicSiteOrigin: "https://preview.protectiongiants.com",
      product: { id: productId, gtin: c.gtin },
      order: {
        id: orderId,
        productId,
        status: "generated",
        orderNumber: "PG-PO-20260825-00000001",
        productionDate: "2026-08-25",
        totalRolls: 1,
        productCodeSnapshot: c.sku,
        productNameSnapshot: c.productName,
        productVersionSnapshot: c.productVersion,
        widthMmSnapshot: c.widthMm,
        lengthMSnapshot: c.lengthM,
        thicknessMilSnapshot: c.thicknessMil,
      },
      lots: [
        { id: lotId, productionOrderId: orderId, lotNumber: c.lotNumber, lotSequence: 1, rollCount: 1 },
      ],
      rolls: [
        {
          id: rollId,
          productionOrderId: orderId,
          productionLotId: lotId,
          serialNumber: c.rollSerial,
          rollIndex: 1,
        },
      ],
      selection: { mode: "order" },
      rollChunkSize: 1,
    });
    const identities = new Map([
      [rollId, { rollId, publicCode: c.publicCode }],
    ]);
    const packPlan = buildRollPrintPackPlan({ outerPlan, warrantyIdentities: identities });
    const layout = planRollPrintPackMasterLayout({
      chunk: packPlan.chunks[0],
      firstPackOrdinal: 1,
      totalPackCount: 1,
    });
    const packPdf = await renderRollPrintPackPdf(layout);
    const packPdfPath = path.join(OUTPUT_DIR, `${c.id}-pack.pdf`);
    const packPngPath = path.join(OUTPUT_DIR, `${c.id}-pack.png`);
    fs.writeFileSync(packPdfPath, Buffer.from(packPdf));
    await rasterizePdf(browser, packPdf, packPngPath, 2.0);
    console.log(`  ✓ Master Roll Print Pack (2 Outer + 3 Warranty): ${packPngPath} (${fs.statSync(packPngPath).size} bytes)`);
  }

  await browser.close();
  console.log("\nAll visual raster evidence generated successfully in artifacts/prl-e2e-final/");
}

main().catch((err) => {
  console.error("Failed to generate raster evidence:", err);
  process.exit(1);
});
