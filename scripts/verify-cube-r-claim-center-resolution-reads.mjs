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
  assert(name, "Supabase database container was not found for Cube R Center read verification.");
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

const signatures = [
  "public.list_center_assigned_warranty_claim_resolution_tasks(integer,integer)",
  "public.get_center_warranty_claim_resolution_task(uuid)",
  "public.list_center_warranty_claim_resolution_evidence(uuid)",
];

assert(querySql(`
  select count(*)
  from pg_proc procedure
  join pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname in (
      'list_center_assigned_warranty_claim_resolution_tasks',
      'get_center_warranty_claim_resolution_task',
      'list_center_warranty_claim_resolution_evidence'
    );
`) === "3", "Cube R Center assigned-task read RPC set is incomplete.");

assert(querySql(`
  select bool_and(procedure.provolatile = 'v')
  from pg_proc procedure
  join pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname in (
      'list_center_assigned_warranty_claim_resolution_tasks',
      'get_center_warranty_claim_resolution_task',
      'list_center_warranty_claim_resolution_evidence'
    );
`) === "t", "Center task read RPCs must remain VOLATILE because shared authorization acquires locks.");

for (const signature of signatures) {
  assert(querySql(`select concat_ws('|',
    has_function_privilege('authenticated', ${sqlText(signature)}, 'EXECUTE'),
    has_function_privilege('anon', ${sqlText(signature)}, 'EXECUTE'),
    has_function_privilege('service_role', ${sqlText(signature)}, 'EXECUTE')
  );`) === "t|f|f", `${signature} grants must be authenticated-only with in-function authorization.`);
}

const forbiddenSurfaceTerms = [
  "customer_name",
  "customer_phone",
  "customer_email",
  "decision_reason",
  "decided_by_profile_id",
  "allocation_id",
  "product_eligibility_basis",
  "performing_center_party_id",
  "assigned_by_profile_id",
  "erp_serial",
];
for (const signature of signatures) {
  const resultShape = querySql(`select lower(pg_catalog.pg_get_function_result(${sqlText(signature)}::regprocedure));`);
  for (const term of forbiddenSurfaceTerms) {
    assert(!resultShape.includes(term), `${signature} must not expose forbidden field ${term}.`);
  }
}

const adminToken = await signIn("cube-j-admin@example.test");
const centerAToken = await signIn("cube-j-center-a@example.test");
const centerBToken = await signIn("cube-j-center-b@example.test");

const adminProfileId = querySql(`
  select profile.id
  from public.profiles profile
  join auth.users auth_user on auth_user.id = profile.id
  where auth_user.email = 'cube-j-admin@example.test'
    and profile.role = 'admin'
    and profile.status = 'active'
  limit 1;
`);
const centerAProfileId = querySql(`
  select profile.id
  from public.profiles profile
  join auth.users auth_user on auth_user.id = profile.id
  where auth_user.email = 'cube-j-center-a@example.test'
    and profile.role = 'center'
    and profile.status = 'active'
  limit 1;
`);
const centerBProfileId = querySql(`
  select profile.id
  from public.profiles profile
  join auth.users auth_user on auth_user.id = profile.id
  where auth_user.email = 'cube-j-center-b@example.test'
    and profile.role = 'center'
    and profile.status = 'active'
  limit 1;
`);
const centerAPartyId = querySql(`
  select party.id
  from public.operational_parties party
  join public.installation_centers center on center.id = party.installation_center_id
  where party.party_type = 'center'
    and center.code = 'CUBE-J-CENTER-A'
    and center.status = 'active'
  limit 1;
`);
const centerBPartyId = querySql(`
  select party.id
  from public.operational_parties party
  join public.installation_centers center on center.id = party.installation_center_id
  where party.party_type = 'center'
    and center.code = 'CUBE-J-CENTER-B'
    and center.status = 'active'
  limit 1;
`);
const centerBId = querySql(`
  select center.id
  from public.installation_centers center
  where center.code = 'CUBE-J-CENTER-B'
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
assert(adminProfileId && centerAProfileId && centerBProfileId
  && centerAPartyId && centerBPartyId && centerBId && productId,
  "Required Admin/Center/Product fixtures are missing for Center read verification.");

async function createProductionRoll(label, custodianPartyId) {
  const order = await userRpc("create_production_order", {
    p_request_id: randomUUID(),
    p_product_id: productId,
    p_production_date: "2026-08-27",
    p_lots: [{ quantity: 1, source_reference: label }],
    p_source_reference: label,
    p_notes: `Cube R Center reads ${label}`,
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
      (select coalesce(max(event.custody_sequence), 0) + 1
       from public.roll_custody_events event
       where event.roll_id = ${sqlUuid(rollId)}),
      ${sqlUuid(custodianPartyId)},
      now()
    );
  `);

  return { rollId, serial };
}

