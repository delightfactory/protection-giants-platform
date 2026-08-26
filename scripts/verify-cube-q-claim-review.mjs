import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";

const apiUrl = process.env.API_URL;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
const anonKey = process.env.ANON_KEY;

if (!apiUrl || !serviceRoleKey || !anonKey) {
  throw new Error("Local Supabase API_URL, SERVICE_ROLE_KEY and ANON_KEY are required.");
}

const password = "Cube-J-Roll-Opening-2026!";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

async function request(path, {
  method = "GET",
  token = serviceRoleKey,
  key = serviceRoleKey,
  body,
  rawBody,
  contentType,
} = {}) {
  const headers = { apikey: key, Authorization: `Bearer ${token}` };
  let payload;
  if (rawBody !== undefined) {
    headers["Content-Type"] = contentType ?? "application/octet-stream";
    payload = rawBody;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const response = await fetch(`${apiUrl}${path}`, { method, headers, body: payload });
  return { response, body: await readJson(response) };
}

async function rpc(name, body, token = serviceRoleKey, key = serviceRoleKey) {
  return request(`/rest/v1/rpc/${name}`, { method: "POST", body, token, key });
}

async function userRpc(name, body, token) {
  return rpc(name, body, token, anonKey);
}

async function signIn(email) {
  const result = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    token: anonKey,
    key: anonKey,
    body: { email, password },
  });
  assert(result.response.ok && result.body?.access_token,
    `Could not sign in ${email}: ${result.response.status} ${JSON.stringify(result.body)}`);
  return result.body.access_token;
}

function one(result, label) {
  assert(result.response.ok && Array.isArray(result.body) && result.body.length === 1,
    `${label}: ${result.response.status} ${JSON.stringify(result.body)}`);
  return result.body[0];
}

async function expectRpcError(name, body, token, expectedMessage) {
  const result = await userRpc(name, body, token);
  assert(!result.response.ok, `${name} unexpectedly succeeded; expected ${expectedMessage}.`);
  assert(result.body?.message === expectedMessage,
    `${name} expected ${expectedMessage}, received ${result.response.status} ${JSON.stringify(result.body)}`);
  return result;
}

async function expectDenied(name, body, token, label) {
  const result = await userRpc(name, body, token);
  assert(!result.response.ok, `${label} unexpectedly succeeded.`);
  return result;
}

function dbContainerName() {
  const names = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" })
    .split("\n").map((value) => value.trim()).filter(Boolean);
  const name = names.find((value) => value.startsWith("supabase_db_"));
  assert(name, "Supabase database container was not found for Cube Q verification.");
  return name;
}

function querySql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", dbContainerName(), "psql", "-At", "-F", "|", "-v", "ON_ERROR_STOP=1",
      "-U", "postgres", "-d", "postgres", "-c", sql],
    { encoding: "utf8" },
  ).trim();
}

function sqlUuid(value) {
  assert(/^[0-9a-f-]{36}$/i.test(value), `Unsafe UUID: ${value}`);
  return `'${value}'::uuid`;
}

