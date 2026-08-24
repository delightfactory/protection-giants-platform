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
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function request(path, { method = "GET", token = anonKey, key = anonKey, body, prefer = false } = {}) {
  const headers = { apikey: key, Authorization: `Bearer ${token}` };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    if (prefer) headers.Prefer = "return=representation";
  }
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { response, body: await readJson(response) };
}

async function rest(path, token, options = {}) {
  return request(`/rest/v1/${path}`, { ...options, token });
}

async function rpc(name, body, token) {
  return rest(`rpc/${name}`, token, { method: "POST", body });
}

async function signIn(email) {
  const result = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email, password },
  });
  assert(result.response.ok && result.body?.access_token,
    `Could not sign in ${email}: ${result.response.status} ${JSON.stringify(result.body)}`);
  return result.body.access_token;
}

async function expectRpcError(name, body, token, expectedMessage) {
  const result = await rpc(name, body, token);
  assert(!result.response.ok, `${name} unexpectedly succeeded; expected ${expectedMessage}.`);
  assert(result.body?.message === expectedMessage,
    `${name} expected ${expectedMessage}, received ${result.response.status} ${JSON.stringify(result.body)}`);
  return result;
}

function one(result, label) {
  assert(result.response.ok && Array.isArray(result.body) && result.body.length === 1,
    `${label}: ${result.response.status} ${JSON.stringify(result.body)}`);
  return result.body[0];
}

function dbContainerName() {
  const names = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" })
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
  const name = names.find((value) => value.startsWith("supabase_db_"));
  assert(name, "Supabase database container was not found for Cube M activation verification.");
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
  assert(/^[0-9a-f-]{36}$/i.test(value), `Unsafe UUID fixture value: ${value}`);
  return `'${value}'::uuid`;
}

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

const adminToken = await signIn("cube-j-admin@example.test");
const centerAToken = await signIn("cube-j-center-a@example.test");
const centerBToken = await signIn("cube-j-center-b@example.test");

const centerA = one(await rest(
  "installation_centers?code=eq.CUBE-J-CENTER-A&select=id,name,status,approval_status",
  adminToken,
), "Read Cube M Center A");
assert(centerA.status === "active", "Cube M activation Center A must be active.");
assert(centerA.approval_status !== "approved",
  "Cube M must verify Warranty Activation without a network-approval prerequisite.");

const centerAParty = one(await rest(
  `operational_parties?installation_center_id=eq.${centerA.id}&select=id,transfer_code`,
  adminToken,
), "Read Cube M Center A party");
const centerB = one(await rest(
  "installation_centers?code=eq.CUBE-J-CENTER-B&select=id",
  adminToken,
), "Read Cube M Center B");
const centerBParty = one(await rest(
  `operational_parties?installation_center_id=eq.${centerB.id}&select=id,transfer_code`,
  adminToken,
), "Read Cube M Center B party");

const product = one(await rest(
  "products?code=eq.PG-CUBE-J-TEST&select=id,code,name,version_name,default_warranty_months,warranty_coverage,care_instructions,status,publication_status",
  adminToken,
), "Read Cube M Product");
assert(product.publication_status === "draft",
  "Cube M test Product should remain unpublished so publication is proven not to gate Activation.");

const orderRequestId = randomUUID();
const orderResult = await rpc("create_production_order", {
  p_request_id: orderRequestId,
  p_product_id: product.id,
  p_production_date: "2026-08-25",
  p_lots: [{ quantity: 7, source_reference: "CUBE-M-ACTIVATION" }],
  p_source_reference: "CUBE-M-ACTIVATION",
  p_notes: "Cube M atomic activation verification",
}, adminToken);
assert(orderResult.response.ok && typeof orderResult.body === "string",
  `Could not create Cube M production fixture: ${orderResult.response.status} ${JSON.stringify(orderResult.body)}`);
const productionOrderId = orderResult.body;

const rollsResult = await rest(
  `rolls?production_order_id=eq.${encodeURIComponent(productionOrderId)}&select=id,serial_number&order=serial_number.asc`,
  adminToken,
);
assert(rollsResult.response.ok && rollsResult.body.length === 7,
  `Expected seven Cube M Rolls: ${rollsResult.response.status} ${JSON.stringify(rollsResult.body)}`);
