import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const baseUrl = process.env.PG_AUDIT_BASE_URL ?? "http://127.0.0.1:3000";
const outDir = process.env.PG_AUDIT_OUT_DIR ?? "artifacts/ux-s02b-roll-datetime";
fs.mkdirSync(outDir, { recursive: true });

const account = {
  email: "cube-k-center-a@example.test",
  password: "Cube-K-Preinstall-Issues-2026!",
};

const cases = [
  { name: "cairo-mobile390", timezoneId: "Africa/Cairo", width: 390, height: 844 },
  { name: "tokyo-mobile390", timezoneId: "Asia/Tokyo", width: 390, height: 844 },
  { name: "cairo-desktop1440", timezoneId: "Africa/Cairo", width: 1440, height: 1000 },
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function login(page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]').fill(account.email);
  await page.locator('input[name="password"]').fill(account.password);
  await Promise.all([
    page.waitForURL((url) => url.pathname.startsWith("/operations"), { timeout: 15000 }),
    page.getByRole("button", { name: "دخول" }).click(),
  ]);
}

async function settle(page) {
  await page.waitForFunction(() => !(document.body?.innerText ?? "").includes("جاري تحميل البيانات"), null, { timeout: 15000 });
  await page.locator("time[datetime]").first().waitFor({ state: "visible", timeout: 15000 });
  await page.waitForFunction(() => [...document.querySelectorAll("time[datetime]")].every((node) => (node.textContent ?? "").trim() !== "—"), null, { timeout: 15000 });
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function readTimes(page) {
  return page.locator("time[datetime]").evaluateAll((nodes) => nodes.map((node) => {
    const raw = node.getAttribute("datetime");
    const text = (node.textContent ?? "").trim();
    const expected = raw
      ? new Intl.DateTimeFormat("ar-EG-u-nu-latn", { dateStyle: "medium", timeStyle: "short" }).format(new Date(raw))
      : null;
    return { raw, text, expected, dir: node.getAttribute("dir") };
  }));
}

const browser = await chromium.launch({ headless: true });
const captures = [];
const failures = [];

for (const testCase of cases) {
  const context = await browser.newContext({
    viewport: { width: testCase.width, height: testCase.height },
    timezoneId: testCase.timezoneId,
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));

  try {
    await login(page);
    await page.goto(`${baseUrl}/operations/rolls`, { waitUntil: "domcontentloaded", timeout: 20000 });
    await settle(page);

    const times = await readTimes(page);
    assert(times.length >= 2, `${testCase.name}: expected custody/opening timestamps in Roll registry.`);
    for (const item of times) {
      assert(item.raw, `${testCase.name}: Roll timestamp is missing datetime.`);
      assert(item.text === item.expected, `${testCase.name}: Roll timestamp mismatch: ${item.raw} => ${item.text}, expected ${item.expected}.`);
      assert(item.dir === "auto", `${testCase.name}: Roll timestamp must use dir=auto.`);
    }

    const bodyText = await page.locator("body").innerText();
    assert(bodyText.includes("تأكيد العهدة"), `${testCase.name}: custody confirmation field is missing.`);
    assert(bodyText.includes("فتح الرول"), `${testCase.name}: Roll opening field is missing.`);

    const overflowPx = await page.evaluate(() => Math.max(0, Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0) - document.documentElement.clientWidth));
    assert(overflowPx <= 1, `${testCase.name}: Roll registry horizontal overflow ${overflowPx}px.`);

    const screenshot = `${testCase.name}__roll-registry.png`;
    await page.screenshot({ path: path.join(outDir, screenshot), fullPage: true });

    captures.push({ ...testCase, times, overflowPx, screenshot, pageErrors });
    if (pageErrors.length) failures.push(`${testCase.name}: page errors: ${pageErrors.join(" | ")}`);
  } catch (error) {
    failures.push(`${testCase.name}: ${String(error)}`);
  } finally {
    await context.close();
  }
}

await browser.close();

const cairo = captures.find((item) => item.name === "cairo-mobile390")?.times?.[0];
const tokyo = captures.find((item) => item.name === "tokyo-mobile390")?.times?.[0];
if (!cairo || !tokyo) {
  failures.push("Could not compare Cairo and Tokyo Roll timestamps.");
} else {
  if (cairo.raw !== tokyo.raw) failures.push(`Timezone comparison did not use the same raw Roll timestamp: ${cairo.raw} vs ${tokyo.raw}.`);
  if (cairo.text === tokyo.text) failures.push(`Device timezone did not change Roll timestamp presentation for ${cairo.raw}: both rendered ${cairo.text}.`);
}

const summary = {
  generatedAt: new Date().toISOString(),
  status: failures.length ? "FAIL" : "PASS",
  failures,
  timezoneComparison: cairo && tokyo ? { raw: cairo.raw, cairo: cairo.text, tokyo: tokyo.text } : null,
  captures,
};
fs.writeFileSync(path.join(outDir, "ux-s02b-summary.json"), JSON.stringify(summary, null, 2));
fs.writeFileSync(path.join(outDir, "ux-s02b-summary.md"), [
  "# UX-S02B Roll Datetime Closure",
  "",
  `Status: ${summary.status}`,
  `Cases: ${captures.length}/${cases.length}`,
  `Failures: ${failures.length}`,
  summary.timezoneComparison ? `Same ISO: ${summary.timezoneComparison.raw}` : "",
  summary.timezoneComparison ? `Cairo: ${summary.timezoneComparison.cairo}` : "",
  summary.timezoneComparison ? `Tokyo: ${summary.timezoneComparison.tokyo}` : "",
  "",
  ...failures.map((failure) => `- ${failure}`),
].filter(Boolean).join("\n"));

console.log(`UX-S02B rendered Roll datetime closure: ${summary.status}; cases=${captures.length}; failures=${failures.length}.`);
if (failures.length) process.exit(1);
