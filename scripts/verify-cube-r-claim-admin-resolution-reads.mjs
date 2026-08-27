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
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
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
}

function dbContainerName() {
  const names = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" })
    .split("\n").map((value) => value.trim()).filter(Boolean);
  const name = names.find((value) => value.startsWith("supabase_db_"));
  assert(name, "Supabase database container was not found for Cube R Admin read verification.");
  return name;
}

function runSql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", dbContainerName(), "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
    { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  );
}

function querySql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", dbContainerName(), "psql", "-At", "-F", "|", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-c", sql],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
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

assert(querySql(`
  select count(*)
  from pg_proc procedure
  join pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname in (
      'list_admin_warranty_claim_resolutions',
      'get_admin_warranty_claim_resolution_detail',
      'list_admin_claim_resolution_replacement_roll_candidates'
    );
`) === "3", "Cube R Admin read RPC set is incomplete.");

assert(querySql(`
  select pg_catalog.strpos(
    pg_catalog.pg_get_functiondef('public.list_admin_claim_resolution_replacement_roll_candidates(uuid,integer,integer)'::regprocedure),
    'private.resolve_claim_replacement_roll_eligibility'
  ) > 0;
`) === "t", "Replacement candidate resolver must reuse the centralized Product-policy helper.");

assert(querySql(`
  select bool_and(procedure.provolatile = 'v')
  from pg_proc procedure
  join pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname in (
      'list_admin_warranty_claim_resolutions',
      'get_admin_warranty_claim_resolution_detail',
      'list_admin_claim_resolution_replacement_roll_candidates'
    );
`) === "t", "Admin read RPCs must remain VOLATILE because the shared read authorization acquires locks.");

for (const signature of [
  "public.list_admin_warranty_claim_resolutions(integer,integer,text,text)",
  "public.get_admin_warranty_claim_resolution_detail(uuid)",
  "public.list_admin_claim_resolution_replacement_roll_candidates(uuid,integer,integer)",
]) {
  assert(querySql(`select concat_ws('|',
    has_function_privilege('authenticated', ${sqlText(signature)}, 'EXECUTE'),
    has_function_privilege('anon', ${sqlText(signature)}, 'EXECUTE'),
    has_function_privilege('service_role', ${sqlText(signature)}, 'EXECUTE')
  );`) === "t|f|f", `${signature} grants must be authenticated-only with in-function authorization.`);
}

const adminToken = await signIn("cube-j-admin@example.test");
const centerToken = await signIn("cube-j-center-a@example.test");
const adminProfileId = querySql(`
  select profile.id
  from public.profiles profile
  join auth.users auth_user on auth_user.id = profile.id
  where auth_user.email = 'cube-j-admin@example.test'
    and profile.role = 'admin'
    and profile.status = 'active'
  limit 1;
`);
const centerPartyId = querySql(`
  select party.id
  from public.operational_parties party
  join public.installation_centers center on center.id = party.installation_center_id
  where party.party_type = 'center'
    and center.code = 'CUBE-J-CENTER-A'
    and center.status = 'active'
  limit 1;
`);
const otherCenterPartyId = querySql(`
  select party.id
  from public.operational_parties party
  join public.installation_centers center on center.id = party.installation_center_id
  where party.party_type = 'center'
    and center.code = 'CUBE-J-CENTER-B'
    and center.status = 'active'
  limit 1;
`);
const productId = querySql(`
  select id
  from public.products
  where status = 'active' and product_type = 'PPF'
  order by created_at, id
  limit 1;
`);
assert(adminProfileId && centerPartyId && otherCenterPartyId && productId,
  "Required Admin/Center/Product fixtures are missing for Admin read verification.");

async function createProductionRoll(label, custodianPartyId = centerPartyId) {
  const order = await userRpc("create_production_order", {
    p_request_id: randomUUID(),
    p_product_id: productId,
    p_production_date: "2026-08-27",
    p_lots: [{ quantity: 1, source_reference: label }],
    p_source_reference: label,
    p_notes: `Cube R Admin reads ${label}`,
  }, adminToken);
  assert(order.response.ok && /^[0-9a-f-]{36}$/i.test(String(order.body)),
    `Could not create ${label} Production Order: ${order.response.status} ${JSON.stringify(order.body)}`);

  const [rollId, serial] = querySql(`
    select concat_ws('|', roll.id, roll.serial_number)
    from public.rolls roll
    where roll.production_order_id = ${sqlUuid(order.body)}
    order by roll.roll_index
    limit 1;
  `).split("|");
  assert(rollId && serial, `Could not read ${label} Roll identity.`);

  runSql(`
    update public.roll_custody_current
    set custodian_party_id = ${sqlUuid(custodianPartyId)}, confirmed_at = now()
    where roll_id = ${sqlUuid(rollId)};

    insert into public.roll_custody_events (roll_id, custody_sequence, custodian_party_id, confirmed_at)
    values (
      ${sqlUuid(rollId)},
      (select coalesce(max(event.custody_sequence), 0) + 1 from public.roll_custody_events event where event.roll_id = ${sqlUuid(rollId)}),
      ${sqlUuid(custodianPartyId)},
      now()
    );
  `);

  return { rollId, serial };
}

