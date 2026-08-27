import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";

const apiUrl = process.env.API_URL;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
const anonKey = process.env.ANON_KEY;
if (!apiUrl || !serviceRoleKey || !anonKey) throw new Error("Local Supabase API_URL, SERVICE_ROLE_KEY and ANON_KEY are required.");

const password = "Cube-J-Roll-Opening-2026!";
let claimCounter = Number(String(Date.now()).slice(-8));
function assert(condition, message) { if (!condition) throw new Error(message); }
async function readJson(response) { const text = await response.text(); if (!text) return null; try { return JSON.parse(text); } catch { return text; } }
async function request(path, { method = "GET", token = serviceRoleKey, key = serviceRoleKey, body, rawBody, contentType, headers = {} } = {}) {
  const requestHeaders = { apikey: key, Authorization: `Bearer ${token}`, ...headers };
  let payload;
  if (rawBody !== undefined) { requestHeaders["Content-Type"] = contentType ?? "application/octet-stream"; payload = rawBody; }
  else if (body !== undefined) { requestHeaders["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
  const response = await fetch(`${apiUrl}${path}`, { method, headers: requestHeaders, body: payload });
  return { response, body: await readJson(response) };
}
async function rpc(name, body, token = serviceRoleKey, key = serviceRoleKey) { return request(`/rest/v1/rpc/${name}`, { method: "POST", body, token, key }); }
async function userRpc(name, body, token) { return rpc(name, body, token, anonKey); }
async function anonRpc(name, body) { return rpc(name, body, anonKey, anonKey); }
async function signIn(email) {
  const result = await request("/auth/v1/token?grant_type=password", { method: "POST", token: anonKey, key: anonKey, body: { email, password } });
  assert(result.response.ok && result.body?.access_token, `Could not sign in ${email}: ${result.response.status} ${JSON.stringify(result.body)}`);
  return result.body.access_token;
}
async function expectRpcError(name, body, token, expectedMessage) {
  const result = await userRpc(name, body, token);
  assert(!result.response.ok, `${name} unexpectedly succeeded; expected ${expectedMessage}.`);
  assert(result.body?.message === expectedMessage, `${name} expected ${expectedMessage}, received ${result.response.status} ${JSON.stringify(result.body)}`);
  return result;
}
function dbContainerName() {
  const names = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" }).split("\n").map((value) => value.trim()).filter(Boolean);
  const name = names.find((value) => value.startsWith("supabase_db_"));
  assert(name, "Supabase database container was not found for Cube R Admin recovery verification.");
  return name;
}
function querySql(sql) { return execFileSync("docker", ["exec", "-i", dbContainerName(), "psql", "-At", "-F", "|", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-c", sql], { encoding: "utf8" }).trim(); }
function runSql(sql) { return execFileSync("docker", ["exec", "-i", dbContainerName(), "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }); }
function sqlUuid(value) { assert(/^[0-9a-f-]{36}$/i.test(value), `Unsafe UUID: ${value}`); return `'${value}'::uuid`; }
function sqlText(value) { return `'${String(value).replaceAll("'", "''")}'`; }
function nextClaimNumber() { claimCounter = (claimCounter + 1) % 100000000; return `PG-C-${String(claimCounter).padStart(8, "0")}`; }

const signature = "public.complete_warranty_claim_resolution_by_admin_recovery(uuid,uuid,text,text[],text,text)";
assert(querySql(`select has_function_privilege('authenticated', '${signature}', 'EXECUTE');`) === "t", "Authenticated must reach Admin recovery RPC; Admin enforcement is internal.");
for (const role of ["anon", "service_role"]) assert(querySql(`select has_function_privilege('${role}', '${signature}', 'EXECUTE');`) === "f", `${role} unexpectedly executes ${signature}.`);
assert(querySql(`select has_function_privilege('authenticated', 'private.lock_claim_center_unactionable_for_recovery(uuid)', 'EXECUTE');`) === "f", "Private Center recovery gate must not be executable by authenticated callers.");

const adminToken = await signIn("cube-j-admin@example.test");
const centerToken = await signIn("cube-j-center-a@example.test");
const adminProfileId = querySql(`select profile.id from public.profiles profile join auth.users auth_user on auth_user.id = profile.id where auth_user.email = 'cube-j-admin@example.test' and profile.role = 'admin' and profile.status = 'active' limit 1;`);
const centerProfileId = querySql(`select profile.id from public.profiles profile join auth.users auth_user on auth_user.id = profile.id where auth_user.email = 'cube-j-center-a@example.test' and profile.role = 'center' and profile.status = 'active' limit 1;`);
const centerPartyId = querySql(`select party.id from public.operational_parties party join public.installation_centers center on center.id = party.installation_center_id where party.party_type = 'center' and center.code = 'CUBE-J-CENTER-A' limit 1;`);
const productId = querySql(`select id from public.products where status = 'active' and product_type = 'PPF' order by created_at, id limit 1;`);
assert(adminProfileId && centerProfileId && centerPartyId && productId, "Required Admin/Center/Product fixtures are missing.");

async function setCenterProfileStatus(status) {
  const result = await request(`/rest/v1/profiles?id=eq.${encodeURIComponent(centerProfileId)}`, { method: "PATCH", key: serviceRoleKey, token: serviceRoleKey, headers: { Prefer: "return=representation" }, body: { status } });
  assert(result.response.ok && Array.isArray(result.body) && result.body[0]?.status === status, `Could not set Center Profile status=${status}: ${result.response.status} ${JSON.stringify(result.body)}`);
}

async function createProductionRoll(label) {
  const order = await userRpc("create_production_order", { p_request_id: randomUUID(), p_product_id: productId, p_production_date: "2026-08-27", p_lots: [{ quantity: 1, source_reference: label }], p_source_reference: label, p_notes: `Cube R Admin recovery ${label}` }, adminToken);
  assert(order.response.ok && /^[0-9a-f-]{36}$/i.test(String(order.body)), `Could not create ${label} Production Order: ${order.response.status} ${JSON.stringify(order.body)}`);
  const [rollId, serial, publicCode] = querySql(`select concat_ws('|', roll.id, roll.serial_number, identity.public_code) from public.rolls roll join private.roll_public_identities identity on identity.roll_id = roll.id where roll.production_order_id = ${sqlUuid(order.body)} order by roll.roll_index limit 1;`).split("|");
  assert(rollId && serial && /^[0-9a-f]{64}$/.test(publicCode), `Could not read ${label} Roll identity.`);
  runSql(`update public.roll_custody_current set custodian_party_id = ${sqlUuid(centerPartyId)}, confirmed_at = now() where roll_id = ${sqlUuid(rollId)}; insert into public.roll_custody_events (roll_id, custody_sequence, custodian_party_id, confirmed_at) values (${sqlUuid(rollId)}, (select coalesce(max(event.custody_sequence), 0) + 1 from public.roll_custody_events event where event.roll_id = ${sqlUuid(rollId)}), ${sqlUuid(centerPartyId)}, now());`);
  return { orderId: order.body, rollId, serial, publicCode };
}

async function createAssignedResolution(label, remedyKind, phoneSuffix) {
  const warrantySource = await createProductionRoll(`${label}-WARRANTY`);
  const opening = await userRpc("open_roll", { p_request_id: randomUUID(), p_roll_serial: warrantySource.serial }, centerToken);
  assert(opening.response.ok && opening.body === warrantySource.rollId, `Could not open ${label} Warranty source Roll: ${opening.response.status} ${JSON.stringify(opening.body)}`);
  const activation = await userRpc("activate_roll_warranty", { p_request_id: randomUUID(), p_roll_serial: warrantySource.serial, p_customer_name: `Cube R Recovery ${label}`, p_customer_phone: `+20100000${phoneSuffix}`, p_customer_email: null, p_vehicle_make: "Test", p_vehicle_model: label, p_vehicle_year: 2026, p_vehicle_plate: label.slice(0, 8), p_vehicle_color: "Black", p_vehicle_vin: `${label.replaceAll("-", "").slice(0, 10)}7654321`.slice(0, 17) }, centerToken);
  const warrantyId = Array.isArray(activation.body) ? activation.body[0]?.warranty_id : activation.body?.warranty_id ?? activation.body;
  assert(activation.response.ok && /^[0-9a-f-]{36}$/i.test(String(warrantyId)), `Could not activate ${label} Warranty: ${activation.response.status} ${JSON.stringify(activation.body)}`);
  const warrantyBefore = querySql(`select concat_ws('|', record_state, activated_at, coverage_expires_at, customer_phone, vehicle_make, vehicle_model, updated_at) from public.warranties where id = ${sqlUuid(warrantyId)};`);
  const claimId = randomUUID(); const resolutionId = randomUUID();
  runSql(`insert into public.warranty_claims (id, request_id, warranty_id, claim_number, category, affected_area, description, status, submitted_at, closed_at, created_at, updated_at, decided_by_profile_id, decision_reason, customer_decision_message, decided_at) values (${sqlUuid(claimId)}, ${sqlUuid(randomUUID())}, ${sqlUuid(warrantyId)}, ${sqlText(nextClaimNumber())}, 'other', 'الجزء الأمامي', 'Approved/open Cube R fixture for narrow Admin recovery verification.', 'approved', now() - interval '2 seconds', null, now() - interval '3 seconds', now() - interval '1 second', ${sqlUuid(adminProfileId)}, 'Cube R Admin recovery verifier approval.', 'تم اعتماد المطالبة لاختبار استرداد الإتمام الإداري.', now() - interval '1 second'); insert into public.warranty_claim_resolutions (id, claim_id, status, authorized_by_profile_id, authorized_at, created_at, updated_at) values (${sqlUuid(resolutionId)}, ${sqlUuid(claimId)}, 'authorized', ${sqlUuid(adminProfileId)}, now(), now(), now());`);
  const assignment = await userRpc("assign_warranty_claim_resolution", { p_action_request_id: randomUUID(), p_resolution_id: resolutionId, p_remedy_kind: remedyKind, p_performing_center_party_id: centerPartyId }, adminToken);
  assert(assignment.response.ok && assignment.body === resolutionId, `Could not assign ${label} Resolution: ${assignment.response.status} ${JSON.stringify(assignment.body)}`);
  return { warrantySource, warrantyId, claimId, resolutionId, warrantyBefore };
}

async function uploadCompletionEvidence(resolutionId, slot, label) {
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Buffer.from(`cube-r-admin-recovery-${label}-${resolutionId}-${slot}`)]);
  const digest = createHash("sha256").update(bytes).digest("hex");
  const path = `resolutions/${resolutionId}/completion/${slot}-${digest}.jpg`;
  const upload = await request(`/storage/v1/object/warranty-claim-evidence/${path}`, { method: "POST", rawBody: bytes, contentType: "image/jpeg" });
  assert(upload.response.ok, `Could not upload ${label} recovery evidence: ${upload.response.status} ${JSON.stringify(upload.body)}`);
  return path;
}
async function publicState(publicCode) { const result = await anonRpc("resolve_public_warranty", { p_public_code: publicCode }); assert(result.response.ok && Array.isArray(result.body) && result.body.length === 1, `Public Warranty resolver failed: ${result.response.status} ${JSON.stringify(result.body)}`); return result.body[0].public_state; }

const recoveryReason = "تم التحقق من تنفيذ العمل فعليًا وتعذر الإغلاق الرقمي من المركز بعد توقف ملف المستخدم التشغيلي.";
const serviceCase = await createAssignedResolution("ADMIN-RECOVERY-SERVICE", "service_reinstall", "0891");
const serviceEvidence = await uploadCompletionEvidence(serviceCase.resolutionId, 1, "service");
await expectRpcError("complete_warranty_claim_resolution_by_admin_recovery", { p_action_request_id: randomUUID(), p_resolution_id: serviceCase.resolutionId, p_completion_note: "Service reinstall was physically completed and verified by recovery evidence.", p_evidence_paths: [serviceEvidence], p_recovery_reason: recoveryReason, p_replacement_roll_serial: null }, adminToken, "PG_CLAIM_RESOLUTION_ADMIN_RECOVERY_NOT_ALLOWED");
assert(querySql(`select concat_ws('|', resolution.status, claim.closed_at is null, (select count(*) from public.warranty_claim_resolution_evidence evidence where evidence.resolution_id = resolution.id)) from public.warranty_claim_resolutions resolution join public.warranty_claims claim on claim.id = resolution.claim_id where resolution.id = ${sqlUuid(serviceCase.resolutionId)};`) === "assigned|t|0", "Blocked recovery must have no terminal/evidence side effects.");
await setCenterProfileStatus("suspended");
await expectRpcError("complete_warranty_claim_resolution", { p_action_request_id: randomUUID(), p_resolution_id: serviceCase.resolutionId, p_completion_note: "Normal Center completion must stop after operational suspension.", p_evidence_paths: [serviceEvidence], p_replacement_roll_serial: null }, centerToken, "PG_CLAIM_RESOLUTION_CENTER_REQUIRED");
const serviceRequestId = randomUUID(); const serviceNote = "Service reinstall was physically completed and verified by recovery evidence.";
const serviceRecovery = await userRpc("complete_warranty_claim_resolution_by_admin_recovery", { p_action_request_id: serviceRequestId, p_resolution_id: serviceCase.resolutionId, p_completion_note: serviceNote, p_evidence_paths: [serviceEvidence], p_recovery_reason: recoveryReason, p_replacement_roll_serial: null }, adminToken);
assert(serviceRecovery.response.ok && serviceRecovery.body === serviceCase.resolutionId, `Service Admin recovery failed: ${serviceRecovery.response.status} ${JSON.stringify(serviceRecovery.body)}`);
const serviceRetry = await userRpc("complete_warranty_claim_resolution_by_admin_recovery", { p_action_request_id: serviceRequestId, p_resolution_id: serviceCase.resolutionId, p_completion_note: serviceNote, p_evidence_paths: [serviceEvidence], p_recovery_reason: recoveryReason, p_replacement_roll_serial: null }, adminToken);
assert(serviceRetry.response.ok && serviceRetry.body === serviceCase.resolutionId, "Exact Admin recovery retry must be idempotent.");
await expectRpcError("complete_warranty_claim_resolution_by_admin_recovery", { p_action_request_id: serviceRequestId, p_resolution_id: serviceCase.resolutionId, p_completion_note: `${serviceNote} conflicting`, p_evidence_paths: [serviceEvidence], p_recovery_reason: recoveryReason, p_replacement_roll_serial: null }, adminToken, "PG_CLAIM_RESOLUTION_ACTION_REQUEST_CONFLICT");
assert(querySql(`select concat_ws('|', resolution.status, resolution.completion_actor_kind, resolution.completed_by_profile_id = ${sqlUuid(adminProfileId)}, claim.status, claim.closed_at = resolution.completed_at, (select count(*) from public.warranty_claim_resolution_evidence evidence where evidence.resolution_id = resolution.id and evidence.uploaded_by_profile_id = ${sqlUuid(adminProfileId)}), (select count(*) from public.warranty_claim_resolution_events event where event.resolution_id = resolution.id and event.event_kind = 'resolution_completed_admin_recovery' and event.actor_kind = 'admin' and event.actor_profile_id = ${sqlUuid(adminProfileId)} and event.reason = ${sqlText(recoveryReason)})) from public.warranty_claim_resolutions resolution join public.warranty_claims claim on claim.id = resolution.claim_id where resolution.id = ${sqlUuid(serviceCase.resolutionId)};`) === "completed|admin_recovery|t|approved|t|1|1", "Service recovery terminal projection/evidence/event drifted.");
assert(querySql(`select concat_ws('|', record_state, activated_at, coverage_expires_at, customer_phone, vehicle_make, vehicle_model, updated_at) from public.warranties where id = ${sqlUuid(serviceCase.warrantyId)};`) === serviceCase.warrantyBefore, "Admin recovery must not mutate the original Warranty.");
await setCenterProfileStatus("active");

const replacementCase = await createAssignedResolution("ADMIN-RECOVERY-REPLACE", "replacement_roll_reinstall", "0892");
const replacementRoll = await createProductionRoll("ADMIN-RECOVERY-MATERIAL");
const reservation = await userRpc("reserve_claim_resolution_roll", { p_action_request_id: randomUUID(), p_resolution_id: replacementCase.resolutionId, p_roll_id: replacementRoll.rollId }, adminToken);
assert(reservation.response.ok && /^[0-9a-f-]{36}$/i.test(String(reservation.body)), `Could not reserve recovery replacement Roll: ${reservation.response.status} ${JSON.stringify(reservation.body)}`);
const replacementEvidence = await uploadCompletionEvidence(replacementCase.resolutionId, 1, "replacement");
await setCenterProfileStatus("suspended");
await expectRpcError("complete_warranty_claim_resolution_by_admin_recovery", { p_action_request_id: randomUUID(), p_resolution_id: replacementCase.resolutionId, p_completion_note: "Replacement recovery must not bypass the physical Opening boundary.", p_evidence_paths: [replacementEvidence], p_recovery_reason: recoveryReason, p_replacement_roll_serial: replacementRoll.serial }, adminToken, "PG_CLAIM_CONSUMPTION_OPENING_INVALID");
assert(querySql(`select concat_ws('|', resolution.status, claim.closed_at is null, allocation.status, (select count(*) from public.warranty_claim_resolution_evidence evidence where evidence.resolution_id = resolution.id)) from public.warranty_claim_resolutions resolution join public.warranty_claims claim on claim.id = resolution.claim_id join public.warranty_claim_resolution_roll_allocations allocation on allocation.resolution_id = resolution.id where resolution.id = ${sqlUuid(replacementCase.resolutionId)};`) === "assigned|t|reserved|0", "Pre-Opening recovery rejection must roll back all completion/material/evidence effects.");
await setCenterProfileStatus("active");
const replacementOpening = await userRpc("open_roll", { p_request_id: randomUUID(), p_roll_serial: replacementRoll.serial }, centerToken);
assert(replacementOpening.response.ok && replacementOpening.body === replacementRoll.rollId, `Could not open recovery replacement Roll: ${replacementOpening.response.status} ${JSON.stringify(replacementOpening.body)}`);
await setCenterProfileStatus("suspended");
await expectRpcError("complete_warranty_claim_resolution", { p_action_request_id: randomUUID(), p_resolution_id: replacementCase.resolutionId, p_completion_note: "Center token cannot complete after operational capability is lost.", p_evidence_paths: [replacementEvidence], p_replacement_roll_serial: replacementRoll.serial }, centerToken, "PG_CLAIM_RESOLUTION_CENTER_REQUIRED");
await expectRpcError("complete_warranty_claim_resolution_by_admin_recovery", { p_action_request_id: randomUUID(), p_resolution_id: replacementCase.resolutionId, p_completion_note: "Replacement reinstall was physically completed and documented for recovery.", p_evidence_paths: [replacementEvidence], p_recovery_reason: recoveryReason, p_replacement_roll_serial: `${replacementRoll.serial}-WRONG` }, adminToken, "PG_CLAIM_RESOLUTION_REPLACEMENT_SCAN_MISMATCH");
const replacementRequestId = randomUUID(); const replacementNote = "Replacement reinstall was physically completed and documented for recovery.";
const replacementRecovery = await userRpc("complete_warranty_claim_resolution_by_admin_recovery", { p_action_request_id: replacementRequestId, p_resolution_id: replacementCase.resolutionId, p_completion_note: replacementNote, p_evidence_paths: [replacementEvidence], p_recovery_reason: recoveryReason, p_replacement_roll_serial: replacementRoll.serial }, adminToken);
assert(replacementRecovery.response.ok && replacementRecovery.body === replacementCase.resolutionId, `Replacement Admin recovery failed: ${replacementRecovery.response.status} ${JSON.stringify(replacementRecovery.body)}`);
assert(querySql(`select concat_ws('|', resolution.status, resolution.completion_actor_kind, resolution.completed_by_profile_id = ${sqlUuid(adminProfileId)}, claim.status, claim.closed_at = resolution.completed_at, allocation.status, allocation.consumed_by_profile_id = ${sqlUuid(adminProfileId)}, (select count(*) from public.warranty_claim_resolution_evidence evidence where evidence.resolution_id = resolution.id and evidence.uploaded_by_profile_id = ${sqlUuid(adminProfileId)}), (select count(*) from public.warranty_claim_resolution_events event where event.resolution_id = resolution.id and event.event_kind = 'replacement_roll_consumed' and event.actor_kind = 'admin' and event.actor_profile_id = ${sqlUuid(adminProfileId)}), (select count(*) from public.warranty_claim_resolution_events event where event.resolution_id = resolution.id and event.event_kind = 'resolution_completed_admin_recovery' and event.actor_kind = 'admin' and event.reason = ${sqlText(recoveryReason)})) from public.warranty_claim_resolutions resolution join public.warranty_claims claim on claim.id = resolution.claim_id join public.warranty_claim_resolution_roll_allocations allocation on allocation.resolution_id = resolution.id and allocation.roll_id = ${sqlUuid(replacementRoll.rollId)} where resolution.id = ${sqlUuid(replacementCase.resolutionId)};`) === "completed|admin_recovery|t|approved|t|consumed|t|1|1|1", "Replacement Admin recovery must atomically consume exact material and close the approved Claim/Resolution.");
assert(await publicState(replacementRoll.publicCode) === "unavailable_for_warranty", "Admin-recovery consumed replacement Roll must remain public-terminal.");
assert(querySql(`select count(*) from public.warranties where roll_id = ${sqlUuid(replacementRoll.rollId)} and record_state = 'issued';`) === "0", "Admin recovery must not issue a new Warranty for consumed replacement material.");
assert(querySql(`select concat_ws('|', record_state, activated_at, coverage_expires_at, customer_phone, vehicle_make, vehicle_model, updated_at) from public.warranties where id = ${sqlUuid(replacementCase.warrantyId)};`) === replacementCase.warrantyBefore, "Replacement Admin recovery must preserve the original Warranty identity/term.");
await setCenterProfileStatus("active");

console.log("Cube R narrow Admin recovery completion PASS: actionable-Center block, service recovery, pre-Opening material block, lost-Center normal-completion denial, exact scan, atomic replacement consumption, approved Claim closure and Warranty preservation.");
