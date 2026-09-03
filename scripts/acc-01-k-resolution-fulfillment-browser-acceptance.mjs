import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const baseUrl = process.env.ACC_BASE_URL?.trim() || "http://127.0.0.1:3000";
const artifactDir = process.env.ACC_K_ARTIFACT_DIR?.trim() || "artifacts/acc-01-k";
const password = "Agent-Network-Foundation-2026!";
const adminEmail = "network-admin@example.test";
const centerEmail = "acc-role-center@example.test";
const unassignedCenterEmail = "acc-i-unassigned-center@example.test";

function assert(condition, message) { if (!condition) throw new Error(message); }

function dbContainerName() {
  const names = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" })
    .split("\n").map((value) => value.trim()).filter(Boolean);
  const name = names.find((value) => value.startsWith("supabase_db_"));
  assert(name, "Supabase database container was not found for ACC-01-K.");
  return name;
}

function querySql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", dbContainerName(), "psql", "-At", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-c", sql],
    { encoding: "utf8" },
  ).trim();
}

function sqlText(value) { return `'${String(value).replaceAll("'", "''")}'`; }
function sqlUuid(value) {
  assert(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value), `Unsafe UUID: ${value}`);
  return `'${value}'::uuid`;
}
function oneSql(sql, label) {
  const raw = querySql(`select row_to_json(q)::text from (${sql}) q;`);
  const rows = raw ? raw.split("\n").filter(Boolean) : [];
  assert(rows.length === 1, `${label}: expected one row, received ${rows.length}.`);
  return JSON.parse(rows[0]);
}
function countSql(sql) { return Number(querySql(`select count(*) from (${sql}) q;`)); }

function attachDiagnostics(page, actor, runtimeErrors, failedResponses) {
  page.on("pageerror", (error) => runtimeErrors.push(`${actor} pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (!/^Failed to load resource: the server responded with a status of \d{3}/.test(text)) runtimeErrors.push(`${actor} console.error: ${text}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) failedResponses.push({ actor, status: response.status(), method: response.request().method(), url: response.url() });
  });
}

async function audit(page, label, enforceMobileTargets = true) {
  const geometry = await page.evaluate((enforce) => {
    const root = document.documentElement;
    const body = document.body;
    const viewportWidth = root.clientWidth;
    const scrollWidth = Math.max(root.scrollWidth, body?.scrollWidth ?? 0);
    const targets = Array.from(document.querySelectorAll("a[href], button, input:not([type='hidden']):not([type='file']), select, textarea, [role='button']"))
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { name: element.getAttribute("aria-label") || element.textContent?.trim().slice(0, 80) || element.getAttribute("name") || "", width: Number(rect.width.toFixed(2)), height: Number(rect.height.toFixed(2)) };
      });
    return { viewportWidth, scrollWidth, undersized: enforce ? targets.filter((item) => item.width < 44 || item.height < 44) : [] };
  }, enforceMobileTargets);
  assert(geometry.scrollWidth <= geometry.viewportWidth + 1, `${label}: horizontal overflow.`);
  assert(geometry.undersized.length === 0, `${label}: undersized mobile targets ${JSON.stringify(geometry.undersized)}`);
  const axe = await new AxeBuilder({ page }).analyze();
  const axeDetails = axe.violations.map((violation) => ({ id: violation.id, impact: violation.impact, nodes: violation.nodes.map((node) => ({ target: node.target, html: node.html })) }));
  assert(axeDetails.length === 0, `${label}: axe violations ${JSON.stringify(axeDetails)}`);
  return { geometry, axe: axeDetails };
}

async function login(page, email) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.getByLabel("كلمة المرور").fill(password);
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/operations", { timeout: 30000 }),
    page.getByRole("button", { name: "دخول" }).click(),
  ]);
  await page.waitForLoadState("networkidle");
}

async function failureSnapshot(page, prefix) {
  if (!page) return null;
  const diagnostic = { url: page.url(), bodyExcerpt: "" };
  try { diagnostic.bodyExcerpt = (await page.locator("body").innerText()).slice(0, 3000); } catch {}
  try { await page.screenshot({ path: path.join(artifactDir, `${prefix}-failure.png`), fullPage: true }); } catch {}
  return diagnostic;
}