async function createCustomerClaimFromUnusedActiveWarranty() {
  const fixture = querySql(`
    select concat_ws('|', warranty.id, warranty.customer_phone, identity.public_code)
    from public.warranties warranty
    join private.roll_public_identities identity on identity.roll_id = warranty.roll_id
    where warranty.record_state = 'issued'
      and warranty.coverage_expires_at > now()
      and not exists (
        select 1 from public.warranty_claims claim where claim.warranty_id = warranty.id
      )
    order by warranty.activated_at desc, warranty.id desc
    limit 1;
  `).split("|");

  assert(fixture.length === 3 && fixture[0] && fixture[1] && fixture[2],
    `Cube Q requires a second active Warranty without a Claim: ${fixture}`);

  const [warrantyId, phone, publicCode] = fixture;
  const verified = one(await rpc("verify_customer_warranty_claim_phone", {
    p_public_code: publicCode,
    p_phone: phone,
  }), "Verify second Warranty phone for Cube Q");

  const draftId = randomUUID();
  const draftOpened = await rpc("open_customer_warranty_claim_draft", {
    p_draft_id: draftId,
    p_warranty_id: warrantyId,
    p_verified_phone_normalized: verified.normalized_phone,
    p_expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  });
  assert(draftOpened.response.ok && draftOpened.body === draftId,
    `Could not open Cube Q second Claim draft: ${draftOpened.response.status} ${JSON.stringify(draftOpened.body)}`);

  const imageBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Buffer.from(`cube-q-customer-${draftId}`)]);
  const digest = createHash("sha256").update(imageBytes).digest("hex");
  const storagePath = `${draftId}/${digest}.jpg`;

  const upload = await request(`/storage/v1/object/warranty-claim-evidence/${storagePath}`, {
    method: "POST",
    rawBody: imageBytes,
    contentType: "image/jpeg",
  });
  assert(upload.response.ok,
    `Could not upload Cube Q second Claim evidence: ${upload.response.status} ${JSON.stringify(upload.body)}`);

  const registered = await rpc("register_customer_warranty_claim_draft_evidence", {
    p_draft_id: draftId,
    p_warranty_id: warrantyId,
    p_verified_phone_normalized: verified.normalized_phone,
    p_storage_path: storagePath,
    p_mime_type: "image/jpeg",
    p_size_bytes: imageBytes.length,
  });
  assert(registered.response.ok && registered.body === true,
    `Could not register Cube Q second Claim evidence: ${registered.response.status} ${JSON.stringify(registered.body)}`);

  const created = one(await rpc("create_customer_warranty_claim", {
    p_request_id: randomUUID(),
    p_warranty_id: warrantyId,
    p_public_code: publicCode,
    p_verified_phone_normalized: verified.normalized_phone,
    p_draft_id: draftId,
    p_category: "other",
    p_affected_area: "الباب الأمامي",
    p_description: "مطالبة ثانية مخصصة لاختبار قرار الرفض والتصحيح المتزامن في Cube Q.",
    p_evidence: [{ storage_path: storagePath, mime_type: "image/jpeg", size_bytes: imageBytes.length }],
  }), "Create second Cube Q Claim");

  return { claimId: created.claim_id, warrantyId, claimNumber: created.claim_number };
}

for (const table of [
  "warranty_claim_inspections",
  "warranty_claim_inspection_evidence",
  "warranty_claim_resolutions",
]) {
  assert(querySql(`select relrowsecurity from pg_class where oid = 'public.${table}'::regclass`) === "t",
    `${table} must have RLS enabled.`);
  for (const role of ["anon", "authenticated", "service_role"]) {
    for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
      assert(querySql(`select has_table_privilege('${role}', 'public.${table}', '${privilege}')`) === "f",
        `${role} unexpectedly has ${privilege} on ${table}.`);
    }
  }
}

const qFunctions = [
  "public.start_warranty_claim_review(uuid,uuid)",
  "public.request_warranty_claim_inspection(uuid,uuid,uuid)",
  "public.reassign_warranty_claim_inspection(uuid,uuid,uuid,text)",
  "public.submit_warranty_claim_inspection(uuid,uuid,text,text,text[])",
  "public.approve_warranty_claim(uuid,uuid,text,text)",
  "public.reject_warranty_claim(uuid,uuid,text,text)",
  "public.cancel_warranty_claim(uuid,uuid,text,text)",
  "public.reopen_warranty_claim_decision_for_correction(uuid,uuid,text)",
  "public.list_admin_warranty_claims(integer,integer,text,text)",
  "public.get_admin_warranty_claim_detail(uuid)",
  "public.list_admin_warranty_claim_timeline(uuid)",
  "public.list_admin_warranty_claim_history(uuid,uuid,integer)",
  "public.list_actionable_claim_inspection_centers()",
  "public.list_center_pending_claim_inspections(integer,integer)",
  "public.get_center_claim_inspection_detail(uuid)",
  "public.list_warranty_claim_evidence_for_role(uuid,uuid)",
];

for (const signature of qFunctions) {
  assert(querySql(`select has_function_privilege('authenticated', '${signature}', 'EXECUTE')`) === "t",
    `authenticated must execute ${signature}.`);
  for (const role of ["anon", "service_role"]) {
    assert(querySql(`select has_function_privilege('${role}', '${signature}', 'EXECUTE')`) === "f",
      `${role} unexpectedly executes ${signature}.`);
  }
}

