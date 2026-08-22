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
    allowed: [
      "/operations",
      "/operations/users",
      "/operations/agents",
      "/operations/dealers",
      "/operations/centers",
      "/operations/products",
      "/operations/production-orders",
      "/operations/production-orders/new",
      "/operations/rolls",
      "/operations/rolls/recovery",
      "/operations/rolls/issues",
      "/operations/transfers",
      "/operations/transfers/new",
    ],
    denied: [],
  },
  agent: {
    email: "network-agent-a@example.test",
    password: "Agent-Network-Foundation-2026!",
    allowed: [
      "/operations",
      "/operations/dealers",
      "/operations/centers",
      "/operations/products",
      "/operations/rolls",
      "/operations/transfers",
      "/operations/transfers/new",
    ],
    denied: [
      "/operations/users",
      "/operations/agents",
      "/operations/production-orders",
      "/operations/rolls/issues",
      "/operations/rolls/open",
      "/operations/rolls/recovery",
    ],
  },
  dealer: {
    email: "network-dealer-a@example.test",
    password: "Agent-Network-Foundation-2026!",
    allowed: [
      "/operations",
      "/operations/centers",
      "/operations/products",
      "/operations/rolls",
      "/operations/transfers",
      "/operations/transfers/new",
    ],
    denied: [
      "/operations/users",
      "/operations/agents",
      "/operations/dealers",
      "/operations/production-orders",
      "/operations/rolls/issues",
      "/operations/rolls/open",
      "/operations/rolls/recovery",
    ],
  },
  center: {
    email: "cube-k-center-a@example.test",
    password: "Cube-K-Preinstall-Issues-2026!",
    allowed: [
      "/operations",
      "/operations/location",
      "/operations/products",
      "/operations/rolls",
      "/operations/rolls/open",
      "/operations/rolls/issues",
      "/operations/rolls/issues/new",
      "/operations/transfers",
      "/operations/transfers/new",
    ],
    denied: [
      "/operations/users",
      "/operations/agents",
      "/operations/dealers",
      "/operations/centers",
      "/operations/production-orders",
      "/operations/rolls/recovery",
    ],
  },
};

const standardViewports = [
  { name: "mobile390", width: 390, height: 844 },
  { name: "desktop1440", width: 1440, height: 1000 },
];

const extendedViewports = [
  { name: "mobile320", width: 320, height: 740 },
  { name: "mobile430", width: 430, height: 932 },
  { name: "tablet768", width: 768, height: 1024 },
];

function isHighRisk(route) {
  return [
    "/operations",
    "/operations/products",
    "/operations/centers",
    "/operations/transfers",
    "/operations/transfers/new",
    "/operations/rolls",
    "/operations/rolls/open",
    "/operations/rolls/issues",
    "/operations/rolls/issues/new",
    "/operations/rolls/recovery",
  ].includes(route);
}

function safeName(value) {
  return value
    .replace(/^\//, "")
    .replaceAll("/", "__")
    .replaceAll("?", "_")
    .replaceAll("=", "-") || "root";
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

async function collectPageMetrics(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const visible = (el) => {
      const style = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && box.width > 0 && box.height > 0;
    };
    const clickables = [...document.querySelectorAll("a,button,input,select,textarea,[role=button]")]
      .filter(visible)
      .map((el) => {
        const box = el.getBoundingClientRect();
        return {
          tag: el.tagName.toLowerCase(),
          text: (el.getAttribute("aria-label") || el.textContent || el.getAttribute("name") || "").trim().slice(0, 100),
          width: Math.round(box.width),
          height: Math.round(box.height),
        };
      });

    const navLinks = [...document.querySelectorAll('nav[aria-label="تنقل بوابة التشغيل"] a')]
      .filter(visible)
      .map((a) => ({ text: (a.textContent || "").trim(), href: a.getAttribute("href") }));

    const primaryActions = [...document.querySelectorAll(".button-primary")]
      .filter(visible)
      .map((el) => (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 100));

    return {
      title: document.title,
      h1: document.querySelector("h1")?.textContent?.trim() ?? null,
      bodyText: (body?.innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 1200),
      dir: root.getAttribute("dir") || body?.getAttribute("dir") || null,
      viewportWidth: root.clientWidth,
      scrollWidth: Math.max(root.scrollWidth, body?.scrollWidth ?? 0),
      overflowPx: Math.max(0, Math.max(root.scrollWidth, body?.scrollWidth ?? 0) - root.clientWidth),
      smallControls: clickables.filter((item) => item.width < 44 || item.height < 44).slice(0, 30),
      navLinks,
      primaryActions,
    };
  });
}

