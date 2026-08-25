import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const apiUrl = process.env.API_URL;
const anonKey = process.env.ANON_KEY;

if (!apiUrl || !anonKey) {
  throw new Error("Local Supabase API_URL and ANON_KEY are required for Cube N resolver verification.");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function dbContainerName() {
  const names = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" })
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
  const name = names.find((value) => value.startsWith("supabase_db_"));
  assert(name, "Supabase database container was not found for Cube N resolver verification.");
  return name;
}

function runSql(sql, { tuplesOnly = false } = {}) {
  const args = ["exec", "-i", dbContainerName(), "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"];
  if (tuplesOnly) args.push("-At");
  return execFileSync("docker", args, {
    input: sql,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
}

function scalar(sql) {
  return runSql(`${sql.trim().replace(/;$/, "")};\n`, { tuplesOnly: true }).trim();
}

function sqlUuid(value) {
  assert(/^[0-9a-f-]{36}$/i.test(value), `Unsafe UUID fixture value: ${value}`);
  return `'${value}'::uuid`;
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

async function request(path, { method = "GET", body } = {}) {
  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { response, body: await readJson(response) };
}

async function resolve(publicCode) {
  return request("/rest/v1/rpc/resolve_public_warranty", {
    method: "POST",
    body: { p_public_code: publicCode },
  });
}

function assertSingleState(result, expectedState, label) {
  assert(result.response.ok, `${label} resolver failed: ${result.response.status} ${JSON.stringify(result.body)}`);
  assert(Array.isArray(result.body) && result.body.length === 1, `${label} expected exactly one resolver row: ${JSON.stringify(result.body)}`);
  assert(result.body[0].public_state === expectedState, `${label} expected ${expectedState}: ${JSON.stringify(result.body[0])}`);
  return result.body[0];
}

const stateColumns = [
  "activated_at",
  "activating_center_name",
  "coverage_expires_at",
  "product_name",
  "public_state",
  "vehicle_make",
  "vehicle_model",
  "vehicle_year",
  "warranty_number",
].sort();

const sourceRollCount = Number(scalar("select count(*) from public.rolls"));
assert(sourceRollCount > 0, "Cube N resolver verification requires existing Roll fixtures.");

const notActivatedRollId = randomUUID();
const activeRollId = randomUUID();
const expiredRollId = randomUUID();
const voidedRollId = randomUUID();
const unavailableRollId = randomUUID();

function insertClone(rollId, orderDigits, lotDigits) {
  runSql(`
  do $$
  declare
    v_source public.rolls%rowtype;
    v_index integer;
  begin
    select * into v_source from public.rolls order by created_at, id limit 1;
    if v_source.id is null then
      raise exception 'PG_CUBE_N_RESOLVER_SOURCE_ROLL_MISSING';
    end if;

    select coalesce(max(r.roll_index), 0) + 1
      into v_index
    from public.rolls r
    where r.production_lot_id = v_source.production_lot_id;

    if v_index > 10000 then
      raise exception 'PG_CUBE_N_RESOLVER_TEST_LOT_FULL';
    end if;

    insert into public.rolls (
      id,
      product_id,
      production_order_id,
      production_lot_id,
      roll_index,
      serial_number,
      erp_serial
    ) values (
      ${sqlUuid(rollId)},
      v_source.product_id,
      v_source.production_order_id,
      v_source.production_lot_id,
      v_index,
      format(
        'PG-R-20991231-${orderDigits}-${lotDigits}-%s',
        case when v_index = 10000 then '10000' else lpad(v_index::text, 4, '0') end
      ),
      'ERP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16))
    );
  end;
  $$;
  `);
}

insertClone(notActivatedRollId, "71000001", "71");
insertClone(activeRollId, "72000001", "72");
insertClone(expiredRollId, "73000001", "73");
insertClone(voidedRollId, "74000001", "74");
insertClone(unavailableRollId, "75000001", "75");

for (const rollId of [notActivatedRollId, activeRollId, expiredRollId, voidedRollId, unavailableRollId]) {
  assert(
    scalar(`select count(*) from private.roll_public_identities where roll_id = ${sqlUuid(rollId)}`) === "1",
    `Cloned Roll ${rollId} did not receive exactly one Cube N public identity.`,
  );
}

runSql(`
do $$
declare
  v_center_profile_id uuid;
  v_center_party_id uuid;
  v_admin_profile_id uuid;
  v_product_id uuid;
  v_product_code text;
  v_product_name text;
  v_product_version text;
  v_number text;
begin
  select p.id, op.id
    into v_center_profile_id, v_center_party_id
  from public.profiles p
  join public.operational_parties op
    on op.party_type = 'center'
   and op.installation_center_id = p.installation_center_id
  where p.role = 'center'
    and p.status = 'active'
  order by p.created_at, p.id
  limit 1;

  select p.id
    into v_admin_profile_id
  from public.profiles p
  where p.role = 'admin'
    and p.status = 'active'
  order by p.created_at, p.id
  limit 1;

  if v_center_profile_id is null or v_center_party_id is null or v_admin_profile_id is null then
    raise exception 'PG_CUBE_N_RESOLVER_ACTOR_FIXTURE_MISSING';
  end if;

  select
    r.product_id,
    po.product_code_snapshot,
    po.product_name_snapshot,
    po.product_version_snapshot
  into
    v_product_id,
    v_product_code,
    v_product_name,
    v_product_version
  from public.rolls r
  join public.production_orders po on po.id = r.production_order_id
  where r.id = ${sqlUuid(activeRollId)};

  if v_product_id is null or v_product_name is null then
    raise exception 'PG_CUBE_N_RESOLVER_PRODUCT_FIXTURE_MISSING';
  end if;

  v_number := format('PG-W-%s', lpad(nextval('private.warranty_number_seq'::regclass)::text, 8, '0'));
  insert into public.warranties (
    request_id, roll_id, warranty_number, record_state,
    activated_by_profile_id, activating_center_party_id, activating_center_name_snapshot,
    activated_at, coverage_expires_at,
    product_id, product_code_snapshot, product_name_snapshot, product_version_snapshot,
    warranty_months_snapshot, warranty_coverage_snapshot, care_instructions_snapshot,
    customer_name, customer_phone, customer_email,
    vehicle_make, vehicle_model, vehicle_year, vehicle_plate, vehicle_color, vehicle_vin
  ) values (
    gen_random_uuid(), ${sqlUuid(activeRollId)}, v_number, 'issued',
    v_center_profile_id, v_center_party_id, 'Resolver Snapshot Center',
    now() - interval '1 day', now() + interval '365 days',
    v_product_id, v_product_code, v_product_name, v_product_version,
    12, 'Resolver coverage snapshot.', 'Resolver care snapshot.',
    'Private Active Customer', '+201000000001', 'active-private@example.test',
    'Toyota', 'Corolla', 2025, 'PRIVATE-ACTIVE', 'Black', 'ACTIVERESOLVER001'
  );

  v_number := format('PG-W-%s', lpad(nextval('private.warranty_number_seq'::regclass)::text, 8, '0'));
  insert into public.warranties (
    request_id, roll_id, warranty_number, record_state,
    activated_by_profile_id, activating_center_party_id, activating_center_name_snapshot,
    activated_at, coverage_expires_at,
    product_id, product_code_snapshot, product_name_snapshot, product_version_snapshot,
    warranty_months_snapshot, warranty_coverage_snapshot, care_instructions_snapshot,
    customer_name, customer_phone, customer_email,
    vehicle_make, vehicle_model, vehicle_year, vehicle_plate, vehicle_color, vehicle_vin
  ) values (
    gen_random_uuid(), ${sqlUuid(expiredRollId)}, v_number, 'issued',
    v_center_profile_id, v_center_party_id, 'Resolver Snapshot Center',
    now() - interval '730 days', now() - interval '365 days',
    v_product_id, v_product_code, v_product_name, v_product_version,
    12, 'Resolver coverage snapshot.', 'Resolver care snapshot.',
    'Private Expired Customer', '+201000000002', 'expired-private@example.test',
    'Honda', 'Civic', 2022, 'PRIVATE-EXPIRED', 'White', 'EXPIREDRESOLVER01'
  );

  v_number := format('PG-W-%s', lpad(nextval('private.warranty_number_seq'::regclass)::text, 8, '0'));
  insert into public.warranties (
    request_id, roll_id, warranty_number, record_state,
    activated_by_profile_id, activating_center_party_id, activating_center_name_snapshot,
    activated_at, coverage_expires_at,
    product_id, product_code_snapshot, product_name_snapshot, product_version_snapshot,
    warranty_months_snapshot, warranty_coverage_snapshot, care_instructions_snapshot,
    customer_name, customer_phone, customer_email,
    vehicle_make, vehicle_model, vehicle_year, vehicle_plate, vehicle_color, vehicle_vin,
    voided_by_profile_id, void_reason, voided_at
  ) values (
    gen_random_uuid(), ${sqlUuid(voidedRollId)}, v_number, 'voided_in_error',
    v_center_profile_id, v_center_party_id, 'Resolver Snapshot Center',
    now() - interval '1 day', now() + interval '365 days',
    v_product_id, v_product_code, v_product_name, v_product_version,
    12, 'Resolver coverage snapshot.', 'Resolver care snapshot.',
    'Private Voided Customer', '+201000000003', 'voided-private@example.test',
    'BMW', 'X3', 2024, 'PRIVATE-VOIDED', 'Blue', 'VOIDEDRESOLVER001',
    v_admin_profile_id, 'Resolver test mistaken activation.', now() - interval '12 hours'
  );

  v_number := format('PG-W-%s', lpad(nextval('private.warranty_number_seq'::regclass)::text, 8, '0'));
  insert into public.warranties (
    request_id, roll_id, warranty_number, record_state,
    activated_by_profile_id, activating_center_party_id, activating_center_name_snapshot,
    activated_at, coverage_expires_at,
    product_id, product_code_snapshot, product_name_snapshot, product_version_snapshot,
    warranty_months_snapshot, warranty_coverage_snapshot, care_instructions_snapshot,
    customer_name, customer_phone, customer_email,
    vehicle_make, vehicle_model, vehicle_year, vehicle_plate, vehicle_color, vehicle_vin,
    voided_by_profile_id, void_reason, voided_at
  ) values (
    gen_random_uuid(), ${sqlUuid(unavailableRollId)}, v_number, 'voided_in_error',
    v_center_profile_id, v_center_party_id, 'Resolver Snapshot Center',
    now() - interval '2 days', now() + interval '364 days',
    v_product_id, v_product_code, v_product_name, v_product_version,
    12, 'Resolver coverage snapshot.', 'Resolver care snapshot.',
    'Private Unavailable Customer', '+201000000004', 'unavailable-private@example.test',
    'Mercedes', 'C200', 2023, 'PRIVATE-UNAVAILABLE', 'Silver', 'UNAVAILRESOLVER01',
    v_admin_profile_id, 'Resolver test mistaken activation.', now() - interval '36 hours'
  );

  insert into public.roll_preinstall_issues (
    id,
    request_id,
    roll_id,
    reported_by_profile_id,
    reporting_center_party_id,
    category,
    description,
    status,
    resolved_by_profile_id,
    resolution_reason,
    resolved_at
  ) values (
    gen_random_uuid(),
    gen_random_uuid(),
    ${sqlUuid(unavailableRollId)},
    v_center_profile_id,
    v_center_party_id,
    'other',
    'Resolver test terminal pre-install condition.',
    'return_required',
    v_admin_profile_id,
    'Resolver test return required.',
    now()
  );
end;
$$;
`);

const codes = Object.fromEntries(
  [
    ["notActivated", notActivatedRollId],
    ["active", activeRollId],
    ["expired", expiredRollId],
    ["voided", voidedRollId],
    ["unavailable", unavailableRollId],
  ].map(([name, rollId]) => [
    name,
    scalar(`select public_code from private.roll_public_identities where roll_id = ${sqlUuid(rollId)}`),
  ]),
);

for (const [name, code] of Object.entries(codes)) {
  assert(/^[0-9a-f]{64}$/.test(code), `${name} fixture has invalid public code: ${code}`);
}

const productionSnapshotName = scalar(`
  select po.product_name_snapshot
  from public.rolls r
  join public.production_orders po on po.id = r.production_order_id
  where r.id = ${sqlUuid(notActivatedRollId)}
`);

const notActivated = assertSingleState(await resolve(codes.notActivated), "not_activated", "Not-activated Roll");
assert(notActivated.product_name === productionSnapshotName, "Pre-activation public Product name did not come from the Production snapshot.");
assert(notActivated.warranty_number === null, "Not-activated state leaked a Warranty Number.");

const active = assertSingleState(await resolve(codes.active), "active", "Active Warranty");
assert(active.warranty_number?.startsWith("PG-W-"), "Active Warranty did not expose its non-secret Warranty Number.");
assert(active.product_name === productionSnapshotName, "Active Warranty did not expose its issuance Product snapshot.");
assert(active.activating_center_name === "Resolver Snapshot Center", "Active Warranty did not expose its Center snapshot.");
assert(active.vehicle_make === "Toyota" && active.vehicle_model === "Corolla" && active.vehicle_year === 2025, "Active Warranty public vehicle projection is incorrect.");
assert(Object.keys(active).sort().join("|") === stateColumns.join("|"), `Resolver returned unapproved columns: ${Object.keys(active).sort().join(", ")}`);

const expired = assertSingleState(await resolve(codes.expired), "expired", "Expired Warranty");
assert(expired.warranty_number?.startsWith("PG-W-"), "Expired Warranty lost its permanent Warranty Number.");

const voided = assertSingleState(await resolve(codes.voided), "no_current_warranty_after_void", "Voided mistaken Warranty");
assert(voided.warranty_number === null && voided.activating_center_name === null, "Voided state exposed historical Warranty details.");

const unavailable = assertSingleState(await resolve(codes.unavailable), "unavailable_for_warranty", "Unavailable Roll after void");
assert(unavailable.warranty_number === null, "Unavailable state exposed a historical Warranty Number.");

for (const row of [notActivated, voided, unavailable]) {
  assert(Object.keys(row).sort().join("|") === stateColumns.join("|"), "Non-effective Warranty state returned an unexpected public shape.");
}

const malformed = await resolve("PG-W-00000001");
assert(malformed.response.ok && Array.isArray(malformed.body) && malformed.body.length === 0, `Malformed code did not use the generic zero-row result: ${JSON.stringify(malformed.body)}`);

const unknown = await resolve("0".repeat(64));
assert(unknown.response.ok && Array.isArray(unknown.body) && unknown.body.length === 0, `Unknown code did not use the generic zero-row result: ${JSON.stringify(unknown.body)}`);

for (const table of ["rolls", "warranties", "warranty_events", "roll_preinstall_issues"]) {
  const direct = await request(`/rest/v1/${table}?select=*&limit=1`);
  assert(!direct.response.ok, `Anonymous caller unexpectedly received direct ${table} table access.`);
}

const privateIdentityProbe = await request("/rest/v1/roll_public_identities?select=*&limit=1");
assert(!privateIdentityProbe.response.ok, "Private Roll public identities unexpectedly became a public Data API relation.");

assert(
  scalar("select has_function_privilege('anon', 'public.resolve_public_warranty(text)', 'EXECUTE')") === "t",
  "Anonymous role cannot execute the approved public Warranty resolver.",
);
assert(
  scalar("select has_function_privilege('authenticated', 'public.resolve_public_warranty(text)', 'EXECUTE')") === "t",
  "Authenticated role cannot execute the approved public Warranty resolver.",
);
assert(
  scalar("select has_function_privilege('service_role', 'public.resolve_public_warranty(text)', 'EXECUTE')") === "f",
  "Service-role Data API unexpectedly received Cube N public resolver EXECUTE.",
);

console.log("Cube N N2 public Warranty resolver verification PASS");