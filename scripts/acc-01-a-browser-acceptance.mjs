import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const baseUrl = process.env.ACC_BASE_URL?.trim() || "http://127.0.0.1:3000";
const artifactDir = process.env.ACC_ARTIFACT_DIR?.trim() || "artifacts/acc-01-a";

const viewports = [
  { name: "320", width: 320, height: 720, mobile: true },
  { name: "360", width: 360, height: 780, mobile: true },
  { name: "390", width: 390, height: 844, mobile: true },
  { name: "430", width: 430, height: 932, mobile: true },
  { name: "desktop", width: 1440, height: 1000, mobile: false },
];

const routes = [
  { name: "login", pathname: "/login", status: 200, text: "تسجيل الدخول" },
  { name: "access-denied", pathname: "/access-denied", status: 200, text: "الوصول غير متاح" },
  { name: "warranty-entry", pathname: "/warranty", status: 200, text: "الوصول إلى ضمانك" },
  { name: "root-not-found", pathname: "/acc-01-invalid-route", status: 404, text: "الصفحة غير متاحة" },
  {
    name: "invalid-roll-qr",
    pathname: "/r/PG-R-20991231-99999999-99-99999",
    status: 404,
    text: "تعذر فتح هذا الرمز",
  },
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function safeName(value) {
  return value.replace(/[^a-z0-9-]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
}

function isBrowserResourceStatusMessage(text) {
  return /^Failed to load resource: the server responded with a status of \d{3}/.test(text);
}

async function pageGeometry(page, enforceTouchTargets) {
  return page.evaluate(({ enforceTouchTargets: enforce }) => {
    const root = document.documentElement;
    const body = document.body;
    const viewportWidth = root.clientWidth;
    const scrollWidth = Math.max(root.scrollWidth, body?.scrollWidth ?? 0);

    const targetSelectors = [
      ".button",
      ".nav-link",
      ".auth-back-link",
      ".ui-icon-button",
      "input:not([type='hidden'])",
      "select",
      "textarea",
    ];

    const targets = Array.from(document.querySelectorAll(targetSelectors.join(",")))
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          className: element.className || "",
          name: element.getAttribute("aria-label") || element.textContent?.trim().slice(0, 80) || element.getAttribute("name") || "",
          width: Number(rect.width.toFixed(2)),
          height: Number(rect.height.toFixed(2)),
        };
      });

    const undersized = enforce
      ? targets.filter((target) => target.width < 44 || target.height < 44)
      : [];

    return { viewportWidth, scrollWidth, targets, undersized };
  }, { enforceTouchTargets });
}

async function keyboardFocusEvidence(page) {
  await page.keyboard.press("Tab");
  return page.evaluate(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || active === document.body) return null;
    const style = getComputedStyle(active);
    return {
      tag: active.tagName.toLowerCase(),
      className: active.className || "",
      name: active.getAttribute("aria-label") || active.textContent?.trim().slice(0, 80) || active.getAttribute("name") || "",
      focusVisible: active.matches(":focus-visible"),
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      boxShadow: style.boxShadow,
    };
  });
}

