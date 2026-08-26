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
}
function dbContainerName() {
  const names = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" })
    .split("\n").map((value) => value.trim()).filter(Boolean);
  const name = names.find((value) => value.startsWith("supabase_db_"));
  assert(name, "Supabase database container was not found for Cube R reservation verification.");
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
function expectSqlFailure(sql, expectedFragment) {
  let failed = false;
  try { runSql(sql); } catch (error) {
    failed = true;
    const stderr = String(error.stderr ?? "");
    assert(stderr.includes(expectedFragment),
      `Expected SQL failure containing ${expectedFragment}, received: ${stderr}`);
  }
  assert(failed, `SQL unexpectedly succeeded; expected ${expectedFragment}.`);
}
function sqlUuid(value) {
  assert(/^[0-9a-f-]{36}$/i.test(value), `Unsafe UUID: ${value}`);
  return `'${value}'::uuid`;
}
function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

const reserveSignature = "public.reserve_claim_resolution_roll(uuid,uuid,uuid)";
const releaseSignature = "public.release_claim_resolution_roll(uuid,uuid,text)";
for (const signature of [reserveSignature, releaseSignature]) {
  assert(querySql(`select has_function_privilege('authenticated', '${signature}', 'EXECUTE');`) === "t",
    `Authenticated users must reach ${signature}; role enforcement belongs inside the RPC.`);
  for (const role of ["anon", "service_role"]) {
    assert(querySql(`select has_function_privilege('${role}', '${signature}', 'EXECUTE');`) === "f",
      `${role} unexpectedly executes ${signature}.`);
  }
}
for (const triggerName of [
  "roll_transfer_reservations_claim_allocation_guard",
  "roll_openings_claim_allocation_guard",
  "warranties_claim_allocation_guard",
]) {
  assert(querySql(`select count(*) from pg_trigger where not tgisinternal and tgname = '${triggerName}';`) === "1",
    `Missing Cube R compatibility trigger ${triggerName}.`);
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
assert(adminProfileId, "Active Cube J Admin fixture is required.");
const centerAPartyId = querySql(`
  select party.id
  from public.operational_parties party
  join public.installation_centers center on center.id = party.installation_center_id
  where party.party_type = 'center' and center.code = 'CUBE-J-CENTER-A' and center.status = 'active'
  limit 1;
`);
assert(centerAPartyId, "Actionable Center A fixture is required.");
const companyPartyId = querySql(`select id from public.operational_parties where party_type = 'company' order by id limit 1;`);
assert(companyPartyId, "Company party fixture is required.");

const warrantyFixture = querySql(`
  select concat_ws('|', warranty.id, warranty.product_id, roll.production_order_id,
    roll.production_lot_id, regexp_replace(roll.serial_number, '[0-9]{4,5}$', ''),
    (select max(candidate.roll_index) from public.rolls candidate where candidate.production_lot_id = roll.production_lot_id))
  from public.warranties warranty
  join public.rolls roll on roll.id = warranty.roll_id
  join public.production_orders production_order on production_order.id = roll.production_order_id
  where warranty.record_state = 'issued'
    and production_order.status = 'generated'
  order by warranty.activated_at, warranty.id
  limit 1;
`).split("|");
assert(warrantyFixture.length === 6 && warrantyFixture.every(Boolean),
  `Issued Warranty fixture for Cube R reservation is required: ${warrantyFixture}`);
const [warrantyId, productId, productionOrderId, productionLotId, serialPrefix, maxIndexText] = warrantyFixture;
const maxIndex = Number(maxIndexText);
assert(Number.isInteger(maxIndex) && maxIndex <= 9998,
  `Fixture Production Lot needs two free Roll indexes: ${maxIndexText}`);

const candidateAId = randomUUID();
const candidateBId = randomUUID();
const candidateAIndex = maxIndex + 1;
const candidateBIndex = maxIndex + 2;
const candidateASerial = `${serialPrefix}${String(candidateAIndex).padStart(4, "0")}`;
const candidateBSerial = `${serialPrefix}${String(candidateBIndex).padStart(4, "0")}`;
const candidateAErp = `ERP-${randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`;
const candidateBErp = `ERP-${randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`;
runSql(`
insert into public.rolls (
  id, product_id, production_order_id, production_lot_id, roll_index, serial_number, erp_serial, created_at
) values
  (${sqlUuid(candidateAId)}, ${sqlUuid(productId)}, ${sqlUuid(productionOrderId)}, ${sqlUuid(productionLotId)},
   ${candidateAIndex}, ${sqlText(candidateASerial)}, ${sqlText(candidateAErp)}, now()),
  (${sqlUuid(candidateBId)}, ${sqlUuid(productId)}, ${sqlUuid(productionOrderId)}, ${sqlUuid(productionLotId)},
   ${candidateBIndex}, ${sqlText(candidateBSerial)}, ${sqlText(candidateBErp)}, now());

update public.roll_custody_current
set custodian_party_id = ${sqlUuid(centerAPartyId)}, confirmed_at = now()
where roll_id in (${sqlUuid(candidateAId)}, ${sqlUuid(candidateBId)});

insert into public.roll_custody_events (roll_id, custody_sequence, custodian_party_id, confirmed_at)
values
  (${sqlUuid(candidateAId)}, 2, ${sqlUuid(centerAPartyId)}, now()),
  (${sqlUuid(candidateBId)}, 2, ${sqlUuid(centerAPartyId)}, now());
`);

const claimId = randomUUID();
const resolutionId = randomUUID();
const claimNumber = `PG-C-9${Date.now()}${Math.floor(Math.random() * 1000)}`;
runSql(`
insert into public.warranty_claims (
  id, request_id, warranty_id, claim_number, category, affected_area, description,
  status, submitted_at, closed_at, created_at, updated_at,
  decided_by_profile_id, decision_reason, customer_decision_message, decided_at
) values (
  ${sqlUuid(claimId)}, ${sqlUuid(randomUUID())}, ${sqlUuid(warrantyId)}, ${sqlText(claimNumber)},
  'other', 'الباب الأمامي',
  'Approved/open Cube R fixture for replacement Roll reservation lifecycle verification.',
  'approved', now() - interval '2 seconds', null, now() - interval '3 seconds', now() - interval '1 second',
  ${sqlUuid(adminProfileId)}, 'Cube R replacement reservation verifier approval.',
  'تم اعتماد المطالبة لاختبار حجز خامة الاستبدال.', now() - interval '1 second'
);
insert into public.warranty_claim_resolutions (
  id, claim_id, status, authorized_by_profile_id, authorized_at, created_at, updated_at
) values (
  ${sqlUuid(resolutionId)}, ${sqlUuid(claimId)}, 'authorized', ${sqlUuid(adminProfileId)}, now(), now(), now()
);
`);

const assignResult = await userRpc("assign_warranty_claim_resolution", {
  p_action_request_id: randomUUID(),
  p_resolution_id: resolutionId,
  p_remedy_kind: "replacement_roll_reinstall",
  p_performing_center_party_id: centerAPartyId,
}, adminToken);
assert(assignResult.response.ok && assignResult.body === resolutionId,
  `Replacement Resolution assignment failed: ${assignResult.response.status} ${JSON.stringify(assignResult.body)}`);

const deniedCenterReserve = await userRpc("reserve_claim_resolution_roll", {
  p_action_request_id: randomUUID(), p_resolution_id: resolutionId, p_roll_id: candidateAId,
}, centerAToken);
assert(!deniedCenterReserve.response.ok, "Center must not perform Admin-only replacement Roll reservation.");

const reserveRequestId = randomUUID();
const reserveResult = await userRpc("reserve_claim_resolution_roll", {
  p_action_request_id: reserveRequestId,
  p_resolution_id: resolutionId,
  p_roll_id: candidateAId,
}, adminToken);
assert(reserveResult.response.ok && /^[0-9a-f-]{36}$/i.test(String(reserveResult.body)),
  `Replacement Roll reservation failed: ${reserveResult.response.status} ${JSON.stringify(reserveResult.body)}`);
const allocationAId = reserveResult.body;

const reservedShape = querySql(`
  select concat_ws('|', allocation.resolution_id, allocation.roll_id, allocation.status,
    allocation.product_eligibility_basis, allocation.reserved_by_profile_id,
    allocation.reserved_at is not null, allocation.released_at is null, allocation.consumed_at is null)
  from public.warranty_claim_resolution_roll_allocations allocation
  where allocation.id = ${sqlUuid(allocationAId)};
`);
assert(reservedShape === `${resolutionId}|${candidateAId}|reserved|same_product_default|${adminProfileId}|t|t|t`,
  `Reserved allocation projection drift: ${reservedShape}`);
const reservedEvent = querySql(`
  select concat_ws('|', event.event_kind, event.actor_profile_id, event.actor_kind,
    event.reason is null, event.event_data ->> 'allocation_id', event.event_data ->> 'roll_id',
    event.event_data ->> 'product_eligibility_basis')
  from public.warranty_claim_resolution_events event
  where event.action_request_id = ${sqlUuid(reserveRequestId)};
`);
assert(reservedEvent === `replacement_roll_reserved|${adminProfileId}|admin|t|${allocationAId}|${candidateAId}|same_product_default`,
  `Replacement Roll reserved event drift: ${reservedEvent}`);

const reserveRetry = await userRpc("reserve_claim_resolution_roll", {
  p_action_request_id: reserveRequestId, p_resolution_id: resolutionId, p_roll_id: candidateAId,
}, adminToken);
assert(reserveRetry.response.ok && reserveRetry.body === allocationAId,
  "Exact reserve retry must return the same allocation id.");
assert(querySql(`select count(*) from public.warranty_claim_resolution_events where action_request_id = ${sqlUuid(reserveRequestId)};`) === "1",
  "Reserve retry must not duplicate the immutable event.");
await expectRpcError("reserve_claim_resolution_roll", {
  p_action_request_id: reserveRequestId, p_resolution_id: resolutionId, p_roll_id: candidateBId,
}, adminToken, "PG_CLAIM_RESOLUTION_ACTION_REQUEST_CONFLICT");
await expectRpcError("reserve_claim_resolution_roll", {
  p_action_request_id: randomUUID(), p_resolution_id: resolutionId, p_roll_id: candidateBId,
}, adminToken, "PG_CLAIM_ROLL_ALREADY_ALLOCATED");

const transferId = querySql(`select id from public.roll_transfers order by created_at, id limit 1;`);
assert(transferId, "Existing Transfer fixture is required for the reverse reservation guard.");
expectSqlFailure(`
begin;
insert into public.roll_transfer_items (transfer_id, roll_id)
values (${sqlUuid(transferId)}, ${sqlUuid(candidateAId)});
insert into public.roll_transfer_reservations (transfer_id, roll_id, reserved_at)
values (${sqlUuid(transferId)}, ${sqlUuid(candidateAId)}, now());
commit;
`, "PG_TRANSFER_ROLL_CLAIM_ALLOCATED");

const openingRequestId = randomUUID();
const opening = await userRpc("open_roll", {
  p_request_id: openingRequestId,
  p_roll_serial: candidateASerial,
}, centerAToken);
assert(opening.response.ok && opening.body === candidateAId,
  `Claim-reserved Roll must reuse Cube J Opening: ${opening.response.status} ${JSON.stringify(opening.body)}`);
assert(querySql(`
  select count(*) from public.roll_openings
  where roll_id = ${sqlUuid(candidateAId)}
    and opened_by_center_party_id = ${sqlUuid(centerAPartyId)};
`) === "1", "Reserved replacement Roll Opening must persist only in Cube J roll_openings.");

await expectRpcError("activate_roll_warranty", {
  p_request_id: randomUUID(),
  p_roll_serial: candidateASerial,
  p_customer_name: "Replacement Roll Guard",
  p_customer_phone: "+201000000999",
  p_customer_email: null,
  p_vehicle_make: "Test",
  p_vehicle_model: "Guard",
  p_vehicle_year: 2026,
  p_vehicle_plate: "R-TEST",
  p_vehicle_color: "Black",
  p_vehicle_vin: "TESTVIN1234567890",
}, centerAToken, "PG_WARRANTY_ROLL_CLAIM_ALLOCATED");

await expectRpcError("release_claim_resolution_roll", {
  p_action_request_id: randomUUID(), p_allocation_id: allocationAId, p_reason: "x",
}, adminToken, "PG_CLAIM_ROLL_RELEASE_REASON_INVALID");
const deniedCenterRelease = await userRpc("release_claim_resolution_roll", {
  p_action_request_id: randomUUID(), p_allocation_id: allocationAId,
  p_reason: "Center must not release Company replacement material.",
}, centerAToken);
assert(!deniedCenterRelease.response.ok, "Center must not perform Admin-only replacement Roll release.");

const releaseRequestId = randomUUID();
const releaseReason = "Unused replacement allocation released for a controlled Roll change.";
const releaseResult = await userRpc("release_claim_resolution_roll", {
  p_action_request_id: releaseRequestId,
  p_allocation_id: allocationAId,
  p_reason: releaseReason,
}, adminToken);
assert(releaseResult.response.ok && releaseResult.body === allocationAId,
  `Replacement Roll release failed: ${releaseResult.response.status} ${JSON.stringify(releaseResult.body)}`);
const releasedShape = querySql(`
  select concat_ws('|', status, released_by_profile_id, release_reason,
    released_at is not null, consumed_at is null)
  from public.warranty_claim_resolution_roll_allocations
  where id = ${sqlUuid(allocationAId)};
`);
assert(releasedShape === `released|${adminProfileId}|${releaseReason}|t|t`,
  `Released allocation projection drift: ${releasedShape}`);
assert(querySql(`select count(*) from public.roll_openings where roll_id = ${sqlUuid(candidateAId)};`) === "1",
  "Release must never erase the immutable Cube J Opening.");
const releaseEvent = querySql(`
  select concat_ws('|', event_kind, actor_profile_id, actor_kind, reason,
    event_data ->> 'allocation_id', event_data ->> 'roll_id', event_data ->> 'product_eligibility_basis')
  from public.warranty_claim_resolution_events
  where action_request_id = ${sqlUuid(releaseRequestId)};
`);
assert(releaseEvent === `replacement_roll_released|${adminProfileId}|admin|${releaseReason}|${allocationAId}|${candidateAId}|same_product_default`,
  `Replacement Roll released event drift: ${releaseEvent}`);

const releaseRetry = await userRpc("release_claim_resolution_roll", {
  p_action_request_id: releaseRequestId, p_allocation_id: allocationAId, p_reason: releaseReason,
}, adminToken);
assert(releaseRetry.response.ok && releaseRetry.body === allocationAId,
  "Exact release retry must return the same allocation id.");
await expectRpcError("release_claim_resolution_roll", {
  p_action_request_id: releaseRequestId, p_allocation_id: allocationAId,
  p_reason: "A conflicting retry reason must not be accepted.",
}, adminToken, "PG_CLAIM_RESOLUTION_ACTION_REQUEST_CONFLICT");
await expectRpcError("reserve_claim_resolution_roll", {
  p_action_request_id: randomUUID(), p_resolution_id: resolutionId, p_roll_id: candidateAId,
}, adminToken, "PG_CLAIM_ROLL_ALREADY_OPENED");

const reserveB = await userRpc("reserve_claim_resolution_roll", {
  p_action_request_id: randomUUID(), p_resolution_id: resolutionId, p_roll_id: candidateBId,
}, adminToken);
assert(reserveB.response.ok && /^[0-9a-f-]{36}$/i.test(String(reserveB.body)),
  `Released allocation must free the Resolution for another eligible unopened Roll: ${reserveB.response.status} ${JSON.stringify(reserveB.body)}`);
assert(querySql(`
  select count(*) from public.warranty_claim_resolution_roll_allocations
  where resolution_id = ${sqlUuid(resolutionId)} and status = 'reserved';
`) === "1", "Exactly one active reserved allocation must remain after controlled replacement.");

console.log("Cube R replacement Roll reserve/release lifecycle and compatibility guards verified.");
