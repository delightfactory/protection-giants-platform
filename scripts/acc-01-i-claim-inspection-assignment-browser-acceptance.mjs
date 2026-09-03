import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const baseUrl = process.env.ACC_BASE_URL?.trim() || "http://127.0.0.1:3000";
const artifactDir = process.env.ACC_I_ARTIFACT_DIR?.trim() || "artifacts/acc-01-i";
const apiUrl = process.env.API_URL?.trim();
const serviceRoleKey = process.env.SERVICE_ROLE_KEY?.trim();
const password = "Agent-Network-Foundation-2026!";
const adminEmail = "network-admin@example.test";
const assignedCenterEmail = "acc-role-center@example.test";
const unassignedCenterEmail = "acc-i-unassigned-center@example.test";

if (!apiUrl || !serviceRoleKey) {
  throw new Error("API_URL and SERVICE_ROLE_KEY are required for ACC-01-I fixtures.");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function dbContainerName() {
  const names = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" })
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
  const name = names.find((value) => value.startsWith("supabase_db_"));
  assert(name, "Supabase database container was not found for ACC-01-I.");
  return name;
}

function querySql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", dbContainerName(), "psql", "-At", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-c", sql],
    { encoding: "utf8" },
  ).trim();
}

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlUuid(value) {
  assert(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
    `Unsafe UUID fixture value: ${value}`);
  return `'${value}'::uuid`;
}

function oneSql(sql, label) {
  const raw = querySql(`select row_to_json(q)::text from (${sql}) q;`);
  const rows = raw ? raw.split("\n").filter(Boolean) : [];
  assert(rows.length === 1, `${label}: expected one row, received ${rows.length}.`);
  return JSON.parse(rows[0]);
}

function manySql(sql) {
  const raw = querySql(`select row_to_json(q)::text from (${sql}) q;`);
  return raw ? raw.split("\n").filter(Boolean).map((line) => JSON.parse(line)) : [];
}

function countSql(sql) {
  return Number(querySql(`select count(*) from (${sql}) q;`));
}

async function createUnassignedCenterUser(centerId) {
  const existing = countSql(`select id from auth.users where email = ${sqlText(unassignedCenterEmail)}`);
  if (existing === 0) {
    const response = await fetch(`${apiUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: unassignedCenterEmail,
        password,
        email_confirm: true,
        app_metadata: {
          pg_provisioning: {
            version: "operational-v1",
            role: "center",
            country_agent_id: null,
            dealer_id: null,
            installation_center_id: centerId,
          },
        },
        user_metadata: { display_name: "ACC I Unassigned Center" },
      }),
    });
    const body = await response.text();
    assert(response.ok, `Could not create ACC-01-I unassigned Center user: ${response.status} ${body}`);
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const rows = manySql(`
      select p.id::text as profile_id, p.role, p.status, p.installation_center_id::text as installation_center_id
      from public.profiles p
      join auth.users u on u.id = p.id
      where u.email = ${sqlText(unassignedCenterEmail)}
    `);
    if (rows.length === 1) return rows[0];
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("ACC-01-I unassigned Center profile was not provisioned.");
}

function attachDiagnostics(page, actor, runtimeErrors, failedResponses) {
  page.on("pageerror", (error) => runtimeErrors.push(`${actor} pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (!/^Failed to load resource: the server responded with a status of \d{3}/.test(text)) {
      runtimeErrors.push(`${actor} console.error: ${text}`);
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      failedResponses.push({
        actor,
        status: response.status(),
        method: response.request().method(),
        url: response.url(),
      });
    }
  });
}

async function audit(page, label, enforceMobileTargets = true) {
  const geometry = await page.evaluate((enforce) => {
    const root = document.documentElement;
    const body = document.body;
    const viewportWidth = root.clientWidth;
    const scrollWidth = Math.max(root.scrollWidth, body?.scrollWidth ?? 0);
    const targets = Array.from(document.querySelectorAll(
      "a[href], button, input:not([type='hidden']):not([type='file']), select, textarea, [role='button']",
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
          width: Number(rect.width.toFixed(2)),
          height: Number(rect.height.toFixed(2)),
        };
      });

    return {
      viewportWidth,
      scrollWidth,
      undersized: enforce ? targets.filter((item) => item.width < 44 || item.height < 44) : [],
    };
  }, enforceMobileTargets);

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