const resolutionColumns = querySql(`
  select string_agg(column_name, ',' order by ordinal_position)
  from information_schema.columns
  where table_schema = 'public' and table_name = 'warranty_claim_resolutions';
`).split(",");
const qResolutionColumns = [
  "id",
  "claim_id",
  "status",
  "authorized_by_profile_id",
  "authorized_at",
  "created_at",
  "updated_at",
];
for (const column of qResolutionColumns) {
  assert(resolutionColumns.includes(column),
    `Cube Q Resolution handoff lost required column ${column}: ${resolutionColumns.join(",")}`);
}
const cubeRResolutionFoundationPresent = querySql(`
  select (to_regclass('public.warranty_claim_resolution_events') is not null)::text;
`) === "true";
if (!cubeRResolutionFoundationPresent) {
  assert(
    resolutionColumns.length === qResolutionColumns.length,
    `Cube Q Resolution handoff leaked pre-R fields: ${resolutionColumns.join(",")}`,
  );
}

const adminToken = await signIn("cube-j-admin@example.test");
const centerAToken = await signIn("cube-j-center-a@example.test");
const centerBToken = await signIn("cube-j-center-b@example.test");

const centerAPartyId = querySql(`
  select party.id
  from public.operational_parties party
  join public.installation_centers center on center.id = party.installation_center_id
  where party.party_type = 'center' and center.code = 'CUBE-J-CENTER-A';
`);
const centerBPartyId = querySql(`
  select party.id
  from public.operational_parties party
  join public.installation_centers center on center.id = party.installation_center_id
  where party.party_type = 'center' and center.code = 'CUBE-J-CENTER-B';
`);
assert(centerAPartyId && centerBPartyId && centerAPartyId !== centerBPartyId,
  "Cube Q requires two distinct actionable Center parties.");

const firstFixture = querySql(`
  select concat_ws('|', claim.id, claim.warranty_id, claim.claim_number)
  from public.warranty_claims claim
  where claim.status = 'submitted' and claim.closed_at is null
  order by claim.submitted_at desc, claim.id desc
  limit 1;
`).split("|");
assert(firstFixture.length === 3 && firstFixture[0], `Cube P submitted Claim fixture missing: ${firstFixture}`);
const [claimAId, claimAWarrantyId, claimANumber] = firstFixture;

const adminQueueBefore = await userRpc("list_admin_warranty_claims", {
  p_limit: 50, p_offset: 0, p_scope: "open", p_status: "submitted",
}, adminToken);
assert(adminQueueBefore.response.ok && adminQueueBefore.body.some((claim) => claim.claim_id === claimAId),
  `Admin queue must expose submitted Claim ${claimANumber}.`);

await expectDenied("list_admin_warranty_claims", {
  p_limit: 10, p_offset: 0, p_scope: "open", p_status: null,
}, centerAToken, "Center Admin Claim queue access");

const detailBefore = one(await userRpc("get_admin_warranty_claim_detail", {
  p_claim_id: claimAId,
}, adminToken), "Admin Claim detail before review");
assert(detailBefore.claim_status === "submitted" && detailBefore.warranty_id === claimAWarrantyId,
  `Admin detail must bind exact Claim/Warranty: ${JSON.stringify(detailBefore)}`);

await expectDenied("start_warranty_claim_review", {
  p_action_request_id: randomUUID(),
  p_claim_id: claimAId,
}, centerAToken, "Center start-review authority");

const startRequestId = randomUUID();
const reviewStarted = await userRpc("start_warranty_claim_review", {
  p_action_request_id: startRequestId,
  p_claim_id: claimAId,
}, adminToken);
assert(reviewStarted.response.ok && typeof reviewStarted.body === "string",
  `Could not start Cube Q review: ${reviewStarted.response.status} ${JSON.stringify(reviewStarted.body)}`);
const reviewRetry = await userRpc("start_warranty_claim_review", {
  p_action_request_id: startRequestId,
  p_claim_id: claimAId,
}, adminToken);
assert(reviewRetry.response.ok && reviewRetry.body === reviewStarted.body,
  "Start-review retry must return the same event id.");

const inspectionRequestId = randomUUID();
const requested = await userRpc("request_warranty_claim_inspection", {
  p_action_request_id: inspectionRequestId,
  p_claim_id: claimAId,
  p_center_party_id: centerAPartyId,
}, adminToken);
assert(requested.response.ok && typeof requested.body === "string",
  `Could not request Cube Q inspection: ${requested.response.status} ${JSON.stringify(requested.body)}`);

