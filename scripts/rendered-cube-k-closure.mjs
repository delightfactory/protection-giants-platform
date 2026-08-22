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

async function measureStableHorizontalOverflow(page) {
  const configuredViewportWidth = page.viewportSize()?.width ?? null;
  return page.evaluate(async (expectedViewportWidth) => {
    if (document.fonts?.ready) {
      try {
        await document.fonts.ready;
      } catch {
        // Keep the rendered gate diagnostic even if the FontFaceSet promise rejects.
      }
    }

    await new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });

    const root = document.documentElement;
    const viewportWidth = expectedViewportWidth ?? root.clientWidth ?? window.innerWidth;
    const scrollWidth = root.scrollWidth;
    const overflow = Math.max(0, scrollWidth - viewportWidth);

    if (overflow <= 1) {
      return { overflow, viewportWidth, scrollWidth, offenders: [] };
    }

    const escapeSelector = (value) => {
      if (globalThis.CSS?.escape) return CSS.escape(value);
      return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
    };

    const selectorFor = (element) => {
      if (element.id) return `#${escapeSelector(element.id)}`;
      const name = element.getAttribute("name");
      if (name) return `${element.tagName.toLowerCase()}[name="${name.replaceAll('"', '\\"')}"]`;
      const ariaLabel = element.getAttribute("aria-label");
      if (ariaLabel) return `${element.tagName.toLowerCase()}[aria-label="${ariaLabel.replaceAll('"', '\\"')}"]`;
      const classes = [...element.classList].slice(0, 3).map((className) => `.${escapeSelector(className)}`).join("");
      if (classes) return `${element.tagName.toLowerCase()}${classes}`;
      const parent = element.parentElement;
      if (!parent) return element.tagName.toLowerCase();
      const siblings = [...parent.children].filter((candidate) => candidate.tagName === element.tagName);
      return `${element.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(element) + 1})`;
    };

    const offenders = [...document.querySelectorAll("body *")]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return null;
        const style = getComputedStyle(element);
        const leftOverflow = Math.max(0, -rect.left);
        const rightOverflow = Math.max(0, rect.right - viewportWidth);
        if (leftOverflow <= 1 && rightOverflow <= 1) return null;
        return {
          selector: selectorFor(element),
          rect: {
            left: Math.round(rect.left * 100) / 100,
            right: Math.round(rect.right * 100) / 100,
            top: Math.round(rect.top * 100) / 100,
            bottom: Math.round(rect.bottom * 100) / 100,
            width: Math.round(rect.width * 100) / 100,
            height: Math.round(rect.height * 100) / 100,
          },
          width: Math.round(rect.width * 100) / 100,
          left: Math.round(rect.left * 100) / 100,
          right: Math.round(rect.right * 100) / 100,
          direction: style.direction,
          position: style.position,
          overflowX: style.overflowX,
          leftOverflow: Math.round(leftOverflow * 100) / 100,
          rightOverflow: Math.round(rightOverflow * 100) / 100,
        };
      })
      .filter(Boolean)
      .sort((a, b) => Math.max(b.leftOverflow, b.rightOverflow) - Math.max(a.leftOverflow, a.rightOverflow))
      .slice(0, 25);

    return { overflow, viewportWidth, scrollWidth, offenders };
  }, configuredViewportWidth);
}

async function assertHealthyPage(page, roleName, route, pageErrors, consoleErrors) {
  assert(!page.url().includes("/access-denied"), `${roleName} was denied ${route}.`);
  assert(pageErrors.length === 0, `${roleName} ${route} page errors: ${pageErrors.join(" | ")}`);
  assert(consoleErrors.length === 0, `${roleName} ${route} console errors: ${consoleErrors.join(" | ")}`);

  const measurement = await measureStableHorizontalOverflow(page);
  if (measurement.overflow > 1) {
    console.error(`[Cube K overflow diagnostic] ${roleName} ${route}: ${JSON.stringify(measurement, null, 2)}`);
  }
  assert(
    measurement.overflow <= 1,
    `${roleName} ${route} has ${measurement.overflow}px horizontal overflow after fonts/layout stabilization. ` +
      `viewport=${measurement.viewportWidth}px scrollWidth=${measurement.scrollWidth}px. ` +
      `Offenders: ${JSON.stringify(measurement.offenders)}`,
  );
  return measurement.overflow;
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
  const overflow = await assertHealthyPage(page, roleName, route, pageErrors, consoleErrors);
  const screenshot = `cube-k-closure__${roleName}__${viewportName}__${suffix}.png`;
  await page.screenshot({ path: path.join(outDir, screenshot), fullPage: true });
  const bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ").trim();
  await context.close();
  return { roleName, route, viewportName, screenshot, bodyText, overflow };
}