async function confirmAction(page, triggerLabel, dialogTitle, confirmLabel) {
  await page.getByRole("button", { name: triggerLabel, exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("heading", { name: dialogTitle, exact: true }).waitFor();
  await dialog.getByRole("button", { name: confirmLabel, exact: true }).click();
}

async function failureSnapshot(page, prefix) {
  if (!page) return null;
  const diagnostic = { url: page.url(), bodyExcerpt: "" };
  try { diagnostic.bodyExcerpt = (await page.locator("body").innerText()).slice(0, 3000); } catch {}
  try { await page.screenshot({ path: path.join(artifactDir, `${prefix}-failure.png`), fullPage: true }); } catch {}
  return diagnostic;
}

function assertBodyExcludes(body, values, label) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    assert(!body.includes(String(value)), `${label}: leaked private value ${String(value)}.`);
  }
}

fs.mkdirSync(artifactDir, { recursive: true });

const claim = oneSql(`
  select
    c.id::text as id,
    c.claim_number,
    c.status,
    c.closed_at::text as closed_at,
    c.warranty_id::text as warranty_id,
    w.customer_name,
    w.customer_phone,
    w.customer_email,
    w.product_name_snapshot,
    w.vehicle_make,
    w.vehicle_model
  from public.warranty_claims c
  join public.warranties w on w.id = c.warranty_id
  where c.closed_at is null
  order by c.submitted_at desc, c.id desc
  limit 1
`, "I submitted Claim from ACC-01-H");

assert(claim.status === "submitted", `ACC-01-I requires the H Claim to remain submitted; received ${claim.status}.`);
assert(claim.closed_at === null, "ACC-01-I requires an open Claim.");
assert(countSql(`select id from public.warranty_claim_inspections where claim_id = ${sqlUuid(claim.id)}`) === 0,
  "ACC-01-I requires no formal inspection before Admin review.");
assert(countSql(`select id from public.warranty_claim_events where claim_id = ${sqlUuid(claim.id)} and event_kind = 'submitted'`) === 1,
  "ACC-01-I requires exactly one submitted event from ACC-01-H.");

const assignedCenter = oneSql(`
  select
    party.id::text as party_id,
    center.id::text as center_id,
    center.code,
    center.name,
    center.city,
    center.country_code
  from public.installation_centers center
  join public.operational_parties party
    on party.party_type = 'center' and party.installation_center_id = center.id
  where center.code = 'NET-C-DSELF' and center.status = 'active'
`, "I assigned Center fixture");

const unassignedCenter = oneSql(`
  select
    party.id::text as party_id,
    center.id::text as center_id,
    center.code,
    center.name,
    center.city,
    center.country_code
  from public.installation_centers center
  join public.operational_parties party
    on party.party_type = 'center' and party.installation_center_id = center.id
  where center.code = 'NET-C-COMPANY' and center.status = 'active'
`, "I unassigned Center fixture");

const secondaryProfile = await createUnassignedCenterUser(unassignedCenter.center_id);
assert(secondaryProfile.role === "center" && secondaryProfile.status === "active",
  `ACC-01-I secondary profile is not an active Center: ${JSON.stringify(secondaryProfile)}`);
assert(secondaryProfile.installation_center_id === unassignedCenter.center_id,
  "ACC-01-I secondary profile is bound to the wrong Center.");

const assignedProfile = oneSql(`
  select p.id::text as profile_id, p.role, p.status
  from public.profiles p
  join auth.users u on u.id = p.id
  where u.email = ${sqlText(assignedCenterEmail)}
    and p.installation_center_id = ${sqlUuid(assignedCenter.center_id)}
`, "I assigned Center profile");
assert(assignedProfile.role === "center" && assignedProfile.status === "active",
  "ACC-01-I assigned Center operator must remain active.");

