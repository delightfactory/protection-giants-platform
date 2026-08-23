import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const baseUrl = process.env.PG_AUDIT_BASE_URL ?? "http://127.0.0.1:3000";
const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const outDir = process.env.PG_AUDIT_OUT_DIR ?? "artifacts/ux-s02c-center-datetime";

if (!apiUrl || !serviceRoleKey) throw new Error("Supabase URL and service role key are required.");
fs.mkdirSync(outDir, { recursive: true });

const account = {
  email: "approval-admin@example.test",
  password: "Center-Network-Approval-2026!",
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function resolveFixtureCenterId() {
  const response = await fetch(`${apiUrl}/rest/v1/installation_centers?code=eq.APP-C-DCHA&select=id`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  });
  const rows = await response.json();
  assert(response.ok && Array.isArray(rows) && rows.length === 1, `Could not resolve Center fixture: ${response.status} ${JSON.stringify(rows)}`);
  return rows[0].id;
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

const centerId = await resolveFixtureCenterId();
const routes = [
  { name: "location", path: `/operations/centers/${centerId}/location`, marker: "سجل الموقع" },
  { name: "approval", path: `/operations/centers/${centerId}/approval`, marker: "سجل الاعتماد" },
];
const cases = [
  { name: "cairo-mobile390", timezoneId: "Africa/Cairo", width: 390, height: 844 },
  { name: "tokyo-mobile390", timezoneId: "Asia/Tokyo", width: 390, height: 844 },
  { name: "cairo-desktop1440", timezoneId: "Africa/Cairo", width: 1440, height: 1000 },
];

const browser = await chromium.launch({ headless: true });
const captures = [];
const failures = [];

for (const route of routes) {
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
      await page.goto(`${baseUrl}${route.path}`, { waitUntil: "domcontentloaded", timeout: 20000 });
      await settle(page);
      const times = await readTimes(page);
      assert(times.length >= 2, `${route.name}/${testCase.name}: expected multiple current/history timestamps.`);
      for (const item of times) {
        assert(item.raw, `${route.name}/${testCase.name}: timestamp missing datetime.`);
        assert(item.text === item.expected, `${route.name}/${testCase.name}: ${item.raw} rendered ${item.text}, expected ${item.expected}.`);
        assert(item.dir === "auto", `${route.name}/${testCase.name}: timestamp must use dir=auto.`);
      }

      const bodyText = await page.locator("body").innerText();
      assert(bodyText.includes(route.marker), `${route.name}/${testCase.name}: expected history section is missing.`);
      const overflowPx = await page.evaluate(() => Math.max(0, Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0) - document.documentElement.clientWidth));
      assert(overflowPx <= 1, `${route.name}/${testCase.name}: horizontal overflow ${overflowPx}px.`);
      const screenshot = `${route.name}__${testCase.name}.png`;
      await page.screenshot({ path: path.join(outDir, screenshot), fullPage: true });
      captures.push({ route: route.name, ...testCase, times, overflowPx, screenshot, pageErrors });
      if (pageErrors.length) failures.push(`${route.name}/${testCase.name}: page errors ${pageErrors.join(" | ")}`);
    } catch (error) {
      failures.push(`${route.name}/${testCase.name}: ${String(error)}`);
    } finally {
      await context.close();
    }
  }
}

await browser.close();

const comparisons = [];
for (const route of routes) {
  const cairo = captures.find((item) => item.route === route.name && item.name === "cairo-mobile390")?.times?.[0];
  const tokyo = captures.find((item) => item.route === route.name && item.name === "tokyo-mobile390")?.times?.[0];
  if (!cairo || !tokyo) {
    failures.push(`${route.name}: missing Cairo/Tokyo comparison.`);
    continue;
  }
  if (cairo.raw !== tokyo.raw) failures.push(`${route.name}: timezone comparison did not use same raw timestamp: ${cairo.raw} vs ${tokyo.raw}.`);
  if (cairo.text === tokyo.text) failures.push(`${route.name}: device timezone did not change timestamp presentation for ${cairo.raw}.`);
  comparisons.push({ route: route.name, raw: cairo.raw, cairo: cairo.text, tokyo: tokyo.text });
}

const summary = {
  generatedAt: new Date().toISOString(),
  status: failures.length ? "FAIL" : "PASS",
  centerId,
  cases: captures.length,
  expectedCases: routes.length * cases.length,
  failures,
  comparisons,
  captures,
};
fs.writeFileSync(path.join(outDir, "ux-s02c-summary.json"), JSON.stringify(summary, null, 2));
fs.writeFileSync(path.join(outDir, "ux-s02c-summary.md"), [
  "# UX-S02C Center History Datetime Closure",
  "",
  `Status: ${summary.status}`,
  `Cases: ${summary.cases}/${summary.expectedCases}`,
  `Failures: ${failures.length}`,
  "",
  ...comparisons.flatMap((item) => [`${item.route} ISO: ${item.raw}`, `${item.route} Cairo: ${item.cairo}`, `${item.route} Tokyo: ${item.tokyo}`]),
  "",
  ...failures.map((failure) => `- ${failure}`),
].filter(Boolean).join("\n"));

console.log(`UX-S02C rendered Center datetime closure: ${summary.status}; cases=${summary.cases}; failures=${failures.length}.`);
if (failures.length) process.exit(1);
