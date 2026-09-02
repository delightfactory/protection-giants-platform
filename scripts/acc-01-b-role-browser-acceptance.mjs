import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const baseUrl = process.env.ACC_BASE_URL?.trim() || "http://127.0.0.1:3000";
const artifactDir = process.env.ACC_B_ARTIFACT_DIR?.trim() || "artifacts/acc-01-b";
const password = "Agent-Network-Foundation-2026!";

const viewports = [
  { name: "320", width: 320, height: 720, mobile: true },
  { name: "360", width: 360, height: 780, mobile: true },
  { name: "390", width: 390, height: 844, mobile: true },
  { name: "430", width: 430, height: 932, mobile: true },
  { name: "desktop", width: 1440, height: 1000, mobile: false },
];

const actors = [
  {
    role: "admin",
    email: "network-admin@example.test",
    roleLabel: "إدارة الشركة",
    mobileNav: ["الرئيسية", "المطالبات", "التنفيذ", "التحويلات", "العمليات"],
    desktopRequired: ["الرئيسية", "المطالبات", "التنفيذ", "التحويلات", "العهدة", "بلاغات اللفات", "الضمانات", "الإنتاج", "المراكز", "الموزعون", "وكلاء الدول", "الحسابات", "المنتجات"],
    moreRequired: "الحسابات",
    authorizedPath: "/operations/claims",
    forbiddenPath: null,
  },
  {
    role: "agent",
    email: "network-agent-a@example.test",
    roleLabel: "وكيل الدولة",
    mobileNav: ["الرئيسية", "التحويلات", "العهدة", "المراكز", "العمليات"],
    desktopRequired: ["الرئيسية", "التحويلات", "العهدة", "المراكز", "الموزعون", "المنتجات"],
    moreRequired: "الموزعون",
    authorizedPath: "/operations/centers",
    forbiddenPath: "/operations/users",
  },
  {
    role: "dealer",
    email: "network-dealer-a@example.test",
    roleLabel: "وكيل / موزع",
    mobileNav: ["الرئيسية", "التحويلات", "العهدة", "المراكز", "العمليات"],
    desktopRequired: ["الرئيسية", "التحويلات", "العهدة", "المراكز", "المنتجات"],
    moreRequired: "المنتجات",
    authorizedPath: "/operations/centers",
    forbiddenPath: "/operations/dealers",
  },
  {
    role: "center",
    email: "acc-role-center@example.test",
    roleLabel: "مركز تركيب",
    mobileNav: ["الرئيسية", "الفحوصات", "التنفيذ", "التحويلات", "العمليات"],
    desktopRequired: ["الرئيسية", "الفحوصات", "التنفيذ", "التحويلات", "العهدة", "بلاغات اللفات", "الضمانات", "المنتجات", "موقع المركز"],
    moreRequired: "موقع المركز",
    authorizedPath: "/operations/claim-inspections",
    forbiddenPath: "/operations/centers",
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

async function visibleNavLabels(page) {
  return page.locator('nav[aria-label="تنقل بوابة التشغيل"] a').evaluateAll((links) => links
    .filter((link) => {
      const style = getComputedStyle(link);
      const rect = link.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    })
    .map((link) => link.textContent?.trim() || "")
    .filter(Boolean));
}

async function mobileGeometry(page, enforceTouchTargets) {
  return page.evaluate(({ enforceTouchTargets: enforce }) => {
    const root = document.documentElement;
    const body = document.body;
    const viewportWidth = root.clientWidth;
    const scrollWidth = Math.max(root.scrollWidth, body?.scrollWidth ?? 0);
    const selectors = "a[href], button, input:not([type='hidden']), select, textarea, [role='button']";
    const targets = Array.from(document.querySelectorAll(selectors))
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
    const undersized = enforce ? targets.filter((target) => target.width < 44 || target.height < 44) : [];
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

async function login(page, email, expectedPath = "/operations") {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.getByLabel("كلمة المرور").fill(password);
  await Promise.all([
    page.waitForURL((url) => url.pathname === expectedPath, { timeout: 30000 }),
    page.getByRole("button", { name: "دخول" }).click(),
  ]);
  await page.waitForLoadState("networkidle");
}

fs.mkdirSync(artifactDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const results = [];
const failures = [];

try {
  for (const viewport of viewports) {
    for (const actor of actors) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        locale: "ar-EG",
      });
      const page = await context.newPage();
      const runtimeErrors = [];
      const badResponses = [];
      const label = `${viewport.name}/${actor.role}`;
      const screenshotPath = path.join(artifactDir, `${safeName(viewport.name)}-${safeName(actor.role)}-home.png`);
      const record = { viewport: viewport.name, role: actor.role, screenshot: screenshotPath };

      page.on("pageerror", (error) => runtimeErrors.push(`pageerror: ${error.message}`));
      page.on("console", (message) => {
        if (message.type() !== "error") return;
        const text = message.text();
        if (!isBrowserResourceStatusMessage(text)) runtimeErrors.push(`console.error: ${text}`);
      });
      page.on("response", (response) => {
        if (response.status() >= 400) {
          badResponses.push(`${response.status()} ${response.request().resourceType()} ${response.url()}`);
        }
      });

      try {
        await login(page, actor.email);
        assert(new URL(page.url()).pathname === "/operations", `${label}: login did not land on Operations Home.`);
        const homeText = await page.locator("body").innerText();
        assert(homeText.includes(actor.roleLabel), `${label}: role label ${actor.roleLabel} is not visible on Operations Home.`);

        const navLabels = await visibleNavLabels(page);
        record.navLabels = navLabels;
        if (viewport.mobile) {
          assert(JSON.stringify(navLabels) === JSON.stringify(actor.mobileNav),
            `${label}: mobile navigation mismatch. Expected ${JSON.stringify(actor.mobileNav)}, received ${JSON.stringify(navLabels)}.`);
        } else {
          for (const required of actor.desktopRequired) {
            assert(navLabels.includes(required), `${label}: desktop navigation is missing ${required}.`);
          }
        }

        const geometry = await mobileGeometry(page, viewport.mobile);
        record.geometry = geometry;
        assert(geometry.scrollWidth <= geometry.viewportWidth + 1,
          `${label}: horizontal overflow (${geometry.scrollWidth}px > ${geometry.viewportWidth}px).`);
        assert(geometry.undersized.length === 0,
          `${label}: mobile interactive targets below 44x44: ${JSON.stringify(geometry.undersized)}`);

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
        assert(focus?.focusVisible, `${label}: keyboard focus is not visibly exposed: ${JSON.stringify(focus)}.`);
        assert(focus.outlineStyle !== "none" || focus.boxShadow !== "none",
          `${label}: keyboard focus has no visible outline/ring.`);

        await page.screenshot({ path: screenshotPath, fullPage: true });

        if (viewport.mobile) {
          const moreLink = page.locator('nav[aria-label="تنقل بوابة التشغيل"] a[href="/operations/more"]').filter({ visible: true });
          await moreLink.click();
          await page.waitForURL((url) => url.pathname === "/operations/more");
          await page.getByText(actor.moreRequired, { exact: true }).first().waitFor({ state: "visible" });
          record.moreRequired = actor.moreRequired;
          if (viewport.name === "390") {
            await page.screenshot({
              path: path.join(artifactDir, `${safeName(actor.role)}-390-more.png`),
              fullPage: true,
            });
          }
        }

        const authorizedResponse = await page.goto(`${baseUrl}${actor.authorizedPath}`, { waitUntil: "networkidle" });
        assert(authorizedResponse?.status() === 200,
          `${label}: authorized route ${actor.authorizedPath} did not return HTTP 200.`);
        assert(new URL(page.url()).pathname === actor.authorizedPath,
          `${label}: authorized route ${actor.authorizedPath} redirected unexpectedly to ${page.url()}.`);
        await page.locator("h1").first().waitFor({ state: "visible" });
        record.authorizedPath = actor.authorizedPath;

        if (actor.forbiddenPath) {
          await page.goto(`${baseUrl}${actor.forbiddenPath}`, { waitUntil: "networkidle" });
          assert(new URL(page.url()).pathname === "/access-denied",
            `${label}: forbidden route ${actor.forbiddenPath} did not redirect to /access-denied; ended at ${page.url()}.`);
          await page.getByText("الوصول غير متاح", { exact: true }).waitFor({ state: "visible" });
          record.forbiddenPath = actor.forbiddenPath;
        }

        record.runtimeErrors = runtimeErrors;
        record.badResponses = badResponses;
        assert(runtimeErrors.length === 0, `${label}: runtime errors: ${runtimeErrors.join(" | ")}`);
        assert(badResponses.length === 0, `${label}: unexpected failed responses: ${badResponses.join(" | ")}`);
        record.ok = true;
      } catch (error) {
        record.ok = false;
        record.error = error instanceof Error ? error.message : String(error);
        record.runtimeErrors = runtimeErrors;
        record.badResponses = badResponses;
        failures.push(`${label}: ${record.error}`);
        await page.screenshot({
          path: path.join(artifactDir, `${safeName(viewport.name)}-${safeName(actor.role)}-failure.png`),
          fullPage: true,
        }).catch(() => {});
      } finally {
        results.push(record);
        await context.close();
      }
    }
  }

  const deniedContext = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ar-EG" });
  const deniedPage = await deniedContext.newPage();
  try {
    await login(deniedPage, "acc-role-denied@example.test", "/access-denied");
    await deniedPage.getByText("الوصول غير متاح", { exact: true }).waitFor({ state: "visible" });
    results.push({ viewport: "390", role: "authenticated-denied", path: "/access-denied", ok: true });
    await deniedPage.screenshot({ path: path.join(artifactDir, "390-authenticated-access-denied.png"), fullPage: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`390/authenticated-denied: ${message}`);
    results.push({ viewport: "390", role: "authenticated-denied", path: "/access-denied", ok: false, error: message });
  } finally {
    await deniedContext.close();
  }
} finally {
  await browser.close();
  fs.writeFileSync(
    path.join(artifactDir, "summary.json"),
    `${JSON.stringify({ baseUrl, generatedAt: new Date().toISOString(), results, failures }, null, 2)}\n`,
  );
}

if (failures.length) {
  console.error(`ACC-01-B role browser acceptance FAILED with ${failures.length} case(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`ACC-01-B role browser acceptance PASS: ${actors.length * viewports.length} role/viewport walkthroughs plus authenticated access-denied were rendered successfully.`);