const rolls = rollsResult.body;

for (const roll of rolls) {
  runSql(`
    begin;
    update public.roll_custody_current
    set custodian_party_id = ${sqlUuid(centerAParty.id)}, confirmed_at = now()
    where roll_id = ${sqlUuid(roll.id)};
    insert into public.roll_custody_events (
      roll_id, custody_sequence, custodian_party_id, confirmed_at
    ) values (
      ${sqlUuid(roll.id)}, 2, ${sqlUuid(centerAParty.id)}, now()
    );
    commit;
  `);
}

for (const index of [0, 1, 3, 4, 6]) {
  const opened = await rpc("open_roll", {
    p_request_id: randomUUID(),
    p_roll_serial: rolls[index].serial_number,
  }, centerAToken);
  assert(opened.response.ok && opened.body === rolls[index].id,
    `Could not open Cube M Roll ${index}: ${opened.response.status} ${JSON.stringify(opened.body)}`);
}

// Foundation verification intentionally creates manual Warranty numbers. Move
// only this ephemeral local sequence fixture forward so engine numbering remains
// isolated from those test rows while preserving the real sequence behavior.
runSql("select setval('private.warranty_number_seq'::regclass, 101, false);");

for (const role of ["anon", "service_role"]) {
  const allowed = querySql(`
    select has_function_privilege(
      '${role}',
      'public.activate_roll_warranty(uuid,text,text,text,text,text,text,smallint,text,text,text)',
      'EXECUTE'
    );
  `);
  assert(allowed === "f", `${role} must not execute authoritative Warranty Activation.`);
}
assert(querySql(`
  select has_function_privilege(
    'authenticated',
    'public.activate_roll_warranty(uuid,text,text,text,text,text,text,smallint,text,text,text)',
    'EXECUTE'
  );
`) === "t", "authenticated must have explicit Warranty Activation EXECUTE privilege.");

const eligibleCandidate = one(await rpc("resolve_warranty_activation_candidate", {
  p_roll_serial: rolls[0].serial_number.toLowerCase(),
}, centerAToken), "Resolve eligible Warranty candidate");
assert(eligibleCandidate.eligibility === "eligible", `Expected eligible candidate, got ${JSON.stringify(eligibleCandidate)}`);
assert(eligibleCandidate.acting_center_party_id === centerAParty.id,
  "Candidate acting Center must come from authenticated Center truth.");
assert(eligibleCandidate.acting_center_name === centerA.name,
  "Candidate Center name must come from authenticated Center truth.");
assert(eligibleCandidate.product_code === product.code,
  "Candidate Product identity must come from Production snapshot.");

await expectRpcError("resolve_warranty_activation_candidate", {
  p_roll_serial: rolls[0].serial_number,
}, centerBToken, "PG_WARRANTY_NOT_CURRENT_CUSTODIAN");

const activationRequestId = randomUUID();
const activationPayload = {
  p_request_id: activationRequestId,
  p_roll_serial: rolls[0].serial_number.toLowerCase(),
  p_customer_name: "  Cube M Customer  ",
  p_customer_phone: "  +201000111222  ",
  p_customer_email: "  CUSTOMER@EXAMPLE.TEST  ",
  p_vehicle_make: "  Test Make  ",
  p_vehicle_model: "  Test Model  ",
  p_vehicle_year: 2026,
  p_vehicle_plate: "  ABC 123  ",
  p_vehicle_color: "  Black  ",
  p_vehicle_vin: "  abc123xyz789  ",
};
const activated = one(await rpc("activate_roll_warranty", activationPayload, centerAToken), "Activate Cube M Warranty");
assert(/^PG-W-[0-9]{8,}$/.test(activated.warranty_number),
  `Unexpected Warranty Number ${activated.warranty_number}`);
