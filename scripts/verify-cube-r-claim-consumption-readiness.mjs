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

function dbContainerName() {
  const names = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" })
    .split("\n").map((value) => value.trim()).filter(Boolean);
  const name = names.find((value) => value.startsWith("supabase_db_"));
  assert(name, "Supabase database container was not found for Cube R consumption readiness verification.");
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

function expectSqlError(sql, expectedMessage) {
  try {
    querySql(sql);
  } catch (error) {
    const stderr = String(error?.stderr ?? "");
    assert(stderr.includes(expectedMessage),
      `Expected SQL error ${expectedMessage}, received: ${stderr || String(error)}`);
    return;
  }
  throw new Error(`SQL unexpectedly succeeded; expected ${expectedMessage}.`);
}

function sqlUuid(value) {
  assert(/^[0-9a-f-]{36}$/i.test(value), `Unsafe UUID: ${value}`);
  return `'${value}'::uuid`;
}

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

assert(
  querySql("select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname = 'require_claim_replacement_roll_consumption_ready';") === "1",
  "Missing private Cube R consumption-readiness boundary.",
);
assert(
  querySql("select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('consume_claim_resolution_roll', 'consume_warranty_claim_resolution_roll');") === "0",
  "Increment 8 must not expose a standalone Claim Roll consume RPC.",
);

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
const productId = querySql(`
  select id
  from public.products
  where status = 'active' and product_type = 'PPF'
  order by created_at, id
  limit 1;
`);
assert(adminProfileId && centerPartyId && productId, "Required Admin/Center/Product fixtures are missing.");

async function createProductionRoll(label) {
  const order = await userRpc("create_production_order", {
    p_request_id: randomUUID(),
    p_product_id: productId,
    p_production_date: "2026-08-27",
    p_lots: [{ quantity: 1, source_reference: label }],
    p_source_reference: label,
    p_notes: `Cube R consumption readiness ${label}`,
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

async function publicState(publicCode) {
  const result = await anonRpc("resolve_public_warranty", { p_public_code: publicCode });
  assert(result.response.ok && Array.isArray(result.body) && result.body.length === 1,
    `Public Warranty resolver failed for ${publicCode}: ${result.response.status} ${JSON.stringify(result.body)}`);
  return result.body[0].public_state;
}

const warrantySource = await createProductionRoll("CR-CONSUME-WARRANTY");
const sourceOpening = await userRpc("open_roll", {
  p_request_id: randomUUID(),
  p_roll_serial: warrantySource.serial,
}, centerToken);
assert(sourceOpening.response.ok && sourceOpening.body === warrantySource.rollId,
  `Could not open consumption verifier Warranty source Roll: ${sourceOpening.response.status} ${JSON.stringify(sourceOpening.body)}`);

const activation = await userRpc("activate_roll_warranty", {
  p_request_id: randomUUID(),
  p_roll_serial: warrantySource.serial,
  p_customer_name: "Cube R Consumption Readiness",
  p_customer_phone: "+201000000878",
  p_customer_email: null,
  p_vehicle_make: "Test",
  p_vehicle_model: "Consume",
  p_vehicle_year: 2026,
  p_vehicle_plate: "R-CONSUME",
  p_vehicle_color: "Black",
  p_vehicle_vin: "CONSUMEREADY12345",
}, centerToken);
const warrantyId = Array.isArray(activation.body)
  ? activation.body[0]?.warranty_id
  : activation.body?.warranty_id ?? activation.body;
assert(activation.response.ok && /^[0-9a-f-]{36}$/i.test(String(warrantyId)),
  `Could not activate verifier Warranty: ${activation.response.status} ${JSON.stringify(activation.body)}`);

const claimId = randomUUID();
const resolutionId = randomUUID();
const claimNumber = `PG-C-8${String(Date.now()).slice(-7)}`;
runSql(`
  insert into public.warranty_claims (
    id, request_id, warranty_id, claim_number, category, affected_area, description,
    status, submitted_at, closed_at, created_at, updated_at,
    decided_by_profile_id, decision_reason, customer_decision_message, decided_at
  ) values (
    ${sqlUuid(claimId)}, ${sqlUuid(randomUUID())}, ${sqlUuid(warrantyId)}, ${sqlText(claimNumber)},
    'other', 'الجزء الأمامي',
    'Approved/open Cube R fixture for consumption-readiness verification.',
    'approved', now() - interval '2 seconds', null, now() - interval '3 seconds', now() - interval '1 second',
    ${sqlUuid(adminProfileId)}, 'Cube R consumption readiness verifier approval.',
    'تم اعتماد المطالبة لاختبار جاهزية خامة الاستبدال.', now() - interval '1 second'
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
  `Could not assign verifier Resolution: ${assignment.response.status} ${JSON.stringify(assignment.body)}`);

const replacement = await createProductionRoll("CR-CONSUME-REPLACEMENT");
const reservation = await userRpc("reserve_claim_resolution_roll", {
  p_action_request_id: randomUUID(),
  p_resolution_id: resolutionId,
  p_roll_id: replacement.rollId,
}, adminToken);
assert(reservation.response.ok && /^[0-9a-f-]{36}$/i.test(String(reservation.body)),
  `Could not reserve verifier replacement Roll: ${reservation.response.status} ${JSON.stringify(reservation.body)}`);

assert(await publicState(replacement.publicCode) === "not_activated",
  "A merely reserved Claim Roll must remain publicly not_activated.");

expectSqlError(
  `select private.require_claim_replacement_roll_consumption_ready(${sqlUuid(resolutionId)}, ${sqlUuid(replacement.rollId)});`,
  "PG_CLAIM_CONSUMPTION_OPENING_INVALID",
);

const replacementOpening = await userRpc("open_roll", {
  p_request_id: randomUUID(),
  p_roll_serial: replacement.serial,
}, centerToken);
assert(replacementOpening.response.ok && replacementOpening.body === replacement.rollId,
  `Could not open reserved replacement Roll: ${replacementOpening.response.status} ${JSON.stringify(replacementOpening.body)}`);

assert(
  querySql(`select private.require_claim_replacement_roll_consumption_ready(${sqlUuid(resolutionId)}, ${sqlUuid(replacement.rollId)});`) === reservation.body,
  "Opened reserved replacement Roll should be consumption-ready before a quality hold.",
);
assert(await publicState(replacement.publicCode) === "not_activated",
  "Opening a reserved Claim Roll must not expose a new public lifecycle state.");

const issueId = randomUUID();
const issue = await userRpc("create_roll_preinstall_issue", {
  p_request_id: randomUUID(),
  p_issue_id: issueId,
  p_roll_serial: replacement.serial,
  p_category: "physical_damage",
  p_description: "Consumption readiness must fail closed while Cube K review is pending.",
  p_evidence_paths: [],
}, centerToken);
assert(issue.response.ok && issue.body === issueId,
  `Could not create verifier Cube K issue: ${issue.response.status} ${JSON.stringify(issue.body)}`);

expectSqlError(
  `select private.require_claim_replacement_roll_consumption_ready(${sqlUuid(resolutionId)}, ${sqlUuid(replacement.rollId)});`,
  "PG_CLAIM_CONSUMPTION_QUALITY_PENDING",
);

runSql(`
  update public.roll_preinstall_issues
  set
    status = 'reported_in_error',
    resolved_by_profile_id = ${sqlUuid(adminProfileId)},
    resolution_reason = 'Verifier clears the temporary pending hold.',
    resolved_at = now()
  where id = ${sqlUuid(issueId)};
`);
assert(
  querySql(`select private.require_claim_replacement_roll_consumption_ready(${sqlUuid(resolutionId)}, ${sqlUuid(replacement.rollId)});`) === reservation.body,
  "reported_in_error Cube K history must permit consumption readiness.",
);

// Historical return_required is terminal for use. Validate it in a rolled-back
// fixture so the same valid Roll can subsequently exercise the consumed terminal path.
const returnIssueId = randomUUID();
const returnRequestId = randomUUID();
runSql(`
  begin;

  insert into public.roll_preinstall_issues (
    id, request_id, roll_id, reported_by_profile_id, reporting_center_party_id,
    category, description, status, resolved_by_profile_id, resolution_reason, resolved_at
  ) values (
    ${sqlUuid(returnIssueId)}, ${sqlUuid(returnRequestId)}, ${sqlUuid(replacement.rollId)},
    ${sqlUuid(adminProfileId)}, ${sqlUuid(centerPartyId)},
    'other', 'Rolled-back verifier terminal quality history.', 'return_required',
    ${sqlUuid(adminProfileId)}, 'Verifier proves return_required blocks Claim consumption.', now()
  );

  do $verify$
  begin
    begin
      perform private.require_claim_replacement_roll_consumption_ready(${sqlUuid(resolutionId)}, ${sqlUuid(replacement.rollId)});
      raise exception 'PG_VERIFIER_EXPECTED_RETURN_REQUIRED_REJECTION';
    exception when sqlstate '23514' then
      if sqlerrm <> 'PG_CLAIM_CONSUMPTION_RETURN_REQUIRED' then
        raise;
      end if;
    end;
  end;
  $verify$;

  rollback;
`);

assert(
  querySql(`select private.require_claim_replacement_roll_consumption_ready(${sqlUuid(resolutionId)}, ${sqlUuid(replacement.rollId)});`) === reservation.body,
  "Rolled-back return_required fixture must not contaminate later readiness checks.",
);

// Completion does not exist yet. Synthesize only its future allocation terminal
// fact so Increment 8 can prove physical/public behavior without introducing a
// second consume operation outside the later atomic completion transaction.
runSql(`
  update public.warranty_claim_resolution_roll_allocations
  set
    status = 'consumed',
    consumed_by_profile_id = ${sqlUuid(adminProfileId)},
    consumed_at = now()
  where id = ${sqlUuid(reservation.body)}
    and status = 'reserved';
`);
assert(querySql(`select status from public.warranty_claim_resolution_roll_allocations where id = ${sqlUuid(reservation.body)};`) === "consumed",
  "Synthetic consumed allocation fixture was not persisted.");

expectSqlError(
  `select private.require_claim_replacement_roll_consumption_ready(${sqlUuid(resolutionId)}, ${sqlUuid(replacement.rollId)});`,
  "PG_CLAIM_CONSUMPTION_ALLOCATION_INVALID",
);
assert(await publicState(replacement.publicCode) === "unavailable_for_warranty",
  "Consumed Claim replacement Roll must resolve unavailable_for_warranty on its own Public Code.");

console.log("Cube R consumption readiness / Cube K quality / consumed public-terminal behavior PASS without a standalone consume or completion engine.");