fs.mkdirSync(artifactDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const results = [];
const failures = [];

try {
  for (const viewport of viewports) {
    for (const route of routes) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        locale: "ar-EG",
      });
      const page = await context.newPage();
      const runtimeErrors = [];
      const badResponses = [];
      const targetUrl = new URL(route.pathname, baseUrl).toString();

      page.on("pageerror", (error) => runtimeErrors.push(`pageerror: ${error.message}`));
      page.on("console", (message) => {
        if (message.type() !== "error") return;
        const text = message.text();
        if (!isBrowserResourceStatusMessage(text)) runtimeErrors.push(`console.error: ${text}`);
      });
      page.on("response", (response) => {
        const status = response.status();
        if (status < 400) return;

        const request = response.request();
        const isExpectedDocumentResponse = request.resourceType() === "document"
          && response.url() === targetUrl
          && status === route.status
          && route.status >= 400;

        if (!isExpectedDocumentResponse) {
          badResponses.push(`${status} ${request.resourceType()} ${response.url()}`);
        }
      });

      const label = `${viewport.name}/${route.name}`;
      const screenshotPath = path.join(artifactDir, `${safeName(viewport.name)}-${safeName(route.name)}.png`);
      const record = {
        viewport: viewport.name,
        route: route.pathname,
        expectedStatus: route.status,
        screenshot: screenshotPath,
      };

      try {
        const response = await page.goto(targetUrl, { waitUntil: "networkidle" });
        assert(response, `${label}: navigation returned no response.`);
        record.status = response.status();
        assert(response.status() === route.status,
          `${label}: expected HTTP ${route.status}, received ${response.status()}.`);

        await page.getByText(route.text, { exact: false }).first().waitFor({ state: "visible" });
        record.expectedText = route.text;

        const documentContract = await page.evaluate(() => ({
          lang: document.documentElement.lang,
          dir: document.documentElement.dir,
          framework404: document.body.innerText.includes("This page could not be found"),
        }));
        record.document = documentContract;
        assert(documentContract.lang === "ar", `${label}: root lang must remain ar.`);
        assert(documentContract.dir === "rtl", `${label}: root dir must remain rtl.`);
        assert(!documentContract.framework404, `${label}: framework-default English 404 leaked into product surface.`);

        const geometry = await pageGeometry(page, viewport.mobile);
        record.geometry = geometry;
        assert(geometry.scrollWidth <= geometry.viewportWidth + 1,
          `${label}: horizontal page overflow (${geometry.scrollWidth}px > ${geometry.viewportWidth}px).`);
        assert(geometry.undersized.length === 0,
          `${label}: interactive mobile targets below 44x44: ${JSON.stringify(geometry.undersized)}`);

        const axe = await new AxeBuilder({ page }).analyze();
        record.axe = axe.violations.map((violation) => ({
          id: violation.id,
          impact: violation.impact,
          help: violation.help,
          nodes: violation.nodes.length,
        }));
        assert(axe.violations.length === 0,
          `${label}: axe violations: ${record.axe.map((item) => `${item.id}:${item.impact}:${item.nodes}`).join(", ")}`);

        const focus = await keyboardFocusEvidence(page);
        record.focus = focus;
        assert(focus, `${label}: keyboard Tab did not enter an interactive control.`);
        assert(focus.focusVisible,
          `${label}: first keyboard-focused control is not :focus-visible (${JSON.stringify(focus)}).`);
        const hasVisibleFocus = focus.outlineStyle !== "none" || focus.boxShadow !== "none";
        assert(hasVisibleFocus, `${label}: keyboard focus has no visible outline/ring.`);

        record.runtimeErrors = runtimeErrors;
        record.badResponses = badResponses;
        assert(runtimeErrors.length === 0,
          `${label}: browser runtime errors: ${runtimeErrors.join(" | ")}`);
        assert(badResponses.length === 0,
          `${label}: unexpected failed resource/API responses: ${badResponses.join(" | ")}`);

        record.ok = true;
      } catch (error) {
        record.ok = false;
        record.error = error instanceof Error ? error.message : String(error);
        record.runtimeErrors = runtimeErrors;
        record.badResponses = badResponses;
        failures.push(`${label}: ${record.error}`);
      } finally {
        await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
        results.push(record);
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
  fs.writeFileSync(
    path.join(artifactDir, "summary.json"),
    `${JSON.stringify({ baseUrl, generatedAt: new Date().toISOString(), results, failures }, null, 2)}\n`,
  );
}

if (failures.length) {
  console.error(`ACC-01-A browser acceptance FAILED with ${failures.length} case(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`ACC-01-A browser acceptance PASS: ${results.length} rendered route/viewport cases completed with no overflow, touch-target, runtime, axe, keyboard-focus, or unexpected resource/API failures.`);
