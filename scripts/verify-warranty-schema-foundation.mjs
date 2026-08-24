import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function dbContainerName() {
  const names = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" })
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
  const name = names.find((value) => value.startsWith("supabase_db_"));
  assert(name, "Supabase database container was not found for Cube M schema verification.");
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

function expectSqlFailure(sql, expectedFragment) {
  let failed = false;
  try {
    runSql(sql);
  } catch (error) {
    failed = true;
    const stderr = String(error.stderr ?? "");
    assert(
      stderr.includes(expectedFragment),
      `Expected SQL failure containing ${expectedFragment}, received: ${stderr}`,
    );
  }
  assert(failed, `SQL unexpectedly succeeded; expected failure containing ${expectedFragment}.`);
}

function sqlUuid(value) {
  assert(/^[0-9a-f-]{36}$/i.test(value), `Unsafe UUID fixture value: ${value}`);
  return `'${value}'::uuid`;
}

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

const rlsState = querySql(`
  select c.relname || ':' || c.relrowsecurity
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('warranties', 'warranty_events')
  order by c.relname;
`);
assert(
  rlsState === "warranties:true\nwarranty_events:true",
  `Cube M Warranty tables must exist with RLS enabled, received: ${rlsState}`,
);

for (const role of ["anon", "authenticated", "service_role"]) {
  const privileges = querySql(`
    select concat_ws(',',
      has_table_privilege('${role}', 'public.warranties', 'SELECT'),
      has_table_privilege('${role}', 'public.warranties', 'INSERT'),
      has_table_privilege('${role}', 'public.warranties', 'UPDATE'),
      has_table_privilege('${role}', 'public.warranties', 'DELETE'),
      has_table_privilege('${role}', 'public.warranty_events', 'SELECT'),
      has_table_privilege('${role}', 'public.warranty_events', 'INSERT'),
      has_table_privilege('${role}', 'public.warranty_events', 'UPDATE'),
      has_table_privilege('${role}', 'public.warranty_events', 'DELETE')
    );
  `);
  assert(
    privileges === "f,f,f,f,f,f,f,f",
    `${role} must have no direct Cube M table privileges in increment 1; received ${privileges}`,
  );

  const sequenceUsage = querySql(`
    select has_sequence_privilege('${role}', 'private.warranty_number_seq', 'USAGE');
  `);
  assert(sequenceUsage === "f", `${role} must not have direct Warranty Number sequence usage.`);
}

const warrantyConstraintNames = new Set(
  querySql(`
    select conname
    from pg_catalog.pg_constraint
    where conrelid = 'public.warranties'::regclass
    order by conname;
  `).split("\n").filter(Boolean),
);
for (const required of [
  "warranties_number_format",
  "warranties_record_state_allowed",
  "warranties_void_shape",
  "warranties_coverage_window",
  "warranties_duration_snapshot_shape",
  "warranties_vehicle_vin_shape",
]) {
  assert(warrantyConstraintNames.has(required), `Missing Cube M Warranty constraint: ${required}`);
}

const eventConstraintNames = new Set(
  querySql(`
    select conname
    from pg_catalog.pg_constraint
    where conrelid = 'public.warranty_events'::regclass
    order by conname;
  `).split("\n").filter(Boolean),
);
for (const required of [
  "warranty_events_kind_allowed",
  "warranty_events_reason_shape",
  "warranty_events_change_snapshot_shape",
]) {
  assert(eventConstraintNames.has(required), `Missing Cube M Warranty event constraint: ${required}`);
}

const indexNames = new Set(
  querySql(`
    select indexname
    from pg_catalog.pg_indexes
    where schemaname = 'public'
      and tablename = 'warranties'
    order by indexname;
  `).split("\n").filter(Boolean),
);
for (const required of [
  "warranties_one_issued_per_roll_idx",
  "warranties_center_recent_idx",
  "warranties_admin_recent_idx",
  "warranties_vehicle_vin_idx",
  "warranties_customer_phone_idx",
]) {
  assert(indexNames.has(required), `Missing Cube M Warranty index: ${required}`);
}

const eventIndexNames = new Set(
  querySql(`
    select indexname
    from pg_catalog.pg_indexes
    where schemaname = 'public'
      and tablename = 'warranty_events'
    order by indexname;
  `).split("\n").filter(Boolean),
);
for (const required of [
  "warranty_events_warranty_timeline_idx",
  "warranty_events_one_activation_idx",
  "warranty_events_one_void_idx",
]) {
  assert(eventIndexNames.has(required), `Missing Cube M Warranty event index: ${required}`);
}

const triggerNames = new Set(
  querySql(`
    select tgname
    from pg_catalog.pg_trigger
    where not tgisinternal
      and tgrelid in ('public.warranties'::regclass, 'public.warranty_events'::regclass)
    order by tgname;
  `).split("\n").filter(Boolean),
);
assert(triggerNames.has("warranties_guard_mutation"), "Warranty mutation guard trigger is missing.");
assert(triggerNames.has("warranty_events_immutable"), "Warranty event immutability trigger is missing.");

const centerFixture = querySql(`
  select p.id, op.id, c.name
  from public.profiles p
  join public.operational_parties op
    on op.party_type = 'center'
   and op.installation_center_id = p.installation_center_id
  join public.installation_centers c on c.id = p.installation_center_id
  where p.role = 'center'
  order by p.created_at, p.id
  limit 1;
`).split("|");
assert(centerFixture.length === 3 && centerFixture.every(Boolean),
  `Expected an existing Center/Profile fixture from earlier database contracts, received ${centerFixture}`);
const [centerProfileId, centerPartyId, centerName] = centerFixture;

const rollFixtures = querySql(`
  select r.id, r.product_id, p.code, p.name, coalesce(p.version_name, 'V1')
  from public.rolls r
  join public.products p on p.id = r.product_id
  order by r.created_at, r.id
  limit 2;
`).split("\n").filter(Boolean).map((row) => row.split("|"));
assert(rollFixtures.length === 2, "Expected at least two existing Roll fixtures from earlier database contracts.");

for (const row of rollFixtures) {
  assert(row.length === 5 && row.every(Boolean), `Invalid Roll/Product fixture row: ${row}`);
}

const [rollAId, productAId, productACode, productAName, productAVersion] = rollFixtures[0];
const [rollBId, productBId, productBCode, productBName, productBVersion] = rollFixtures[1];

const warrantyAId = randomUUID();
const warrantyARequestId = randomUUID();
const activationEventRequestId = warrantyARequestId;

runSql(`
  insert into public.warranties (
    id,
    request_id,
    roll_id,
    warranty_number,
    activated_by_profile_id,
    activating_center_party_id,
    activating_center_name_snapshot,
    activated_at,
    coverage_expires_at,
    product_id,
    product_code_snapshot,
    product_name_snapshot,
    product_version_snapshot,
    warranty_months_snapshot,
    warranty_coverage_snapshot,
    care_instructions_snapshot,
    customer_name,
    customer_phone,
    customer_email,
    vehicle_make,
    vehicle_model,
    vehicle_year,
    vehicle_plate,
    vehicle_color,
    vehicle_vin
  ) values (
    ${sqlUuid(warrantyAId)},
    ${sqlUuid(warrantyARequestId)},
    ${sqlUuid(rollAId)},
    'PG-W-00000001',
    ${sqlUuid(centerProfileId)},
    ${sqlUuid(centerPartyId)},
    ${sqlText(centerName)},
    now(),
    now() + interval '120 months',
    ${sqlUuid(productAId)},
    ${sqlText(productACode)},
    ${sqlText(productAName)},
    ${sqlText(productAVersion)},
    120,
    'Cube M foundation coverage.',
    'Cube M foundation care.',
    'Foundation Customer',
    '+201000000001',
    null,
    'Test Make',
    'Test Model',
    2026,
    null,
    null,
    'TESTVIN000001'
  );

  insert into public.warranty_events (
    warranty_id,
    action_request_id,
    event_kind,
    actor_profile_id
  ) values (
    ${sqlUuid(warrantyAId)},
    ${sqlUuid(activationEventRequestId)},
    'activated',
    ${sqlUuid(centerProfileId)}
  );
`);

expectSqlFailure(`
  insert into public.warranty_events (
    warranty_id,
    action_request_id,
    event_kind,
    actor_profile_id
  ) values (
    ${sqlUuid(warrantyAId)},
    ${sqlUuid(randomUUID())},
    'activated',
    ${sqlUuid(centerProfileId)}
  );
`, "warranty_events_one_activation_idx");

expectSqlFailure(`
  insert into public.warranties (
    request_id, roll_id, warranty_number,
    activated_by_profile_id, activating_center_party_id, activating_center_name_snapshot,
    activated_at, coverage_expires_at,
    product_id, product_code_snapshot, product_name_snapshot, product_version_snapshot,
    warranty_months_snapshot, warranty_coverage_snapshot, care_instructions_snapshot,
    customer_name, customer_phone,
    vehicle_make, vehicle_model, vehicle_vin
  ) values (
    ${sqlUuid(randomUUID())}, ${sqlUuid(rollAId)}, 'PG-W-00000002',
    ${sqlUuid(centerProfileId)}, ${sqlUuid(centerPartyId)}, ${sqlText(centerName)},
    now(), now() + interval '120 months',
    ${sqlUuid(productAId)}, ${sqlText(productACode)}, ${sqlText(productAName)}, ${sqlText(productAVersion)},
    120, 'Duplicate coverage.', 'Duplicate care.',
    'Duplicate Customer', '+201000000002',
    'Test Make', 'Test Model', 'TESTVIN000002'
  );
`, "warranties_one_issued_per_roll_idx");

expectSqlFailure(`
  update public.warranties
  set warranty_number = 'PG-W-99999999'
  where id = ${sqlUuid(warrantyAId)};
`, "PG_WARRANTY_CORE_IMMUTABLE");

runSql(`
  update public.warranties
  set customer_name = 'Corrected Foundation Customer'
  where id = ${sqlUuid(warrantyAId)};
`);
assert(
  querySql(`select customer_name from public.warranties where id = ${sqlUuid(warrantyAId)};`) ===
    "Corrected Foundation Customer",
  "Issued Warranty must permit only the future bounded customer/vehicle correction shape.",
);

expectSqlFailure(`
  update public.warranties
  set
    record_state = 'voided_in_error',
    voided_by_profile_id = ${sqlUuid(centerProfileId)},
    void_reason = 'Foundation test void.',
    voided_at = now(),
    customer_name = 'Illegal Combined Change'
  where id = ${sqlUuid(warrantyAId)};
`, "PG_WARRANTY_VOID_WITH_DETAILS_CHANGE");

runSql(`
  update public.warranties
  set
    record_state = 'voided_in_error',
    voided_by_profile_id = ${sqlUuid(centerProfileId)},
    void_reason = 'Foundation test void.',
    voided_at = now()
  where id = ${sqlUuid(warrantyAId)};

  insert into public.warranty_events (
    warranty_id,
    action_request_id,
    event_kind,
    actor_profile_id,
    reason
  ) values (
    ${sqlUuid(warrantyAId)},
    ${sqlUuid(randomUUID())},
    'voided_in_error',
    ${sqlUuid(centerProfileId)},
    'Foundation test void.'
  );
`);

expectSqlFailure(`
  insert into public.warranty_events (
    warranty_id,
    action_request_id,
    event_kind,
    actor_profile_id,
    reason
  ) values (
    ${sqlUuid(warrantyAId)},
    ${sqlUuid(randomUUID())},
    'voided_in_error',
    ${sqlUuid(centerProfileId)},
    'Duplicate foundation void event.'
  );
`, "warranty_events_one_void_idx");

expectSqlFailure(`
  update public.warranties
  set customer_phone = '+201000009999'
  where id = ${sqlUuid(warrantyAId)};
`, "PG_WARRANTY_VOIDED_IMMUTABLE");

const warrantyBId = randomUUID();
runSql(`
  insert into public.warranties (
    id,
    request_id,
    roll_id,
    warranty_number,
    activated_by_profile_id,
    activating_center_party_id,
    activating_center_name_snapshot,
    activated_at,
    coverage_expires_at,
    product_id,
    product_code_snapshot,
    product_name_snapshot,
    product_version_snapshot,
    warranty_months_snapshot,
    warranty_coverage_snapshot,
    care_instructions_snapshot,
    customer_name,
    customer_phone,
    vehicle_make,
    vehicle_model,
    vehicle_vin
  ) values (
    ${sqlUuid(warrantyBId)},
    ${sqlUuid(randomUUID())},
    ${sqlUuid(rollAId)},
    'PG-W-00000003',
    ${sqlUuid(centerProfileId)},
    ${sqlUuid(centerPartyId)},
    ${sqlText(centerName)},
    now(),
    now() + interval '120 months',
    ${sqlUuid(productAId)},
    ${sqlText(productACode)},
    ${sqlText(productAName)},
    ${sqlText(productAVersion)},
    120,
    'Reactivation-shape coverage.',
    'Reactivation-shape care.',
    'Second Foundation Customer',
    '+201000000003',
    'Test Make',
    'Test Model',
    'TESTVIN000003'
  );
`);
assert(
  querySql(`select count(*) from public.warranties where roll_id = ${sqlUuid(rollAId)} and record_state = 'issued';`) === "1",
  "A Roll must have exactly one effective issued Warranty after historical void + later issuance shape.",
);

expectSqlFailure(`
  update public.warranty_events
  set event_kind = 'details_corrected', reason = 'Illegal history edit.'
  where warranty_id = ${sqlUuid(warrantyAId)};
`, "PG_WARRANTY_HISTORY_IMMUTABLE");

expectSqlFailure(`
  insert into public.warranty_events (
    warranty_id,
    action_request_id,
    event_kind,
    actor_profile_id,
    reason
  ) values (
    ${sqlUuid(warrantyBId)},
    ${sqlUuid(randomUUID())},
    'details_corrected',
    ${sqlUuid(centerProfileId)},
    'Missing change snapshot.'
  );
`, "warranty_events_change_snapshot_shape");

expectSqlFailure(`
  insert into public.warranties (
    request_id, roll_id, warranty_number,
    activated_by_profile_id, activating_center_party_id, activating_center_name_snapshot,
    activated_at, coverage_expires_at,
    product_id, product_code_snapshot, product_name_snapshot, product_version_snapshot,
    warranty_months_snapshot, warranty_coverage_snapshot, care_instructions_snapshot,
    customer_name, customer_phone,
    vehicle_make, vehicle_model, vehicle_vin
  ) values (
    ${sqlUuid(randomUUID())}, ${sqlUuid(rollBId)}, 'PG-W-BAD',
    ${sqlUuid(centerProfileId)}, ${sqlUuid(centerPartyId)}, ${sqlText(centerName)},
    now(), now() + interval '120 months',
    ${sqlUuid(productBId)}, ${sqlText(productBCode)}, ${sqlText(productBName)}, ${sqlText(productBVersion)},
    120, 'Invalid-number coverage.', 'Invalid-number care.',
    'Invalid Number Customer', '+201000000004',
    'Test Make', 'Test Model', 'TESTVIN000004'
  );
`, "warranties_number_format");

expectSqlFailure(`
  insert into public.warranties (
    request_id, roll_id, warranty_number,
    activated_by_profile_id, activating_center_party_id, activating_center_name_snapshot,
    activated_at, coverage_expires_at,
    product_id, product_code_snapshot, product_name_snapshot, product_version_snapshot,
    warranty_months_snapshot, warranty_coverage_snapshot, care_instructions_snapshot,
    customer_name, customer_phone,
    vehicle_make, vehicle_model, vehicle_vin
  ) values (
    ${sqlUuid(randomUUID())}, ${sqlUuid(rollBId)}, 'PG-W-00000004',
    ${sqlUuid(centerProfileId)}, ${sqlUuid(centerPartyId)}, ${sqlText(centerName)},
    now(), now() + interval '120 months',
    ${sqlUuid(productBId)}, ${sqlText(productBCode)}, ${sqlText(productBName)}, ${sqlText(productBVersion)},
    120, 'Invalid VIN coverage.', 'Invalid VIN care.',
    'Invalid VIN Customer', '+201000000005',
    'Test Make', 'Test Model', 'bad vin'
  );
`, "warranties_vehicle_vin_shape");

console.log("Cube M Warranty schema foundation verification passed.");