assert(activated.record_state === "issued", "Successful Activation must create issued Warranty.");
assert(activated.customer_name === "Cube M Customer", "Customer name must be normalized.");
assert(activated.customer_phone === "+201000111222", "Customer phone must be normalized.");
assert(activated.customer_email === "customer@example.test", "Customer email must be normalized.");
assert(activated.vehicle_vin === "ABC123XYZ789", "VIN/chassis must be normalized uppercase.");
assert(activated.activating_center_name === centerA.name,
  "Installer Center snapshot must not be caller-supplied free text.");

const persisted = querySql(`
  select concat_ws('|',
    warranty.roll_id,
    warranty.activating_center_party_id,
    warranty.activating_center_name_snapshot,
    warranty.product_code_snapshot,
    warranty.product_name_snapshot,
    coalesce(warranty.product_version_snapshot, ''),
    warranty.warranty_months_snapshot,
    warranty.warranty_coverage_snapshot,
    warranty.care_instructions_snapshot,
    warranty.vehicle_vin,
    (
      warranty.coverage_expires_at = (
        (warranty.activated_at at time zone 'UTC')
        + make_interval(months => warranty.warranty_months_snapshot)
      ) at time zone 'UTC'
    )
  )
  from public.warranties warranty
  where warranty.id = ${sqlUuid(activated.warranty_id)};
`).split("|");
assert(persisted[0] === rolls[0].id, "Persisted Warranty must reference the exact physical Roll.");
assert(persisted[1] === centerAParty.id, "Persisted activating Center party must come from actor context.");
assert(persisted[2] === centerA.name, "Persisted Center-name snapshot must match issuance-time Center truth.");
assert(persisted[3] === product.code && persisted[4] === product.name,
  `Warranty Product identity must match Production snapshot: ${persisted}`);
assert(Number(persisted[6]) === product.default_warranty_months,
  "Warranty duration snapshot must match current Product policy at activation.");
assert(persisted[7] === product.warranty_coverage && persisted[8] === product.care_instructions,
  "Warranty coverage/care snapshots must match one coherent current Product policy.");
assert(persisted[9] === "ABC123XYZ789", "Persisted VIN must be normalized.");
assert(persisted[10] === "t", "Warranty expiry must use authoritative calendar-month arithmetic.");

const activationEventCount = Number(querySql(`
  select count(*)
  from public.warranty_events
  where warranty_id = ${sqlUuid(activated.warranty_id)}
    and event_kind = 'activated'
    and action_request_id = ${sqlUuid(activationRequestId)};
`));
assert(activationEventCount === 1, "Activation must append exactly one matching immutable event.");
assert(querySql(`
  select custodian_party_id from public.roll_custody_current where roll_id = ${sqlUuid(rolls[0].id)};
`) === centerAParty.id, "Warranty Activation must not move confirmed Roll custody.");
assert(querySql(`
  select count(*) from public.roll_openings where roll_id = ${sqlUuid(rolls[0].id)};
`) === "1", "Warranty Activation must not mutate/remove immutable Opening.");

const retry = one(await rpc("activate_roll_warranty", activationPayload, centerAToken), "Retry Cube M Activation");
assert(retry.warranty_id === activated.warranty_id && retry.warranty_number === activated.warranty_number,
  "Matching request retry must return the same Warranty identity.");

await expectRpcError("activate_roll_warranty", {
  ...activationPayload,
  p_customer_phone: "+201000999999",
}, centerAToken, "PG_WARRANTY_REQUEST_CONFLICT");
await expectRpcError("activate_roll_warranty", {
  ...activationPayload,
  p_request_id: randomUUID(),
}, centerAToken, "PG_WARRANTY_ALREADY_ACTIVATED");

const afterActivationCandidate = one(await rpc("resolve_warranty_activation_candidate", {
  p_roll_serial: rolls[0].serial_number,
}, centerAToken), "Resolve already-activated candidate");
assert(afterActivationCandidate.eligibility === "already_activated"
  && afterActivationCandidate.existing_warranty_number === activated.warranty_number,
  `Candidate must surface existing Warranty: ${JSON.stringify(afterActivationCandidate)}`);

const issueCandidateBlocked = one(await rpc("resolve_roll_preinstall_issue_candidate", {
  p_roll_serial: rolls[0].serial_number,
}, centerAToken), "Resolve post-Warranty issue candidate");
assert(issueCandidateBlocked.eligibility === "warranty_activated",
  `Cube K preflight must surface Warranty block: ${JSON.stringify(issueCandidateBlocked)}`);