async function createAssignedReplacementResolution() {
  const warrantySource = await createProductionRoll("ADMIN-READ-WARRANTY");
  const opening = await userRpc("open_roll", {
    p_request_id: randomUUID(),
    p_roll_serial: warrantySource.serial,
  }, centerToken);
  assert(opening.response.ok && opening.body === warrantySource.rollId,
    `Could not open Warranty source Roll: ${opening.response.status} ${JSON.stringify(opening.body)}`);

  const activation = await userRpc("activate_roll_warranty", {
    p_request_id: randomUUID(),
    p_roll_serial: warrantySource.serial,
    p_customer_name: "Cube R Admin Read Customer",
    p_customer_phone: "+201000000891",
    p_customer_email: "cube-r-admin-read@example.test",
    p_vehicle_make: "Test",
    p_vehicle_model: "Admin Read",
    p_vehicle_year: 2026,
    p_vehicle_plate: "R-READ",
    p_vehicle_color: "Black",
    p_vehicle_vin: "ADMINREAD12345678",
  }, centerToken);
  const warrantyId = Array.isArray(activation.body)
    ? activation.body[0]?.warranty_id
    : activation.body?.warranty_id ?? activation.body;
  assert(activation.response.ok && /^[0-9a-f-]{36}$/i.test(String(warrantyId)),
    `Could not activate Admin read Warranty: ${activation.response.status} ${JSON.stringify(activation.body)}`);

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
      'other', 'الجزء الأمامي', 'Approved/open fixture for Cube R Admin operational read verification.',
      'approved', now() - interval '2 seconds', null, now() - interval '3 seconds', now() - interval '1 second',
      ${sqlUuid(adminProfileId)}, 'Cube R Admin read verifier approval.',
      'تم اعتماد المطالبة لاستكمال المعالجة.', now() - interval '1 second'
    );

    insert into public.warranty_claim_resolutions (
      id, claim_id, status, authorized_by_profile_id, authorized_at, created_at, updated_at
    ) values (
      ${sqlUuid(resolutionId)}, ${sqlUuid(claimId)}, 'authorized',
      ${sqlUuid(adminProfileId)}, now(), now(), now()
    );
  `);

  const assignment = await userRpc("assign_warranty_claim_resolution", {
    p_action_request_id: randomUUID(),
    p_resolution_id: resolutionId,
    p_remedy_kind: "replacement_roll_reinstall",
    p_performing_center_party_id: centerPartyId,
  }, adminToken);
  assert(assignment.response.ok && assignment.body === resolutionId,
    `Could not assign Admin read Resolution: ${assignment.response.status} ${JSON.stringify(assignment.body)}`);

  return { warrantyId, claimId, claimNumber, resolutionId };
}

const fixture = await createAssignedReplacementResolution();
const validCandidate = await createProductionRoll("ADMIN-READ-VALID");
const openedCandidate = await createProductionRoll("ADMIN-READ-OPENED");
const otherCenterCandidate = await createProductionRoll("ADMIN-READ-OTHER-CENTER", otherCenterPartyId);

const opened = await userRpc("open_roll", {
  p_request_id: randomUUID(),
  p_roll_serial: openedCandidate.serial,
}, centerToken);
assert(opened.response.ok && opened.body === openedCandidate.rollId,
  `Could not open excluded candidate Roll: ${opened.response.status} ${JSON.stringify(opened.body)}`);

const adminList = await userRpc("list_admin_warranty_claim_resolutions", {
  p_limit: 100,
  p_offset: 0,
  p_scope: "open",
  p_status: "assigned",
}, adminToken);
assert(adminList.response.ok && Array.isArray(adminList.body),
  `Admin Resolution list failed: ${adminList.response.status} ${JSON.stringify(adminList.body)}`);
const listRow = adminList.body.find((row) => row.resolution_id === fixture.resolutionId);
assert(listRow?.claim_number === fixture.claimNumber
  && listRow?.resolution_status === "assigned"
  && listRow?.remedy_kind === "replacement_roll_reinstall"
  && listRow?.performing_center_party_id === centerPartyId,
  "Admin Resolution queue must project the assigned Claim/Center/remedy accurately.");

const detailBefore = await userRpc("get_admin_warranty_claim_resolution_detail", {
  p_resolution_id: fixture.resolutionId,
}, adminToken);
assert(detailBefore.response.ok && Array.isArray(detailBefore.body) && detailBefore.body.length === 1,
  `Admin Resolution detail failed: ${detailBefore.response.status} ${JSON.stringify(detailBefore.body)}`);
assert(detailBefore.body[0].resolution_status === "assigned"
  && detailBefore.body[0].claim_number === fixture.claimNumber
  && detailBefore.body[0].allocation_id === null
  && Number(detailBefore.body[0].active_operator_count) >= 1,
  "Admin detail must show assigned state, Claim identity, actionable Center and no material before reservation.");

const candidates = await userRpc("list_admin_claim_resolution_replacement_roll_candidates", {
  p_resolution_id: fixture.resolutionId,
  p_limit: 100,
  p_offset: 0,
}, adminToken);
assert(candidates.response.ok && Array.isArray(candidates.body),
  `Replacement candidate resolver failed: ${candidates.response.status} ${JSON.stringify(candidates.body)}`);
assert(candidates.body.some((row) => row.roll_id === validCandidate.rollId
  && row.product_eligibility_basis === "same_product_default"),
  "Valid same-Product Roll in performing-Center custody must be offered with the centralized policy basis.");
assert(!candidates.body.some((row) => row.roll_id === openedCandidate.rollId),
  "Already-opened Roll must not appear in the replacement candidate resolver.");
assert(!candidates.body.some((row) => row.roll_id === otherCenterCandidate.rollId),
  "Roll outside the performing Center's confirmed custody must not appear in the candidate resolver.");

await expectRpcError("list_admin_warranty_claim_resolutions", {
  p_limit: 10, p_offset: 0, p_scope: "open", p_status: null,
}, centerToken, "PG_CLAIM_ADMIN_REQUIRED");
await expectRpcError("get_admin_warranty_claim_resolution_detail", {
  p_resolution_id: fixture.resolutionId,
}, centerToken, "PG_CLAIM_ADMIN_REQUIRED");
await expectRpcError("list_admin_claim_resolution_replacement_roll_candidates", {
  p_resolution_id: fixture.resolutionId, p_limit: 10, p_offset: 0,
}, centerToken, "PG_CLAIM_ADMIN_REQUIRED");

const reservation = await userRpc("reserve_claim_resolution_roll", {
  p_action_request_id: randomUUID(),
  p_resolution_id: fixture.resolutionId,
  p_roll_id: validCandidate.rollId,
}, adminToken);
assert(reservation.response.ok && /^[0-9a-f-]{36}$/i.test(String(reservation.body)),
  `Could not reserve read-layer candidate Roll: ${reservation.response.status} ${JSON.stringify(reservation.body)}`);

const detailAfter = await userRpc("get_admin_warranty_claim_resolution_detail", {
  p_resolution_id: fixture.resolutionId,
}, adminToken);
assert(detailAfter.response.ok && detailAfter.body?.length === 1,
  `Admin detail after reservation failed: ${detailAfter.response.status} ${JSON.stringify(detailAfter.body)}`);
const projected = detailAfter.body[0];
assert(projected.allocation_id === reservation.body
  && projected.allocation_status === "reserved"
  && projected.replacement_roll_id === validCandidate.rollId
  && projected.replacement_roll_serial === validCandidate.serial
  && projected.product_eligibility_basis === "same_product_default"
  && projected.replacement_quality_state === "none",
  "Admin detail must project the exact reserved replacement material and current physical/quality state.");

const candidatesAfterReservation = await userRpc("list_admin_claim_resolution_replacement_roll_candidates", {
  p_resolution_id: fixture.resolutionId,
  p_limit: 100,
  p_offset: 0,
}, adminToken);
assert(candidatesAfterReservation.response.ok && Array.isArray(candidatesAfterReservation.body)
  && candidatesAfterReservation.body.length === 0,
  "An active reserved/consumed allocation must suppress browsing for a hidden second replacement Roll.");

const anonCandidateAttempt = await rpc("list_admin_claim_resolution_replacement_roll_candidates", {
  p_resolution_id: fixture.resolutionId,
  p_limit: 10,
  p_offset: 0,
}, anonKey, anonKey);
assert(!anonCandidateAttempt.response.ok,
  "Anonymous role must not execute the Admin replacement candidate resolver.");

console.log("Cube R Admin Resolution read foundation PASS: Admin-only queue/detail, centralized-policy replacement candidates, physical exclusions, and reserved-material projection.");
