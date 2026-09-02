import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const baseUrl = process.env.ACC_BASE_URL?.trim() || "http://127.0.0.1:3000";
const apiUrl = process.env.API_URL;
const anonKey = process.env.ANON_KEY;
const artifactDir = process.env.ACC_F_ARTIFACT_DIR?.trim() || "artifacts/acc-01-f";
const password = "Agent-Network-Foundation-2026!";

if (!apiUrl || !anonKey) throw new Error("API_URL and ANON_KEY are required for ACC-01-F.");

const fixture = JSON.parse(fs.readFileSync(path.join(artifactDir, "fixture.json"), "utf8"));
const customer = {
  name: "عميل قبول الضمان",
  phoneInput: "+20 10 1234 5678",
  phone: "+201012345678",
  email: "acc-f-customer@example.test",
};
const vehicle = {
  make: "Toyota",
  model: "Camry",
  year: 2026,
  plate: "ACC-F-2026",
  color: "Black",
  vin: "ACC01FVIN20260001",
};

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
  assert(name, "Supabase database container was not found for ACC-01-F.");
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

function countSql(sql) {
  return Number(querySql(`select count(*) from (${sql}) q;`));
}

function custodyParty(rollId) {
  return querySql(`select custodian_party_id::text from public.roll_custody_current where roll_id = ${sqlUuid(rollId)};`);
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
  try { diagnostic.bodyExcerpt = (await page.locator("body").innerText()).slice(0, 2200); } catch {}
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
          name: element.getAttribute("aria-label") || element.textContent?.trim().slice(0, 80) || element.getAttribute("name") || "",
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
    nodes: violation.nodes.map((node) => ({ target: node.target, html: node.html, failureSummary: node.failureSummary })),
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
  const scenario = fixture.positive;
  const runtimeErrors = [];
  const failedResponses = [];
  const context = await browser.newContext({
    viewport: { width: scenario.width, height: scenario.height },
    locale: "ar-EG",
  });
  const page = await context.newPage();
  attachDiagnostics(page, "center-positive", runtimeErrors, failedResponses);

  try {
    assert(openingCount(scenario.rollId) === 0, "positive: Roll must start unopened.");
    assert(custodyParty(scenario.rollId) === fixture.actor.partyId, "positive: Center must hold Roll before opening.");
    assert(countSql(`select 1 from public.roll_preinstall_issues where roll_id = ${sqlUuid(scenario.rollId)}`) === 0,
      "positive: Roll unexpectedly has a Pre-install Issue.");
    assert(countSql(`select 1 from public.warranties where roll_id = ${sqlUuid(scenario.rollId)}`) === 0,
      "positive: Roll unexpectedly has a Warranty.");

    await login(page, fixture.actor.email);

    await page.goto(`${baseUrl}/operations/rolls/open`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "فتح رول", level: 1 }).waitFor();
    await page.getByLabel("أو أدخل سيريال الرول").fill(scenario.serialNumber);
    await page.getByRole("button", { name: "تحقق من الرول" }).click();
    await page.getByRole("heading", { name: scenario.productName, level: 2 }).waitFor({ timeout: 30000 });
    await page.getByRole("button", { name: "تأكيد فتح الرول" }).click();
    await page.getByRole("heading", { name: "تم فتح الرول بنجاح", level: 2 }).waitFor({ timeout: 30000 });
    const openingAudit = await audit(page, "positive/opening-success", true);
    await page.screenshot({ path: path.join(artifactDir, "mobile-opening-success.png"), fullPage: true });

    assert(openingCount(scenario.rollId) === 1, "positive: browser opening did not create exactly one immutable opening.");
    assert(custodyParty(scenario.rollId) === fixture.actor.partyId, "positive: opening changed custody.");

    const preflight = await rpc("resolve_warranty_activation_candidate", { p_roll_serial: scenario.serialNumber }, centerToken);
    assert(preflight.response.ok && Array.isArray(preflight.body) && preflight.body.length === 1,
      `positive: resolver failed: ${preflight.response.status} ${JSON.stringify(preflight.body)}`);
    assert(preflight.body[0].eligibility === "eligible", `positive: expected eligible, got ${JSON.stringify(preflight.body[0])}`);
    assert(preflight.body[0].warranty_months === scenario.warrantyMonths, "positive: preflight warranty months mismatch.");

    await page.goto(`${baseUrl}/operations/warranties/activate?roll=${encodeURIComponent(scenario.serialNumber)}`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "تفعيل ضمان عميل", level: 1 }).waitFor();
    await page.getByRole("button", { name: "تحقق من الأهلية" }).click();
    await page.getByRole("heading", { name: scenario.productName, level: 2 }).waitFor({ timeout: 30000 });
    await page.getByText("الرول مؤهل للتفعيل الآن", { exact: true }).waitFor();
    await page.getByText(`${scenario.warrantyMonths} شهر`, { exact: true }).waitFor();
    const candidateAudit = await audit(page, "positive/warranty-candidate", true);
    await page.screenshot({ path: path.join(artifactDir, "mobile-warranty-candidate.png"), fullPage: true });

    await page.getByRole("button", { name: "متابعة لبيانات العميل" }).click();
    await page.getByRole("heading", { name: "بيانات العميل والسيارة", level: 2 }).waitFor();
    await page.getByLabel("الاسم الكامل *").fill(customer.name);
    await page.getByLabel("رقم الهاتف الدولي *").fill(customer.phoneInput);
    await page.getByLabel("البريد الإلكتروني — اختياري").fill(customer.email);
    await page.getByLabel("الماركة *").fill(vehicle.make);
    await page.getByLabel("الموديل *").fill(vehicle.model);
    await page.getByLabel("VIN / رقم الشاسيه *").fill(vehicle.vin.toLowerCase());
    await page.getByLabel("سنة الموديل — اختياري").fill(String(vehicle.year));
    await page.getByLabel("رقم اللوحة — اختياري").fill(vehicle.plate);
    await page.getByLabel("اللون — اختياري").fill(vehicle.color);
    const detailsAudit = await audit(page, "positive/warranty-details", true);
    await page.screenshot({ path: path.join(artifactDir, "mobile-warranty-details.png"), fullPage: true });

    await page.getByRole("button", { name: "مراجعة البيانات" }).click();
    await page.getByRole("heading", { name: "راجع قبل التفعيل", level: 2 }).waitFor();
    await page.getByText(customer.phone, { exact: true }).waitFor();
    await page.getByText(vehicle.vin, { exact: true }).waitFor();
    const reviewAudit = await audit(page, "positive/warranty-review", true);
    await page.screenshot({ path: path.join(artifactDir, "mobile-warranty-review.png"), fullPage: true });

    await page.getByRole("button", { name: "تأكيد تفعيل ضمان العميل" }).click();
    await page.getByRole("heading", { name: "تم تفعيل ضمان العميل", level: 2 }).waitFor({ timeout: 30000 });
    const warrantyNumber = (await page.locator("[dir='ltr']").filter({ hasText: /^PG-W-[0-9]{8,}$/ }).first().innerText()).trim();
    assert(/^PG-W-[0-9]{8,}$/.test(warrantyNumber), `positive: invalid Warranty Number ${warrantyNumber}`);
    const detailHref = await page.getByRole("link", { name: "فتح تفاصيل الضمان" }).getAttribute("href");
    const detailMatch = detailHref?.match(/^\/operations\/warranties\/([0-9a-f-]{36})$/i);
    assert(detailMatch, `positive: invalid Warranty detail href ${detailHref}`);
    const warrantyId = detailMatch[1];
    const successAudit = await audit(page, "positive/warranty-success", true);
    await page.screenshot({ path: path.join(artifactDir, "mobile-warranty-success.png"), fullPage: true });

    const warranty = oneSql(`
      select
        id::text as id,
        request_id::text as request_id,
        roll_id::text as roll_id,
        warranty_number,
        record_state,
        activated_by_profile_id::text as activated_by_profile_id,
        activating_center_party_id::text as activating_center_party_id,
        activating_center_name_snapshot,
        activated_at::text as activated_at,
        coverage_expires_at::text as coverage_expires_at,
        product_id::text as product_id,
        product_code_snapshot,
        product_name_snapshot,
        product_version_snapshot,
        warranty_months_snapshot,
        warranty_coverage_snapshot,
        care_instructions_snapshot,
        customer_name,
        customer_phone,
        customer_email,
        vehicle_make,
        vehicle_model,
        vehicle_year,
        vehicle_plate,
        vehicle_color,
        vehicle_vin,
        (coverage_expires_at = (((activated_at at time zone 'UTC') + make_interval(months => warranty_months_snapshot)) at time zone 'UTC')) as exact_calendar_expiry
      from public.warranties
      where roll_id = ${sqlUuid(scenario.rollId)}
    `, "positive authoritative Warranty");

    assert(warranty.id === warrantyId && warranty.warranty_number === warrantyNumber, "positive: UI Warranty identity mismatch.");
    assert(warranty.record_state === "issued", "positive: Warranty must be issued.");
    assert(warranty.roll_id === scenario.rollId, "positive: Warranty Roll mismatch.");
    assert(warranty.activated_by_profile_id === fixture.actor.profileId, "positive: activation actor mismatch.");
    assert(warranty.activating_center_party_id === fixture.actor.partyId, "positive: activating Center mismatch.");
    assert(warranty.activating_center_name_snapshot === fixture.actor.centerName, "positive: Center snapshot mismatch.");
    assert(warranty.product_id === scenario.productId, "positive: Product identity mismatch.");
    assert(warranty.product_code_snapshot === scenario.productCode && warranty.product_name_snapshot === scenario.productName,
      "positive: production Product snapshot mismatch.");
    assert(warranty.warranty_months_snapshot === scenario.warrantyMonths, "positive: Warranty months snapshot mismatch.");
    assert(warranty.warranty_coverage_snapshot === scenario.warrantyCoverage, "positive: Warranty coverage snapshot mismatch.");
    assert(warranty.care_instructions_snapshot === scenario.careInstructions, "positive: care instructions snapshot mismatch.");
    assert(warranty.customer_name === customer.name && warranty.customer_phone === customer.phone && warranty.customer_email === customer.email,
      "positive: customer snapshot mismatch.");
    assert(warranty.vehicle_make === vehicle.make && warranty.vehicle_model === vehicle.model && warranty.vehicle_year === vehicle.year,
      "positive: vehicle identity snapshot mismatch.");
    assert(warranty.vehicle_plate === vehicle.plate && warranty.vehicle_color === vehicle.color && warranty.vehicle_vin === vehicle.vin,
      "positive: vehicle detail snapshot mismatch.");
    assert(warranty.exact_calendar_expiry === true, "positive: coverage expiry is not exact snapped calendar-month expiry.");
    assert(typeof warranty.activated_at === "string" && typeof warranty.coverage_expires_at === "string", "positive: Warranty timestamps missing.");
    assert(custodyParty(scenario.rollId) === fixture.actor.partyId, "positive: activation changed Roll custody.");
    assert(openingCount(scenario.rollId) === 1, "positive: activation changed opening history.");

    const activationEvent = oneSql(`
      select warranty_id::text as warranty_id, action_request_id::text as action_request_id, event_kind,
             actor_profile_id::text as actor_profile_id, reason, change_snapshot, created_at::text as created_at
      from public.warranty_events
      where warranty_id = ${sqlUuid(warrantyId)} and event_kind = 'activated'
    `, "positive activation event");
    assert(activationEvent.warranty_id === warrantyId && activationEvent.action_request_id === warranty.request_id,
      "positive: activation event request identity mismatch.");
    assert(activationEvent.event_kind === "activated" && activationEvent.actor_profile_id === fixture.actor.profileId,
      "positive: activation event actor/kind mismatch.");
    assert(activationEvent.reason === null && activationEvent.change_snapshot === null, "positive: activation event shape mismatch.");
    assert(countSql(`select 1 from public.warranty_events where warranty_id = ${sqlUuid(warrantyId)} and event_kind = 'activated'`) === 1,
      "positive: activation event is not unique.");

    const replay = await rpc("activate_roll_warranty", {
      p_request_id: warranty.request_id,
      p_roll_serial: scenario.serialNumber,
      p_customer_name: customer.name,
      p_customer_phone: customer.phone,
      p_customer_email: customer.email,
      p_vehicle_make: vehicle.make,
      p_vehicle_model: vehicle.model,
      p_vehicle_year: vehicle.year,
      p_vehicle_plate: vehicle.plate,
      p_vehicle_color: vehicle.color,
      p_vehicle_vin: vehicle.vin,
    }, centerToken);
    assert(replay.response.ok && Array.isArray(replay.body) && replay.body.length === 1,
      `positive: idempotent replay failed ${replay.response.status} ${JSON.stringify(replay.body)}`);
    assert(replay.body[0].warranty_id === warrantyId && replay.body[0].warranty_number === warrantyNumber,
      "positive: same request did not replay the same Warranty.");
    assert(countSql(`select 1 from public.warranties where roll_id = ${sqlUuid(scenario.rollId)}`) === 1,
      "positive: idempotent replay created duplicate Warranty.");
    assert(countSql(`select 1 from public.warranty_events where warranty_id = ${sqlUuid(warrantyId)} and event_kind = 'activated'`) === 1,
      "positive: idempotent replay created duplicate activation event.");

    await page.goto(`${baseUrl}${detailHref}`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: warrantyNumber, level: 1 }).waitFor();
    await page.getByText("ساري", { exact: true }).waitFor();
    await page.getByText(customer.name, { exact: true }).first().waitFor();
    await page.getByText(scenario.serialNumber, { exact: true }).waitFor();
    await page.getByRole("heading", { name: "سياسة الضمان والعناية", level: 2 }).waitFor();
    const detailAudit = await audit(page, "positive/warranty-detail", true);
    await page.screenshot({ path: path.join(artifactDir, "mobile-warranty-detail.png"), fullPage: true });

    const activatedCandidate = await rpc("resolve_warranty_activation_candidate", { p_roll_serial: scenario.serialNumber }, centerToken);
    assert(activatedCandidate.response.ok && activatedCandidate.body?.[0]?.eligibility === "already_activated",
      `positive: resolver did not become already_activated: ${JSON.stringify(activatedCandidate.body)}`);
    assert(activatedCandidate.body[0].existing_warranty_id === warrantyId && activatedCandidate.body[0].existing_warranty_number === warrantyNumber,
      "positive: already_activated identity mismatch.");

    await page.goto(`${baseUrl}/operations/warranties/activate?roll=${encodeURIComponent(scenario.serialNumber)}`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "تحقق من الأهلية" }).click();
    await page.getByText(`هذا الرول مرتبط بالفعل بالضمان ${warrantyNumber}.`, { exact: true }).waitFor({ timeout: 30000 });
    assert(await page.getByRole("button", { name: "متابعة لبيانات العميل" }).count() === 0,
      "positive: already-activated Roll still exposes continuation action.");
    await page.getByRole("link", { name: "فتح الضمان" }).waitFor();
    const alreadyAudit = await audit(page, "positive/already-activated", true);
    await page.screenshot({ path: path.join(artifactDir, "mobile-already-activated.png"), fullPage: true });

    assert(runtimeErrors.length === 0, `positive: runtime errors ${JSON.stringify(runtimeErrors)}`);
    assert(failedResponses.length === 0, `positive: unexpected HTTP failures ${JSON.stringify(failedResponses)}`);

    results.push({
      name: scenario.name,
      ok: true,
      rollId: scenario.rollId,
      serialNumber: scenario.serialNumber,
      warrantyId,
      warrantyNumber,
      requestId: warranty.request_id,
      openingAudit,
      candidateAudit,
      detailsAudit,
      reviewAudit,
      successAudit,
      detailAudit,
      alreadyAudit,
      failedResponses,
    });
  } catch (error) {
    failures.push({
      name: scenario.name,
      error: error instanceof Error ? error.message : String(error),
      diagnostic: await failureSnapshot(page, "mobile-positive"),
      runtimeErrors,
      failedResponses,
    });
    results.push({ name: scenario.name, ok: false });
  } finally {
    await context.close();
  }

  const blocked = fixture.blocked;
  const blockedRuntimeErrors = [];
  const blockedFailedResponses = [];
  const blockedContext = await browser.newContext({
    viewport: { width: blocked.width, height: blocked.height },
    locale: "ar-EG",
  });
  const blockedPage = await blockedContext.newPage();
  attachDiagnostics(blockedPage, "center-blocked", blockedRuntimeErrors, blockedFailedResponses);

  try {
    assert(openingCount(blocked.rollId) === 1, "blocked: E Roll must remain opened exactly once.");
    assert(countSql(`select 1 from public.roll_preinstall_issues where roll_id = ${sqlUuid(blocked.rollId)} and status = 'submitted'`) === 1,
      "blocked: expected exactly one submitted Pre-install Issue from E.");
    assert(countSql(`select 1 from public.warranties where roll_id = ${sqlUuid(blocked.rollId)} and record_state = 'issued'`) === 0,
      "blocked: issue-pending Roll unexpectedly has an issued Warranty.");

    const blockedCandidate = await rpc("resolve_warranty_activation_candidate", { p_roll_serial: blocked.serialNumber }, centerToken);
    assert(blockedCandidate.response.ok && blockedCandidate.body?.[0]?.eligibility === "issue_pending",
      `blocked: resolver did not return issue_pending: ${JSON.stringify(blockedCandidate.body)}`);
    assert(blockedCandidate.body[0].blocking_issue_state === "submitted", "blocked: blocking Issue state mismatch.");

    await login(blockedPage, fixture.actor.email);
    await blockedPage.goto(`${baseUrl}/operations/warranties/activate?roll=${encodeURIComponent(blocked.serialNumber)}`, { waitUntil: "networkidle" });
    await blockedPage.getByRole("button", { name: "تحقق من الأهلية" }).click();
    await blockedPage.getByText("يوجد بلاغ ما قبل تركيب قيد قرار الشركة. لا يمكن التفعيل حتى يتم حسمه.", { exact: true }).waitFor({ timeout: 30000 });
    assert(await blockedPage.getByRole("button", { name: "متابعة لبيانات العميل" }).count() === 0,
      "blocked: issue-pending Roll exposes activation continuation.");
    await blockedPage.getByRole("link", { name: "عرض البلاغات" }).waitFor();
    const blockedAudit = await audit(blockedPage, "blocked/issue-pending", false);
    await blockedPage.screenshot({ path: path.join(artifactDir, "desktop-issue-pending.png"), fullPage: true });
    assert(blockedRuntimeErrors.length === 0, `blocked: runtime errors ${JSON.stringify(blockedRuntimeErrors)}`);
    assert(blockedFailedResponses.length === 0, `blocked: unexpected HTTP failures ${JSON.stringify(blockedFailedResponses)}`);

    results.push({
      name: blocked.name,
      ok: true,
      rollId: blocked.rollId,
      serialNumber: blocked.serialNumber,
      eligibility: blockedCandidate.body[0].eligibility,
      blockedAudit,
      failedResponses: blockedFailedResponses,
    });
  } catch (error) {
    failures.push({
      name: blocked.name,
      error: error instanceof Error ? error.message : String(error),
      diagnostic: await failureSnapshot(blockedPage, "desktop-issue-pending"),
      runtimeErrors: blockedRuntimeErrors,
      failedResponses: blockedFailedResponses,
    });
    results.push({ name: blocked.name, ok: false });
  } finally {
    await blockedContext.close();
  }
} finally {
  await browser.close();
}

fs.writeFileSync(path.join(artifactDir, "summary.json"), `${JSON.stringify({ results, failures }, null, 2)}\n`);
if (failures.length > 0) throw new Error(`ACC-01-F failed: ${JSON.stringify(failures)}`);
console.log("ACC-01-F PASS: rendered Warranty Activation success, immutable persistence, idempotency, already-activated and issue-pending blocking verified.");