await expectRpcError("create_roll_preinstall_issue", {
  p_request_id: randomUUID(),
  p_issue_id: randomUUID(),
  p_roll_serial: rolls[0].serial_number,
  p_category: "other",
  p_description: "Post Warranty issue submission must be blocked.",
  p_evidence_paths: [],
}, centerAToken, "PG_ROLL_ISSUE_WARRANTY_ACTIVATED");

const recoveryCandidateBlocked = one(await rpc("resolve_opened_roll_recovery_candidate", {
  p_roll_serial: rolls[0].serial_number,
}, adminToken), "Resolve post-Warranty Recovery candidate");
assert(recoveryCandidateBlocked.eligibility === "warranty_activated",
  `Cube J Recovery preflight must surface Warranty block: ${JSON.stringify(recoveryCandidateBlocked)}`);
await expectRpcError("recover_opened_roll", {
  p_request_id: randomUUID(),
  p_roll_serial: rolls[0].serial_number,
  p_reason: "Warranty already exists; Recovery must be blocked.",
  p_confirm_physical_receipt: true,
}, adminToken, "PG_ROLL_RECOVERY_WARRANTY_ACTIVATED");

// Old request retry remains historical after Admin-style void; a legitimate new
// Activation needs a new request and receives a new Warranty Number.
const centerAProfileId = querySql(`
  select id from public.profiles
  where installation_center_id = ${sqlUuid(centerA.id)} and role = 'center'
  order by created_at, id limit 1;
`);
runSql(`
  update public.warranties
  set
    record_state = 'voided_in_error',
    voided_by_profile_id = ${sqlUuid(centerAProfileId)},
    void_reason = 'Cube M activation engine void fixture.',
    voided_at = now()
  where id = ${sqlUuid(activated.warranty_id)};
  insert into public.warranty_events (
    warranty_id, action_request_id, event_kind, actor_profile_id, reason
  ) values (
    ${sqlUuid(activated.warranty_id)}, ${sqlUuid(randomUUID())}, 'voided_in_error',
    ${sqlUuid(centerAProfileId)}, 'Cube M activation engine void fixture.'
  );
`);
const oldRetryAfterVoid = one(await rpc("activate_roll_warranty", activationPayload, centerAToken), "Retry old request after void");
assert(oldRetryAfterVoid.warranty_id === activated.warranty_id
  && oldRetryAfterVoid.record_state === "voided_in_error",
  "Old request retry after void must reference historical result and never resurrect it.");

const issueCandidateAfterVoid = one(await rpc("resolve_roll_preinstall_issue_candidate", {
  p_roll_serial: rolls[0].serial_number,
}, centerAToken), "Resolve issue candidate after void");
assert(issueCandidateAfterVoid.eligibility === "eligible",
  "Void-in-error must remove only the Warranty-specific Cube K block.");
const recoveryCandidateAfterVoid = one(await rpc("resolve_opened_roll_recovery_candidate", {
  p_roll_serial: rolls[0].serial_number,
}, adminToken), "Resolve Recovery candidate after void");
assert(recoveryCandidateAfterVoid.eligibility === "eligible",
  "Void-in-error must remove only the Warranty-specific Cube J Recovery block.");

const reactivationRequestId = randomUUID();
const reactivated = one(await rpc("activate_roll_warranty", {
  ...activationPayload,
  p_request_id: reactivationRequestId,
}, centerAToken), "Reactivate after void");
assert(reactivated.warranty_id !== activated.warranty_id,
  "Reactivation after void must create a new Warranty row.");
assert(reactivated.warranty_number !== activated.warranty_number,
  "Reactivation after void must allocate a new Warranty Number.");
assert(querySql(`
  select count(*) from public.warranties
  where roll_id = ${sqlUuid(rolls[0].id)} and record_state = 'issued';
`) === "1", "A Roll must still have at most one effective issued Warranty after reactivation.");

