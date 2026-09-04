import fs from "node:fs";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const baseUrl = process.env.ACC_BASE_URL?.trim() || process.env.BASE_URL?.trim() || "http://127.0.0.1:3100";
const artifactDir = process.env.ACC_D_ARTIFACT_DIR?.trim() || "artifacts/uat-01-d";
const adminEmail = "network-admin@example.test";
const password = "Agent-Network-Foundation-2026!";
const controlledDelayMs = 1800;
const viewports = [
  { name: "390", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 1000 },
];
const navigationCase = {
  name: "authenticated-products-to-transfers",
  startPath: "/operations/products?uat=01-d",
  startHeading: "المنتجات",
  targetPath: "/operations/transfers",
  targetHeading: "تحويلات اللفات",
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function pause(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isTargetRscRequest(request, targetUrl) {
  const requestUrl = new URL(request.url());
  return request.method() === "GET"
    && requestUrl.origin === targetUrl.origin
    && requestUrl.pathname === targetUrl.pathname
    && requestUrl.searchParams.has("_rsc");
}

async function login(page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle", timeout: 30000 });
  await page.getByLabel("البريد الإلكتروني").fill(adminEmail);
  await page.getByLabel("كلمة المرور").fill(password);
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/operations", { timeout: 30000 }),
    page.getByRole("button", { name: "دخول" }).click(),
  ]);
  await page.waitForLoadState("networkidle");
}

async function firstVisibleLink(page, href, label) {
  const links = page.locator(`a[href="${href}"]`);
  const count = await links.count();
  for (let index = 0; index < count; index += 1) {
    const link = links.nth(index);
    if (await link.isVisible()) return link;
  }
  throw new Error(`${label}: no visible link found for ${href}.`);
}

async function openStartRoute(page, testCase) {
  await page.goto(`${baseUrl}${testCase.startPath}`, { waitUntil: "networkidle", timeout: 30000 });
  await page.getByRole("heading", { name: testCase.startHeading, level: 1 }).waitFor({ state: "visible" });
}

async function waitForTargetReady(page, testCase) {
  const targetUrl = new URL(testCase.targetPath, baseUrl);
  await page.waitForFunction(({ pathname, search }) => (
    window.location.pathname === pathname && window.location.search === search
  ), { pathname: targetUrl.pathname, search: targetUrl.search }, { timeout: 30000 });
  await page.getByRole("heading", { name: testCase.targetHeading, level: 1 }).waitFor({ state: "visible", timeout: 30000 });
}

async function auditReadyRoute(page) {
  const geometry = await page.evaluate(() => ({
    scrollWidth: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0),
    clientWidth: document.documentElement.clientWidth,
  }));
  assert(geometry.scrollWidth <= geometry.clientWidth + 1,
    `horizontal overflow (${geometry.scrollWidth}px > ${geometry.clientWidth}px).`);
  const axe = await new AxeBuilder({ page }).analyze();
  assert(axe.violations.length === 0,
    `axe violations: ${axe.violations.map((violation) => violation.id).join(", ")}`);
  return { geometry, axeViolations: axe.violations.length };
}

async function installControlledDelay(page, targetUrl) {
  const metrics = { delayedRequestCount: 0, observedDelayMs: [] };
  let navigationStarted = false;
  const routeHandler = async (route) => {
    if (!isTargetRscRequest(route.request(), targetUrl)) {
      await route.continue();
      return;
    }
    if (!navigationStarted) {
      await route.abort();
      return;
    }
    metrics.delayedRequestCount += 1;
    const delayStartedAt = performance.now();
    await pause(controlledDelayMs);
    metrics.observedDelayMs.push(Math.round(performance.now() - delayStartedAt));
    await route.continue();
  };
  await page.route("**/*", routeHandler);
  return {
    metrics,
    routeHandler,
    beginNavigation() {
      navigationStarted = true;
    },
  };
}

