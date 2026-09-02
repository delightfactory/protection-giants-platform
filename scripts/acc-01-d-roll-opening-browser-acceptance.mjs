import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const baseUrl = process.env.ACC_BASE_URL?.trim() || "http://127.0.0.1:3000";
const apiUrl = process.env.API_URL;
const anonKey = process.env.ANON_KEY;
const artifactDir = process.env.ACC_D_ARTIFACT_DIR?.trim() || "artifacts/acc-01-d";
const password = "Agent-Network-Foundation-2026!";

if (!apiUrl || !anonKey) throw new Error("API_URL and ANON_KEY are required for ACC-01-D.");

const fixture = JSON.parse(fs.readFileSync(path.join(artifactDir, "fixture.json"), "utf8"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

async function request(pathname, { method = "GET", token = anonKey, body } = {}) {
  const headers = { apikey: anonKey, Authorization: `Bearer ${token}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${apiUrl}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { response, body: await readJson(response) };
}

async function signInApi(email) {
  const result = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email, password },
  });
  assert(result.response.ok && result.body?.access_token,
    `Could not sign in API actor ${email}: ${result.response.status} ${JSON.stringify(result.body)}`);
  return result.body.access_token;
}

async function rpc(name, body, token) {
  return request(`/rest/v1/rpc/${name}`, { method: "POST", body, token });
}

function dbContainerName() {
  const names = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" })
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
  const name = names.find((value) => value.startsWith("supabase_db_"));
  assert(name, "Supabase database container was not found for ACC-01-D.");
  return name;
}

function querySql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", dbContainerName(), "psql", "-At", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-c", sql],
    { encoding: "utf8" },
  ).trim();
}

function sqlUuid(value) {
  assert(/^[0-9a-f-]{36}$/i.test(value), `Unsafe UUID fixture value: ${value}`);
  return `'${value}'::uuid`;
}

function oneSql(sql, label) {
  const raw = querySql(`select row_to_json(q)::text from (${sql}) q;`);
  const rows = raw ? raw.split("\n").filter(Boolean) : [];
  assert(rows.length === 1, `${label}: expected one row, received ${rows.length}.`);
  return JSON.parse(rows[0]);
}

function custodyParty(rollId) {
  return querySql(`select custodian_party_id::text from public.roll_custody_current where roll_id = ${sqlUuid(rollId)};`);
}

function reservationCount(rollId) {
  return Number(querySql(`select count(*) from public.roll_transfer_reservations where roll_id = ${sqlUuid(rollId)};`));
}

function openingCount(rollId) {
  return Number(querySql(`select count(*) from public.roll_openings where roll_id = ${sqlUuid(rollId)};`));
}

async function login(page, email) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.getByLabel("كلمة المرور").fill(password);
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/operations", { timeout: 30000 }),
    page.getByRole("button", { name: "دخول" }).click(),
  ]);
  await page.getByRole("heading", { level: 1 }).waitFor({ state: "visible" });
}

function attachDiagnostics(page, prefix, runtimeErrors, failedResponses) {
  page.on("pageerror", (error) => runtimeErrors.push(`${prefix} pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" && !/^Failed to load resource:/.test(message.text())) {
      runtimeErrors.push(`${prefix} console.error: ${message.text()}`);
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      failedResponses.push({
        actor: prefix,
        status: response.status(),
        method: response.request().method(),
        url: response.url(),
      });
    }
  });
}

async function failureSnapshot(page, filePrefix) {
  const diagnostic = { url: page.url(), bodyExcerpt: "" };
  try { diagnostic.bodyExcerpt = (await page.locator("body").innerText()).slice(0, 1600); } catch {}
  try { await page.screenshot({ path: path.join(artifactDir, `${filePrefix}-failure.png`), fullPage: true }); } catch {}
  return diagnostic;
}

async function audit(page, label, mobile) {
  const geometry = await page.evaluate((enforce) => {
    const root = document.documentElement;
    const body = document.body;
    const viewportWidth = root.clientWidth;
    const scrollWidth = Math.max(root.scrollWidth, body?.scrollWidth ?? 0);
    const targets = Array.from(document.querySelectorAll(
      "a[href], button, input:not([type='hidden']), select, textarea, [role='button']",
    ))
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          name: element.getAttribute("aria-label") || element.textContent?.trim().slice(0, 80) || "",
          width: rect.width,
          height: rect.height,
        };
      });

    return {
      viewportWidth,
      scrollWidth,
      undersized: enforce ? targets.filter((item) => item.width < 44 || item.height < 44) : [],
    };
  }, mobile);

  assert(geometry.scrollWidth <= geometry.viewportWidth + 1, `${label}: horizontal overflow.`);
  assert(geometry.undersized.length === 0,
    `${label}: undersized mobile targets ${JSON.stringify(geometry.undersized)}`);

  const axe = await new AxeBuilder({ page }).analyze();
  const axeDetails = axe.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    nodes: violation.nodes.map((node) => ({
      target: node.target,
      html: node.html,
      failureSummary: node.failureSummary,
    })),
  }));
  assert(axeDetails.length === 0, `${label}: axe violations ${JSON.stringify(axeDetails)}`);
  return { geometry, axe: axeDetails };
}

fs.mkdirSync(artifactDir, { recursive: true });
const centerToken = await signInApi(fixture.actor.email);
const browser = await chromium.launch({ headless: true });
const results = [];
const failures = [];

