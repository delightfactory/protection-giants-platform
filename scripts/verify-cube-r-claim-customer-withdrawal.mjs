import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const apiUrl = process.env.API_URL;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
const anonKey = process.env.ANON_KEY;
if (!apiUrl || !serviceRoleKey || !anonKey) {
  throw new Error("Local Supabase API_URL, SERVICE_ROLE_KEY and ANON_KEY are required.");
}
const password = "Cube-J-Roll-Opening-2026!";
let claimCounter = Number(String(Date.now()).slice(-8));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}
async function request(path, { method = "GET", token = serviceRoleKey, key = serviceRoleKey, body } = {}) {
  const headers = { apikey: key, Authorization: `Bearer ${token}` };
  let payload;
  if (body !== undefined) {
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
    method: "POST", token: anonKey, key: anonKey, body: { email, password },
  });
  assert(result.response.ok && result.body?.access_token,
    `Could not sign in ${email}: ${result.response.status} ${JSON.stringify(result.body)}`);
  return result.body.access_token;
}
async function expectRpcError(name, body, token, expectedMessage) {
  const result = await userRpc(name, body, token);
  assert(!result.response.ok, `${name} unexpectedly succeeded; expected ${expectedMessage}.`);
  assert(result.body?.message === expectedMessage,
    `${name} expected ${expectedMessage}, received ${result.response.status} ${JSON.stringify(result.body)}`);
}
function dbContainerName() {
  const names = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" })
    .split("\n").map((value) => value.trim()).filter(Boolean);
  const name = names.find((value) => value.startsWith("supabase_db_"));
  assert(name, "Supabase database container was not found for Cube R PD-079 verification.");
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
function runSql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", dbContainerName(), "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
    { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  );
}
function sqlUuid(value) {
  assert(/^[0-9a-f-]{36}$/i.test(value), `Unsafe UUID: ${value}`);
  return `'${value}'::uuid`;
}
function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}
function nextClaimNumber() {
  claimCounter = (claimCounter + 1) % 100000000;
  return `PG-C-${String(claimCounter).padStart(8, "0")}`;
}

const signature = "public.cancel_assigned_claim_resolution_for_customer_withdrawal(uuid,uuid,text,text)";
assert(querySql(`select has_function_privilege('authenticated', '${signature}', 'EXECUTE');`) === "t",
  "Authenticated users must reach PD-079 RPC; Admin enforcement is inside the function.");
for (const role of ["anon", "service_role"]) {
  assert(querySql(`select has_function_privilege('${role}', '${signature}', 'EXECUTE');`) === "f",
    `${role} unexpectedly executes ${signature}.`);
}
assert(querySql(`select count(*) from pg_trigger where tgrelid = 'public.warranty_claim_resolution_events'::regclass and not tgisinternal and tgname = 'warranty_claim_resolution_events_materialize_notification';`) === "1",
  "PD-079 must reuse the single Resolution event -> Cube L projector trigger.");

const adminToken = await signIn("cube-j-admin@example.test");
const centerToken = await signIn("cube-j-center-a@example.test");
const adminProfileId = querySql(`
  select profile.id from public.profiles profile
  join auth.users auth_user on auth_user.id = profile.id
  where auth_user.email = 'cube-j-admin@example.test'
    and profile.role = 'admin' and profile.status = 'active' limit 1;
`);
const centerPartyId = querySql(`
  select party.id from public.operational_parties party
  join public.installation_centers center on center.id = party.installation_center_id
  where party.party_type = 'center' and center.code = 'CUBE-J-CENTER-A' limit 1;
`);
assert(adminProfileId && centerPartyId, "Admin + Center A fixtures are required for PD-079.");