// Policy completeness is recoverable, while archive/publication state alone is
// deliberately not an Activation gate for an already-produced Roll.
runSql(`update public.products set warranty_coverage = null where id = ${sqlUuid(product.id)};`);
const incompleteCandidate = one(await rpc("resolve_warranty_activation_candidate", {
  p_roll_serial: rolls[1].serial_number,
}, centerAToken), "Resolve incomplete-policy candidate");
assert(incompleteCandidate.eligibility === "policy_incomplete",
  `Incomplete Product policy must be recoverable preflight state: ${JSON.stringify(incompleteCandidate)}`);
await expectRpcError("activate_roll_warranty", {
  ...activationPayload,
  p_request_id: randomUUID(),
  p_roll_serial: rolls[1].serial_number,
  p_vehicle_vin: "POLICY123456",
}, centerAToken, "PG_WARRANTY_POLICY_INCOMPLETE");
runSql(`
  update public.products
  set warranty_coverage = ${sqlText(product.warranty_coverage)}, status = 'archived'
  where id = ${sqlUuid(product.id)};
`);
const archivedActivation = one(await rpc("activate_roll_warranty", {
  ...activationPayload,
  p_request_id: randomUUID(),
  p_roll_serial: rolls[1].serial_number,
  p_vehicle_vin: "ARCHIVE123456",
}, centerAToken), "Activate archived Product Roll");
assert(archivedActivation.record_state === "issued",
  "Archived/unpublished Product must not strand an otherwise legitimate produced Roll.");
runSql(`update public.products set status = 'active' where id = ${sqlUuid(product.id)};`);

const unopenedCandidate = one(await rpc("resolve_warranty_activation_candidate", {
  p_roll_serial: rolls[2].serial_number,
}, centerAToken), "Resolve unopened candidate");
assert(unopenedCandidate.eligibility === "not_opened",
  `Unopened Roll preflight must be deterministic: ${JSON.stringify(unopenedCandidate)}`);
await expectRpcError("activate_roll_warranty", {
  ...activationPayload,
  p_request_id: randomUUID(),
  p_roll_serial: rolls[2].serial_number,
  p_vehicle_vin: "UNOPEN123456",
}, centerAToken, "PG_WARRANTY_ROLL_NOT_OPENED");

const transferResult = await rpc("create_roll_transfer", {
  p_request_id: randomUUID(),
  p_recipient_transfer_code: centerBParty.transfer_code,
  p_roll_ids: [rolls[5].id],
}, centerAToken);
assert(transferResult.response.ok, `Could not create Cube M reservation fixture: ${JSON.stringify(transferResult.body)}`);
const reservedCandidate = one(await rpc("resolve_warranty_activation_candidate", {
  p_roll_serial: rolls[5].serial_number,
}, centerAToken), "Resolve reserved candidate");
assert(reservedCandidate.eligibility === "transfer_reserved",
  `Reserved Roll preflight must report reservation first: ${JSON.stringify(reservedCandidate)}`);
await expectRpcError("activate_roll_warranty", {
  ...activationPayload,
  p_request_id: randomUUID(),
  p_roll_serial: rolls[5].serial_number,
  p_vehicle_vin: "RESERVE123456",
}, centerAToken, "PG_WARRANTY_TRANSFER_RESERVED");

// Activation vs Issue submission: exactly one transaction wins from the same
// valid pre-state because both preserve Production Order -> current custody.
const issueRaceRequest = randomUUID();
const issueRaceId = randomUUID();
const activationIssueRaceRequest = randomUUID();
const [issueRace, activationIssueRace] = await Promise.all([
  rpc("create_roll_preinstall_issue", {
    p_request_id: issueRaceRequest,
    p_issue_id: issueRaceId,
    p_roll_serial: rolls[3].serial_number,
    p_category: "other",
    p_description: "Concurrent Cube M issue versus activation verification.",
    p_evidence_paths: [],
  }, centerAToken),
  rpc("activate_roll_warranty", {
    ...activationPayload,
    p_request_id: activationIssueRaceRequest,
    p_roll_serial: rolls[3].serial_number,
    p_vehicle_vin: "ISSUERACE123",
  }, centerAToken),
]);
assert([issueRace.response.ok, activationIssueRace.response.ok].filter(Boolean).length === 1,
  `Activation/Issue race must have one winner: issue=${issueRace.response.status} ${JSON.stringify(issueRace.body)} activation=${activationIssueRace.response.status} ${JSON.stringify(activationIssueRace.body)}`);
