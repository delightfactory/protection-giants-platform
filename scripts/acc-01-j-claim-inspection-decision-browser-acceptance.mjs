import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const baseUrl = process.env.ACC_BASE_URL?.trim() || "http://127.0.0.1:3000";
const artifactDir = process.env.ACC_J_ARTIFACT_DIR?.trim() || "artifacts/acc-01-j";
const password = "Agent-Network-Foundation-2026!";
const adminEmail = "network-admin@example.test";
const centerEmail = "acc-role-center@example.test";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function dbContainerName() {
  const names = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" })
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
  const name = names.find((value) => value.startsWith("supabase_db_"));
  assert(name, "Supabase database container was not found for ACC-01-J.");
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

function countSql(sql) {
  return Number(querySql(`select count(*) from (${sql}) q;`));
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
      failedResponses.push({ actor, status: response.status(), method: response.request().method(), url: response.url() });
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
    return { viewportWidth, scrollWidth, undersized: enforce ? targets.filter((item) => item.width < 44 || item.height < 44) : [] };
  }, enforceMobileTargets);

  assert(geometry.scrollWidth <= geometry.viewportWidth + 1, `${label}: horizontal overflow.`);
  assert(geometry.undersized.length === 0, `${label}: undersized mobile targets ${JSON.stringify(geometry.undersized)}`);
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

async function failureSnapshot(page, prefix) {
  if (!page) return null;
  const diagnostic = { url: page.url(), bodyExcerpt: "" };
  try { diagnostic.bodyExcerpt = (await page.locator("body").innerText()).slice(0, 3000); } catch {}
  try { await page.screenshot({ path: path.join(artifactDir, `${prefix}-failure.png`), fullPage: true }); } catch {}
  return diagnostic;
}

fs.mkdirSync(artifactDir, { recursive: true });
const evidenceBuffer = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZqSoAAAAASUVORK5CYII=",
  "base64",
);
fs.writeFileSync(path.join(artifactDir, "inspection-evidence.png"), evidenceBuffer);

const fixture = oneSql(`
  select claim.id::text as claim_id, claim.claim_number, claim.status as claim_status,
    claim.closed_at::text as closed_at, inspection.id::text as inspection_id,
    inspection.status as inspection_status, inspection.assigned_center_party_id::text as assigned_center_party_id,
    party.installation_center_id::text as center_id, center.name as center_name
  from public.warranty_claims claim
  join public.warranty_claim_inspections inspection on inspection.claim_id = claim.id
  join public.operational_parties party on party.id = inspection.assigned_center_party_id
  join public.installation_centers center on center.id = party.installation_center_id
  where claim.status = 'awaiting_inspection' and claim.closed_at is null and inspection.status = 'requested'
  order by inspection.requested_at desc, inspection.id desc
  limit 1
`, "J requested inspection from ACC-01-I");

assert(fixture.claim_status === "awaiting_inspection" && fixture.inspection_status === "requested",
  `ACC-01-J requires ACC-01-I handoff state: ${JSON.stringify(fixture)}`);
assert(countSql(`select id from public.warranty_claim_resolutions where claim_id = ${sqlUuid(fixture.claim_id)}`) === 0,
  "ACC-01-J requires no Resolution before Center inspection and Admin decision.");

const centerProfile = oneSql(`
  select p.id::text as profile_id, p.role, p.status, p.installation_center_id::text as center_id
  from public.profiles p join auth.users u on u.id = p.id where u.email = ${sqlText(centerEmail)}
`, "J assigned Center profile");
assert(centerProfile.role === "center" && centerProfile.status === "active" && centerProfile.center_id === fixture.center_id,
  `ACC-01-J Center fixture is not the assigned active Center: ${JSON.stringify(centerProfile)}`);

const adminProfile = oneSql(`
  select p.id::text as profile_id, p.role, p.status
  from public.profiles p join auth.users u on u.id = p.id where u.email = ${sqlText(adminEmail)}
`, "J Admin profile");
assert(adminProfile.role === "admin" && adminProfile.status === "active",
  `ACC-01-J Admin fixture is not active: ${JSON.stringify(adminProfile)}`);