const inspectionId = querySql(`
  select id from public.warranty_claim_inspections where claim_id = ${sqlUuid(claimAId)};
`);
assert(inspectionId, "Inspection request must create exactly one inspection row.");
assert(querySql(`select count(*) from public.warranty_claim_inspections where claim_id = ${sqlUuid(claimAId)}`) === "1",
  "Cube Q must persist at most one formal inspection per Claim.");

const centerAQueue = await userRpc("list_center_pending_claim_inspections", {
  p_limit: 30, p_offset: 0,
}, centerAToken);
assert(centerAQueue.response.ok && centerAQueue.body.some((row) => row.inspection_id === inspectionId),
  "Assigned Center A must see the pending inspection.");

await expectRpcError("get_center_claim_inspection_detail", {
  p_inspection_id: inspectionId,
}, centerBToken, "PG_CLAIM_INSPECTION_NOT_FOUND");

const pendingCancelId = randomUUID();
const pendingCancelled = await userRpc("cancel_warranty_claim", {
  p_action_request_id: pendingCancelId,
  p_claim_id: claimAId,
  p_reason: "Customer cancellation recorded while formal inspection was pending.",
  p_customer_message: "تم إلغاء المطالبة قبل استكمال الفحص بناءً على طلب العميل.",
}, adminToken);
assert(pendingCancelled.response.ok,
  `Could not cancel pending-inspection Claim: ${pendingCancelled.response.status} ${JSON.stringify(pendingCancelled.body)}`);

assert(querySql(`
  select concat_ws('|', status, closed_at is not null)
  from public.warranty_claims where id = ${sqlUuid(claimAId)};
`) === "cancelled|t", "Pending-inspection cancellation must close the Claim.");
assert(querySql(`
  select status from public.warranty_claim_inspections where id = ${sqlUuid(inspectionId)};
`) === "requested", "Cancellation must preserve the requested inspection as immutable history.");

const centerAAfterCancel = await userRpc("list_center_pending_claim_inspections", {
  p_limit: 30, p_offset: 0,
}, centerAToken);
assert(centerAAfterCancel.response.ok && !centerAAfterCancel.body.some((row) => row.inspection_id === inspectionId),
  "Cancelled parent Claim must remove the Center task from the actionable queue.");

const reopenPendingId = randomUUID();
const reopenedPending = await userRpc("reopen_warranty_claim_decision_for_correction", {
  p_action_request_id: reopenPendingId,
  p_claim_id: claimAId,
  p_reason: "The ordinary cancellation was recorded in error while inspection was pending.",
}, adminToken);
assert(reopenedPending.response.ok,
  `Could not reopen pending-inspection cancellation: ${reopenedPending.response.status} ${JSON.stringify(reopenedPending.body)}`);

assert(querySql(`
  select concat_ws('|', status, closed_at is null, decided_at is null)
  from public.warranty_claims where id = ${sqlUuid(claimAId)};
`) === "awaiting_inspection|t|t",
  "PD-078 must resume the same requested inspection instead of creating an under_review dead end.");
assert(querySql(`select count(*) from public.warranty_claim_inspections where claim_id = ${sqlUuid(claimAId)}`) === "1",
  "PD-078 pending-inspection recovery must reuse the same inspection row.");
assert(querySql(`
  select coalesce(event_data ->> 'resumed_status', '')
  from public.warranty_claim_events
  where action_request_id = ${sqlUuid(reopenPendingId)};
`) === "awaiting_inspection",
  "PD-078 reopen audit must record the resumed pending-inspection status.");

const centerAAfterReopen = await userRpc("list_center_pending_claim_inspections", {
  p_limit: 30, p_offset: 0,
}, centerAToken);
assert(centerAAfterReopen.response.ok && centerAAfterReopen.body.some((row) => row.inspection_id === inspectionId),
  "Reopened pending inspection must become actionable again for the assigned Center.");

const reassignId = randomUUID();
const reassigned = await userRpc("reassign_warranty_claim_inspection", {
  p_action_request_id: reassignId,
  p_claim_id: claimAId,
  p_center_party_id: centerBPartyId,
  p_reason: "Move the resumed inspection to the second actionable Center.",
}, adminToken);
assert(reassigned.response.ok,
  `Could not reassign Cube Q inspection: ${reassigned.response.status} ${JSON.stringify(reassigned.body)}`);
