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
  return result;
}
function dbContainerName() {
  const names = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" })
    .split("\n").map((value) => value.trim()).filter(Boolean);
  const name = names.find((value) => value.startsWith("supabase_db_"));
  assert(name, "Supabase database container was not found for Cube R correction verification.");
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

const reassignSignature = "public.reassign_warranty_claim_resolution(uuid,uuid,uuid,text)";
const remedySignature = "public.change_warranty_claim_resolution_remedy(uuid,uuid,text,text)";
for (const signature of [reassignSignature, remedySignature]) {
  assert(querySql(`select has_function_privilege('authenticated', '${signature}', 'EXECUTE');`) === "t",
    `Authenticated must reach ${signature}; Admin enforcement is inside the RPC.`);
  for (const role of ["anon", "service_role"]) {
    assert(querySql(`select has_function_privilege('${role}', '${signature}', 'EXECUTE');`) === "f",
      `${role} unexpectedly executes ${signature}.`);
  }
}

const adminToken = await signIn("cube-j-admin@example.test");
const centerAToken = await signIn("cube-j-center-a@example.test");
const adminProfileId = querySql(`
  select profile.id
  from public.profiles profile
  join auth.users auth_user on auth_user.id = profile.id
  where auth_user.email = 'cube-j-admin@example.test'
    and profile.role = 'admin' and profile.status = 'active'
  limit 1;
`);
assert(adminProfileId, "Active Admin fixture is required.");

const centerAPartyId = querySql(`
  select party.id
  from public.operational_parties party
  join public.installation_centers center on center.id = party.installation_center_id
  where party.party_type = 'center' and center.code = 'CUBE-J-CENTER-A' and center.status = 'active'
  limit 1;
`);
const centerBPartyId = querySql(`
  select party.id
  from public.operational_parties party
  join public.installation_centers center on center.id = party.installation_center_id
  where party.party_type = 'center' and center.code = 'CUBE-J-CENTER-B' and center.status = 'active'
  limit 1;
`);
assert(centerAPartyId && centerBPartyId && centerAPartyId !== centerBPartyId,
  "Two distinct active Center fixtures are required.");
assert(Number(querySql(`select count(*) from private.notification_party_profile_ids(${sqlUuid(centerBPartyId)});`)) >= 1,
  "Center B must be actionable and have at least one active bound Profile.");

const fixture = querySql(`
  select concat_ws('|', resolution.id, resolution.claim_id, resolution.remedy_kind,
    resolution.performing_center_party_id, resolution.assigned_at)
  from public.warranty_claim_resolutions resolution
  join public.warranty_claims claim on claim.id = resolution.claim_id
  where resolution.status = 'assigned'
    and claim.status = 'approved' and claim.closed_at is null
  order by resolution.assigned_at desc, resolution.id desc
  limit 1;
`).split("|");
assert(fixture.length === 5 && fixture.every(Boolean),
  `Cube R initial assignment fixture is required: ${fixture}`);
const [resolutionId, claimId, initialRemedy, initialCenterPartyId, initialAssignedAt] = fixture;
assert(initialRemedy === "service_reinstall" && initialCenterPartyId === centerAPartyId,
  `Expected initial assignment to Center A/service remedy, received ${fixture}`);

const centerDenied = await userRpc("reassign_warranty_claim_resolution", {
  p_action_request_id: randomUUID(),
  p_resolution_id: resolutionId,
  p_performing_center_party_id: centerBPartyId,
  p_reason: "Center user must not reassign fulfillment work.",
}, centerAToken);
assert(!centerDenied.response.ok, "Center Profile must not perform Admin-only Resolution reassignment.");

await expectRpcError("reassign_warranty_claim_resolution", {
  p_action_request_id: randomUUID(),
  p_resolution_id: resolutionId,
  p_performing_center_party_id: centerAPartyId,
  p_reason: "Same Center is not a reassignment.",
}, adminToken, "PG_CLAIM_RESOLUTION_CENTER_UNCHANGED");
await expectRpcError("reassign_warranty_claim_resolution", {
  p_action_request_id: randomUUID(),
  p_resolution_id: resolutionId,
  p_performing_center_party_id: randomUUID(),
  p_reason: "Unknown Center must fail the actionable destination boundary.",
}, adminToken, "PG_CLAIM_CENTER_INACTIVE");
await expectRpcError("reassign_warranty_claim_resolution", {
  p_action_request_id: randomUUID(),
  p_resolution_id: resolutionId,
  p_performing_center_party_id: centerBPartyId,
  p_reason: "bad",
}, adminToken, "PG_CLAIM_RESOLUTION_REASSIGN_REQUEST_INVALID");

const reassignRequestId = randomUUID();
const reassignReason = "Performing Center changed before any Claim material was reserved.";
const reassigned = await userRpc("reassign_warranty_claim_resolution", {
  p_action_request_id: reassignRequestId,
  p_resolution_id: resolutionId,
  p_performing_center_party_id: centerBPartyId,
  p_reason: reassignReason,
}, adminToken);
assert(reassigned.response.ok && reassigned.body === resolutionId,
  `Resolution reassignment failed: ${reassigned.response.status} ${JSON.stringify(reassigned.body)}`);

const reassignedProjection = querySql(`
  select concat_ws('|', status, remedy_kind, performing_center_party_id, assigned_by_profile_id,
    assigned_at > ${sqlText(initialAssignedAt)}::timestamptz, completed_at is null, cancelled_at is null)
  from public.warranty_claim_resolutions where id = ${sqlUuid(resolutionId)};
`);
assert(reassignedProjection === `assigned|service_reinstall|${centerBPartyId}|${adminProfileId}|t|t|t`,
  `Resolution reassignment projection drift: ${reassignedProjection}`);

const reassignEvent = querySql(`
  select concat_ws('|', id, event_kind, actor_profile_id, actor_kind, reason,
    event_data ->> 'claim_id', event_data ->> 'remedy_kind',
    event_data ->> 'old_performing_center_party_id', event_data ->> 'performing_center_party_id')
  from public.warranty_claim_resolution_events
  where action_request_id = ${sqlUuid(reassignRequestId)};
`).split("|");
assert(reassignEvent.length === 9 && reassignEvent[1] === "resolution_reassigned"
  && reassignEvent[2] === adminProfileId && reassignEvent[3] === "admin"
  && reassignEvent[4] === reassignReason && reassignEvent[5] === claimId
  && reassignEvent[6] === "service_reinstall"
  && reassignEvent[7] === centerAPartyId && reassignEvent[8] === centerBPartyId,
  `Resolution reassignment event drift: ${reassignEvent}`);
const reassignEventId = reassignEvent[0];

const centerBRecipients = querySql(`select count(*) from private.notification_party_profile_ids(${sqlUuid(centerBPartyId)});`);
const reassignNotificationShape = querySql(`
  select concat_ws('|', count(*), bool_and(event_type = 'claim_resolution.reassigned'),
    bool_and(attention_level = 'action_required'), bool_and(push_eligible),
    bool_and(action_path = '/operations/claim-resolution-tasks/${resolutionId}'))
  from public.notifications
  where source_domain = 'warranty_claim_resolution'
    and source_event_key = ${sqlText(`warranty_claim_resolution_events:${reassignEventId}`)};
`);
assert(reassignNotificationShape === `${centerBRecipients}|t|t|t|t`,
  `Reassigned Center notification drift: ${reassignNotificationShape}`);
assert(querySql(`
  select count(*)
  from public.notifications notification
  where notification.source_domain = 'warranty_claim_resolution'
    and notification.source_event_key = ${sqlText(`warranty_claim_resolution_events:${reassignEventId}`)}
    and notification.recipient_profile_id in (
      select profile_id from private.notification_party_profile_ids(${sqlUuid(centerAPartyId)})
    );
`) === "0", "Old Center must not receive the new reassignment action notification.");

const reassignRetry = await userRpc("reassign_warranty_claim_resolution", {
  p_action_request_id: reassignRequestId,
  p_resolution_id: resolutionId,
  p_performing_center_party_id: centerBPartyId,
  p_reason: reassignReason,
}, adminToken);
assert(reassignRetry.response.ok && reassignRetry.body === resolutionId,
  "Exact reassignment retry must return the same Resolution id.");
assert(querySql(`select count(*) from public.warranty_claim_resolution_events where action_request_id = ${sqlUuid(reassignRequestId)};`) === "1",
  "Reassignment retry must not duplicate the immutable event.");
await expectRpcError("reassign_warranty_claim_resolution", {
  p_action_request_id: reassignRequestId,
  p_resolution_id: resolutionId,
  p_performing_center_party_id: centerAPartyId,
  p_reason: reassignReason,
}, adminToken, "PG_CLAIM_RESOLUTION_ACTION_REQUEST_CONFLICT");

const remedyDenied = await userRpc("change_warranty_claim_resolution_remedy", {
  p_action_request_id: randomUUID(),
  p_resolution_id: resolutionId,
  p_remedy_kind: "replacement_roll_reinstall",
  p_reason: "Center user must not change the authorized remedy projection.",
}, centerAToken);
assert(!remedyDenied.response.ok, "Center Profile must not perform Admin-only remedy correction.");
await expectRpcError("change_warranty_claim_resolution_remedy", {
  p_action_request_id: randomUUID(),
  p_resolution_id: resolutionId,
  p_remedy_kind: "unsupported",
  p_reason: "Unsupported remedy must fail.",
}, adminToken, "PG_CLAIM_RESOLUTION_REMEDY_CHANGE_REQUEST_INVALID");
await expectRpcError("change_warranty_claim_resolution_remedy", {
  p_action_request_id: randomUUID(),
  p_resolution_id: resolutionId,
  p_remedy_kind: "service_reinstall",
  p_reason: "Same remedy is not a correction.",
}, adminToken, "PG_CLAIM_RESOLUTION_REMEDY_UNCHANGED");

const assignedAtBeforeRemedy = querySql(`select assigned_at from public.warranty_claim_resolutions where id = ${sqlUuid(resolutionId)};`);
const remedyRequestId = randomUUID();
const remedyReason = "Approved remedy corrected before any replacement material was reserved.";
const remedyChanged = await userRpc("change_warranty_claim_resolution_remedy", {
  p_action_request_id: remedyRequestId,
  p_resolution_id: resolutionId,
  p_remedy_kind: "replacement_roll_reinstall",
  p_reason: remedyReason,
}, adminToken);
assert(remedyChanged.response.ok && remedyChanged.body === resolutionId,
  `Resolution remedy correction failed: ${remedyChanged.response.status} ${JSON.stringify(remedyChanged.body)}`);
assert(querySql(`
  select concat_ws('|', status, remedy_kind, performing_center_party_id,
    assigned_at = ${sqlText(assignedAtBeforeRemedy)}::timestamptz, completed_at is null, cancelled_at is null)
  from public.warranty_claim_resolutions where id = ${sqlUuid(resolutionId)};
`) === `assigned|replacement_roll_reinstall|${centerBPartyId}|t|t|t`,
  "Remedy correction must preserve assignment identity/time and keep Resolution assigned.");

const remedyEvent = querySql(`
  select concat_ws('|', id, event_kind, actor_profile_id, actor_kind, reason,
    event_data ->> 'claim_id', event_data ->> 'old_remedy_kind',
    event_data ->> 'remedy_kind', event_data ->> 'performing_center_party_id')
  from public.warranty_claim_resolution_events
  where action_request_id = ${sqlUuid(remedyRequestId)};
`).split("|");
assert(remedyEvent.length === 9 && remedyEvent[1] === "resolution_remedy_changed"
  && remedyEvent[2] === adminProfileId && remedyEvent[3] === "admin" && remedyEvent[4] === remedyReason
  && remedyEvent[5] === claimId && remedyEvent[6] === "service_reinstall"
  && remedyEvent[7] === "replacement_roll_reinstall" && remedyEvent[8] === centerBPartyId,
  `Resolution remedy-change event drift: ${remedyEvent}`);
assert(querySql(`
  select count(*) from public.notifications
  where source_domain = 'warranty_claim_resolution'
    and source_event_key = ${sqlText(`warranty_claim_resolution_events:${remedyEvent[0]}`)};
`) === "0", "Remedy correction must not create unnecessary notification noise in this increment.");

const remedyRetry = await userRpc("change_warranty_claim_resolution_remedy", {
  p_action_request_id: remedyRequestId,
  p_resolution_id: resolutionId,
  p_remedy_kind: "replacement_roll_reinstall",
  p_reason: remedyReason,
}, adminToken);
assert(remedyRetry.response.ok && remedyRetry.body === resolutionId,
  "Exact remedy-correction retry must return the same Resolution id.");
await expectRpcError("change_warranty_claim_resolution_remedy", {
  p_action_request_id: remedyRequestId,
  p_resolution_id: resolutionId,
  p_remedy_kind: "service_reinstall",
  p_reason: remedyReason,
}, adminToken, "PG_CLAIM_RESOLUTION_ACTION_REQUEST_CONFLICT");

const rollId = querySql(`
  select roll.id
  from public.rolls roll
  where not exists (
    select 1 from public.warranty_claim_resolution_roll_allocations allocation
    where allocation.roll_id = roll.id and allocation.status in ('reserved', 'consumed')
  )
  order by roll.created_at, roll.id
  limit 1;
`);
assert(rollId, "One Roll fixture is required for the material guard.");
const allocationId = randomUUID();
runSql(`
insert into public.warranty_claim_resolution_roll_allocations (
  id, resolution_id, roll_id, product_eligibility_basis, status,
  reserved_by_profile_id, reserved_at, created_at
) values (
  ${sqlUuid(allocationId)}, ${sqlUuid(resolutionId)}, ${sqlUuid(rollId)},
  'same_product_default', 'reserved', ${sqlUuid(adminProfileId)}, now(), now()
);
`);

await expectRpcError("change_warranty_claim_resolution_remedy", {
  p_action_request_id: randomUUID(),
  p_resolution_id: resolutionId,
  p_remedy_kind: "service_reinstall",
  p_reason: "Reserved material must be released before remedy correction.",
}, adminToken, "PG_CLAIM_RESOLUTION_MATERIAL_ACTIVE");
await expectRpcError("reassign_warranty_claim_resolution", {
  p_action_request_id: randomUUID(),
  p_resolution_id: resolutionId,
  p_performing_center_party_id: centerAPartyId,
  p_reason: "Reserved material must be released before Center reassignment.",
}, adminToken, "PG_CLAIM_RESOLUTION_MATERIAL_ACTIVE");

runSql(`
update public.warranty_claim_resolution_roll_allocations
set status = 'released',
    released_by_profile_id = ${sqlUuid(adminProfileId)},
    release_reason = 'Verifier releases material before correction.',
    released_at = greatest(clock_timestamp(), reserved_at + interval '1 microsecond')
where id = ${sqlUuid(allocationId)};
`);

const postReleaseRemedy = await userRpc("change_warranty_claim_resolution_remedy", {
  p_action_request_id: randomUUID(),
  p_resolution_id: resolutionId,
  p_remedy_kind: "service_reinstall",
  p_reason: "Released material permits bounded remedy correction again.",
}, adminToken);
assert(postReleaseRemedy.response.ok && postReleaseRemedy.body === resolutionId,
  `Released allocation should restore remedy correction: ${postReleaseRemedy.response.status} ${JSON.stringify(postReleaseRemedy.body)}`);

const postReleaseReassign = await userRpc("reassign_warranty_claim_resolution", {
  p_action_request_id: randomUUID(),
  p_resolution_id: resolutionId,
  p_performing_center_party_id: centerAPartyId,
  p_reason: "Released material permits bounded Center reassignment again.",
}, adminToken);
assert(postReleaseReassign.response.ok && postReleaseReassign.body === resolutionId,
  `Released allocation should restore Center reassignment: ${postReleaseReassign.response.status} ${JSON.stringify(postReleaseReassign.body)}`);

assert(querySql(`
  select concat_ws('|', resolution.status, resolution.remedy_kind, resolution.performing_center_party_id,
    claim.status, claim.closed_at is null, allocation.status)
  from public.warranty_claim_resolutions resolution
  join public.warranty_claims claim on claim.id = resolution.claim_id
  join public.warranty_claim_resolution_roll_allocations allocation on allocation.resolution_id = resolution.id
  where resolution.id = ${sqlUuid(resolutionId)} and allocation.id = ${sqlUuid(allocationId)};
`) === `assigned|service_reinstall|${centerAPartyId}|approved|t|released`,
  "Bounded correction flow must leave Claim approved/open and historical released material untouched.");

console.log("Cube R assignment reassignment and remedy correction verified.");