const warrantyId = querySql(`
  select warranty.id
  from public.warranties warranty
  where warranty.record_state = 'issued'
    and not exists (
      select 1 from public.warranty_claims claim
      where claim.warranty_id = warranty.id and claim.closed_at is null
    )
  order by warranty.created_at, warranty.id
  limit 1;
`);
assert(warrantyId, "PD-079 requires an issued Warranty with no current open Claim.");
const warrantyBefore = querySql(`
  select concat_ws('|', record_state, activated_at, coverage_expires_at,
    customer_phone, vehicle_make, vehicle_model, updated_at)
  from public.warranties where id = ${sqlUuid(warrantyId)};
`);

function createAssignedFixture(remedyKind) {
  const claimId = randomUUID();
  const resolutionId = randomUUID();
  const claimNumber = nextClaimNumber();
  runSql(`
insert into public.warranty_claims (
  id, request_id, warranty_id, claim_number, category, affected_area, description,
  status, submitted_at, closed_at, created_at, updated_at,
  decided_by_profile_id, decision_reason, customer_decision_message, decided_at
) values (
  ${sqlUuid(claimId)}, ${sqlUuid(randomUUID())}, ${sqlUuid(warrantyId)}, ${sqlText(claimNumber)},
  'other', 'منطقة اختبار PD-079',
  'Approved/open fixture used only to verify post-assignment customer withdrawal.',
  'approved', now() - interval '20 seconds', null, now() - interval '21 seconds', now() - interval '10 seconds',
  ${sqlUuid(adminProfileId)}, 'Approved fixture for bounded PD-079 verification.',
  'تم اعتماد المطالبة لاختبار إغلاق التنفيذ بناءً على رغبة العميل.', now() - interval '10 seconds'
);
insert into public.warranty_claim_resolutions (
  id, claim_id, status, authorized_by_profile_id, authorized_at,
  remedy_kind, performing_center_party_id, assigned_by_profile_id, assigned_at,
  created_at, updated_at
) values (
  ${sqlUuid(resolutionId)}, ${sqlUuid(claimId)}, 'assigned', ${sqlUuid(adminProfileId)}, now() - interval '9 seconds',
  ${sqlText(remedyKind)}, ${sqlUuid(centerPartyId)}, ${sqlUuid(adminProfileId)}, now() - interval '8 seconds',
  now() - interval '9 seconds', now() - interval '8 seconds'
);
`);
  return { claimId, resolutionId, claimNumber };
}

const service = createAssignedFixture("service_reinstall");
const reason = "العميل أكد بعد الإسناد أنه لا يرغب في استكمال تنفيذ الخدمة المعتمدة.";
const customerMessage = "تم إغلاق تنفيذ الخدمة المعتمدة بناءً على طلبك بعدم استكمال المعالجة.";

await expectRpcError("cancel_assigned_claim_resolution_for_customer_withdrawal", {
  p_action_request_id: randomUUID(), p_resolution_id: service.resolutionId,
  p_reason: "x", p_customer_message: customerMessage,
}, adminToken, "PG_CLAIM_RESOLUTION_WITHDRAWAL_REASON_INVALID");
await expectRpcError("cancel_assigned_claim_resolution_for_customer_withdrawal", {
  p_action_request_id: randomUUID(), p_resolution_id: service.resolutionId,
  p_reason: reason, p_customer_message: "x",
}, adminToken, "PG_CLAIM_RESOLUTION_WITHDRAWAL_CUSTOMER_MESSAGE_INVALID");
await expectRpcError("cancel_assigned_claim_resolution_for_customer_withdrawal", {
  p_action_request_id: randomUUID(), p_resolution_id: service.resolutionId,
  p_reason: reason, p_customer_message: customerMessage,
}, centerToken, "PG_WARRANTY_ADMIN_REQUIRED");

const requestId = randomUUID();
const cancelled = await userRpc("cancel_assigned_claim_resolution_for_customer_withdrawal", {
  p_action_request_id: requestId, p_resolution_id: service.resolutionId,
  p_reason: reason, p_customer_message: customerMessage,
}, adminToken);
assert(cancelled.response.ok && cancelled.body === service.resolutionId,
  `PD-079 cancellation failed: ${cancelled.response.status} ${JSON.stringify(cancelled.body)}`);

