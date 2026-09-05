import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

import { buildQrVectorGeometry } from "../lib/qr/qr-vector.ts";
import { WARRANTY_QR_LABEL_TEMPLATE } from "../lib/labels/warranty-qr-label-template.ts";

const artifactDir = process.env.PRL_ARTIFACT_DIR?.trim() || "artifacts/prl-e2e-fix-01";
fs.mkdirSync(artifactDir, { recursive: true });

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function percentX(mm) {
  return `${(mm / WARRANTY_QR_LABEL_TEMPLATE.widthMm) * 100}%`;
}

function percentY(mm) {
  return `${(mm / WARRANTY_QR_LABEL_TEMPLATE.heightMm) * 100}%`;
}

function boxStyle(box) {
  return `left: ${percentX(box.xMm)}; bottom: ${percentY(box.yMm)}; width: ${percentX(box.widthMm)}; height: ${percentY(box.heightMm)};`;
}

function generateWarrantyCardHtml(model) {
  const geometry = buildQrVectorGeometry(model.qrPayload);
  const fills = geometry.fills.map(
    (fill) => `<path d="${fill.path}" fill="#${fill.color}" fill-rule="nonzero"></path>`
  ).join("\n");

  return `
    <div class="warranty-frame" dir="ltr" aria-label="معاينة ملصق التحقق من الضمان">
      <div class="warranty-brand-band" aria-hidden="true"></div>
      <strong class="warranty-brand">PROTECTION GIANTS</strong>
      <strong class="warranty-title">WARRANTY</strong>
      <span class="warranty-instruction">SCAN TO VERIFY</span>
      <span class="warranty-product">${model.productName}</span>
      <div class="warranty-qr" style="${boxStyle(WARRANTY_QR_LABEL_TEMPLATE.qrQuietBox)}">
        <svg viewBox="0 0 ${geometry.width} ${geometry.height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Warranty verification QR" shape-rendering="crispEdges">
          <rect width="${geometry.width}" height="${geometry.height}" fill="#fff"></rect>
          ${fills}
        </svg>
      </div>
      <span class="warranty-domain">protectiongiants.com</span>
    </div>
  `;
}

function generatePackHtml(productName) {
  const packCss = fs.readFileSync("components/labels/roll-print-pack-preview.module.css", "utf8");
  const warrantyCss = fs.readFileSync("components/labels/warranty-qr-label-preview.module.css", "utf8");

  // Transform CSS modules to test classnames
  const normalizedPackCss = packCss
    .replace(/\.pack\b/g, ".pack")
    .replace(/\.guide\b/g, ".guide")
    .replace(/\.guideMeta\b/g, ".guideMeta")
    .replace(/\.outerRow\b/g, ".outerRow")
    .replace(/\.warrantyRow\b/g, ".warrantyRow")
    .replace(/\.piece\b/g, ".piece")
    .replace(/\.pieceGuide\b/g, ".pieceGuide");

  const normalizedWarrantyCss = warrantyCss
    .replace(/\.frame\b/g, ".warranty-frame")
    .replace(/\.brandBand\b/g, ".warranty-brand-band")
    .replace(/\.brand\b/g, ".warranty-brand")
    .replace(/\.title\b/g, ".warranty-title")
    .replace(/\.instruction\b/g, ".warranty-instruction")
    .replace(/\.product\b/g, ".warranty-product")
    .replace(/\.qr\b/g, ".warranty-qr")
    .replace(/\.domain\b/g, ".warranty-domain");

  const model = {
    productName,
    qrPayload: "https://protectiongiants.com/w/PG-W-2026-TESTCODE",
  };

  const warrantyCard = generateWarrantyCardHtml(model);

  return `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #111; color: #fff; padding: 24px; }
    ${normalizedPackCss}
    ${normalizedWarrantyCss}
  </style>
</head>
<body>
  <div style="max-width: 1200px; margin: 0 auto;">
    <section class="pack" aria-label="معاينة حزمة ملصقات الرول">
      <header class="guide">
        <div>
          <span>ROLL PACK</span>
          <strong dir="ltr">PG-R-20260825-00000001-01-0001</strong>
        </div>
        <div class="guideMeta">
          <span dir="ltr">Roll 1 / 20</span>
          <strong>Outer ×2 · Warranty ×3</strong>
        </div>
      </header>
      <div class="warrantyRow">
        <div class="piece">
          <div class="pieceGuide">Warranty 1</div>
          ${warrantyCard}
        </div>
        <div class="piece">
          <div class="pieceGuide">Warranty 2</div>
          ${warrantyCard}
        </div>
        <div class="piece">
          <div class="pieceGuide">Warranty 3</div>
          ${warrantyCard}
        </div>
      </div>
    </section>
  </div>
</body>
</html>
  `;
}