try {
  for (const scenario of fixture.scenarios) {
    const mobile = scenario.width < 600;
    const label = scenario.name;
    const runtimeErrors = [];
    const failedResponses = [];
    const context = await browser.newContext({
      viewport: { width: scenario.width, height: scenario.height },
      locale: "ar-EG",
    });
    const page = await context.newPage();
    attachDiagnostics(page, "center", runtimeErrors, failedResponses);

    try {
      assert(openingCount(scenario.rollId) === 0, `${label}: Roll was already opened before browser acceptance.`);
      assert(custodyParty(scenario.rollId) === fixture.actor.partyId, `${label}: Center is not current custodian before opening.`);
      assert(reservationCount(scenario.rollId) === 0, `${label}: Roll is unexpectedly reserved before opening.`);

      await login(page, fixture.actor.email);
      await page.goto(`${baseUrl}/operations/rolls/open`, { waitUntil: "networkidle" });
      await page.getByRole("heading", { name: "فتح رول", level: 1 }).waitFor();

      const manualInput = page.getByLabel("أو أدخل سيريال الرول");
      await manualInput.fill(scenario.serialNumber);
      await page.getByRole("button", { name: "تحقق من الرول" }).click();

      await page.getByRole("heading", { name: "ACC 01 D Roll Opening Acceptance PPF", level: 2 }).waitFor({ timeout: 30000 });
      await page.getByText("تأكيد مادي دائم", { exact: true }).waitFor();
      await page.getByText(scenario.serialNumber, { exact: true }).waitFor();

      const candidateAudit = await audit(page, `${label}/opening-candidate`, mobile);
      await page.screenshot({ path: path.join(artifactDir, `${label}-opening-candidate.png`), fullPage: true });

      await page.getByRole("button", { name: "تأكيد فتح الرول" }).click();
      await page.getByRole("heading", { name: "تم فتح الرول بنجاح", level: 2 }).waitFor({ timeout: 30000 });
      await page.getByText("تم تسجيل الفتح كحدث دائم، مع بقاء الحيازة الحالية للمركز بدون تغيير.", { exact: true }).waitFor();

      const successAudit = await audit(page, `${label}/opening-success`, mobile);
      await page.screenshot({ path: path.join(artifactDir, `${label}-opening-success.png`), fullPage: true });

      const opening = oneSql(`
        select
          roll_id::text as roll_id,
          request_id::text as request_id,
          opened_by_profile_id::text as opened_by_profile_id,
          opened_by_center_party_id::text as opened_by_center_party_id,
          opened_at::text as opened_at
        from public.roll_openings
        where roll_id = ${sqlUuid(scenario.rollId)}
      `, `${label} authoritative Roll Opening`);

      assert(opening.roll_id === scenario.rollId, `${label}: opening Roll mismatch.`);
      assert(opening.opened_by_profile_id === fixture.actor.profileId, `${label}: opening actor Profile mismatch.`);
      assert(opening.opened_by_center_party_id === fixture.actor.partyId, `${label}: opening Center party mismatch.`);
      assert(typeof opening.opened_at === "string" && opening.opened_at.length > 10, `${label}: opened_at missing.`);
      assert(openingCount(scenario.rollId) === 1, `${label}: expected exactly one immutable opening row.`);
      assert(custodyParty(scenario.rollId) === fixture.actor.partyId, `${label}: custody changed during opening.`);
      assert(reservationCount(scenario.rollId) === 0, `${label}: opening created or retained a Transfer reservation.`);

      const sendRead = await rpc("list_transfer_send_rolls", {
        p_search: scenario.serialNumber,
        p_lot_id: null,
        p_limit: 10,
        p_offset: 0,
      }, centerToken);
      assert(sendRead.response.ok && Array.isArray(sendRead.body) && sendRead.body.length === 1,
        `${label}: opened Roll sender-read failed: ${sendRead.response.status} ${JSON.stringify(sendRead.body)}`);
      assert(sendRead.body[0].roll_id === scenario.rollId && sendRead.body[0].availability === "opened",
        `${label}: opened Roll is not truthfully excluded from ordinary Transfer: ${JSON.stringify(sendRead.body)}`);

      await page.getByRole("button", { name: "فتح رول آخر" }).click();
      await page.getByLabel("أو أدخل سيريال الرول").fill(scenario.serialNumber);
      await page.getByRole("button", { name: "تحقق من الرول" }).click();
      await page.getByText(/هذا الرول مسجل كمفتوح بالفعل منذ/).waitFor({ timeout: 30000 });
      assert(await page.getByRole("button", { name: "تأكيد فتح الرول" }).count() === 0,
        `${label}: already-opened Roll still exposes the opening confirmation action.`);
      assert(openingCount(scenario.rollId) === 1, `${label}: re-resolve created a duplicate opening.`);
      assert(runtimeErrors.length === 0, `${label}: runtime errors ${JSON.stringify(runtimeErrors)}`);
      assert(failedResponses.length === 0, `${label}: unexpected HTTP failures ${JSON.stringify(failedResponses)}`);

      results.push({
        name: label,
        ok: true,
        rollId: scenario.rollId,
        serialNumber: scenario.serialNumber,
        requestId: opening.request_id,
        candidateAudit,
        successAudit,
        transferAvailability: sendRead.body[0].availability,
        failedResponses,
      });
    } catch (error) {
      failures.push({
        name: label,
        error: error instanceof Error ? error.message : String(error),
        diagnostic: await failureSnapshot(page, label),
        runtimeErrors,
        failedResponses,
      });
      results.push({ name: label, ok: false });
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}

fs.writeFileSync(path.join(artifactDir, "summary.json"), `${JSON.stringify({ results, failures }, null, 2)}\n`);
if (failures.length > 0) throw new Error(`ACC-01-D failed: ${JSON.stringify(failures)}`);
console.log(`ACC-01-D PASS: ${results.length}/${fixture.scenarios.length} representative Roll Opening manual-fallback paths.`);
