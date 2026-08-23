import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const baseUrl = process.env.PG_AUDIT_BASE_URL ?? "http://127.0.0.1:3000";
const outDir = process.env.PG_AUDIT_OUT_DIR ?? "artifacts/ux-s01-rendered";
fs.mkdirSync(outDir, { recursive: true });

const roles = {
  admin: { email: "network-admin@example.test", password: "Agent-Network-Foundation-2026!", admin: true },
  agent: { email: "network-agent-a@example.test", password: "Agent-Network-Foundation-2026!", admin: false },
  dealer: { email: "network-dealer-a@example.test", password: "Agent-Network-Foundation-2026!", admin: false },
  center: { email: "cube-k-center-a@example.test", password: "Cube-K-Preinstall-Issues-2026!", admin: false },
};

const viewports = [
  { name: "mobile320", width: 320, height: 740 },
  { name: "mobile390", width: 390, height: 844 },
  { name: "desktop1440", width: 1440, height: 1000 },
];

async function login(page, role) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]').fill(role.email);
  await page.locator('input[name="password"]').fill(role.password);
  await Promise.all([
    page.waitForURL((url) => url.pathname.startsWith("/operations"), { timeout: 15000 }),
    page.getByRole("button", { name: "دخول" }).click(),
  ]);
}

async function settle(page) {
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function waitForProductsReady(page, role) {
  await page.waitForFunction(
    ({ admin }) => {
      const bodyText = document.body?.innerText ?? "";
      if (bodyText.includes("جاري تحميل البيانات")) return false;
      if (document.querySelector("h1")?.textContent?.trim() !== "المنتجات") return false;
      if (admin) return document.querySelector('a[href="/operations/products/new"]') !== null;
      return bodyText.includes("العرض فقط؛ إدارة المنتجات متاحة للشركة");
    },
    { admin: role.admin },
    { timeout: 15000 },
  );
  await settle(page);
}

const browser = await chromium.launch({ headless: true });
const captures = [];
const failures = [];

for (const [roleName, role] of Object.entries(roles)) {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error)));

    try {
      await login(page, role);
      const response = await page.goto(`${baseUrl}/operations/products`, { waitUntil: "domcontentloaded", timeout: 20000 });
      await waitForProductsReady(page, role);

      const metrics = await page.evaluate(() => {
        const root = document.documentElement;
        const body = document.body;
        const content = document.querySelector(".operations-content");
        const mobileNav = document.querySelector(".operations-mobile-nav");
        const bodyText = body?.innerText ?? "";
        return {
          h1: document.querySelector("h1")?.textContent?.trim() ?? null,
          denied: location.pathname.includes("/access-denied") || bodyText.includes("الوصول غير متاح"),
          readOnlyCopy: bodyText.includes("العرض فقط؛ إدارة المنتجات متاحة للشركة"),
          newProductLinks: document.querySelectorAll('a[href="/operations/products/new"]').length,
          editLinks: document.querySelectorAll('a[href^="/operations/products/"][href$="/edit"]').length,
          lifecycleButtons: [...document.querySelectorAll("button")].filter((button) => ["أرشفة", "إعادة تفعيل"].includes((button.textContent ?? "").trim())).length,
          overflowPx: Math.max(0, Math.max(root.scrollWidth, body?.scrollWidth ?? 0) - root.clientWidth),
          paddingBottom: content ? Number.parseFloat(getComputedStyle(content).paddingBottom) : 0,
          mobileNavVisible: mobileNav ? getComputedStyle(mobileNav).display !== "none" && mobileNav.getBoundingClientRect().height > 0 : false,
        };
      });

      const localFailures = [];
      if ((response?.status() ?? 500) >= 500) localFailures.push(`HTTP ${response?.status()}`);
      if (metrics.denied) localFailures.push("Products route resolved to access denied");
      if (metrics.h1 !== "المنتجات") localFailures.push(`Unexpected h1: ${JSON.stringify(metrics.h1)}`);
      if (metrics.overflowPx > 1) localFailures.push(`Horizontal overflow ${metrics.overflowPx}px`);
      if (pageErrors.length) localFailures.push(`Page errors: ${pageErrors.join(" | ")}`);

      if (role.admin) {
        if (metrics.readOnlyCopy) localFailures.push("Admin received read-only copy");
        if (metrics.newProductLinks < 1) localFailures.push("Admin missing create-product action");
        if (metrics.editLinks < 1) localFailures.push("Admin missing product edit action");
      } else {
        if (!metrics.readOnlyCopy) localFailures.push("Operational role missing explicit read-only copy");
        if (metrics.newProductLinks !== 0) localFailures.push("Operational role can see create-product action");
        if (metrics.editLinks !== 0) localFailures.push("Operational role can see edit-product action");
        if (metrics.lifecycleButtons !== 0) localFailures.push("Operational role can see product lifecycle action");
      }

      if (viewport.width <= 900) {
        if (metrics.paddingBottom < 92) localFailures.push(`Mobile content padding is ${metrics.paddingBottom}px, expected >=92px`);
        if (!metrics.mobileNavVisible) localFailures.push("Expected mobile navigation is not visible");
      }

      const screenshot = `${roleName}__${viewport.name}__products.png`;
      await page.screenshot({ path: path.join(outDir, screenshot), fullPage: true });
      captures.push({ role: roleName, viewport, metrics, screenshot, failures: localFailures });
      for (const failure of localFailures) failures.push({ role: roleName, viewport: viewport.name, failure });
    } catch (error) {
      failures.push({ role: roleName, viewport: viewport.name, failure: String(error) });
    } finally {
      await context.close();
    }
  }
}

await browser.close();

const summary = { generatedAt: new Date().toISOString(), status: failures.length ? "FAIL" : "PASS", failures, captures };
fs.writeFileSync(path.join(outDir, "ux-s01-summary.json"), JSON.stringify(summary, null, 2));
fs.writeFileSync(path.join(outDir, "ux-s01-summary.md"), [
  "# UX-S01 Rendered Closure",
  "",
  `Status: ${summary.status}`,
  `Captures: ${captures.length}`,
  `Failures: ${failures.length}`,
  "",
  ...failures.map((item) => `- ${item.role} / ${item.viewport}: ${item.failure}`),
].join("\n"));

console.log(`UX-S01 rendered closure: ${summary.status}; captures=${captures.length}; failures=${failures.length}.`);
if (failures.length) process.exit(1);