async function captureRoute({ browser, roleName, role, viewport, route, expectedAllowed }) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (error) => pageErrors.push(String(error)));

  let loginError = null;
  try {
    await login(page, role);
  } catch (error) {
    loginError = String(error);
  }

  let responseStatus = null;
  let navigationError = null;
  if (!loginError) {
    try {
      const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 20000 });
      responseStatus = response?.status() ?? null;
      await page.waitForTimeout(500);
    } catch (error) {
      navigationError = String(error);
    }
  }

  const finalUrl = page.url();
  const denied = finalUrl.includes("/access-denied") || (await page.locator("text=الوصول غير متاح").count()) > 0;
  const metrics = !loginError && !navigationError ? await collectPageMetrics(page) : null;
  const screenshotName = `${roleName}__${viewport.name}__${safeName(route)}.png`;
  const screenshotPath = path.join(outDir, screenshotName);
  try {
    await page.screenshot({ path: screenshotPath, fullPage: true });
  } catch {}

  const findings = [];
  if (loginError) findings.push({ severity: "P0", code: "LOGIN_FAILED", detail: loginError });
  if (navigationError) findings.push({ severity: "P0", code: "NAVIGATION_FAILED", detail: navigationError });
  if (responseStatus && responseStatus >= 500) findings.push({ severity: "P0", code: "HTTP_5XX", detail: String(responseStatus) });
  if (expectedAllowed && denied) findings.push({ severity: "P0", code: "EXPECTED_ROUTE_DENIED", detail: route });
  if (!expectedAllowed && !denied) findings.push({ severity: "P0", code: "FORBIDDEN_ROUTE_ACCESSIBLE", detail: route });
  if (metrics?.overflowPx > 1) findings.push({ severity: "P1", code: "HORIZONTAL_OVERFLOW", detail: `${metrics.overflowPx}px` });
  if (pageErrors.length) findings.push({ severity: "P1", code: "PAGE_ERROR", detail: pageErrors.slice(0, 5).join(" | ") });
  if (consoleErrors.length) findings.push({ severity: "P2", code: "CONSOLE_ERROR", detail: consoleErrors.slice(0, 5).join(" | ") });
  if (metrics?.smallControls?.length) findings.push({ severity: "P2", code: "SUB_44PX_CONTROLS", detail: `${metrics.smallControls.length} sampled` });

  await context.close();
  return {
    role: roleName,
    viewport,
    route,
    expectedAllowed,
    finalUrl,
    responseStatus,
    denied,
    loginError,
    navigationError,
    consoleErrors,
    pageErrors,
    screenshot: screenshotName,
    metrics,
    findings,
  };
}

const browser = await chromium.launch({ headless: true });
const results = [];

for (const [roleName, role] of Object.entries(roles)) {
  const allowedRoutes = role.allowed;
  const deniedRoutes = role.denied;
  for (const route of allowedRoutes) {
    const viewports = isHighRisk(route) ? [...standardViewports, ...extendedViewports] : standardViewports;
    for (const viewport of viewports) {
      results.push(await captureRoute({ browser, roleName, role, viewport, route, expectedAllowed: true }));
    }
  }
  for (const route of deniedRoutes) {
    for (const viewport of standardViewports) {
      results.push(await captureRoute({ browser, roleName, role, viewport, route, expectedAllowed: false }));
    }
  }
}

// Discover representative dynamic details from list pages for Admin and Center.
for (const [roleName, role] of Object.entries({ admin: roles.admin, center: roles.center })) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await login(page, role);
  for (const listRoute of ["/operations/rolls/issues", "/operations/transfers"]) {
    await page.goto(`${baseUrl}${listRoute}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(400);
    const href = await page.locator(`a[href^="${listRoute}/"]`).first().getAttribute("href").catch(() => null);
    if (href && !href.endsWith("/new")) {
      for (const viewport of standardViewports) {
        results.push(await captureRoute({ browser, roleName, role, viewport, route: href, expectedAllowed: true }));
      }
    }
  }
  await context.close();
}

await browser.close();

const findingRows = results.flatMap((result) => result.findings.map((finding) => ({
  role: result.role,
  viewport: result.viewport.name,
  route: result.route,
  screenshot: result.screenshot,
  ...finding,
})));

const summary = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  totalCaptures: results.length,
  roles: Object.keys(roles),
  findingCounts: findingRows.reduce((acc, row) => {
    acc[row.severity] = (acc[row.severity] ?? 0) + 1;
    return acc;
  }, {}),
  findings: findingRows,
  captures: results,
};

fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));

const lines = [
  "# Protection Giants — Rendered Role Walkthrough Run",
  "",
  `Generated: ${summary.generatedAt}`,
  `Captures: ${summary.totalCaptures}`,
  `Finding counts: ${JSON.stringify(summary.findingCounts)}`,
  "",
  "## Findings",
  "",
  "| Severity | Role | Viewport | Route | Code | Detail | Screenshot |",
  "|---|---|---|---|---|---|---|",
  ...findingRows.map((row) => `| ${row.severity} | ${row.role} | ${row.viewport} | \`${row.route}\` | ${row.code} | ${String(row.detail).replaceAll("|", "\\|")} | ${row.screenshot} |`),
  "",
  "## Capture index",
  "",
  ...results.map((result) => `- ${result.role} / ${result.viewport.name} / \`${result.route}\` → ${result.screenshot} / h1=${JSON.stringify(result.metrics?.h1 ?? null)} / denied=${result.denied} / overflow=${result.metrics?.overflowPx ?? "n/a"}px`),
];
fs.writeFileSync(path.join(outDir, "summary.md"), lines.join("\n"));

const blocking = findingRows.filter((row) => row.severity === "P0" || row.severity === "P1");
console.log(`Rendered role walkthrough captured ${results.length} surfaces; P0/P1 findings: ${blocking.length}.`);
// Do not fail on UX findings: the audit must upload evidence. Failures of the harness itself are already represented as P0 rows.