assert(querySql(`
  select assigned_center_party_id from public.warranty_claim_inspections where id = ${sqlUuid(inspectionId)};
`) === centerBPartyId, "Inspection reassignment must preserve the row and change only assigned Center.");

const oldCenterQueue = await userRpc("list_center_pending_claim_inspections", {
  p_limit: 30, p_offset: 0,
}, centerAToken);
const newCenterQueue = await userRpc("list_center_pending_claim_inspections", {
  p_limit: 30, p_offset: 0,
}, centerBToken);
assert(oldCenterQueue.response.ok && !oldCenterQueue.body.some((row) => row.inspection_id === inspectionId),
  "Old Center must lose actionable inspection access after reassignment.");
assert(newCenterQueue.response.ok && newCenterQueue.body.some((row) => row.inspection_id === inspectionId),
  "New Center must gain the reassigned inspection task.");

const inspectionBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Buffer.from(`cube-q-inspection-${inspectionId}`)]);
const inspectionDigest = createHash("sha256").update(inspectionBytes).digest("hex");
const inspectionPath = `inspections/${inspectionId}/1-${inspectionDigest}.jpg`;
const inspectionUpload = await request(`/storage/v1/object/warranty-claim-evidence/${inspectionPath}`, {
  method: "POST",
  rawBody: inspectionBytes,
  contentType: "image/jpeg",
});
assert(inspectionUpload.response.ok,
  `Could not upload inspection evidence: ${inspectionUpload.response.status} ${JSON.stringify(inspectionUpload.body)}`);

await expectRpcError("submit_warranty_claim_inspection", {
  p_action_request_id: randomUUID(),
  p_inspection_id: inspectionId,
  p_technical_observation: "Old Center must not be able to submit after reassignment.",
  p_suspected_cause: "reassigned",
  p_evidence_paths: [inspectionPath],
}, centerAToken, "PG_CLAIM_INSPECTION_NOT_ASSIGNED_CENTER");

const submitInspectionId = randomUUID();
const submitted = await userRpc("submit_warranty_claim_inspection", {
  p_action_request_id: submitInspectionId,
  p_inspection_id: inspectionId,
  p_technical_observation: "The film shows a localized adhesion defect requiring Company adjudication.",
  p_suspected_cause: "Possible localized installation contamination",
  p_evidence_paths: [inspectionPath],
}, centerBToken);
assert(submitted.response.ok && submitted.body === inspectionId,
  `Assigned Center could not submit inspection: ${submitted.response.status} ${JSON.stringify(submitted.body)}`);

const submittedRetry = await userRpc("submit_warranty_claim_inspection", {
  p_action_request_id: submitInspectionId,
  p_inspection_id: inspectionId,
  p_technical_observation: "The film shows a localized adhesion defect requiring Company adjudication.",
  p_suspected_cause: "Possible localized installation contamination",
  p_evidence_paths: [inspectionPath],
}, centerBToken);
assert(submittedRetry.response.ok && submittedRetry.body === inspectionId,
  "Inspection submission retry must return the same inspection id.");

assert(querySql(`
  select concat_ws('|',
    claim.status,
    inspection.status,
    inspection.submitted_by_profile_id is not null,
    (select count(*) from public.warranty_claim_inspection_evidence evidence where evidence.inspection_id = inspection.id)
  )
  from public.warranty_claims claim
  join public.warranty_claim_inspections inspection on inspection.claim_id = claim.id
  where claim.id = ${sqlUuid(claimAId)};
`) === "under_review|submitted|t|1",
  "Inspection submission must atomically return Claim to review and persist one immutable evidence row.");

const adminEvidence = await userRpc("list_warranty_claim_evidence_for_role", {
  p_claim_id: claimAId,
  p_inspection_id: null,
}, adminToken);
assert(adminEvidence.response.ok
  && adminEvidence.body.some((row) => row.evidence_scope === "customer_submission")
  && adminEvidence.body.some((row) => row.evidence_scope === "inspection"),
  "Admin evidence projection must include both customer and submitted inspection evidence.");

await expectRpcError("get_center_claim_inspection_detail", {
  p_inspection_id: inspectionId,
}, centerBToken, "PG_CLAIM_INSPECTION_NOT_FOUND");