if (issueRace.response.ok) {
  assert(activationIssueRace.body?.message === "PG_WARRANTY_ISSUE_PENDING",
    `Activation loser must observe issue hold: ${JSON.stringify(activationIssueRace.body)}`);
} else {
  assert(issueRace.body?.message === "PG_ROLL_ISSUE_WARRANTY_ACTIVATED",
    `Issue loser must observe effective Warranty: ${JSON.stringify(issueRace.body)}`);
}

// Activation vs opened-Roll Recovery: exactly one transaction wins. Recovery
// first moves custody; Activation first makes the Recovery reservation guard fail.
const recoveryRaceRequest = randomUUID();
const activationRecoveryRaceRequest = randomUUID();
const [recoveryRace, activationRecoveryRace] = await Promise.all([
  rpc("recover_opened_roll", {
    p_request_id: recoveryRaceRequest,
    p_roll_serial: rolls[4].serial_number,
    p_reason: "Concurrent Cube M Recovery versus activation verification.",
    p_confirm_physical_receipt: true,
  }, adminToken),
  rpc("activate_roll_warranty", {
    ...activationPayload,
    p_request_id: activationRecoveryRaceRequest,
    p_roll_serial: rolls[4].serial_number,
    p_vehicle_vin: "RECOVRACE123",
  }, centerAToken),
]);
assert([recoveryRace.response.ok, activationRecoveryRace.response.ok].filter(Boolean).length === 1,
  `Activation/Recovery race must have one winner: recovery=${recoveryRace.response.status} ${JSON.stringify(recoveryRace.body)} activation=${activationRecoveryRace.response.status} ${JSON.stringify(activationRecoveryRace.body)}`);
if (recoveryRace.response.ok) {
  assert(activationRecoveryRace.body?.message === "PG_WARRANTY_NOT_CURRENT_CUSTODIAN",
    `Activation loser must observe moved custody: ${JSON.stringify(activationRecoveryRace.body)}`);
} else {
  assert(recoveryRace.body?.message === "PG_ROLL_RECOVERY_WARRANTY_ACTIVATED",
    `Recovery loser must observe effective Warranty: ${JSON.stringify(recoveryRace.body)}`);
}

// Two independent Activation requests on one eligible Roll produce one issued
// Warranty. The physical lifecycle locks serialize the decision before insert.
const activationRaceARequest = randomUUID();
const activationRaceBRequest = randomUUID();
const [activationRaceA, activationRaceB] = await Promise.all([
  rpc("activate_roll_warranty", {
    ...activationPayload,
    p_request_id: activationRaceARequest,
    p_roll_serial: rolls[6].serial_number,
    p_vehicle_vin: "ACTRACEA123",
  }, centerAToken),
  rpc("activate_roll_warranty", {
    ...activationPayload,
    p_request_id: activationRaceBRequest,
    p_roll_serial: rolls[6].serial_number,
    p_vehicle_vin: "ACTRACEB123",
  }, centerAToken),
]);
assert([activationRaceA.response.ok, activationRaceB.response.ok].filter(Boolean).length === 1,
  `Concurrent Activations must have one winner: A=${activationRaceA.response.status} ${JSON.stringify(activationRaceA.body)} B=${activationRaceB.response.status} ${JSON.stringify(activationRaceB.body)}`);
const activationRaceLoser = activationRaceA.response.ok ? activationRaceB : activationRaceA;
assert(activationRaceLoser.body?.message === "PG_WARRANTY_ALREADY_ACTIVATED",
  `Activation loser must receive deterministic already_activated: ${JSON.stringify(activationRaceLoser.body)}`);
assert(querySql(`
  select count(*) from public.warranties
  where roll_id = ${sqlUuid(rolls[6].id)} and record_state = 'issued';
`) === "1", "Concurrent Activation race must leave exactly one effective Warranty.");

console.log("Cube M atomic Warranty Activation engine verified.");