async function measureControlledFeedback(browser, viewport, testCase) {
  const context = await browser.newContext({ viewport, locale: "ar-EG" });
  const page = await context.newPage();
  const runtimeErrors = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  const targetUrl = new URL(testCase.targetPath, baseUrl);
  let controlledDelay = null;
  try {
    await login(page);
    controlledDelay = await installControlledDelay(page, targetUrl);
    await openStartRoute(page, testCase);
    const link = await firstVisibleLink(page, testCase.targetPath, `${viewport.width}/${testCase.name}`);
    const feedback = page.locator(".ui-navigation-feedback");
    assert(await feedback.count() === 0, "Navigation feedback must be absent before the transition.");

    const clickStartedAt = await page.evaluate(() => performance.now());
    controlledDelay.beginNavigation();
    const clickPromise = link.click();
    await feedback.waitFor({ state: "visible", timeout: 5000 });
    const firstFeedbackAt = await page.evaluate(() => performance.now());
    const preReadyState = {
      pathname: new URL(page.url()).pathname,
      search: new URL(page.url()).search,
      feedbackVisible: await feedback.isVisible(),
      targetHeadingVisible: await page.getByRole("heading", { name: testCase.targetHeading, level: 1 }).isVisible(),
    };
    assert(preReadyState.feedbackVisible, "Navigation feedback was not visible after its wait resolved.");
    assert(!preReadyState.targetHeadingVisible,
      "Navigation feedback appeared only after the target route was already ready.");

    await clickPromise;
    await waitForTargetReady(page, testCase);
    const routeReadyAt = await page.evaluate(() => performance.now());
    await feedback.waitFor({ state: "hidden", timeout: 5000 });
    const postReadyState = {
      pathname: new URL(page.url()).pathname,
      search: new URL(page.url()).search,
      feedbackVisible: await feedback.isVisible(),
    };
    assert(!postReadyState.feedbackVisible,
      "Navigation feedback remained visible after the pathname/search transition completed.");
    assert(controlledDelay.metrics.delayedRequestCount > 0,
      "Controlled navigation did not observe a delayed target RSC request.");
    assert(controlledDelay.metrics.observedDelayMs.some((value) => value >= controlledDelayMs - 100),
      `Controlled target request was not delayed for approximately ${controlledDelayMs}ms.`);
    assert(runtimeErrors.length === 0, `runtime errors: ${runtimeErrors.join(" | ")}`);
    const audit = await auditReadyRoute(page);
    return {
      mode: "controlled-delay-feedback",
      viewport,
      route: testCase,
      controlledDelayMs,
      observedDelayMs: controlledDelay.metrics.observedDelayMs,
      delayedRequestCount: controlledDelay.metrics.delayedRequestCount,
      clickToFirstVisibleFeedbackMs: Math.round(firstFeedbackAt - clickStartedAt),
      clickToRouteReadyMs: Math.round(routeReadyAt - clickStartedAt),
      feedbackBeforeRouteReady: firstFeedbackAt < routeReadyAt,
      preReadyState,
      postReadyState,
      runtimeErrors,
      ...audit,
    };
  } finally {
    if (controlledDelay) await page.unroute("**/*", controlledDelay.routeHandler);
    await context.close();
  }
}

async function measureUnthrottledReadiness(browser, viewport, testCase) {
  const context = await browser.newContext({ viewport, locale: "ar-EG" });
  const page = await context.newPage();
  const runtimeErrors = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  try {
    await login(page);
    await openStartRoute(page, testCase);
    const link = await firstVisibleLink(page, testCase.targetPath, `${viewport.width}/${testCase.name}`);
    const clickStartedAt = await page.evaluate(() => performance.now());
    await link.click();
    await waitForTargetReady(page, testCase);
    const routeReadyAt = await page.evaluate(() => performance.now());
    assert(runtimeErrors.length === 0, `runtime errors: ${runtimeErrors.join(" | ")}`);
    const audit = await auditReadyRoute(page);
    return {
      mode: "unthrottled-route-readiness",
      viewport,
      route: testCase,
      clickToRouteReadyMs: Math.round(routeReadyAt - clickStartedAt),
      readyUrl: page.url(),
      runtimeErrors,
      ...audit,
    };
  } finally {
    await context.close();
  }
}

fs.mkdirSync(artifactDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
const failures = [];

try {
  for (const viewport of viewports) {
    const record = { viewport, controlled: null, unthrottled: null };
    try {
      record.controlled = await measureControlledFeedback(browser, viewport, navigationCase);
    } catch (error) {
      failures.push(`${viewport.name}/controlled-delay-feedback: ${error instanceof Error ? error.message : String(error)}`);
    }
    try {
      record.unthrottled = await measureUnthrottledReadiness(browser, viewport, navigationCase);
    } catch (error) {
      failures.push(`${viewport.name}/unthrottled-route-readiness: ${error instanceof Error ? error.message : String(error)}`);
    }
    results.push(record);
  }
} finally {
  await browser.close();
  fs.writeFileSync(
    `${artifactDir}/summary.json`,
    `${JSON.stringify({ baseUrl, actor: adminEmail, controlledDelayMs, results, failures }, null, 2)}\n`,
  );
}

console.log(JSON.stringify({ results, failures }, null, 2));
if (failures.length > 0) {
  console.error(`UAT-01-D navigation FAILED with ${failures.length} case(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("UAT-01-D navigation PASS: authenticated operational feedback and separate unthrottled readiness were verified at mobile and desktop sizes.");