const adminProfile = oneSql(`
  select p.id::text as profile_id, p.role, p.status
  from public.profiles p
  join auth.users u on u.id = p.id
  where u.email = ${sqlText(adminEmail)}
`, "I Admin profile");
assert(adminProfile.role === "admin" && adminProfile.status === "active",
  "ACC-01-I Admin fixture must remain active.");

const actionableCenters = manySql(`
  select center.id::text as center_id, party.id::text as party_id
  from public.installation_centers center
  join public.operational_parties party
    on party.party_type = 'center' and party.installation_center_id = center.id
  where center.status = 'active'
    and exists (
      select 1 from public.profiles p
      where p.role = 'center' and p.status = 'active' and p.installation_center_id = center.id
    )
`);
assert(actionableCenters.some((item) => item.party_id === assignedCenter.party_id),
  "Assigned Center is not actionable after fixtures.");
assert(actionableCenters.some((item) => item.party_id === unassignedCenter.party_id),
  "Secondary Center is not actionable after fixtures.");

const runtimeErrors = [];
const failedResponses = [];
const audits = {};
const databaseEvidence = {};
let adminPage = null;
let assignedPage = null;
let unassignedPage = null;

const browser = await chromium.launch({ headless: true });
try {
  const adminContext = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ar-EG" });
  adminPage = await adminContext.newPage();
  attachDiagnostics(adminPage, "admin", runtimeErrors, failedResponses);
  await login(adminPage, adminEmail);

  const reviewResponse = await adminPage.goto(`${baseUrl}/operations/claims/${claim.id}/review`, { waitUntil: "networkidle" });
  assert(reviewResponse?.status() === 200, "Admin Claim review route did not return HTTP 200.");
  await adminPage.getByRole("heading", { level: 1, name: `إجراءات ${claim.claim_number}` }).waitFor();
  await adminPage.getByText("جديدة", { exact: true }).waitFor();
  audits.adminSubmitted = await audit(adminPage, "I Admin submitted Claim review", true);
  await adminPage.screenshot({ path: path.join(artifactDir, "admin-submitted-review.png"), fullPage: true });

  await confirmAction(adminPage, "بدء المراجعة", "بدء مراجعة المطالبة؟", "بدء المراجعة");
  await adminPage.getByLabel("مركز الفحص").waitFor({ state: "visible", timeout: 30000 });

  const afterReview = oneSql(`
    select c.status, c.closed_at::text as closed_at,
      (select count(*) from public.warranty_claim_events e where e.claim_id = c.id and e.event_kind = 'review_started')::int as review_event_count
    from public.warranty_claims c
    where c.id = ${sqlUuid(claim.id)}
  `, "I authoritative Claim after review start");
  assert(afterReview.status === "under_review" && afterReview.closed_at === null,
    `Claim did not transition to under_review: ${JSON.stringify(afterReview)}`);
  assert(afterReview.review_event_count === 1,
    `Expected exactly one review_started event: ${JSON.stringify(afterReview)}`);

  const reviewEvent = oneSql(`
    select e.id::text as event_id, e.actor_profile_id::text as actor_profile_id, e.actor_kind, e.reason, e.event_data
    from public.warranty_claim_events e
    where e.claim_id = ${sqlUuid(claim.id)} and e.event_kind = 'review_started'
  `, "I review_started event");
  assert(reviewEvent.actor_profile_id === adminProfile.profile_id && reviewEvent.actor_kind === "admin",
    `review_started actor is incorrect: ${JSON.stringify(reviewEvent)}`);
  assert(reviewEvent.reason === null && reviewEvent.event_data === null,
    `review_started event shape changed unexpectedly: ${JSON.stringify(reviewEvent)}`);
  assert(countSql(`select id from public.notifications where source_event_key = ${sqlText(`warranty_claim_events:${reviewEvent.event_id}`)}`) === 0,
    "review_started must not materialize a notification for the acting Admin's own action.");
  databaseEvidence.afterReview = { afterReview, reviewEvent };
  audits.adminUnderReview = await audit(adminPage, "I Admin under-review inspection assignment", true);

  await adminPage.getByLabel("مركز الفحص").selectOption(assignedCenter.party_id);
  await confirmAction(adminPage, "طلب فحص رسمي", "تأكيد طلب الفحص؟", "تأكيد التكليف");
  await adminPage.getByText("المركز المكلف حاليًا", { exact: true }).waitFor({ state: "visible", timeout: 30000 });
  await adminPage.getByLabel(/إجراءات مراجعة المطالبة/).getByText(assignedCenter.name, { exact: true }).waitFor();

  const inspection = oneSql(`
    select
      i.id::text as inspection_id,
      i.claim_id::text as claim_id,
      i.status,
      i.assigned_center_party_id::text as assigned_center_party_id,
      i.requested_by_profile_id::text as requested_by_profile_id,
      i.submitted_by_profile_id::text as submitted_by_profile_id,
      i.technical_observation,
      i.suspected_cause,
      i.submitted_at::text as submitted_at
    from public.warranty_claim_inspections i
    where i.claim_id = ${sqlUuid(claim.id)}
  `, "I authoritative requested inspection");
  assert(inspection.status === "requested", `Inspection is not requested: ${JSON.stringify(inspection)}`);
  assert(inspection.assigned_center_party_id === assignedCenter.party_id,
    `Inspection assigned to wrong Center: ${JSON.stringify(inspection)}`);
  assert(inspection.requested_by_profile_id === adminProfile.profile_id,
    `Inspection request actor is incorrect: ${JSON.stringify(inspection)}`);
  assert(inspection.submitted_by_profile_id === null && inspection.technical_observation === null
    && inspection.suspected_cause === null && inspection.submitted_at === null,
  `ACC-01-I must stop before Center inspection submission: ${JSON.stringify(inspection)}`);

  const afterAssignment = oneSql(`
    select c.status, c.closed_at::text as closed_at
    from public.warranty_claims c
    where c.id = ${sqlUuid(claim.id)}
  `, "I authoritative Claim after inspection request");
  assert(afterAssignment.status === "awaiting_inspection" && afterAssignment.closed_at === null,
    `Claim did not transition to awaiting_inspection: ${JSON.stringify(afterAssignment)}`);

  const inspectionEvent = oneSql(`
    select e.id::text as event_id, e.actor_profile_id::text as actor_profile_id, e.actor_kind, e.reason, e.event_data
    from public.warranty_claim_events e
    where e.claim_id = ${sqlUuid(claim.id)} and e.event_kind = 'inspection_requested'
  `, "I inspection_requested event");
  assert(inspectionEvent.actor_profile_id === adminProfile.profile_id && inspectionEvent.actor_kind === "admin",
    `inspection_requested actor is incorrect: ${JSON.stringify(inspectionEvent)}`);
  assert(inspectionEvent.reason === null,
    `inspection_requested must not carry a reason: ${JSON.stringify(inspectionEvent)}`);
  assert(inspectionEvent.event_data?.inspection_id === inspection.inspection_id
    && inspectionEvent.event_data?.assigned_center_party_id === assignedCenter.party_id,
  `inspection_requested event_data is not authoritative: ${JSON.stringify(inspectionEvent)}`);
  assert(countSql(`select id from public.warranty_claim_events where claim_id = ${sqlUuid(claim.id)} and event_kind = 'inspection_requested'`) === 1,
    "ACC-01-I expected exactly one inspection_requested event.");

  const notification = oneSql(`
    select
      n.recipient_profile_id::text as recipient_profile_id,
      n.event_type,
      n.source_domain,
      n.source_event_key,
      n.attention_level,
      n.action_path,
      n.push_eligible
    from public.notifications n
    where n.source_event_key = ${sqlText(`warranty_claim_events:${inspectionEvent.event_id}`)}
      and n.event_type = 'claim.inspection_requested'
  `, "I assigned Center notification");
  assert(notification.recipient_profile_id === assignedProfile.profile_id,
    `Inspection notification went to wrong profile: ${JSON.stringify(notification)}`);
  assert(notification.source_domain === "warranty_claim"
    && notification.attention_level === "action_required"
    && notification.action_path === "/operations/claim-inspections"
    && notification.push_eligible === true,
  `Inspection notification contract changed: ${JSON.stringify(notification)}`);
  assert(countSql(`
    select id from public.notifications
    where source_event_key = ${sqlText(`warranty_claim_events:${inspectionEvent.event_id}`)}
      and recipient_profile_id = ${sqlUuid(secondaryProfile.profile_id)}
  `) === 0, "Unassigned Center unexpectedly received the assigned Center notification.");

  databaseEvidence.afterAssignment = { afterAssignment, inspection, inspectionEvent, notification };
  audits.adminAssigned = await audit(adminPage, "I Admin assigned inspection", true);
  await adminPage.screenshot({ path: path.join(artifactDir, "admin-assigned-inspection.png"), fullPage: true });
  await adminContext.close();

  const assignedContext = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ar-EG" });
  assignedPage = await assignedContext.newPage();
  attachDiagnostics(assignedPage, "assigned-center", runtimeErrors, failedResponses);
  await login(assignedPage, assignedCenterEmail);
  const queueResponse = await assignedPage.goto(`${baseUrl}/operations/claim-inspections`, { waitUntil: "networkidle" });
  assert(queueResponse?.status() === 200, "Assigned Center inspection queue did not return HTTP 200.");
  await assignedPage.getByRole("heading", { level: 1, name: "فحوصات الضمان المسندة للمركز" }).waitFor();
  await assignedPage.getByText(claim.claim_number, { exact: true }).waitFor();
  await assignedPage.getByText("بانتظار الفحص", { exact: true }).waitFor();
  audits.assignedQueue = await audit(assignedPage, "I assigned Center queue", true);
  await assignedPage.screenshot({ path: path.join(artifactDir, "assigned-center-queue.png"), fullPage: true });

  await assignedPage.getByRole("link", { name: "فتح مهمة الفحص", exact: true }).click();
  await assignedPage.waitForURL((url) => url.pathname === `/operations/claim-inspections/${inspection.inspection_id}`);
  await assignedPage.waitForLoadState("networkidle");
  await assignedPage.getByRole("heading", { level: 1, name: claim.claim_number }).waitFor();
  await assignedPage.getByText("فحص مطلوب", { exact: true }).waitFor();
  await assignedPage.getByRole("heading", { name: "الصور المرفقة بالمطالبة" }).waitFor();
  const assignedBody = await assignedPage.locator("body").innerText();
  assertBodyExcludes(assignedBody, [claim.customer_name, claim.customer_phone, claim.customer_email],
    "assigned Center inspection detail");
  assert(assignedBody.includes(claim.product_name_snapshot), "Assigned Center detail omitted product context.");
  assert(assignedBody.includes(claim.vehicle_make) && assignedBody.includes(claim.vehicle_model),
    "Assigned Center detail omitted vehicle context.");
  assert(assignedBody.includes("1 صورة"), "Assigned Center detail did not receive the H customer evidence handoff.");
  audits.assignedDetail = await audit(assignedPage, "I assigned Center inspection detail", true);
  await assignedPage.screenshot({ path: path.join(artifactDir, "assigned-center-detail.png"), fullPage: true });

  assert(countSql(`select id from public.warranty_claim_inspections where id = ${sqlUuid(inspection.inspection_id)} and status = 'submitted'`) === 0,
    "ACC-01-I accidentally crossed scope into Center inspection submission.");
  await assignedContext.close();

  const unassignedContext = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ar-EG" });
  unassignedPage = await unassignedContext.newPage();
  attachDiagnostics(unassignedPage, "unassigned-center", runtimeErrors, failedResponses);
  await login(unassignedPage, unassignedCenterEmail);

  await unassignedPage.goto(`${baseUrl}/operations/claim-inspections`, { waitUntil: "networkidle" });
  await unassignedPage.getByRole("heading", { level: 1, name: "فحوصات الضمان المسندة للمركز" }).waitFor();
  const unassignedQueueBody = await unassignedPage.locator("body").innerText();
  assert(!unassignedQueueBody.includes(claim.claim_number), "Unassigned Center queue leaked the assigned Claim.");
  audits.unassignedQueue = await audit(unassignedPage, "I unassigned Center queue", true);

  await unassignedPage.goto(`${baseUrl}/operations/claims/${claim.id}/review`, { waitUntil: "networkidle" });
  assert(new URL(unassignedPage.url()).pathname === "/access-denied",
    `Center reached Admin Claim review route: ${unassignedPage.url()}`);
  await unassignedPage.getByText("الوصول غير متاح", { exact: true }).waitFor();

  const directResponse = await unassignedPage.goto(
    `${baseUrl}/operations/claim-inspections/${inspection.inspection_id}`,
    { waitUntil: "networkidle" },
  );
  const directStatus = directResponse?.status();
  assert(directStatus === 200 || directStatus === 404,
    `Unassigned Center exact inspection detail returned unexpected HTTP ${directStatus}.`);
  assert(new URL(unassignedPage.url()).pathname === `/operations/claim-inspections/${inspection.inspection_id}`,
    `Unassigned Center exact inspection detail navigated unexpectedly: ${unassignedPage.url()}`);
  await unassignedPage.getByText("السجل أو الصفحة المطلوبة غير متاحة", { exact: true }).waitFor();
  const robotsContents = await unassignedPage.locator('meta[name="robots"]').evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("content") ?? ""));
  assert(robotsContents.some((content) => content.toLowerCase().split(",").map((token) => token.trim()).includes("noindex")),
    `Unassigned Center not-found response was not marked noindex: ${JSON.stringify(robotsContents)}`);
  const unassignedDetailBody = await unassignedPage.locator("body").innerText();
  assertBodyExcludes(unassignedDetailBody, [
    claim.claim_number,
    claim.customer_name,
    claim.customer_phone,
    claim.customer_email,
    claim.product_name_snapshot,
  ], "unassigned Center exact inspection detail");
  await unassignedPage.screenshot({ path: path.join(artifactDir, "unassigned-center-hidden-detail.png"), fullPage: true });
  await unassignedContext.close();

  const unexpectedResponses = failedResponses.filter((item) => !(
    item.actor === "unassigned-center"
    && item.status === 404
    && new URL(item.url).pathname === `/operations/claim-inspections/${inspection.inspection_id}`
  ));
  assert(runtimeErrors.length === 0, `ACC-01-I runtime errors: ${JSON.stringify(runtimeErrors)}`);
  assert(unexpectedResponses.length === 0,
    `ACC-01-I unexpected failed responses: ${JSON.stringify(unexpectedResponses)}`);

  fs.writeFileSync(path.join(artifactDir, "summary.json"), `${JSON.stringify({
    baseUrl,
    generatedAt: new Date().toISOString(),
    claim: { id: claim.id, claimNumber: claim.claim_number },
    assignedCenter,
    unassignedCenter,
    audits,
    databaseEvidence,
    runtimeErrors,
    failedResponses,
  }, null, 2)}\n`);

  console.log(`ACC-01-I Claim inspection assignment browser acceptance passed for ${claim.claim_number}.`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const failure = {
    message,
    admin: await failureSnapshot(adminPage, "admin"),
    assignedCenter: await failureSnapshot(assignedPage, "assigned-center"),
    unassignedCenter: await failureSnapshot(unassignedPage, "unassigned-center"),
    runtimeErrors,
    failedResponses,
    databaseEvidence,
  };
  fs.writeFileSync(path.join(artifactDir, "failure.json"), `${JSON.stringify(failure, null, 2)}\n`);
  throw error;
} finally {
  await browser.close();
}
