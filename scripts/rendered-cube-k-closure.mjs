import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const baseUrl = process.env.PG_AUDIT_BASE_URL ?? "http://127.0.0.1:3000";
const outDir = process.env.PG_AUDIT_OUT_DIR ?? "artifacts/rendered-role-walkthrough";
fs.mkdirSync(outDir, { recursive: true });

const roles = {
  admin: {
    email: "network-admin@example.test",
    password: "Agent-Network-Foundation-2026!",
  },
  center: {
    email: "cube-k-center-a@example.test",
    password: "Cube-K-Preinstall-Issues-2026!",
  },
};

const viewports = {
  mobile320: { width: 320, height: 740 },
  mobile390: { width: 390, height: 844 },
  desktop1440: { width: 1440, height: 1000 },
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function login(page, role) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]').fill(role.email);
  await page.locator('input[name="password"]').fill(role.password);
  await Promise.all([
    page.waitForURL((url) => url.pathname.startsWith("/operations"), { timeout: 15000 }),
    page.getByRole("button", { name: "دخول" }).click(),
  ]);
}

async function capture(browser, roleName, route, viewportName, suffix) {
  const viewport = viewports[viewportName];
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  await login(page, roles[roleName]);
  const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(750);
  assert(response && response.status() < 500, `${roleName} ${route} returned ${response?.status()}.`);
  assert(!page.url().includes("/access-denied"), `${roleName} was denied ${route}.`);
  assert(pageErrors.length === 0, `${roleName} ${route} page errors: ${pageErrors.join(" | ")}`);
  assert(consoleErrors.length === 0, `${roleName} ${route} console errors: ${consoleErrors.join(" | ")}`);
  const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
  assert(overflow <= 1, `${roleName} ${route} has ${overflow}px horizontal overflow.`);
  const screenshot = `cube-k-closure__${roleName}__${viewportName}__${suffix}.png`;
  await page.screenshot({ path: path.join(outDir, screenshot), fullPage: true });
  const bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ").trim();
  await context.close();
  return { roleName, route, viewportName, screenshot, bodyText, overflow };
}