const approvalId = randomUUID();
const approved = await userRpc("approve_warranty_claim", {
  p_action_request_id: approvalId,
  p_claim_id: claimAId,
  p_reason: "Inspection confirms a covered film defect requiring authorized resolution.",
  p_customer_message: "تم قبول المطالبة وجارٍ ترتيب المعالجة المناسبة.",
}, adminToken);
assert(approved.response.ok && typeof approved.body === "string",
  `Could not approve Cube Q Claim: ${approved.response.status} ${JSON.stringify(approved.body)}`);
const resolutionId = approved.body;

assert(querySql(`
  select concat_ws('|', claim.status, claim.closed_at is null, resolution.status)
  from public.warranty_claims claim
  join public.warranty_claim_resolutions resolution on resolution.claim_id = claim.id
  where claim.id = ${sqlUuid(claimAId)};
`) === "approved|t|authorized",
  "Approval must leave Claim open and create exactly one authorized Resolution.");
assert(querySql(`select count(*) from public.warranty_claim_resolutions where claim_id = ${sqlUuid(claimAId)}`) === "1",
  "Approval must create exactly one Resolution header.");

const approvalRetry = await userRpc("approve_warranty_claim", {
  p_action_request_id: approvalId,
  p_claim_id: claimAId,
  p_reason: "Inspection confirms a covered film defect requiring authorized resolution.",
  p_customer_message: "تم قبول المطالبة وجارٍ ترتيب المعالجة المناسبة.",
}, adminToken);
assert(approvalRetry.response.ok && approvalRetry.body === resolutionId,
  "Approval retry must return the same Resolution.");

await expectRpcError("approve_warranty_claim", {
  p_action_request_id: approvalId,
  p_claim_id: claimAId,
  p_reason: "Conflicting reason under the same action request must be rejected.",
  p_customer_message: "تم قبول المطالبة وجارٍ ترتيب المعالجة المناسبة.",
}, adminToken, "PG_CLAIM_ACTION_REQUEST_CONFLICT");

const approvalCorrectionId = randomUUID();
const approvalCancelled = await userRpc("cancel_warranty_claim", {
  p_action_request_id: approvalCorrectionId,
  p_claim_id: claimAId,
  p_reason: "Approval was entered in error before any fulfillment assignment.",
  p_customer_message: "تم إلغاء قرار القبول السابق قبل بدء تنفيذ المعالجة.",
}, adminToken);
assert(approvalCancelled.response.ok,
  `Could not apply bounded approval correction: ${approvalCancelled.response.status} ${JSON.stringify(approvalCancelled.body)}`);

assert(querySql(`
  select concat_ws('|', claim.status, claim.closed_at is not null, resolution.status, resolution.id)
  from public.warranty_claims claim
  join public.warranty_claim_resolutions resolution on resolution.claim_id = claim.id
  where claim.id = ${sqlUuid(claimAId)};
`) === `cancelled|t|authorized|${resolutionId}`,
  "Approval correction must close Claim while preserving the original authorized Resolution as history.");
assert(querySql(`
  select count(*) from public.warranty_claim_events
  where claim_id = ${sqlUuid(claimAId)}
    and event_kind in ('approved', 'approval_cancelled_before_execution');
`) === "2", "Approval correction must preserve both immutable decision events.");

await expectRpcError("reopen_warranty_claim_decision_for_correction", {
  p_action_request_id: randomUUID(),
  p_claim_id: claimAId,
  p_reason: "Resolution-bearing approval correction must not be reopenable.",
}, adminToken, "PG_CLAIM_REOPEN_RESOLUTION_EXISTS");

const claimB = await createCustomerClaimFromUnusedActiveWarranty();

await userRpc("start_warranty_claim_review", {
  p_action_request_id: randomUUID(),
  p_claim_id: claimB.claimId,
}, adminToken);

const rejectId = randomUUID();
const rejected = await userRpc("reject_warranty_claim", {
  p_action_request_id: rejectId,
  p_claim_id: claimB.claimId,
  p_reason: "Submitted evidence does not establish a covered film defect.",
  p_customer_message: "بعد المراجعة لم يتم قبول المطالبة وفق نطاق الضمان.",
}, adminToken);
assert(rejected.response.ok,
  `Could not reject second Cube Q Claim: ${rejected.response.status} ${JSON.stringify(rejected.body)}`);