fs.mkdirSync(artifactDir, { recursive: true });
const evidenceBuffer = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZqSoAAAAASUVORK5CYII=", "base64");
const evidenceFile = path.join(artifactDir, "completion-evidence.png");
fs.writeFileSync(evidenceFile, evidenceBuffer);

const fixture = oneSql(`
  select
    resolution.id::text as resolution_id,
    claim.id::text as claim_id,
    claim.claim_number,
    claim.customer_decision_message,
    claim.status as claim_status,
    claim.closed_at::text as claim_closed_at,
    resolution.status as resolution_status,
    warranty.customer_phone,
    identity.public_code,
    center.party_id::text as center_party_id,
    center.center_id::text as center_id,
    center.name as center_name
  from public.warranty_claim_resolutions resolution
  join public.warranty_claims claim on claim.id = resolution.claim_id
  join public.warranties warranty on warranty.id = claim.warranty_id
  join private.roll_public_identities identity on identity.roll_id = warranty.roll_id
  left join lateral (
    select party.id as party_id, installation_center.id as center_id, installation_center.name
    from public.operational_parties party
    join public.installation_centers installation_center on installation_center.id = party.installation_center_id
    where party.party_type = 'center' and installation_center.status = 'active'
    order by installation_center.name, party.id
    limit 1
  ) center on true
  where resolution.status = 'authorized'
    and claim.status = 'approved'
    and claim.closed_at is null
  order by resolution.authorized_at desc, resolution.id desc
  limit 1
`, "K authorized Resolution from ACC-01-J");
assert(fixture.resolution_status === "authorized" && fixture.claim_status === "approved" && fixture.claim_closed_at === null, `ACC-01-K requires an open authorized Resolution: ${JSON.stringify(fixture)}`);
assert(/^[0-9a-f]{64}$/i.test(fixture.public_code), "ACC-01-K public Warranty identity is invalid.");
assert(countSql(`select id from public.warranty_claim_resolutions where id = ${sqlUuid(fixture.resolution_id)} and status = 'authorized'`) === 1, "ACC-01-K Resolution fixture disappeared.");

const adminProfile = oneSql(`select p.id::text as profile_id, p.role, p.status from public.profiles p join auth.users u on u.id = p.id where u.email = ${sqlText(adminEmail)}`, "K Admin profile");
const centerProfile = oneSql(`select p.id::text as profile_id, p.role, p.status, p.installation_center_id::text as center_id from public.profiles p join auth.users u on u.id = p.id where u.email = ${sqlText(centerEmail)}`, "K performing Center profile");
const centerParty = oneSql(`select party.id::text as party_id, center.id::text as center_id, center.name from public.operational_parties party join public.installation_centers center on center.id = party.installation_center_id where party.party_type = 'center' and center.id = ${sqlUuid(centerProfile.center_id)} and center.status = 'active'`, "K performing Center party");
assert(adminProfile.role === "admin" && adminProfile.status === "active", "ACC-01-K Admin fixture is not active.");
assert(centerProfile.role === "center" && centerProfile.status === "active" && centerParty.party_id, "ACC-01-K Center fixture is not active.");

const runtimeErrors = [];
const failedResponses = [];
const audits = {};
const databaseEvidence = {};
let adminPage = null;
let centerPage = null;
let otherCenterPage = null;
let customerPage = null;
const browser = await chromium.launch({ headless: true });

