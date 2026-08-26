import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

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
} = {}) {
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
    method: "POST",
    token: anonKey,
    key: anonKey,
    body: { email, password },
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
  return result;
}

function dbContainerName() {
  const names = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" })
    .split("\n").map((value) => value.trim()).filter(Boolean);
  const name = names.find((value) => value.startsWith("supabase_db_"));
  assert(name, "Supabase database container was not found for Cube R assignment verification.");
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
    ["exec", "-i", dbContainerName(), "psql", "-v", "ON_ERROR_STOP=1",
      "-U", "postgres", "-d", "postgres"],
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

const signature = "public.assign_warranty_claim_resolution(uuid,uuid,text,uuid)";
assert(querySql(`select has_function_privilege('authenticated', '${signature}', 'EXECUTE');`) === "t",
  "Authenticated users must reach the R assignment RPC; role enforcement happens inside the security-definer boundary.");
for (const role of ["anon", "service_role"]) {
  assert(querySql(`select has_function_privilege('${role}', '${signature}', 'EXECUTE');`) === "f",
    `${role} unexpectedly executes ${signature}.`);
}

assert(querySql(`select to_regclass('public.warranty_claim_resolution_roll_allocations') is null;`) === "t",
  "Initial assignment increment must remain allocation-free.");
assert(querySql(`select count(*) from pg_trigger where tgrelid = 'public.warranty_claim_resolution_events'::regclass and not tgisinternal and tgname = 'warranty_claim_resolution_events_materialize_notification';`) === "1",
  "Resolution event -> Cube L notification projector trigger is missing.");

const adminToken = await signIn("cube-j-admin@example.test");
const centerAToken = await signIn("cube-j-center-a@example.test");

const adminProfileId = querySql(`
  select profile.id
  from public.profiles profile
  join auth.users auth_user on auth_user.id = profile.id
  where auth_user.email = 'cube-j-admin@example.test'
    and profile.role = 'admin'
    and profile.status = 'active'
  limit 1;
`);
assert(adminProfileId, "Active Cube J Admin Profile fixture is required.");

const centerAPartyId = querySql(`
  select party.id
  from public.operational_parties party
  join public.installation_centers center on center.id = party.installation_center_id
  where party.party_type = 'center'
    and center.code = 'CUBE-J-CENTER-A'
    and center.status = 'active'
  limit 1;
`);
assert(centerAPartyId, "Actionable Center A party fixture is required.");

const historicalQ = querySql(`
  select concat_ws('|', claim.id, claim.warranty_id, resolution.id)
  from public.warranty_claims claim
  join public.warranty_claim_resolutions resolution on resolution.claim_id = claim.id
  join public.warranties warranty on warranty.id = claim.warranty_id
  where claim.status = 'cancelled'
    and claim.closed_at is not null
    and resolution.status = 'authorized'
    and warranty.record_state = 'issued'
  order by claim.updated_at desc, claim.id desc
  limit 1;
`).split("|");
assert(historicalQ.length === 3 && historicalQ.every(Boolean),
  `Cube Q historical approval-cancel fixture is required before Cube R assignment: ${historicalQ}`);
const [, warrantyId, historicalResolutionId] = historicalQ;

await expectRpcError("assign_warranty_claim_resolution", {
  p_action_request_id: randomUUID(),
  p_resolution_id: historicalResolutionId,
  p_remedy_kind: "service_reinstall",
  p_performing_center_party_id: centerAPartyId,
}, adminToken, "PG_CLAIM_RESOLUTION_ASSIGN_STATE_INVALID");

const claimId = randomUUID();
const claimRequestId = randomUUID();
const resolutionId = randomUUID();
const claimNumber = `PG-C-9${Date.now()}${Math.floor(Math.random() * 1000)}`;

runSql(`
insert into public.warranty_claims (
  id, request_id, warranty_id, claim_number, category, affected_area, description,
  status, submitted_at, closed_at, created_at, updated_at,
  decided_by_profile_id, decision_reason, customer_decision_message, decided_at
) values (
  ${sqlUuid(claimId)}, ${sqlUuid(claimRequestId)}, ${sqlUuid(warrantyId)}, ${sqlText(claimNumber)},
  'other', 'الباب الأمامي',
  'Approved/open Cube R handoff fixture created only to verify initial Resolution assignment.',
  'approved', now() - interval '2 seconds', null, now() - interval '3 seconds', now() - interval '1 second',
  ${sqlUuid(adminProfileId)}, 'Cube R verifier approved handoff fixture.',
  'تم اعتماد المطالبة لاختبار إسناد التنفيذ في Cube R.', now() - interval '1 second'
);

insert into public.warranty_claim_resolutions (
  id, claim_id, status, authorized_by_profile_id, authorized_at, created_at, updated_at
) values (
  ${sqlUuid(resolutionId)}, ${sqlUuid(claimId)}, 'authorized', ${sqlUuid(adminProfileId)}, now(), now(), now()
);
`);

await expectRpcError("assign_warranty_claim_resolution", {
  p_action_request_id: randomUUID(),
  p_resolution_id: resolutionId,
  p_remedy_kind: "unsupported_remedy",
  p_performing_center_party_id: centerAPartyId,
}, adminToken, "PG_CLAIM_RESOLUTION_REMEDY_INVALID");

await expectRpcError("assign_warranty_claim_resolution", {
  p_action_request_id: randomUUID(),
  p_resolution_id: resolutionId,
  p_remedy_kind: "service_reinstall",
  p_performing_center_party_id: randomUUID(),
}, adminToken, "PG_CLAIM_CENTER_INACTIVE");

const deniedCenter = await userRpc("assign_warranty_claim_resolution", {
  p_action_request_id: randomUUID(),
  p_resolution_id: resolutionId,
  p_remedy_kind: "service_reinstall",
  p_performing_center_party_id: centerAPartyId,
}, centerAToken);
assert(!deniedCenter.response.ok,
  "Center Profile must not perform Admin-only initial Resolution assignment.");

assert(querySql(`select status from public.warranty_claim_resolutions where id = ${sqlUuid(resolutionId)};`) === "authorized",
  "Rejected assignment attempts must not mutate the authorized Resolution.");

const assignmentRequestId = randomUUID();
const assigned = await userRpc("assign_warranty_claim_resolution", {
  p_action_request_id: assignmentRequestId,
  p_resolution_id: resolutionId,
  p_remedy_kind: "service_reinstall",
  p_performing_center_party_id: centerAPartyId,
}, adminToken);
assert(assigned.response.ok && assigned.body === resolutionId,
  `Initial Resolution assignment failed: ${assigned.response.status} ${JSON.stringify(assigned.body)}`);

const assignedProjection = querySql(`
  select concat_ws('|',
    resolution.status, resolution.remedy_kind, resolution.performing_center_party_id,
    resolution.assigned_by_profile_id, resolution.assigned_at is not null,
    resolution.completed_at is null, resolution.cancelled_at is null,
    claim.status, claim.closed_at is null, warranty.record_state
  )
  from public.warranty_claim_resolutions resolution
  join public.warranty_claims claim on claim.id = resolution.claim_id
  join public.warranties warranty on warranty.id = claim.warranty_id
  where resolution.id = ${sqlUuid(resolutionId)};
`);
assert(assignedProjection === `assigned|service_reinstall|${centerAPartyId}|${adminProfileId}|t|t|t|approved|t|issued`,
  `Initial assignment projection drift: ${assignedProjection}`);

const eventRow = querySql(`
  select concat_ws('|', event.id, event.resolution_id, event.event_kind, event.actor_profile_id,
    event.actor_kind, event.reason is null, event.event_data ->> 'claim_id',
    event.event_data ->> 'remedy_kind', event.event_data ->> 'performing_center_party_id')
  from public.warranty_claim_resolution_events event
  where event.action_request_id = ${sqlUuid(assignmentRequestId)};
`).split("|");
assert(eventRow.length === 9
  && eventRow[1] === resolutionId
  && eventRow[2] === "resolution_assigned"
  && eventRow[3] === adminProfileId
  && eventRow[4] === "admin"
  && eventRow[5] === "t"
  && eventRow[6] === claimId
  && eventRow[7] === "service_reinstall"
  && eventRow[8] === centerAPartyId,
  `Resolution assignment event drift: ${eventRow}`);
const assignmentEventId = eventRow[0];

const expectedCenterRecipients = querySql(`
  select count(*) from private.notification_party_profile_ids(${sqlUuid(centerAPartyId)});
`);
assert(Number(expectedCenterRecipients) >= 1,
  "Assigned Center must expose at least one active notification recipient.");

const notificationShape = querySql(`
  select concat_ws('|', count(*), bool_and(notification.attention_level = 'action_required'),
    bool_and(notification.push_eligible), bool_and(notification.action_path is null))
  from public.notifications notification
  where notification.source_domain = 'warranty_claim_resolution'
    and notification.source_event_key = ${sqlText(`warranty_claim_resolution_events:${assignmentEventId}`)}
    and notification.event_type = 'claim_resolution.assigned';
`);
assert(notificationShape === `${expectedCenterRecipients}|t|t|t`,
  `Assigned Center notification materialization drift: ${notificationShape}`);

assert(querySql(`
  select count(*) from public.notifications notification
  where notification.source_domain = 'warranty_claim_resolution'
    and notification.source_event_key = ${sqlText(`warranty_claim_resolution_events:${assignmentEventId}`)}
    and notification.recipient_profile_id = ${sqlUuid(adminProfileId)};
`) === "0", "Initial assignment must not create Admin self-success noise.");

const centerInbox = await userRpc("list_notifications", { p_limit: 100, p_offset: 0 }, centerAToken);
assert(centerInbox.response.ok && centerInbox.body.some((notification) =>
  notification.event_type === "claim_resolution.assigned"
    && notification.source_event_key === `warranty_claim_resolution_events:${assignmentEventId}`
    && notification.attention_level === "action_required"
    && notification.push_eligible === true
    && notification.action_path === null
), `Assigned Center Inbox is missing the durable action-required row: ${JSON.stringify(centerInbox.body)}`);

const retry = await userRpc("assign_warranty_claim_resolution", {
  p_action_request_id: assignmentRequestId,
  p_resolution_id: resolutionId,
  p_remedy_kind: "service_reinstall",
  p_performing_center_party_id: centerAPartyId,
}, adminToken);
assert(retry.response.ok && retry.body === resolutionId,
  "Exact initial-assignment retry must return the same Resolution id.");
assert(querySql(`select count(*) from public.warranty_claim_resolution_events where action_request_id = ${sqlUuid(assignmentRequestId)};`) === "1",
  "Assignment retry must not duplicate the immutable Resolution event.");
assert(querySql(`
  select count(*) from public.notifications notification
  where notification.source_domain = 'warranty_claim_resolution'
    and notification.source_event_key = ${sqlText(`warranty_claim_resolution_events:${assignmentEventId}`)}
    and notification.event_type = 'claim_resolution.assigned';
`) === expectedCenterRecipients, "Assignment retry must not duplicate Center Inbox rows.");

await expectRpcError("assign_warranty_claim_resolution", {
  p_action_request_id: assignmentRequestId,
  p_resolution_id: resolutionId,
  p_remedy_kind: "replacement_roll_reinstall",
  p_performing_center_party_id: centerAPartyId,
}, adminToken, "PG_CLAIM_RESOLUTION_ACTION_REQUEST_CONFLICT");

await expectRpcError("assign_warranty_claim_resolution", {
  p_action_request_id: randomUUID(),
  p_resolution_id: resolutionId,
  p_remedy_kind: "service_reinstall",
  p_performing_center_party_id: centerAPartyId,
}, adminToken, "PG_CLAIM_RESOLUTION_ASSIGN_STATE_INVALID");

await expectRpcError("cancel_warranty_claim", {
  p_action_request_id: randomUUID(),
  p_claim_id: claimId,
  p_reason: "Attempted Q approval undo after Cube R execution assignment started.",
  p_customer_message: "لا يجوز إلغاء الاعتماد القديم بعد بدء تنفيذ المعالجة.",
}, adminToken, "PG_CLAIM_APPROVAL_ALREADY_IN_EXECUTION");

assert(querySql(`
  select concat_ws('|', resolution.status, claim.status, claim.closed_at is null)
  from public.warranty_claim_resolutions resolution
  join public.warranty_claims claim on claim.id = resolution.claim_id
  where resolution.id = ${sqlUuid(resolutionId)};
`) === "assigned|approved|t", "Q rejection must leave the R-assigned Claim/Resolution unchanged.");

assert(querySql(`select to_regclass('public.warranty_claim_resolution_roll_allocations') is null;`) === "t",
  "Initial assignment must not create Roll allocation persistence as a side effect.");

console.log("Cube R initial Resolution assignment verified.");