const projection = querySql(`
  select concat_ws('|', resolution.status, resolution.cancelled_by_profile_id,
    resolution.cancellation_reason, resolution.customer_cancellation_message,
    resolution.cancelled_at is not null, resolution.completed_at is null,
    claim.status, claim.closed_at = resolution.cancelled_at,
    claim.decided_at is not null, claim.decided_by_profile_id is not null)
  from public.warranty_claim_resolutions resolution
  join public.warranty_claims claim on claim.id = resolution.claim_id
  where resolution.id = ${sqlUuid(service.resolutionId)};
`);
assert(projection === `cancelled|${adminProfileId}|${reason}|${customerMessage}|t|t|approved|t|t|t`,
  `PD-079 terminal projection drift: ${projection}`);
assert(querySql(`
  select concat_ws('|', record_state, activated_at, coverage_expires_at,
    customer_phone, vehicle_make, vehicle_model, updated_at)
  from public.warranties where id = ${sqlUuid(warrantyId)};
`) === warrantyBefore, "PD-079 must not mutate the original Warranty projection.");

const event = querySql(`
  select concat_ws('|', id, resolution_id, event_kind, actor_profile_id, actor_kind,
    reason, event_data ->> 'claim_id', event_data ->> 'remedy_kind',
    event_data ->> 'performing_center_party_id', event_data ->> 'customer_message')
  from public.warranty_claim_resolution_events
  where action_request_id = ${sqlUuid(requestId)};
`).split("|");
assert(event.length === 10 && event[1] === service.resolutionId
  && event[2] === "resolution_cancelled_customer_withdrawal"
  && event[3] === adminProfileId && event[4] === "admin" && event[5] === reason
  && event[6] === service.claimId && event[7] === "service_reinstall"
  && event[8] === centerPartyId && event[9] === customerMessage,
  `PD-079 immutable event drift: ${event}`);
const eventId = event[0];

const expectedRecipients = querySql(`select count(*) from private.notification_party_profile_ids(${sqlUuid(centerPartyId)});`);
const notificationShape = querySql(`
  select concat_ws('|', count(*), bool_and(attention_level = 'info'),
    bool_and(push_eligible), bool_and(action_path is null),
    bool_and(body not like '%${reason.replaceAll("'", "''")}%'))
  from public.notifications
  where source_domain = 'warranty_claim_resolution'
    and source_event_key = ${sqlText(`warranty_claim_resolution_events:${eventId}`)}
    and event_type = 'claim_resolution.cancelled_customer_withdrawal';
`);
assert(notificationShape === `${expectedRecipients}|t|t|t|t`,
  `PD-079 Center notification materialization drift: ${notificationShape}`);

const retry = await userRpc("cancel_assigned_claim_resolution_for_customer_withdrawal", {
  p_action_request_id: requestId, p_resolution_id: service.resolutionId,
  p_reason: reason, p_customer_message: customerMessage,
}, adminToken);
assert(retry.response.ok && retry.body === service.resolutionId, "Exact PD-079 retry must be idempotent.");
assert(querySql(`select count(*) from public.warranty_claim_resolution_events where action_request_id = ${sqlUuid(requestId)};`) === "1",
  "PD-079 retry duplicated the immutable Resolution event.");
assert(querySql(`select count(*) from public.notifications where source_event_key = ${sqlText(`warranty_claim_resolution_events:${eventId}`)} and event_type = 'claim_resolution.cancelled_customer_withdrawal';`) === expectedRecipients,
  "PD-079 retry duplicated Center Inbox rows.");