async function createDedicatedPendingIssue(browser, results) {
  const context = await browser.newContext({ viewport: viewports.mobile320 });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(String(error)));

  await login(page, roles.center);
  await page.goto(`${baseUrl}/operations/rolls`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
  const serials = [...new Set(((await page.locator("body").innerText()).match(/PG-R-\d{8}-\d{8}-\d{2}-\d{4}/g) ?? []))];
  assert(serials.length > 0, "Could not discover Center-held Roll serials for Cube K rendered closure.");

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
  assert(eligibleSerial, "No Center-held opened Roll was eligible for the dedicated rendered QA issue.");

  const serialHeight = await page.locator("#issue-roll-serial").evaluate((element) => Math.round(element.getBoundingClientRect().height));
  assert(serialHeight >= 44, `Cube K manual serial input is only ${serialHeight}px high.`);
  assert(await page.locator("time").count() > 0, "Eligible candidate does not render semantic browser-local time.");

  await page.locator("#issue-category").selectOption("manufacturing_defect");
  await page.locator("#issue-description").fill("علامة واضحة في طبقة الفيلم قبل بدء التركيب — بلاغ مخصص لاختبار واجهة Cube K المرئية.");

  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZxvAAAAAASUVORK5CYII=", "base64");
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

  const overflow = await assertHealthyPage(page, "center", "/operations/rolls/issues/new", pageErrors, consoleErrors);
  const previewScreenshot = "cube-k-closure__center__mobile320__submission-image-preview.png";
  await page.screenshot({ path: path.join(outDir, previewScreenshot), fullPage: true });
  results.push({
    roleName: "center",
    route: "/operations/rolls/issues/new",
    viewportName: "mobile320",
    screenshot: previewScreenshot,
    serialHeight,
    eligibleSerial,
    overflow,
  });

  await page.getByRole("button", { name: "إرسال البلاغ وإيقاف التفعيل مؤقتًا" }).click();
  await page.getByRole("heading", { name: "تم إرسال البلاغ للشركة" }).waitFor({ timeout: 20000 });
  const detailHref = await page.getByRole("link", { name: "فتح البلاغ" }).getAttribute("href");
  assert(detailHref && /^\/operations\/rolls\/issues\/[0-9a-f-]{36}$/i.test(detailHref),
    `Dedicated issue did not expose a valid detail route: ${detailHref}`);

  const successScreenshot = "cube-k-closure__center__mobile320__submission-success.png";
  await page.screenshot({ path: path.join(outDir, successScreenshot), fullPage: true });
  results.push({
    roleName: "center",
    route: "/operations/rolls/issues/new",
    viewportName: "mobile320",
    screenshot: successScreenshot,
    eligibleSerial,
    detailHref,
  });

  await context.close();
  return detailHref;
}

async function captureCenterPendingDetail(browser, detailHref, results) {
  for (const viewportName of ["mobile320", "mobile390", "desktop1440"]) {
    const result = await capture(browser, "center", detailHref, viewportName, "center-pending-detail");
    assert(result.bodyText.includes("قيد مراجعة الشركة"), "Dedicated Center issue is no longer pending during rendered closure.");
    assert(!/\bRecovery\b/i.test(result.bodyText), "Center pending detail leaks Recovery terminology.");
    assert(!/\bhold\b/i.test(result.bodyText), "Center pending detail leaks hold terminology.");
    assert(result.bodyText.includes("لا تستخدم الرول"), "Center pending detail does not provide the expected direct next action.");
    results.push(result);
  }
}

async function captureEvidenceGallery(browser, detailHref, results) {
  for (const roleName of ["admin", "center"]) {
    for (const viewportName of ["mobile390", "desktop1440"]) {
      const result = await capture(browser, roleName, detailHref, viewportName, `${roleName}-evidence-detail`);
      const context = await browser.newContext({ viewport: viewports[viewportName] });
      const page = await context.newPage();
      await login(page, roles[roleName]);
      await page.goto(`${baseUrl}${detailHref}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(750);
      const gallery = page.locator('img[alt^="صورة دليل"]');
      assert(await gallery.count() === 1, `${roleName} evidence detail did not render the dedicated inline image evidence.`);
      const imageLoaded = await gallery.first().evaluate((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0);
      assert(imageLoaded, `${roleName} evidence preview did not load successfully.`);
      assert(await page.getByRole("link", { name: /فتح بالحجم الكامل/ }).count() === 1,
        `${roleName} evidence detail lacks exact full-size access for the dedicated image.`);
      assert(await page.locator("time").count() >= 3, `${roleName} issue detail does not render semantic local date/time values.`);
      await context.close();
      results.push(result);
    }
  }
}

const browser = await chromium.launch({ headless: true });
const results = [];
try {
  const detailHref = await createDedicatedPendingIssue(browser, results);
  await captureCenterPendingDetail(browser, detailHref, results);
  await captureEvidenceGallery(browser, detailHref, results);
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