const technicalObservation = "يوجد عيب التصاق موضعي ظاهر بوضوح في مساحة محددة من الفيلم ويحتاج إلى قرار الشركة.";
const suspectedCause = "تلوث موضعي محتمل أثناء التركيب";
const decisionReason = "نتيجة الفحص الفني تؤكد وجود عيب مغطى يستلزم تنفيذ معالجة رسمية للمطالبة.";
const customerMessage = "تم قبول مطالبتك بعد مراجعة الفحص الفني وسيتم استكمال إجراءات المعالجة من خلال المركز المختص.";

const runtimeErrors = [];
const failedResponses = [];
const audits = {};
const databaseEvidence = {};
let centerPage = null;
let adminPage = null;
const browser = await chromium.launch({ headless: true });

try {
  const centerContext = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ar-EG" });
  centerPage = await centerContext.newPage();
  attachDiagnostics(centerPage, "center", runtimeErrors, failedResponses);
  await login(centerPage, centerEmail);

  const detailResponse = await centerPage.goto(`${baseUrl}/operations/claim-inspections/${fixture.inspection_id}`, { waitUntil: "networkidle" });
  assert(detailResponse?.status() === 200, "Assigned Center inspection detail did not return HTTP 200.");
  await centerPage.getByRole("heading", { name: "تسجيل الفحص" }).waitFor();
  await centerPage.getByText(fixture.claim_number, { exact: false }).first().waitFor();
  audits.centerRequestedInspection = await audit(centerPage, "J Center requested inspection", true);
  await centerPage.screenshot({ path: path.join(artifactDir, "center-requested-inspection.png"), fullPage: true });

  await centerPage.getByLabel("الملاحظة الفنية").fill(technicalObservation);
  await centerPage.getByLabel("السبب المشتبه به — اختياري").fill(suspectedCause);
  const fileInput = centerPage.locator('input[type="file"]').first();
  assert(await fileInput.count() === 1, "ACC-01-J could not find the inspection evidence file input.");
  await fileInput.setInputFiles({ name: "inspection-evidence.png", mimeType: "image/png", buffer: evidenceBuffer });
  await centerPage.getByText("1/5 صور محددة", { exact: false }).waitFor();
  await centerPage.getByRole("checkbox", { name: /راجعت الملاحظة والصور/ }).check();

  await centerPage.getByRole("button", { name: "إرسال نتيجة الفحص", exact: true }).click();
  const submitDialog = centerPage.getByRole("dialog");
  await submitDialog.getByRole("heading", { name: "إرسال الفحص مع 1 صورة؟", exact: true }).waitFor();
  await Promise.all([
    centerPage.waitForURL((url) => url.pathname === "/operations/claim-inspections" && url.searchParams.get("notice") === "submitted", { timeout: 30000 }),
    submitDialog.getByRole("button", { name: "تأكيد وإرسال الفحص", exact: true }).click(),
  ]);
  await centerPage.waitForLoadState("networkidle");

  const submittedInspection = oneSql(`
    select inspection.status, inspection.submitted_by_profile_id::text as submitted_by_profile_id,
      inspection.technical_observation, inspection.suspected_cause, inspection.submitted_at::text as submitted_at,
      claim.status as claim_status, claim.closed_at::text as closed_at
    from public.warranty_claim_inspections inspection
    join public.warranty_claims claim on claim.id = inspection.claim_id
    where inspection.id = ${sqlUuid(fixture.inspection_id)}
  `, "J authoritative submitted inspection");
  assert(submittedInspection.status === "submitted", `Inspection was not submitted: ${JSON.stringify(submittedInspection)}`);
  assert(submittedInspection.submitted_by_profile_id === centerProfile.profile_id,
    `Inspection was submitted by the wrong Profile: ${JSON.stringify(submittedInspection)}`);
  assert(submittedInspection.technical_observation === technicalObservation,
    `Inspection technical observation mismatch: ${JSON.stringify(submittedInspection)}`);
  assert(submittedInspection.suspected_cause === suspectedCause,
    `Inspection suspected cause mismatch: ${JSON.stringify(submittedInspection)}`);
  assert(Boolean(submittedInspection.submitted_at), "Inspection submitted_at was not recorded.");
  assert(submittedInspection.claim_status === "under_review" && submittedInspection.closed_at === null,
    `Claim did not return to under_review after inspection: ${JSON.stringify(submittedInspection)}`);

  const inspectionEvidence = oneSql(`
    select evidence.storage_path, evidence.mime_type, evidence.size_bytes,
      evidence.uploaded_by_profile_id::text as uploaded_by_profile_id, evidence.created_at::text as created_at
    from public.warranty_claim_inspection_evidence evidence
    where evidence.inspection_id = ${sqlUuid(fixture.inspection_id)}
  `, "J finalized inspection evidence");
  assert(inspectionEvidence.mime_type === "image/png" && Number(inspectionEvidence.size_bytes) > 0,
    `Inspection evidence metadata is invalid: ${JSON.stringify(inspectionEvidence)}`);
  assert(inspectionEvidence.uploaded_by_profile_id === centerProfile.profile_id && Boolean(inspectionEvidence.created_at),
    `Inspection evidence actor/timestamp is invalid: ${JSON.stringify(inspectionEvidence)}`);
  assert(inspectionEvidence.storage_path.startsWith(`inspections/${fixture.inspection_id}/`),
    `Inspection evidence storage path is outside the inspection namespace: ${inspectionEvidence.storage_path}`);
  assert(countSql(`select id from storage.objects where bucket_id = 'warranty-claim-evidence' and name = ${sqlText(inspectionEvidence.storage_path)}`) === 1,
    "Finalized inspection evidence object is missing from private storage.");

  const inspectionEvent = oneSql(`
    select event.event_kind, event.actor_profile_id::text as actor_profile_id, event.actor_kind, event.event_data
    from public.warranty_claim_events event
    where event.claim_id = ${sqlUuid(fixture.claim_id)} and event.event_kind = 'inspection_submitted'
  `, "J authoritative inspection_submitted event");
  assert(inspectionEvent.actor_profile_id === centerProfile.profile_id && inspectionEvent.actor_kind === "center",
    `inspection_submitted actor is invalid: ${JSON.stringify(inspectionEvent)}`);
  assert(inspectionEvent.event_data?.inspection_id === fixture.inspection_id,
    `inspection_submitted inspection id is invalid: ${JSON.stringify(inspectionEvent)}`);
  assert(inspectionEvent.event_data?.assigned_center_party_id === fixture.assigned_center_party_id,
    `inspection_submitted Center is invalid: ${JSON.stringify(inspectionEvent)}`);
  assert(Number(inspectionEvent.event_data?.evidence_count) === 1,
    `inspection_submitted evidence count is invalid: ${JSON.stringify(inspectionEvent)}`);
  assert(countSql(`select id from public.warranty_claim_events where claim_id = ${sqlUuid(fixture.claim_id)} and event_kind = 'inspection_submitted'`) === 1,
    "ACC-01-J expected exactly one inspection_submitted event.");

  databaseEvidence.submittedInspection = submittedInspection;
  databaseEvidence.inspectionEvidence = inspectionEvidence;
  databaseEvidence.inspectionEvent = inspectionEvent;

  const submittedDetailResponse = await centerPage.goto(`${baseUrl}/operations/claim-inspections/${fixture.inspection_id}`, { waitUntil: "networkidle" });
  assert(submittedDetailResponse?.status() === 200, "Submitted inspection detail did not remain readable to assigned Center.");
  assert(await centerPage.getByRole("heading", { name: "تسجيل الفحص" }).count() === 0,
    "Submitted inspection still exposes the mutable Center submission workspace.");
  assert(await centerPage.getByRole("button", { name: "إرسال نتيجة الفحص", exact: true }).count() === 0,
    "Submitted inspection still exposes the submit action.");
  await centerPage.getByText(technicalObservation, { exact: true }).waitFor();
  audits.centerSubmittedInspection = await audit(centerPage, "J Center submitted inspection read-only detail", true);
  await centerPage.screenshot({ path: path.join(artifactDir, "center-submitted-inspection.png"), fullPage: true });

  await centerPage.goto(`${baseUrl}/operations/claim-inspections`, { waitUntil: "networkidle" });
  assert(await centerPage.locator(`a[href="/operations/claim-inspections/${fixture.inspection_id}"]`).count() === 0,
    "Submitted inspection remains in the Center pending inspection queue.");
  audits.centerQueueAfterSubmission = await audit(centerPage, "J Center queue after inspection submission", true);
  await centerPage.screenshot({ path: path.join(artifactDir, "center-queue-after-submission.png"), fullPage: true });
  await centerContext.close();

  const adminContext = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ar-EG" });
  adminPage = await adminContext.newPage();
  attachDiagnostics(adminPage, "admin", runtimeErrors, failedResponses);
  await login(adminPage, adminEmail);

  const decisionResponse = await adminPage.goto(`${baseUrl}/operations/claims/${fixture.claim_id}/decision`, { waitUntil: "networkidle" });
  assert(decisionResponse?.status() === 200, "Admin decision route did not return HTTP 200 after inspection submission.");
  await adminPage.getByRole("heading", { level: 1, name: `قرار ${fixture.claim_number}` }).waitFor();
  const approveHeading = adminPage.getByRole("heading", { name: "قبول المطالبة", exact: true });
  await approveHeading.waitFor();
  audits.adminDecisionReady = await audit(adminPage, "J Admin decision after inspection", true);
  await adminPage.screenshot({ path: path.join(artifactDir, "admin-decision-ready.png"), fullPage: true });

  const approveForm = approveHeading.locator("xpath=ancestor::form");
  assert(await approveForm.count() === 1, "ACC-01-J could not isolate the approval form.");
  await approveForm.getByLabel("سبب القرار الداخلي").fill(decisionReason);
  await approveForm.getByLabel("رسالة القرار للعميل").fill(customerMessage);
  await approveForm.getByRole("button", { name: "قبول المطالبة", exact: true }).click();
  const approveDialog = adminPage.getByRole("dialog");
  await approveDialog.getByRole("heading", { name: "تأكيد قبول المطالبة؟", exact: true }).waitFor();
  await Promise.all([
    adminPage.waitForURL((url) => url.pathname === `/operations/claims/${fixture.claim_id}`, { timeout: 30000 }),
    approveDialog.getByRole("button", { name: "قبول المطالبة", exact: true }).click(),
  ]);
  await adminPage.waitForLoadState("networkidle");

  const approvedClaim = oneSql(`
    select claim.status, claim.closed_at::text as closed_at, claim.decided_by_profile_id::text as decided_by_profile_id,
      claim.decision_reason, claim.customer_decision_message, claim.decided_at::text as decided_at
    from public.warranty_claims claim where claim.id = ${sqlUuid(fixture.claim_id)}
  `, "J authoritative approved Claim");
  assert(approvedClaim.status === "approved" && approvedClaim.closed_at === null,
    `Claim was not approved/open: ${JSON.stringify(approvedClaim)}`);
  assert(approvedClaim.decided_by_profile_id === adminProfile.profile_id,
    `Claim decision actor mismatch: ${JSON.stringify(approvedClaim)}`);
  assert(approvedClaim.decision_reason === decisionReason && approvedClaim.customer_decision_message === customerMessage,
    `Claim decision text mismatch: ${JSON.stringify(approvedClaim)}`);
  assert(Boolean(approvedClaim.decided_at), "Claim decided_at was not recorded.");

  const resolution = oneSql(`
    select resolution.id::text as resolution_id, resolution.claim_id::text as claim_id, resolution.status,
      resolution.authorized_by_profile_id::text as authorized_by_profile_id, resolution.authorized_at::text as authorized_at
    from public.warranty_claim_resolutions resolution where resolution.claim_id = ${sqlUuid(fixture.claim_id)}
  `, "J authorized Resolution");
  assert(resolution.status === "authorized" && resolution.authorized_by_profile_id === adminProfile.profile_id,
    `Approval did not create the expected authorized Resolution: ${JSON.stringify(resolution)}`);
  assert(Boolean(resolution.authorized_at), "Resolution authorized_at was not recorded.");
  assert(countSql(`select id from public.warranty_claim_resolutions where claim_id = ${sqlUuid(fixture.claim_id)}`) === 1,
    "ACC-01-J expected exactly one Resolution for the approved Claim.");

  const approvedEvent = oneSql(`
    select event.event_kind, event.actor_profile_id::text as actor_profile_id, event.actor_kind, event.reason, event.event_data
    from public.warranty_claim_events event
    where event.claim_id = ${sqlUuid(fixture.claim_id)} and event.event_kind = 'approved'
  `, "J authoritative approved event");
  assert(approvedEvent.actor_profile_id === adminProfile.profile_id && approvedEvent.actor_kind === "admin",
    `Approved event actor mismatch: ${JSON.stringify(approvedEvent)}`);
  assert(approvedEvent.reason === decisionReason && approvedEvent.event_data?.customer_message === customerMessage,
    `Approved event decision data mismatch: ${JSON.stringify(approvedEvent)}`);
  assert(approvedEvent.event_data?.resolution_id === resolution.resolution_id,
    `Approved event Resolution mismatch: ${JSON.stringify(approvedEvent)}`);
  assert(countSql(`select id from public.warranty_claim_events where claim_id = ${sqlUuid(fixture.claim_id)} and event_kind = 'approved'`) === 1,
    "ACC-01-J expected exactly one approved event.");

  databaseEvidence.approvedClaim = approvedClaim;
  databaseEvidence.resolution = resolution;
  databaseEvidence.approvedEvent = approvedEvent;

  await adminPage.getByText("تم قبول المطالبة، وتظل مفتوحة حتى اكتمال المعالجة المسندة وتنفيذها.", { exact: true }).waitFor();
  await adminPage.getByRole("heading", { name: "مقبولة", exact: true }).waitFor();
  await adminPage.getByText(decisionReason, { exact: true }).waitFor();
  await adminPage.getByText(customerMessage, { exact: true }).waitFor();
  audits.adminApprovedClaim = await audit(adminPage, "J Admin approved Claim detail", true);
  await adminPage.screenshot({ path: path.join(artifactDir, "admin-approved-claim.png"), fullPage: true });
  await adminContext.close();

  assert(runtimeErrors.length === 0, `ACC-01-J runtime errors: ${JSON.stringify(runtimeErrors)}`);
  assert(failedResponses.length === 0, `ACC-01-J failed network responses: ${JSON.stringify(failedResponses)}`);

  fs.writeFileSync(path.join(artifactDir, "summary.json"), JSON.stringify({ fixture, audits, databaseEvidence, runtimeErrors, failedResponses }, null, 2));
  console.log(JSON.stringify({ status: "ok", claimId: fixture.claim_id, claimNumber: fixture.claim_number,
    inspectionId: fixture.inspection_id, resolutionId: resolution.resolution_id }, null, 2));
} catch (error) {
  const diagnostic = {
    message: error instanceof Error ? error.message : String(error),
    center: await failureSnapshot(centerPage, "center"),
    admin: await failureSnapshot(adminPage, "admin"),
    runtimeErrors,
    failedResponses,
  };
  fs.writeFileSync(path.join(artifactDir, "failure.json"), JSON.stringify(diagnostic, null, 2));
  throw error;
} finally {
  await browser.close();
}
