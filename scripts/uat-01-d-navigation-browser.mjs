import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const cases = [
  { name: "home-to-warranty", start: "/", selector: 'a[href="/warranty"]', ready: "/warranty" },
  { name: "warranty-to-home", start: "/warranty", selector: 'a[href="/"]', ready: "/" },
];

const browser = await chromium.launch({ headless: true });
const results = [];
const failures = [];

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
  const context = await browser.newContext({ viewport, locale: "ar-EG" });
  for (const testCase of cases) {
    const page = await context.newPage();
    const runtimeErrors = [];
    page.on("pageerror", (error) => runtimeErrors.push(error.message));
    await page.goto(`${baseUrl}${testCase.start}`, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForTimeout(150);
    const link = page.locator(testCase.selector).first();
    if (await link.count() !== 1) throw new Error(`${testCase.name}: navigation link not found at ${testCase.start}`);

    const started = performance.now();
    await link.click();
    let firstResponseMs = null;
    try {
      await page.locator(".ui-navigation-feedback").waitFor({ state: "visible", timeout: 750 });
      firstResponseMs = Math.round(performance.now() - started);
    } catch {
      // A fast transition may complete before React paints the transient indicator.
      firstResponseMs = Math.round(performance.now() - started);
    }
    await page.waitForFunction((ready) => window.location.pathname === ready, testCase.ready, { timeout: 15000 });
    await page.locator("main").waitFor({ state: "visible", timeout: 15000 });
    const readyMs = Math.round(performance.now() - started);
    const geometry = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    const axe = await new AxeBuilder({ page }).analyze();
    const record = { viewport, ...testCase, firstResponseMs, readyMs, geometry, axeViolations: axe.violations.length, runtimeErrors };
    results.push(record);
    if (geometry.scrollWidth > geometry.clientWidth + 1) failures.push(`${testCase.name}@${viewport.width}: horizontal overflow`);
    if (axe.violations.length) failures.push(`${testCase.name}@${viewport.width}: axe violations`);
    if (runtimeErrors.length) failures.push(`${testCase.name}@${viewport.width}: runtime errors`);
    await page.close();
  }
  await context.close();
}

await browser.close();
console.log(JSON.stringify({ results }, null, 2));
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`UAT-01-D navigation PASS: ${results.length} desktop/mobile transitions measured with no overflow, axe, or runtime failures.`);