async function createAssignedResolution() {
  const warrantySource = await createProductionRoll("CENTER-READ-WARRANTY", centerAPartyId);
  const opening = await userRpc("open_roll", {
    p_request_id: randomUUID(),
    p_roll_serial: warrantySource.serial,
  }, centerAToken);
  assert(opening.response.ok && opening.body === warrantySource.rollId,
    `Could not open Center-read Warranty source Roll: ${opening.response.status} ${JSON.stringify(opening.body)}`);

  const activation = await userRpc("activate_roll_warranty", {
    p_request_id: randomUUID(),
    p_roll_serial: warrantySource.serial,
    p_customer_name: "Private Customer Must Not Leak",
    p_customer_phone: "+201000000892",
    p_customer_email: "private-center-read@example.test",
    p_vehicle_make: "Test",
    p_vehicle_model: "Center Read",
    p_vehicle_year: 2026,
    p_vehicle_plate: "R-CENTER",
    p_vehicle_color: "Blue",
    p_vehicle_vin: "CENTERREAD1234567",
  }, centerAToken);
  const warrantyId = Array.isArray(activation.body)
    ? activation.body[0]?.warranty_id
    : activation.body?.warranty_id ?? activation.body;
  assert(activation.response.ok && /^[0-9a-f-]{36}$/i.test(String(warrantyId)),
    `Could not activate Center-read Warranty: ${activation.response.status} ${JSON.stringify(activation.body)}`);

  const claimId = randomUUID();
  const inspectionId = randomUUID();
  const resolutionId = randomUUID();
  const claimNumber = nextClaimNumber();
  const customerEvidencePath = `claims/${claimId}/customer/1-center-read.jpg`;
  const inspectionEvidencePath = `inspections/${inspectionId}/1-${"a".repeat(64)}.jpg`;

  runSql(`
    insert into public.warranty_claims (
      id, request_id, warranty_id, claim_number, category, affected_area, description,
      status, submitted_at, closed_at, created_at, updated_at,
      decided_by_profile_id, decision_reason, customer_decision_message, decided_at
    ) values (
      ${sqlUuid(claimId)}, ${sqlUuid(randomUUID())}, ${sqlUuid(warrantyId)}, ${sqlText(claimNumber)},
      'other', 'الجزء الأمامي', 'Approved/open fixture for exact Cube R Center task read verification.',
      'approved', now() - interval '5 seconds', null, now() - interval '6 seconds', now() - interval '1 second',
      ${sqlUuid(adminProfileId)}, 'Private Admin approval reason that must never reach the Center read model.',
      'تم اعتماد المطالبة لاستكمال المعالجة.', now() - interval '1 second'
    );

    insert into public.warranty_claim_evidence (
      claim_id, evidence_kind, storage_path, mime_type, size_bytes, created_at
    ) values (
      ${sqlUuid(claimId)}, 'customer_submission', ${sqlText(customerEvidencePath)},
      'image/jpeg', 12345, now() - interval '4 seconds'
    );

    insert into public.warranty_claim_inspections (
      id, claim_id, status, assigned_center_party_id, requested_by_profile_id, requested_at,
      submitted_by_profile_id, technical_observation, suspected_cause, submitted_at, created_at, updated_at
    ) values (
      ${sqlUuid(inspectionId)}, ${sqlUuid(claimId)}, 'submitted', ${sqlUuid(centerAPartyId)},
      ${sqlUuid(adminProfileId)}, now() - interval '4 seconds',
      ${sqlUuid(centerAProfileId)},
      'Inspection confirms the affected area and provides execution-relevant technical context.',
      'Surface preparation issue', now() - interval '2 seconds',
      now() - interval '5 seconds', now() - interval '2 seconds'
    );

    -- This read-only regression builds a historical submitted Inspection directly as fixture data.
    -- Seed the matching transient stage immediately before the canonical evidence insert so the
    -- production consume trigger remains fully enforced; no production bypass is introduced.
    insert into private.operational_evidence_stages (
      flow_kind, inspection_id, resolution_id, actor_profile_id, slot,
      storage_path, mime_type, size_bytes, state, created_at
    ) values (
      'inspection', ${sqlUuid(inspectionId)}, null, ${sqlUuid(centerAProfileId)}, 1,
      ${sqlText(inspectionEvidencePath)}, 'image/jpeg', 23456, 'staged', now() - interval '3 seconds'
    );

    insert into public.warranty_claim_inspection_evidence (
      inspection_id, storage_path, mime_type, size_bytes, uploaded_by_profile_id, created_at
    ) values (
      ${sqlUuid(inspectionId)}, ${sqlText(inspectionEvidencePath)},
      'image/jpeg', 23456, ${sqlUuid(centerAProfileId)}, now() - interval '2 seconds'
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
    p_performing_center_party_id: centerAPartyId,
  }, adminToken);
  assert(assignment.response.ok && assignment.body === resolutionId,
    `Could not assign Center-read Resolution: ${assignment.response.status} ${JSON.stringify(assignment.body)}`);

  return {
    claimId,
    claimNumber,
    resolutionId,
    customerEvidencePath,
    inspectionEvidencePath,
  };
}

const fixture = await createAssignedResolution();

const centerAQueue = await userRpc("list_center_assigned_warranty_claim_resolution_tasks", {
  p_limit: 100,
  p_offset: 0,
}, centerAToken);
assert(centerAQueue.response.ok && Array.isArray(centerAQueue.body),
  `Center A task queue failed: ${centerAQueue.response.status} ${JSON.stringify(centerAQueue.body)}`);
const centerAQueueRow = centerAQueue.body.find((row) => row.resolution_id === fixture.resolutionId);
assert(centerAQueueRow?.claim_number === fixture.claimNumber
  && centerAQueueRow?.remedy_kind === "replacement_roll_reinstall"
  && centerAQueueRow?.affected_area === "الجزء الأمامي",
  "Assigned Center queue must project only its exact unresolved Resolution task context.");
for (const forbidden of ["customer_name", "customer_phone", "customer_email", "decision_reason",
  "allocation_id", "product_eligibility_basis", "replacement_roll_serial"]) {
  assert(!(forbidden in centerAQueueRow), `Center queue leaked forbidden/unnecessary field ${forbidden}.`);
}

const centerBQueueBefore = await userRpc("list_center_assigned_warranty_claim_resolution_tasks", {
  p_limit: 100,
  p_offset: 0,
}, centerBToken);
assert(centerBQueueBefore.response.ok
  && Array.isArray(centerBQueueBefore.body)
  && !centerBQueueBefore.body.some((row) => row.resolution_id === fixture.resolutionId),
  "Unassigned Center must not see another Center's Resolution in its task queue.");

const centerADetail = await userRpc("get_center_warranty_claim_resolution_task", {
  p_resolution_id: fixture.resolutionId,
}, centerAToken);
assert(centerADetail.response.ok && Array.isArray(centerADetail.body) && centerADetail.body.length === 1,
  `Center A exact task detail failed: ${centerADetail.response.status} ${JSON.stringify(centerADetail.body)}`);
const firstDetail = centerADetail.body[0];
assert(firstDetail.claim_number === fixture.claimNumber
  && firstDetail.remedy_kind === "replacement_roll_reinstall"
  && firstDetail.vehicle_plate === "R-CENTER"
  && firstDetail.vehicle_vin === "CENTERREAD1234567"
  && firstDetail.inspection_status === "submitted"
  && firstDetail.inspection_technical_observation?.includes("execution-relevant")
  && firstDetail.inspection_suspected_cause === "Surface preparation issue"
  && firstDetail.replacement_roll_serial === null
  && firstDetail.replacement_quality_state === null,
  "Exact Center task detail must contain only the approved execution context before material reservation.");
for (const forbidden of forbiddenSurfaceTerms) {
  assert(!(forbidden in firstDetail), `Center detail leaked forbidden field ${forbidden}.`);
}

const centerAEvidence = await userRpc("list_center_warranty_claim_resolution_evidence", {
  p_resolution_id: fixture.resolutionId,
}, centerAToken);
assert(centerAEvidence.response.ok && Array.isArray(centerAEvidence.body),
  `Center A task evidence metadata failed: ${centerAEvidence.response.status} ${JSON.stringify(centerAEvidence.body)}`);
assert(centerAEvidence.body.length === 2
  && centerAEvidence.body.some((row) => row.evidence_scope === "customer_submission"
    && row.storage_path === fixture.customerEvidencePath)
  && centerAEvidence.body.some((row) => row.evidence_scope === "inspection"
    && row.storage_path === fixture.inspectionEvidencePath),
  "Assigned Center must receive only Claim and submitted-inspection evidence metadata for the exact task.");
for (const row of centerAEvidence.body) {
  assert(Object.keys(row).sort().join("|") === ["created_at", "evidence_scope", "mime_type", "size_bytes", "storage_path"].sort().join("|"),
    "Center evidence projection must remain metadata-only.");
}

await expectRpcError("get_center_warranty_claim_resolution_task", {
  p_resolution_id: fixture.resolutionId,
}, centerBToken, "PG_CLAIM_RESOLUTION_TASK_NOT_FOUND");
await expectRpcError("list_center_warranty_claim_resolution_evidence", {
  p_resolution_id: fixture.resolutionId,
}, centerBToken, "PG_CLAIM_RESOLUTION_TASK_NOT_FOUND");
await expectRpcError("list_center_assigned_warranty_claim_resolution_tasks", {
  p_limit: 10, p_offset: 0,
}, adminToken, "PG_CLAIM_RESOLUTION_CENTER_REQUIRED");

const reassignment = await userRpc("reassign_warranty_claim_resolution", {
  p_action_request_id: randomUUID(),
  p_resolution_id: fixture.resolutionId,
  p_performing_center_party_id: centerBPartyId,
  p_reason: "Move exact fulfillment task to Center B for Center-read authorization regression.",
}, adminToken);
assert(reassignment.response.ok && reassignment.body === fixture.resolutionId,
  `Could not reassign Center-read Resolution: ${reassignment.response.status} ${JSON.stringify(reassignment.body)}`);

const centerAQueueAfter = await userRpc("list_center_assigned_warranty_claim_resolution_tasks", {
  p_limit: 100,
  p_offset: 0,
}, centerAToken);
assert(centerAQueueAfter.response.ok
  && !centerAQueueAfter.body.some((row) => row.resolution_id === fixture.resolutionId),
  "Previous performing Center must lose queue visibility immediately after reassignment.");
await expectRpcError("get_center_warranty_claim_resolution_task", {
  p_resolution_id: fixture.resolutionId,
}, centerAToken, "PG_CLAIM_RESOLUTION_TASK_NOT_FOUND");
await expectRpcError("list_center_warranty_claim_resolution_evidence", {
  p_resolution_id: fixture.resolutionId,
}, centerAToken, "PG_CLAIM_RESOLUTION_TASK_NOT_FOUND");

const centerBQueueAfter = await userRpc("list_center_assigned_warranty_claim_resolution_tasks", {
  p_limit: 100,
  p_offset: 0,
}, centerBToken);
assert(centerBQueueAfter.response.ok
  && centerBQueueAfter.body.some((row) => row.resolution_id === fixture.resolutionId),
  "Current performing Center must gain the reassigned task.");

const centerBEvidence = await userRpc("list_center_warranty_claim_resolution_evidence", {
  p_resolution_id: fixture.resolutionId,
}, centerBToken);
assert(centerBEvidence.response.ok && centerBEvidence.body.length === 2,
  "Relevant Claim/inspection evidence must follow the exact current assigned task, not the historical inspection Center.");

const replacement = await createProductionRoll("CENTER-READ-REPLACEMENT", centerBPartyId);
const reservation = await userRpc("reserve_claim_resolution_roll", {
  p_action_request_id: randomUUID(),
  p_resolution_id: fixture.resolutionId,
  p_roll_id: replacement.rollId,
}, adminToken);
assert(reservation.response.ok && /^[0-9a-f-]{36}$/i.test(String(reservation.body)),
  `Could not reserve Center-read replacement Roll: ${reservation.response.status} ${JSON.stringify(reservation.body)}`);

const detailWithReservation = await userRpc("get_center_warranty_claim_resolution_task", {
  p_resolution_id: fixture.resolutionId,
}, centerBToken);
assert(detailWithReservation.response.ok && detailWithReservation.body?.length === 1,
  `Center B detail after reservation failed: ${detailWithReservation.response.status} ${JSON.stringify(detailWithReservation.body)}`);
assert(detailWithReservation.body[0].replacement_roll_serial === replacement.serial
  && detailWithReservation.body[0].replacement_roll_product_code
  && detailWithReservation.body[0].replacement_roll_product_name
  && detailWithReservation.body[0].replacement_roll_opened_at === null
  && detailWithReservation.body[0].replacement_quality_state === "none",
  "Center detail must expose only the exact reserved replacement Roll operational identity/state.");
assert(!("allocation_id" in detailWithReservation.body[0])
  && !("product_eligibility_basis" in detailWithReservation.body[0]),
  "Center detail must not expose allocation UUID or Product-policy basis.");

const replacementOpening = await userRpc("open_roll", {
  p_request_id: randomUUID(),
  p_roll_serial: replacement.serial,
}, centerBToken);
assert(replacementOpening.response.ok && replacementOpening.body === replacement.rollId,
  `Assigned Center could not open exact reserved replacement Roll: ${replacementOpening.response.status} ${JSON.stringify(replacementOpening.body)}`);

const detailAfterOpening = await userRpc("get_center_warranty_claim_resolution_task", {
  p_resolution_id: fixture.resolutionId,
}, centerBToken);
assert(detailAfterOpening.response.ok
  && detailAfterOpening.body?.[0]?.replacement_roll_serial === replacement.serial
  && typeof detailAfterOpening.body[0].replacement_roll_opened_at === "string",
  "Center task detail must reflect the exact replacement Roll Opening after Cube J succeeds.");

runSql(`update public.installation_centers set status = 'suspended' where id = ${sqlUuid(centerBId)};`);
await expectRpcError("list_center_assigned_warranty_claim_resolution_tasks", {
  p_limit: 10, p_offset: 0,
}, centerBToken, "PG_WARRANTY_CENTER_INACTIVE");
runSql(`update public.installation_centers set status = 'active' where id = ${sqlUuid(centerBId)};`);

const anonAttempt = await rpc("get_center_warranty_claim_resolution_task", {
  p_resolution_id: fixture.resolutionId,
}, anonKey, anonKey);
assert(!anonAttempt.response.ok,
  "Anonymous role must not execute the Center assigned-task detail RPC.");

console.log("Cube R Center assigned-task reads PASS: exact queue/detail isolation, reassignment revocation, Claim/inspection evidence metadata, reserved Roll projection, and suspended/anonymous denial.");
