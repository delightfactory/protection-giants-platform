import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";

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

async function anonRpc(name, body) {
  return rpc(name, body, anonKey, anonKey);
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
  assert(name, "Supabase database container was not found for Cube R completion verification.");
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
    and procedure.proname = 'complete_warranty_claim_resolution';
`) === "1", "Missing public normal Center completion RPC.");
assert(querySql("select count(*) from public.warranty_claim_resolution_evidence;") === "0",
  "Completion evidence verifier requires a clean evidence table.");
assert(querySql(`
  select count(*)
  from pg_proc procedure
  join pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname in ('consume_claim_resolution_roll', 'consume_warranty_claim_resolution_roll');
`) === "0", "Normal completion must not introduce a standalone consume RPC.");

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
const centerProfileId = querySql(`
  select profile.id
  from public.profiles profile
  join auth.users auth_user on auth_user.id = profile.id
  where auth_user.email = 'cube-j-center-a@example.test'
    and profile.role = 'center'
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
const productId = querySql(`
  select id
  from public.products
  where status = 'active' and product_type = 'PPF'
  order by created_at, id
  limit 1;
`);
assert(adminProfileId && centerProfileId && centerPartyId && productId,
  "Required Admin/Center/Product fixtures are missing.");

async function createProductionRoll(label) {
  const order = await userRpc("create_production_order", {
    p_request_id: randomUUID(),
    p_product_id: productId,
    p_production_date: "2026-08-27",
    p_lots: [{ quantity: 1, source_reference: label }],
    p_source_reference: label,
    p_notes: `Cube R normal completion ${label}`,
  }, adminToken);
  assert(order.response.ok && /^[0-9a-f-]{36}$/i.test(String(order.body)),
    `Could not create ${label} Production Order: ${order.response.status} ${JSON.stringify(order.body)}`);

  const [rollId, serial, publicCode] = querySql(`
    select concat_ws('|', roll.id, roll.serial_number, identity.public_code)
    from public.rolls roll
    join private.roll_public_identities identity on identity.roll_id = roll.id
    where roll.production_order_id = ${sqlUuid(order.body)}
    order by roll.roll_index
    limit 1;
  `).split("|");
  assert(rollId && serial && /^[0-9a-f]{64}$/.test(publicCode), `Could not read ${label} Roll identity.`);

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

  return { orderId: order.body, rollId, serial, publicCode };
}

async function createAssignedResolution(label, remedyKind, phoneSuffix) {
  const warrantySource = await createProductionRoll(`${label}-WARRANTY`);
  const opening = await userRpc("open_roll", {
    p_request_id: randomUUID(),
    p_roll_serial: warrantySource.serial,
  }, centerToken);
  assert(opening.response.ok && opening.body === warrantySource.rollId,
    `Could not open ${label} Warranty source Roll: ${opening.response.status} ${JSON.stringify(opening.body)}`);

  const activation = await userRpc("activate_roll_warranty", {
    p_request_id: randomUUID(),
    p_roll_serial: warrantySource.serial,
    p_customer_name: `Cube R ${label}`,
    p_customer_phone: `+20100000${phoneSuffix}`,
    p_customer_email: null,
    p_vehicle_make: "Test",
    p_vehicle_model: label,
    p_vehicle_year: 2026,
    p_vehicle_plate: label.slice(0, 8),
    p_vehicle_color: "Black",
    p_vehicle_vin: `${label.replaceAll("-", "").slice(0, 10)}1234567`.slice(0, 17),
  }, centerToken);
  const warrantyId = Array.isArray(activation.body)
    ? activation.body[0]?.warranty_id
    : activation.body?.warranty_id ?? activation.body;
  assert(activation.response.ok && /^[0-9a-f-]{36}$/i.test(String(warrantyId)),
    `Could not activate ${label} Warranty: ${activation.response.status} ${JSON.stringify(activation.body)}`);

  const originalCoverageExpiresAt = querySql(`
    select coverage_expires_at::text from public.warranties where id = ${sqlUuid(warrantyId)};
  `);
  const claimId = randomUUID();
  const resolutionId = randomUUID();
  runSql(`
    insert into public.warranty_claims (
      id, request_id, warranty_id, claim_number, category, affected_area, description,
      status, submitted_at, closed_at, created_at, updated_at,
      decided_by_profile_id, decision_reason, customer_decision_message, decided_at
    ) values (
      ${sqlUuid(claimId)}, ${sqlUuid(randomUUID())}, ${sqlUuid(warrantyId)}, ${sqlText(nextClaimNumber())},
      'other', 'الجزء الأمامي',
      'Approved/open Cube R fixture for normal Center completion verification.',
      'approved', now() - interval '2 seconds', null, now() - interval '3 seconds', now() - interval '1 second',
      ${sqlUuid(adminProfileId)}, 'Cube R normal completion verifier approval.',
      'تم اعتماد المطالبة لاختبار إتمام المعالجة.', now() - interval '1 second'
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
    p_remedy_kind: remedyKind,
    p_performing_center_party_id: centerPartyId,
  }, adminToken);
  assert(assignment.response.ok && assignment.body === resolutionId,
    `Could not assign ${label} Resolution: ${assignment.response.status} ${JSON.stringify(assignment.body)}`);

  return { warrantySource, warrantyId, claimId, resolutionId, originalCoverageExpiresAt };
}

async function uploadCompletionEvidence(resolutionId, slot, label) {
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Buffer.from(`cube-r-completion-${label}-${resolutionId}-${slot}`)]);
  const digest = createHash("sha256").update(bytes).digest("hex");
  const path = `resolutions/${resolutionId}/completion/${slot}-${digest}.jpg`;
  const upload = await request(`/storage/v1/object/warranty-claim-evidence/${path}`, {
    method: "POST",
    rawBody: bytes,
    contentType: "image/jpeg",
  });
  assert(upload.response.ok,
    `Could not upload ${label} completion evidence: ${upload.response.status} ${JSON.stringify(upload.body)}`);
  return path;
}

async function publicState(publicCode) {
  const result = await anonRpc("resolve_public_warranty", { p_public_code: publicCode });
  assert(result.response.ok && Array.isArray(result.body) && result.body.length === 1,
    `Public Warranty resolver failed: ${result.response.status} ${JSON.stringify(result.body)}`);
  return result.body[0].public_state;
}

// Service/reinstall: evidence is required, replacement scan is forbidden, and
// completion closes only the approved Claim/Resolution without material mutation.
const serviceCase = await createAssignedResolution("SERVICE-COMPLETE", "service_reinstall", "0881");
const serviceEvidence = await uploadCompletionEvidence(serviceCase.resolutionId, 1, "service");

await expectRpcError("complete_warranty_claim_resolution", {
  p_action_request_id: randomUUID(),
  p_resolution_id: serviceCase.resolutionId,
  p_completion_note: "Service reinstall completed with documented final inspection.",
  p_evidence_paths: [serviceEvidence],
  p_replacement_roll_serial: "NOT-USED-FOR-SERVICE",
}, centerToken, "PG_CLAIM_RESOLUTION_REPLACEMENT_SCAN_INVALID");

assert(querySql(`
  select concat_ws('|', resolution.status, claim.closed_at is null)
  from public.warranty_claim_resolutions resolution
  join public.warranty_claims claim on claim.id = resolution.claim_id
  where resolution.id = ${sqlUuid(serviceCase.resolutionId)};
`) === "assigned|t", "Rejected service completion must leave Resolution assigned and Claim open.");

const serviceRequestId = randomUUID();
const serviceNote = "Service reinstall completed with documented final inspection.";
const serviceCompletion = await userRpc("complete_warranty_claim_resolution", {
  p_action_request_id: serviceRequestId,
  p_resolution_id: serviceCase.resolutionId,
  p_completion_note: serviceNote,
  p_evidence_paths: [serviceEvidence],
  p_replacement_roll_serial: null,
}, centerToken);
assert(serviceCompletion.response.ok && serviceCompletion.body === serviceCase.resolutionId,
  `Service completion failed: ${serviceCompletion.response.status} ${JSON.stringify(serviceCompletion.body)}`);

const serviceRetry = await userRpc("complete_warranty_claim_resolution", {
  p_action_request_id: serviceRequestId,
  p_resolution_id: serviceCase.resolutionId,
  p_completion_note: serviceNote,
  p_evidence_paths: [serviceEvidence],
  p_replacement_roll_serial: null,
}, centerToken);
assert(serviceRetry.response.ok && serviceRetry.body === serviceCase.resolutionId,
  "Exact service completion retry must return the completed Resolution.");

await expectRpcError("complete_warranty_claim_resolution", {
  p_action_request_id: serviceRequestId,
  p_resolution_id: serviceCase.resolutionId,
  p_completion_note: "Conflicting note under the same completion action request.",
  p_evidence_paths: [serviceEvidence],
  p_replacement_roll_serial: null,
}, centerToken, "PG_CLAIM_RESOLUTION_ACTION_REQUEST_CONFLICT");

assert(querySql(`
  select concat_ws('|',
    resolution.status,
    resolution.completion_actor_kind,
    resolution.completed_by_profile_id = ${sqlUuid(centerProfileId)},
    claim.status,
    claim.closed_at is not null,
    (select count(*) from public.warranty_claim_resolution_evidence evidence where evidence.resolution_id = resolution.id),
    (select count(*) from public.warranty_claim_resolution_roll_allocations allocation where allocation.resolution_id = resolution.id and allocation.status in ('reserved','consumed')),
    (select count(*) from public.warranty_claim_resolution_events event where event.resolution_id = resolution.id and event.event_kind = 'resolution_completed')
  )
  from public.warranty_claim_resolutions resolution
  join public.warranty_claims claim on claim.id = resolution.claim_id
  where resolution.id = ${sqlUuid(serviceCase.resolutionId)};
`) === "completed|center|t|approved|t|1|0|1",
  "Service completion must atomically close Claim/Resolution with one immutable evidence row and no material consumption.");
assert(querySql(`select coverage_expires_at::text from public.warranties where id = ${sqlUuid(serviceCase.warrantyId)};`) === serviceCase.originalCoverageExpiresAt,
  "Service completion must not change the original Warranty expiry.");

// Replacement/reinstall: pending K issue blocks, wrong scan blocks, then one exact
// transaction consumes the reserved Roll, completes Resolution and closes Claim.
const replacementCase = await createAssignedResolution("REPLACE-COMPLETE", "replacement_roll_reinstall", "0882");
const replacementRoll = await createProductionRoll("REPLACE-COMPLETE-MATERIAL");
const reservation = await userRpc("reserve_claim_resolution_roll", {
  p_action_request_id: randomUUID(),
  p_resolution_id: replacementCase.resolutionId,
  p_roll_id: replacementRoll.rollId,
}, adminToken);
assert(reservation.response.ok && /^[0-9a-f-]{36}$/i.test(String(reservation.body)),
  `Could not reserve completion replacement Roll: ${reservation.response.status} ${JSON.stringify(reservation.body)}`);

const replacementOpening = await userRpc("open_roll", {
  p_request_id: randomUUID(),
  p_roll_serial: replacementRoll.serial,
}, centerToken);
assert(replacementOpening.response.ok && replacementOpening.body === replacementRoll.rollId,
  `Could not open completion replacement Roll: ${replacementOpening.response.status} ${JSON.stringify(replacementOpening.body)}`);

const replacementEvidence = await uploadCompletionEvidence(replacementCase.resolutionId, 1, "replacement");
const issueId = randomUUID();
const issue = await userRpc("create_roll_preinstall_issue", {
  p_request_id: randomUUID(),
  p_issue_id: issueId,
  p_roll_serial: replacementRoll.serial,
  p_category: "physical_damage",
  p_description: "Pending quality review must block replacement Claim completion.",
  p_evidence_paths: [],
}, centerToken);
assert(issue.response.ok && issue.body === issueId,
  `Could not create completion-blocking Cube K issue: ${issue.response.status} ${JSON.stringify(issue.body)}`);

await expectRpcError("complete_warranty_claim_resolution", {
  p_action_request_id: randomUUID(),
  p_resolution_id: replacementCase.resolutionId,
  p_completion_note: "Replacement reinstall completed after exact material verification.",
  p_evidence_paths: [replacementEvidence],
  p_replacement_roll_serial: replacementRoll.serial,
}, centerToken, "PG_CLAIM_CONSUMPTION_QUALITY_PENDING");

assert(querySql(`
  select concat_ws('|', resolution.status, claim.closed_at is null, allocation.status,
    (select count(*) from public.warranty_claim_resolution_evidence evidence where evidence.resolution_id = resolution.id))
  from public.warranty_claim_resolutions resolution
  join public.warranty_claims claim on claim.id = resolution.claim_id
  join public.warranty_claim_resolution_roll_allocations allocation on allocation.resolution_id = resolution.id
  where resolution.id = ${sqlUuid(replacementCase.resolutionId)};
`) === "assigned|t|reserved|0",
  "Quality-blocked completion must roll back every completion/material/evidence effect.");

runSql(`
  update public.roll_preinstall_issues
  set
    status = 'reported_in_error',
    resolved_by_profile_id = ${sqlUuid(adminProfileId)},
    resolution_reason = 'Verifier clears the temporary pending quality hold.',
    resolved_at = now()
  where id = ${sqlUuid(issueId)};
`);

await expectRpcError("complete_warranty_claim_resolution", {
  p_action_request_id: randomUUID(),
  p_resolution_id: replacementCase.resolutionId,
  p_completion_note: "Replacement reinstall completed after exact material verification.",
  p_evidence_paths: [replacementEvidence],
  p_replacement_roll_serial: `${replacementRoll.serial}-WRONG`,
}, centerToken, "PG_CLAIM_RESOLUTION_REPLACEMENT_SCAN_MISMATCH");

const replacementRequestId = randomUUID();
const replacementNote = "Replacement reinstall completed after exact material verification.";
const replacementCompletion = await userRpc("complete_warranty_claim_resolution", {
  p_action_request_id: replacementRequestId,
  p_resolution_id: replacementCase.resolutionId,
  p_completion_note: replacementNote,
  p_evidence_paths: [replacementEvidence],
  p_replacement_roll_serial: replacementRoll.serial,
}, centerToken);
assert(replacementCompletion.response.ok && replacementCompletion.body === replacementCase.resolutionId,
  `Replacement completion failed: ${replacementCompletion.response.status} ${JSON.stringify(replacementCompletion.body)}`);

const replacementRetry = await userRpc("complete_warranty_claim_resolution", {
  p_action_request_id: replacementRequestId,
  p_resolution_id: replacementCase.resolutionId,
  p_completion_note: replacementNote,
  p_evidence_paths: [replacementEvidence],
  p_replacement_roll_serial: replacementRoll.serial,
}, centerToken);
assert(replacementRetry.response.ok && replacementRetry.body === replacementCase.resolutionId,
  "Exact replacement completion retry must not double-consume material.");

assert(querySql(`
  select concat_ws('|',
    resolution.status,
    resolution.completion_actor_kind,
    claim.status,
    claim.closed_at is not null,
    allocation.status,
    allocation.consumed_by_profile_id = ${sqlUuid(centerProfileId)},
    (select count(*) from public.warranty_claim_resolution_evidence evidence where evidence.resolution_id = resolution.id),
    (select count(*) from public.warranty_claim_resolution_events event where event.resolution_id = resolution.id and event.event_kind = 'replacement_roll_consumed'),
    (select count(*) from public.warranty_claim_resolution_events event where event.resolution_id = resolution.id and event.event_kind = 'resolution_completed')
  )
  from public.warranty_claim_resolutions resolution
  join public.warranty_claims claim on claim.id = resolution.claim_id
  join public.warranty_claim_resolution_roll_allocations allocation on allocation.resolution_id = resolution.id and allocation.roll_id = ${sqlUuid(replacementRoll.rollId)}
  where resolution.id = ${sqlUuid(replacementCase.resolutionId)};
`) === "completed|center|approved|t|consumed|t|1|1|1",
  "Replacement completion must atomically consume exactly one reserved Roll and close Claim/Resolution with immutable evidence/events.");

assert(await publicState(replacementRoll.publicCode) === "unavailable_for_warranty",
  "Consumed replacement Roll Public Code must become unavailable_for_warranty in the same committed lifecycle.");
assert(querySql(`select count(*) from public.warranties where roll_id = ${sqlUuid(replacementRoll.rollId)} and record_state = 'issued';`) === "0",
  "Replacement completion must not issue a new Warranty for consumed material.");
assert(querySql(`select coverage_expires_at::text from public.warranties where id = ${sqlUuid(replacementCase.warrantyId)};`) === replacementCase.originalCoverageExpiresAt,
  "Replacement completion must preserve the original customer Warranty expiry.");

console.log("Cube R atomic normal Center completion PASS for service and replacement remedies, including evidence, K hold, exact scan, consumption, Claim closure and Warranty-term preservation.");