async function verifyLayout(page, testName) {
  const evaluations = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll(".warranty-frame"));
    return cards.map((card, cardIndex) => {
      const cardRect = card.getBoundingClientRect();
      const brand = card.querySelector(".warranty-brand").getBoundingClientRect();
      const title = card.querySelector(".warranty-title").getBoundingClientRect();
      const instruction = card.querySelector(".warranty-instruction").getBoundingClientRect();
      const product = card.querySelector(".warranty-product").getBoundingClientRect();
      const qr = card.querySelector(".warranty-qr").getBoundingClientRect();
      const domain = card.querySelector(".warranty-domain").getBoundingClientRect();
      const qrSvg = card.querySelector(".warranty-qr svg").getBoundingClientRect();

      // Check non-overlapping vertical order on left column
      const brandBottom = brand.bottom;
      const titleTop = title.top;
      const titleBottom = title.bottom;
      const instructionTop = instruction.top;
      const instructionBottom = instruction.bottom;
      const productTop = product.top;

      // Tolerance of 0.5px for sub-pixel anti-aliasing
      const overlapBrandTitle = brandBottom > titleTop + 0.5;
      const overlapTitleInstruction = titleBottom > instructionTop + 0.5;
      const overlapInstructionProduct = instructionBottom > productTop + 0.5;

      // Check horizontal separation: product text does not overlap QR box
      const productRight = product.right;
      const qrLeft = qr.left;
      const overlapProductQr = productRight > qrLeft + 0.5;

      // Check domain under QR
      const qrBottom = qr.bottom;
      const domainTop = domain.top;
      const overlapQrDomain = qrBottom > domainTop + 0.5;

      // Check containment inside card
      const insideCard = (
        brand.top >= cardRect.top - 0.5 &&
        title.top >= cardRect.top - 0.5 &&
        instruction.top >= cardRect.top - 0.5 &&
        product.bottom <= cardRect.bottom + 0.5 &&
        domain.bottom <= cardRect.bottom + 0.5 &&
        qr.right <= cardRect.right + 0.5
      );

      // Check QR containment
      const qrContained = (
        qrSvg.left >= qr.left - 0.5 &&
        qrSvg.right <= qr.right + 0.5 &&
        qrSvg.top >= qr.top - 0.5 &&
        qrSvg.bottom <= qr.bottom + 0.5
      );

      return {
        cardIndex,
        cardWidth: cardRect.width,
        cardHeight: cardRect.height,
        aspectRatio: cardRect.width / cardRect.height,
        overlapBrandTitle,
        overlapTitleInstruction,
        overlapInstructionProduct,
        overlapProductQr,
        overlapQrDomain,
        insideCard,
        qrContained,
        brandRect: { top: brand.top, bottom: brand.bottom, left: brand.left, right: brand.right },
        titleRect: { top: title.top, bottom: title.bottom, left: title.left, right: title.right },
        instructionRect: { top: instruction.top, bottom: instruction.bottom },
        productRect: { top: product.top, bottom: product.bottom, right: product.right },
        qrRect: { top: qr.top, bottom: qr.bottom, left: qr.left },
        domainRect: { top: domain.top, bottom: domain.bottom },
      };
    });
  });

  for (const item of evaluations) {
    assert(!item.overlapBrandTitle, `${testName} [Card ${item.cardIndex}]: PROTECTION GIANTS overlaps WARRANTY.`);
    assert(!item.overlapTitleInstruction, `${testName} [Card ${item.cardIndex}]: WARRANTY overlaps SCAN TO VERIFY.`);
    assert(!item.overlapInstructionProduct, `${testName} [Card ${item.cardIndex}]: SCAN TO VERIFY overlaps Product Name.`);
    assert(!item.overlapProductQr, `${testName} [Card ${item.cardIndex}]: Product Name overlaps QR quiet box.`);
    assert(!item.overlapQrDomain, `${testName} [Card ${item.cardIndex}]: QR box overlaps domain caption.`);
    assert(item.insideCard, `${testName} [Card ${item.cardIndex}]: Elements escape card bounds.`);
    assert(item.qrContained, `${testName} [Card ${item.cardIndex}]: QR SVG escapes quiet box.`);
    assert(Math.abs(item.aspectRatio - (70 / 45)) < 0.08, `${testName} [Card ${item.cardIndex}]: Card aspect ratio corrupted (${item.aspectRatio.toFixed(3)}).`);
  }

  return evaluations;
}

async function run() {
  console.log("Starting rendered Warranty preview regression verification...");

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch {
    browser = await chromium.launch({
      headless: true,
      executablePath: "C:/Users/DELL/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe",
    });
  }

  const viewports = [
    { name: "desktop", width: 1440, height: 900 },
    { name: "mobile-390", width: 390, height: 844 },
  ];

  const testCases = [
    { name: "short-product-name", productName: "PG Shield Ceramic" },
    { name: "long-product-name", productName: "PROTECTION GIANTS ULTIMATE PLUS CERAMIC PPF 1524MM" },
  ];

  try {
    for (const vp of viewports) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
      });
      const page = await context.newPage();

      for (const tc of testCases) {
        const testId = `${vp.name}-${tc.name}`;
        const html = generatePackHtml(tc.productName);
        await page.setContent(html, { waitUntil: "load" });

        const results = await verifyLayout(page, testId);

        const screenshotPath = path.join(artifactDir, `${testId}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });

        console.log(`  ✓ ${testId}: ${results.length} cards verified PASS. Screenshot saved: ${screenshotPath}`);
      }

      await context.close();
    }

    console.log("All rendered Warranty preview regressions PASSED (Desktop & Mobile, Short & Long names).");
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error("FATAL: Warranty preview regression failed:", err);
  process.exit(1);
});
