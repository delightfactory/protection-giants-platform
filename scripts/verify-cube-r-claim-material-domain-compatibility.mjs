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
  assert(name, "Supabase database container was not found for Cube R material compatibility verification.");
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
    { encoding: "utf8" },
  ).trim();
}

function sqlUuid(value) {
  assert(/^[0-9a-f-]{36}$/i.test(value), `Unsafe UUID: ${value}`);
  return `'${value}'::uuid`;
}

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

for (const triggerName of [
  "production_orders_claim_allocation_void_guard",
  "roll_preinstall_issues_claim_consumed_guard",
  "roll_transfer_reservations_claim_allocation_guard",
]) {
  assert(querySql(`select count(*) from pg_trigger where not tgisinternal and tgname = '${triggerName}';`) === "1",
    `Missing Cube R material compatibility trigger ${triggerName}.`);
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
assert(adminProfileId, "Active Cube J Admin fixture is required.");
const centerPartyId = querySql(`
  select party.id
  from public.operational_parties party
  join public.installation_centers center on center.id = party.installation_center_id
  where party.party_type = 'center'
    and center.code = 'CUBE-J-CENTER-A'
    and center.status = 'active'
  limit 1;
`);
assert(centerPartyId, "Actionable Center A fixture is required.");
const productId = querySql(`
  select id
  from public.products
  where status = 'active' and product_type = 'PPF'
  order by created_at, id
  limit 1;
`);
assert(productId, "Active PPF Product fixture is required.");

async function createProductionRoll(label) {
  const order = await userRpc("create_production_order", {
    p_request_id: randomUUID(),
    p_product_id: productId,
    p_production_date: "2026-08-27",
    p_lots: [{ quantity: 1, source_reference: label }],
    p_source_reference: label,
    p_notes: `Cube R material compatibility ${label}`,
  }, adminToken);
  assert(order.response.ok && /^[0-9a-f-]{36}$/i.test(String(order.body)),
    `Could not create ${label} Production Order: ${order.response.status} ${JSON.stringify(order.body)}`);

  const row = querySql(`
    select concat_ws('|', roll.id, roll.serial_number)
    from public.rolls roll
    where roll.production_order_id = ${sqlUuid(order.body)}
    order by roll.roll_index
    limit 1;
  `).split("|");
  assert(row.length === 2 && row.every(Boolean), `Could not read ${label} Roll fixture: ${row}`);
  const [rollId, serial] = row;

  runSql(`
    update public.roll_custody_current
    set custodian_party_id = ${sqlUuid(centerPartyId)}, confirmed_at = now()
    where roll_id = ${sqlUuid(rollId)};

    insert into public.roll_custody_events (roll_id, custody_sequence, custodian_party_id, confirmed_at)
    values (
      ${sqlUuid(rollId)},
      (select coalesce(max(event.custody_sequence), 0) + 1 from public.roll_custody_events event where event.roll_id = ${sqlUuid(rollId)}),
      ${sqlUuid(centerPartyId)},
      now()
    );
  `);

  return { orderId: order.body, rollId, serial };
}

// Build a fresh, independent Warranty identity for this verifier so it never
// depends on Claim/Resolution rows left by earlier Cube R scripts.
const warrantySource = await createProductionRoll("CR-MAT-WARRANTY");
const opening = await userRpc("open_roll", {
  p_request_id: randomUUID(),
  p_roll_serial: warrantySource.serial,
}, centerToken);
assert(opening.response.ok && opening.body === warrantySource.rollId,
  `Could not open Warranty source Roll: ${opening.response.status} ${JSON.stringify(opening.body)}`);

const activation = await userRpc("activate_roll_warranty", {
  p_request_id: randomUUID(),
  p_roll_serial: warrantySource.serial,
  p_customer_name: "Cube R Material Compatibility",
  p_customer_phone: "+201000000877",
  p_customer_email: null,
  p_vehicle_make: "Test",
  p_vehicle_model: "Material",
  p_vehicle_year: 2026,
  p_vehicle_plate: "R-MAT",
  p_vehicle_color: "Black",
  p_vehicle_vin: "MATCOMPAT12345678",
}, centerToken);
const warrantyId = Array.isArray(activation.body)
  ? activation.body[0]?.warranty_id
  : activation.body?.warranty_id ?? activation.body;
assert(activation.response.ok && /^[0-9a-f-]{36}$/i.test(String(warrantyId)),
  `Could not activate Warranty source Roll: ${activation.response.status} ${JSON.stringify(activation.body)}`);

const claimId = randomUUID();
const resolutionId = randomUUID();
const claimNumber = `PG-C-9${String(Date.now()).slice(-7)}`;
runSql(`
  insert into public.warranty_claims (
    id, request_id, warranty_id, claim_number, category, affected_area, description,
    status, submitted_at, closed_at, created_at, updated_at,
    decided_by_profile_id, decision_reason, customer_decision_message, decided_at
  ) values (
    ${sqlUuid(claimId)}, ${sqlUuid(randomUUID())}, ${sqlUuid(warrantyId)}, ${sqlText(claimNumber)},
    'other', 'الباب الأمامي',
    'Approved/open Cube R fixture for material-domain compatibility verification.',
    'approved', now() - interval '2 seconds', null, now() - interval '3 seconds', now() - interval '1 second',
    ${sqlUuid(adminProfileId)}, 'Cube R material compatibility verifier approval.',
    'تم اعتماد المطالبة لاختبار توافق خامة الاستبدال.', now() - interval '1 second'
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
  `Could not assign replacement Resolution: ${assignment.response.status} ${JSON.stringify(assignment.body)}`);

// 1) A reserved child Roll blocks Production Order void. Once released, Cube R
// no longer blocks the normal Production lifecycle and an otherwise-unused order may void.
const productionGuard = await createProductionRoll("CR-MAT-PRODUCTION-GUARD");
const productionReserve = await userRpc("reserve_claim_resolution_roll", {
  p_action_request_id: randomUUID(),
  p_resolution_id: resolutionId,
  p_roll_id: productionGuard.rollId,
}, adminToken);
assert(productionReserve.response.ok && /^[0-9a-f-]{36}$/i.test(String(productionReserve.body)),
  `Could not reserve Production guard Roll: ${productionReserve.response.status} ${JSON.stringify(productionReserve.body)}`);

await expectRpcError("void_production_order", {
  p_order_id: productionGuard.orderId,
  p_reason: "Reserved Claim material must preserve Production lineage.",
}, adminToken, "PG_CLAIM_ROLL_PRODUCTION_VOID_BLOCKED");

const releaseProductionGuard = await userRpc("release_claim_resolution_roll", {
  p_action_request_id: randomUUID(),
  p_allocation_id: productionReserve.body,
  p_reason: "Release the unused verifier allocation before normal Production void.",
}, adminToken);
assert(releaseProductionGuard.response.ok && releaseProductionGuard.body === productionReserve.body,
  `Could not release Production guard allocation: ${releaseProductionGuard.response.status} ${JSON.stringify(releaseProductionGuard.body)}`);

const voidAfterRelease = await userRpc("void_production_order", {
  p_order_id: productionGuard.orderId,
  p_reason: "Released Claim history must not block an otherwise valid Production void.",
}, adminToken);
assert(voidAfterRelease.response.ok && voidAfterRelease.body === productionGuard.orderId,
  `Released allocation unexpectedly blocked Production void: ${voidAfterRelease.response.status} ${JSON.stringify(voidAfterRelease.body)}`);

// 2) Reserved material intentionally keeps using Cube J Opening and Cube K Issue.
// Opened Roll Recovery still routes through the mature Transfer reservation gate.
const materialRoll = await createProductionRoll("CR-MAT-K-RECOVERY");
const materialReserve = await userRpc("reserve_claim_resolution_roll", {
  p_action_request_id: randomUUID(),
  p_resolution_id: resolutionId,
  p_roll_id: materialRoll.rollId,
}, adminToken);
assert(materialReserve.response.ok && /^[0-9a-f-]{36}$/i.test(String(materialReserve.body)),
  `Could not reserve Cube K/Recovery Roll: ${materialReserve.response.status} ${JSON.stringify(materialReserve.body)}`);

const materialOpening = await userRpc("open_roll", {
  p_request_id: randomUUID(),
  p_roll_serial: materialRoll.serial,
}, centerToken);
assert(materialOpening.response.ok && materialOpening.body === materialRoll.rollId,
  `Reserved replacement Roll must remain openable by its assigned Center: ${materialOpening.response.status} ${JSON.stringify(materialOpening.body)}`);

await expectRpcError("recover_opened_roll", {
  p_request_id: randomUUID(),
  p_roll_serial: materialRoll.serial,
  p_reason: "Reserved Claim material cannot leave through ordinary Recovery.",
  p_confirm_physical_receipt: true,
}, adminToken, "PG_TRANSFER_ROLL_CLAIM_ALLOCATED");

const issueId = randomUUID();
const issue = await userRpc("create_roll_preinstall_issue", {
  p_request_id: randomUUID(),
  p_issue_id: issueId,
  p_roll_serial: materialRoll.serial,
  p_category: "physical_damage",
  p_description: "Reserved Claim material must keep the ordinary Cube K issue path available.",
  p_evidence_paths: [],
}, centerToken);
assert(issue.response.ok && issue.body === issueId,
  `Reserved replacement Roll must allow Cube K issue reporting: ${issue.response.status} ${JSON.stringify(issue.body)}`);

// End the verifier issue without inventing a Claim-specific issue state, then
// synthesize the future consumed terminal allocation to validate guards before
// the dedicated consume engine is introduced in its own increment.
runSql(`
  update public.roll_preinstall_issues
  set
    status = 'reported_in_error',
    resolved_by_profile_id = ${sqlUuid(adminProfileId)},
    resolution_reason = 'Verifier cleanup before synthetic consumed-state guard checks.',
    resolved_at = now()
  where id = ${sqlUuid(issueId)};

  update public.warranty_claim_resolution_roll_allocations
  set
    status = 'consumed',
    consumed_by_profile_id = ${sqlUuid(adminProfileId)},
    consumed_at = now()
  where id = ${sqlUuid(materialReserve.body)}
    and status = 'reserved';
`);
assert(querySql(`select status from public.warranty_claim_resolution_roll_allocations where id = ${sqlUuid(materialReserve.body)};`) === "consumed",
  "Synthetic consumed allocation fixture was not persisted.");

await expectRpcError("create_roll_preinstall_issue", {
  p_request_id: randomUUID(),
  p_issue_id: randomUUID(),
  p_roll_serial: materialRoll.serial,
  p_category: "other",
  p_description: "Consumed Claim material must not begin another Cube K pre-install issue.",
  p_evidence_paths: [],
}, centerToken, "PG_ROLL_ISSUE_CLAIM_CONSUMED");

await expectRpcError("recover_opened_roll", {
  p_request_id: randomUUID(),
  p_roll_serial: materialRoll.serial,
  p_reason: "Consumed Claim material is terminal and cannot be recovered.",
  p_confirm_physical_receipt: true,
}, adminToken, "PG_TRANSFER_ROLL_CLAIM_ALLOCATED");

await expectRpcError("void_production_order", {
  p_order_id: materialRoll.orderId,
  p_reason: "Consumed Claim material must preserve its Production lineage permanently.",
}, adminToken, "PG_CLAIM_ROLL_PRODUCTION_VOID_BLOCKED");

assert(querySql(`select count(*) from public.roll_openings where roll_id = ${sqlUuid(materialRoll.rollId)};`) === "1",
  "Compatibility checks must preserve the immutable Cube J Opening.");
assert(querySql(`select count(*) from public.roll_transfer_reservations where roll_id = ${sqlUuid(materialRoll.rollId)};`) === "0",
  "Rejected Recovery attempts must not leak a Transfer reservation.");

console.log("Cube R Production / Recovery / Cube K material compatibility verified without introducing consumption or completion engines.");