try {
  const adminContext = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ar-EG" });
  adminPage = await adminContext.newPage();
  attachDiagnostics(adminPage, "admin", runtimeErrors, failedResponses);
  await login(adminPage, adminEmail);
  const adminUrl = `${baseUrl}/operations/claim-resolutions/${fixture.resolution_id}`;
  const adminResponse = await adminPage.goto(adminUrl, { waitUntil: "networkidle" });
  assert(adminResponse?.status() === 200, "Admin Resolution detail did not return HTTP 200.");
  await adminPage.getByRole("heading", { level: 1, name: `تنفيذ ${fixture.claim_number}` }).waitFor();
  await adminPage.getByRole("heading", { name: "إسناد المعالجة إلى مركز تنفيذ", exact: true }).waitFor();
  audits.adminAuthorizedResolution = await audit(adminPage, "K Admin authorized Resolution", true);
  await adminPage.screenshot({ path: path.join(artifactDir, "admin-authorized-resolution.png"), fullPage: true });
  const assignmentSelects = adminPage.locator("select");
  assert(await assignmentSelects.count() >= 2, "K Resolution assignment controls are missing.");
  await assignmentSelects.nth(0).selectOption("service_reinstall");
  await assignmentSelects.nth(1).selectOption(centerParty.party_id);
  await adminPage.getByRole("button", { name: "إسناد التنفيذ", exact: true }).click();
  await adminPage.getByText("تم إسناد التنفيذ إلى المركز المختار.", { exact: true }).waitFor({ timeout: 30000 });
  const assigned = oneSql(`
    select resolution.status as resolution_status, resolution.remedy_kind,
      resolution.performing_center_party_id::text as performing_center_party_id,
      resolution.assigned_by_profile_id::text as assigned_by_profile_id,
      resolution.assigned_at::text as assigned_at,
      claim.status as claim_status, claim.closed_at::text as claim_closed_at
    from public.warranty_claim_resolutions resolution
    join public.warranty_claims claim on claim.id = resolution.claim_id
    where resolution.id = ${sqlUuid(fixture.resolution_id)}
  `, "K authoritative assigned Resolution");
  assert(assigned.resolution_status === "assigned" && assigned.remedy_kind === "service_reinstall", `Resolution assignment mismatch: ${JSON.stringify(assigned)}`);
  assert(assigned.performing_center_party_id === centerParty.party_id && assigned.assigned_by_profile_id === adminProfile.profile_id && assigned.assigned_at, `Resolution assignment actor/Center mismatch: ${JSON.stringify(assigned)}`);
  assert(assigned.claim_status === "approved" && assigned.claim_closed_at === null, "Assignment changed Claim state unexpectedly.");
  assert(countSql(`select id from public.warranty_claim_resolution_roll_allocations where resolution_id = ${sqlUuid(fixture.resolution_id)}`) === 0, "service_reinstall must not create a Roll allocation.");
  databaseEvidence.assigned = assigned;
  audits.adminAssignedResolution = await audit(adminPage, "K Admin assigned service Resolution", true);
  await adminPage.screenshot({ path: path.join(artifactDir, "admin-assigned-service-resolution.png"), fullPage: true });
  await adminContext.close();

  const centerContext = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ar-EG" });
  centerPage = await centerContext.newPage();
  attachDiagnostics(centerPage, "center", runtimeErrors, failedResponses);
  await login(centerPage, centerEmail);
  const queueResponse = await centerPage.goto(`${baseUrl}/operations/claim-resolution-tasks`, { waitUntil: "networkidle" });
  assert(queueResponse?.status() === 200, "Center Resolution task queue did not return HTTP 200.");
  await centerPage.getByRole("heading", { level: 1, name: "مهام تنفيذ المطالبات المسندة للمركز" }).waitFor();
  await centerPage.getByText(fixture.claim_number, { exact: true }).waitFor();
  await centerPage.getByRole("link", { name: "فتح مهمة التنفيذ", exact: true }).waitFor();
  audits.centerQueue = await audit(centerPage, "K assigned Center task queue", true);
  await centerPage.screenshot({ path: path.join(artifactDir, "center-task-queue.png"), fullPage: true });

  const taskResponse = await centerPage.goto(`${baseUrl}/operations/claim-resolution-tasks/${fixture.resolution_id}`, { waitUntil: "networkidle" });
  assert(taskResponse?.status() === 200, "Center exact Resolution task did not return HTTP 200.");
  await centerPage.getByRole("heading", { level: 1, name: fixture.claim_number }).waitFor();
  await centerPage.getByRole("heading", { name: "إغلاق المهمة بعد التنفيذ الفعلي", exact: true }).waitFor();
  const taskBody = await centerPage.locator("body").innerText();
  assert(!taskBody.includes(fixture.customer_phone), "Center task leaked customer phone.");
  assert(!taskBody.includes(fixture.resolution_id), "Center task leaked internal Resolution UUID.");
  audits.centerExactTask = await audit(centerPage, "K exact assigned Center task", true);
  await centerPage.screenshot({ path: path.join(artifactDir, "center-exact-task-before-completion.png"), fullPage: true });

  const fileInput = centerPage.locator('input[type="file"]').first();
  assert(await fileInput.count() === 1, "K completion evidence file input is missing.");
  await fileInput.setInputFiles({ name: "completion-evidence.png", mimeType: "image/png", buffer: evidenceBuffer });
  await centerPage.getByText("1/5 صور محددة", { exact: false }).waitFor();
  await centerPage.locator("textarea").fill("تم تنفيذ إعادة التركيب وفحص النتيجة النهائية وتوثيق الحالة بالصور.");
  await centerPage.getByRole("checkbox", { name: /أؤكد أن العلاج المحدد/ }).check();
  await centerPage.getByRole("button", { name: "تأكيد الإكمال وإغلاق المطالبة", exact: true }).click();
  const completionDialog = centerPage.getByRole("dialog");
  await completionDialog.getByRole("heading", { name: "إغلاق المطالبة مع 1 صورة إكمال؟", exact: true }).waitFor();
  await Promise.all([
    centerPage.waitForURL((url) => url.pathname === "/operations/claim-resolution-tasks" && url.searchParams.get("notice") === "completed", { timeout: 30000 }),
    completionDialog.getByRole("button", { name: "تأكيد الإكمال والإغلاق", exact: true }).click(),
  ]);
  await centerPage.waitForLoadState("networkidle");

  const completed = oneSql(`
    select resolution.status as resolution_status,
      resolution.completed_by_profile_id::text as completed_by_profile_id,
      resolution.completion_actor_kind, resolution.completion_note,
      resolution.completed_at::text as completed_at,
      claim.status as claim_status, claim.closed_at::text as claim_closed_at,
      (select count(*) from public.warranty_claim_resolution_evidence evidence where evidence.resolution_id = resolution.id)::int as evidence_count,
      (select count(*) from public.warranty_claim_resolution_events event where event.resolution_id = resolution.id and event.event_kind = 'resolution_completed')::int as completion_event_count,
      (select count(*) from public.warranty_claim_resolution_roll_allocations allocation where allocation.resolution_id = resolution.id)::int as allocation_count
    from public.warranty_claim_resolutions resolution
    join public.warranty_claims claim on claim.id = resolution.claim_id
    where resolution.id = ${sqlUuid(fixture.resolution_id)}
  `, "K authoritative completed Resolution");
  assert(completed.resolution_status === "completed" && completed.completed_by_profile_id === centerProfile.profile_id && completed.completion_actor_kind === "center", `Completion actor/state mismatch: ${JSON.stringify(completed)}`);
  assert(completed.claim_status === "approved" && completed.claim_closed_at && completed.completed_at, `Claim did not close correctly: ${JSON.stringify(completed)}`);
  assert(Number(completed.evidence_count) === 1 && Number(completed.completion_event_count) === 1 && Number(completed.allocation_count) === 0, `Completion evidence/event/material invariant failed: ${JSON.stringify(completed)}`);
  const evidence = oneSql(`select evidence.storage_path, evidence.mime_type, evidence.size_bytes, evidence.uploaded_by_profile_id::text as uploaded_by_profile_id from public.warranty_claim_resolution_evidence evidence where evidence.resolution_id = ${sqlUuid(fixture.resolution_id)}`, "K completion evidence");
  assert(evidence.storage_path.startsWith(`resolutions/${fixture.resolution_id}/completion/`) && evidence.mime_type === "image/png" && Number(evidence.size_bytes) > 0 && evidence.uploaded_by_profile_id === centerProfile.profile_id, `Completion evidence metadata mismatch: ${JSON.stringify(evidence)}`);
  assert(countSql(`select id from storage.objects where bucket_id = 'warranty-claim-evidence' and name = ${sqlText(evidence.storage_path)}`) === 1, "Finalized completion evidence object is missing from private storage.");
  const bucket = oneSql("select public from storage.buckets where id = 'warranty-claim-evidence'", "K evidence bucket privacy");
  assert(bucket.public === false, "Completion evidence bucket must remain private.");
  databaseEvidence.completed = { completed, evidence, bucket };
  const centerCompletedBody = await centerPage.locator("body").innerText();
  assert(!centerCompletedBody.includes(fixture.resolution_id), "Center completion queue leaked the internal Resolution UUID.");
  audits.centerCompletedQueue = await audit(centerPage, "K Center completed task queue", true);
  await centerPage.screenshot({ path: path.join(artifactDir, "center-completed-task-queue.png"), fullPage: true });
  await centerContext.close();

  const otherCenterContext = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ar-EG" });
  otherCenterPage = await otherCenterContext.newPage();
  attachDiagnostics(otherCenterPage, "other-center", runtimeErrors, failedResponses);
  await login(otherCenterPage, unassignedCenterEmail);
  await otherCenterPage.goto(`${baseUrl}/operations/claim-resolution-tasks`, { waitUntil: "networkidle" });
  const otherQueueBody = await otherCenterPage.locator("body").innerText();
  assert(!otherQueueBody.includes(fixture.claim_number), "A different Center received the completed task.");
  audits.otherCenterQueue = await audit(otherCenterPage, "K other Center isolated queue", true);
  await otherCenterPage.screenshot({ path: path.join(artifactDir, "other-center-isolated-queue.png"), fullPage: true });
  await otherCenterContext.close();

  const customerContext = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ar-EG" });
  customerPage = await customerContext.newPage();
  attachDiagnostics(customerPage, "customer", runtimeErrors, failedResponses);
  const publicRoute = `${baseUrl}/w/${fixture.public_code}/claim`;
  const publicResponse = await customerPage.goto(publicRoute, { waitUntil: "networkidle" });
  assert(publicResponse?.status() === 200, "Customer Claim route did not return HTTP 200.");
  await customerPage.getByRole("heading", { name: "تحقق من رقم الهاتف" }).waitFor();
  await customerPage.getByLabel("رقم الهاتف المسجل — بصيغة دولية").fill(fixture.customer_phone);
  await customerPage.getByRole("button", { name: "متابعة", exact: true }).click();
  await customerPage.getByRole("heading", { name: "سجل خدمات الضمان", exact: true }).waitFor({ timeout: 30000 });
  const customerBody = await customerPage.locator("body").innerText();
  assert(customerBody.includes("تم التنفيذ") && customerBody.includes("إعادة تنفيذ الخدمة") && customerBody.includes(fixture.claim_number) && customerBody.includes(fixture.center_name), "Customer service history omitted an allowed completed-service fact.");
  assert(fixture.customer_decision_message && customerBody.includes(fixture.customer_decision_message), "Customer history omitted the customer-facing decision message.");
  for (const forbidden of [completed.completion_note, fixture.resolution_id, evidence.storage_path, evidence.storage_path.split("/").at(-1), adminProfile.profile_id, "completion_actor_kind", "product_eligibility_basis"]) {
    if (forbidden) assert(!customerBody.includes(String(forbidden)), `Customer flow leaked forbidden internal value ${forbidden}.`);
  }
  audits.customerCompletedHistory = await audit(customerPage, "K verified customer completed service history", true);
  await customerPage.screenshot({ path: path.join(artifactDir, "customer-completed-service-history.png"), fullPage: true });
  await customerContext.close();

  assert(runtimeErrors.length === 0, `ACC-01-K runtime errors: ${JSON.stringify(runtimeErrors)}`);
  assert(failedResponses.length === 0, `ACC-01-K failed network responses: ${JSON.stringify(failedResponses)}`);
  fs.writeFileSync(path.join(artifactDir, "summary.json"), `${JSON.stringify({ fixture, audits, databaseEvidence, runtimeErrors, failedResponses }, null, 2)}\n`);
  console.log(`ACC-01-K Resolution Fulfillment browser acceptance passed for ${fixture.claim_number}.`);
} catch (error) {
  const failure = {
    message: error instanceof Error ? error.message : String(error),
    admin: await failureSnapshot(adminPage, "admin"),
    center: await failureSnapshot(centerPage, "center"),
    otherCenter: await failureSnapshot(otherCenterPage, "other-center"),
    customer: await failureSnapshot(customerPage, "customer"),
    runtimeErrors,
    failedResponses,
    databaseEvidence,
  };
  fs.writeFileSync(path.join(artifactDir, "failure.json"), `${JSON.stringify(failure, null, 2)}\n`);
  throw error;
} finally {
  await browser.close();
}