await expectRpcError("cancel_assigned_claim_resolution_for_customer_withdrawal", {
  p_action_request_id: requestId, p_resolution_id: service.resolutionId,
  p_reason: reason, p_customer_message: `${customerMessage} تعديل`,
}, adminToken, "PG_CLAIM_RESOLUTION_ACTION_REQUEST_CONFLICT");
await expectRpcError("cancel_assigned_claim_resolution_for_customer_withdrawal", {
  p_action_request_id: randomUUID(), p_resolution_id: service.resolutionId,
  p_reason: reason, p_customer_message: customerMessage,
}, adminToken, "PG_CLAIM_RESOLUTION_WITHDRAWAL_STATE_INVALID");

// Replacement remedy: an unused reserved Roll must be explicitly released first.
const replacement = createAssignedFixture("replacement_roll_reinstall");
const rollId = querySql(`
  select roll.id from public.rolls roll
  where not exists (
    select 1 from public.warranty_claim_resolution_roll_allocations allocation
    where allocation.roll_id = roll.id and allocation.status in ('reserved', 'consumed')
  )
  order by roll.created_at, roll.id limit 1;
`);
assert(rollId, "PD-079 reserved-material fixture requires one unallocated Roll.");
const allocationId = randomUUID();
runSql(`
insert into public.warranty_claim_resolution_roll_allocations (
  id, resolution_id, roll_id, product_eligibility_basis, status,
  reserved_by_profile_id, reserved_at, created_at
) values (
  ${sqlUuid(allocationId)}, ${sqlUuid(replacement.resolutionId)}, ${sqlUuid(rollId)},
  'same_product_default', 'reserved', ${sqlUuid(adminProfileId)}, now(), now() - interval '1 second'
);
`);
await expectRpcError("cancel_assigned_claim_resolution_for_customer_withdrawal", {
  p_action_request_id: randomUUID(), p_resolution_id: replacement.resolutionId,
  p_reason: reason, p_customer_message: customerMessage,
}, adminToken, "PG_CLAIM_RESOLUTION_WITHDRAWAL_RELEASE_REQUIRED");
assert(querySql(`select status from public.warranty_claim_resolution_roll_allocations where id = ${sqlUuid(allocationId)};`) === "reserved",
  "Blocked PD-079 attempt must not silently release material.");
assert(querySql(`select concat_ws('|', status, closed_at is null) from public.warranty_claims where id = ${sqlUuid(replacement.claimId)};`) === "approved|t",
  "Blocked PD-079 attempt must leave the replacement Claim open/approved.");

const release = await userRpc("release_claim_resolution_roll", {
  p_action_request_id: randomUUID(), p_allocation_id: allocationId,
  p_reason: "Release required before customer-withdrawal closure under PD-079.",
}, adminToken);
assert(release.response.ok && release.body === allocationId,
  `Explicit pre-withdrawal release failed: ${release.response.status} ${JSON.stringify(release.body)}`);
assert(querySql(`select status from public.warranty_claim_resolution_roll_allocations where id = ${sqlUuid(allocationId)};`) === "released",
  "Explicit PD-079 prerequisite release did not persist.");

const replacementCancel = await userRpc("cancel_assigned_claim_resolution_for_customer_withdrawal", {
  p_action_request_id: randomUUID(), p_resolution_id: replacement.resolutionId,
  p_reason: reason, p_customer_message: customerMessage,
}, adminToken);
assert(replacementCancel.response.ok && replacementCancel.body === replacement.resolutionId,
  `PD-079 replacement cancellation after release failed: ${replacementCancel.response.status} ${JSON.stringify(replacementCancel.body)}`);
assert(querySql(`
  select concat_ws('|', resolution.status, claim.status, claim.closed_at = resolution.cancelled_at,
    (select count(*) from public.warranty_claim_resolution_roll_allocations allocation where allocation.resolution_id = resolution.id and allocation.status = 'reserved'))
  from public.warranty_claim_resolutions resolution
  join public.warranty_claims claim on claim.id = resolution.claim_id
  where resolution.id = ${sqlUuid(replacement.resolutionId)};
`) === "cancelled|approved|t|0", "Released replacement PD-079 terminal state drifted.");

console.log("Cube R PD-079 customer-withdrawal cancellation verified.");