async function inspectIssueList(browser, roleName) {
  const context = await browser.newContext({ viewport: viewports.mobile390 });
  const page = await context.newPage();
  await login(page, roles[roleName]);
  await page.goto(`${baseUrl}/operations/rolls/issues`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
  const rows = await page.evaluate(() => [...document.querySelectorAll("article.ui-record-item")].map((article) => {
    const href = article.querySelector('a[href^="/operations/rolls/issues/"]')?.getAttribute("href") ?? null;
    const serial = article.querySelector("h2")?.textContent?.trim() ?? null;
    const facts = [...article.querySelectorAll(".ui-record-fact")].map((fact) => ({
      label: fact.querySelector("dt")?.textContent?.trim() ?? "",
      value: fact.querySelector("dd")?.textContent?.trim() ?? "",
    }));
    const evidenceFact = facts.find((fact) => fact.label === "الصور");
    return {
      href,
      serial,
      evidenceCount: Number.parseInt(evidenceFact?.value ?? "0", 10) || 0,
      text: article.textContent?.replace(/\s+/g, " ").trim() ?? "",
    };
  }).filter((row) => row.href && !row.href.endsWith("/new")));
  await context.close();
  assert(rows.length > 0, `${roleName} issue list has no real issue detail links.`);
  return rows;
}

async function capturePendingCenterDetail(browser, centerRows, results) {
  const pending = centerRows.find((row) => row.text.includes("قيد مراجعة الشركة"));
  assert(pending?.href, "Could not find a pending Center issue for rendered closure.");
  for (const viewportName of ["mobile320", "mobile390", "desktop1440"]) {
    const result = await capture(browser, "center", pending.href, viewportName, "center-pending-detail");
    assert(!/\bRecovery\b/i.test(result.bodyText), "Center pending detail leaks Recovery terminology.");
    assert(!/\bhold\b/i.test(result.bodyText), "Center pending detail leaks hold terminology.");
    assert(result.bodyText.includes("لا تستخدم الرول"), "Center pending detail does not provide the expected direct next action.");
    results.push(result);
  }
}

async function captureEvidenceDetail(browser, adminRows, centerRows, results) {
  const adminEvidence = adminRows.find((row) => row.evidenceCount > 0);
  assert(adminEvidence?.href, "Could not find an issue with evidence for rendered closure.");
  assert(centerRows.some((row) => row.href === adminEvidence.href), "Reporting Center cannot see the evidence-bearing historical issue.");

  for (const roleName of ["admin", "center"]) {
    for (const viewportName of ["mobile390", "desktop1440"]) {
      const result = await capture(browser, roleName, adminEvidence.href, viewportName, `${roleName}-evidence-detail`);
      const context = await browser.newContext({ viewport: viewports[viewportName] });
      const page = await context.newPage();
      await login(page, roles[roleName]);
      await page.goto(`${baseUrl}${adminEvidence.href}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(750);
      const gallery = page.locator('img[alt^="صورة دليل"]');
      assert(await gallery.count() > 0, `${roleName} evidence detail did not render inline image evidence.`);
      const imageLoaded = await gallery.first().evaluate((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0);
      assert(imageLoaded, `${roleName} evidence preview did not load successfully.`);
      assert(await page.getByRole("link", { name: /فتح بالحجم الكامل/ }).count() > 0, `${roleName} evidence detail lacks full-size access.`);
      await context.close();
      results.push(result);
    }
  }
}

async function captureSubmissionPreview(browser, centerRows, results) {
  const issueSerials = new Set(centerRows.map((row) => row.serial).filter(Boolean));
  const context = await browser.newContext({ viewport: viewports.mobile320 });
  const page = await context.newPage();
  await login(page, roles.center);
  await page.goto(`${baseUrl}/operations/rolls`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
  const serials = [...new Set(((await page.locator("body").innerText()).match(/PG-R-\d{8}-\d{8}-\d{2}-\d{4}/g) ?? []))]
    .filter((serial) => !issueSerials.has(serial));
  assert(serials.length > 0, "Could not discover a candidate Roll serial for image-preview closure.");

  let eligibleSerial = null;
  for (const serial of serials) {
    await page.goto(`${baseUrl}/operations/rolls/issues/new`, { waitUntil: "domcontentloaded" });
    await page.locator("#issue-roll-serial").fill(serial);
    await page.getByRole("button", { name: "تحقق من الرول" }).click();
    await page.waitForTimeout(650);
    if (await page.locator("#issue-category").count()) {
      eligibleSerial = serial;
      break;
    }
  }
  assert(eligibleSerial, "No unused opened Center-held Roll was eligible for preview testing.");

  const serialHeight = await page.locator("#issue-roll-serial").evaluate((element) => Math.round(element.getBoundingClientRect().height));
  assert(serialHeight >= 44, `Cube K manual serial input is only ${serialHeight}px high.`);
  assert(await page.locator("time").count() > 0, "Eligible candidate does not render semantic local time.");

  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZxvAAAAAASUVORK5CYII=", "base64");
  const fixturePath = path.join(outDir, "cube-k-preview-fixture.png");
  fs.writeFileSync(fixturePath, png);
  await page.locator("#issue-images").setInputFiles({
    name: "roll-defect-preview.png",
    mimeType: "image/png",
    buffer: png,
  });
  await page.waitForTimeout(400);
  const preview = page.locator('ul[aria-label="معاينة الصور المختارة"] img');
  assert(await preview.count() === 1, "Center image selection did not render exactly one preview.");
  const previewLoaded = await preview.first().evaluate((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0);
  assert(previewLoaded, "Center selected-image preview did not load.");
  const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
  assert(overflow <= 1, `Center preview form has ${overflow}px horizontal overflow.`);
  const screenshot = "cube-k-closure__center__mobile320__submission-image-preview.png";
  await page.screenshot({ path: path.join(outDir, screenshot), fullPage: true });
  results.push({ roleName: "center", route: "/operations/rolls/issues/new", viewportName: "mobile320", screenshot, serialHeight, eligibleSerial, overflow });
  await context.close();
}

const browser = await chromium.launch({ headless: true });
const results = [];
try {
  const adminRows = await inspectIssueList(browser, "admin");
  const centerRows = await inspectIssueList(browser, "center");
  await capturePendingCenterDetail(browser, centerRows, results);
  await captureEvidenceDetail(browser, adminRows, centerRows, results);
  await captureSubmissionPreview(browser, centerRows, results);
} finally {
  await browser.close();
}

const summary = {
  generatedAt: new Date().toISOString(),
  status: "PASS",
  captures: results,
};
fs.writeFileSync(path.join(outDir, "cube-k-closure-summary.json"), JSON.stringify(summary, null, 2));
fs.writeFileSync(path.join(outDir, "cube-k-closure-summary.md"), [
  "# Cube K — Focused Rendered Closure",
  "",
  `Generated: ${summary.generatedAt}`,
  "Status: PASS",
  "",
  ...results.map((result) => `- ${result.roleName} / ${result.viewportName} / ${result.route} → ${result.screenshot}`),
].join("\n"));
console.log(`Cube K focused rendered closure passed with ${results.length} evidence captures.`);