assert(querySql(`
  select concat_ws('|', status, closed_at is not null)
  from public.warranty_claims where id = ${sqlUuid(claimB.claimId)};
`) === "rejected|t", "Rejection must close the Claim.");
assert(querySql(`select count(*) from public.warranty_claim_resolutions where claim_id = ${sqlUuid(claimB.claimId)}`) === "0",
  "Rejected Claim must not create a Resolution.");

const reopenRejectedId = randomUUID();
const reopenedRejected = await userRpc("reopen_warranty_claim_decision_for_correction", {
  p_action_request_id: reopenRejectedId,
  p_claim_id: claimB.claimId,
  p_reason: "The rejection was recorded against incomplete internal review evidence.",
}, adminToken);
assert(reopenedRejected.response.ok,
  `Could not reopen rejected Claim: ${reopenedRejected.response.status} ${JSON.stringify(reopenedRejected.body)}`);
assert(querySql(`
  select concat_ws('|', status, closed_at is null, decided_at is null, decision_reason is null)
  from public.warranty_claims where id = ${sqlUuid(claimB.claimId)};
`) === "under_review|t|t|t",
  "Rejected Claim correction must reopen to under_review and clear current decision projection.");

const reopenRetry = await userRpc("reopen_warranty_claim_decision_for_correction", {
  p_action_request_id: reopenRejectedId,
  p_claim_id: claimB.claimId,
  p_reason: "The rejection was recorded against incomplete internal review evidence.",
}, adminToken);
assert(reopenRetry.response.ok && reopenRetry.body === reopenedRejected.body,
  "PD-078 retry must return the same correction event.");

const raceRejectId = randomUUID();
const raceCancelId = randomUUID();
const [raceReject, raceCancel] = await Promise.all([
  userRpc("reject_warranty_claim", {
    p_action_request_id: raceRejectId,
    p_claim_id: claimB.claimId,
    p_reason: "Concurrent rejection contender for deterministic final-decision serialization.",
    p_customer_message: "تم إغلاق المطالبة بعد المراجعة النهائية.",
  }, adminToken),
  userRpc("cancel_warranty_claim", {
    p_action_request_id: raceCancelId,
    p_claim_id: claimB.claimId,
    p_reason: "Concurrent cancellation contender for deterministic final-decision serialization.",
    p_customer_message: "تم إلغاء المطالبة بعد المراجعة النهائية.",
  }, adminToken),
]);

assert(Number(raceReject.response.ok) + Number(raceCancel.response.ok) === 1,
  `Exactly one conflicting final decision must commit: reject=${raceReject.response.status}, cancel=${raceCancel.response.status}.`);

const claimBRaceState = querySql(`
  select concat_ws('|', status, closed_at is not null)
  from public.warranty_claims where id = ${sqlUuid(claimB.claimId)};
`).split("|");
assert(["rejected", "cancelled"].includes(claimBRaceState[0]) && claimBRaceState[1] === "t",
  `Conflicting final decision race ended in invalid state: ${claimBRaceState}`);
assert(querySql(`
  select count(*)
  from public.warranty_claim_events
  where action_request_id in (${sqlUuid(raceRejectId)}, ${sqlUuid(raceCancelId)});
`) === "1", "Conflicting final decision race must append exactly one winning event.");

const timeline = await userRpc("list_admin_warranty_claim_timeline", {
  p_claim_id: claimAId,
}, adminToken);
assert(timeline.response.ok
  && timeline.body.some((event) => event.event_kind === "inspection_requested")
  && timeline.body.some((event) => event.event_kind === "decision_reopened_for_correction")
  && timeline.body.some((event) => event.event_kind === "inspection_reassigned")
  && timeline.body.some((event) => event.event_kind === "inspection_submitted")
  && timeline.body.some((event) => event.event_kind === "approved")
  && timeline.body.some((event) => event.event_kind === "approval_cancelled_before_execution"),
  "Admin timeline must preserve the complete immutable Claim Q history.");

const closedHistory = await userRpc("list_admin_warranty_claim_history", {
  p_warranty_id: claimB.warrantyId,
  p_exclude_claim_id: null,
  p_limit: 10,
}, adminToken);
assert(closedHistory.response.ok && closedHistory.body.some((claim) => claim.claim_id === claimB.claimId),
  "Admin Warranty Claim history must expose the closed corrected Claim.");

console.log("Cube Q Claim review, inspection, decision and PD-078 recovery contracts verified.");
