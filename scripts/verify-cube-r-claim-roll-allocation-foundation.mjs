import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function dbContainerName() {
  const names = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" })
    .split("\n").map((value) => value.trim()).filter(Boolean);
  const name = names.find((value) => value.startsWith("supabase_db_"));
  assert(name, "Supabase database container was not found for Cube R allocation verification.");
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
    ["exec", "-i", dbContainerName(), "psql", "-At", "-F", "|", "-v", "ON_ERROR_STOP=1",
      "-U", "postgres", "-d", "postgres", "-c", sql],
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
    assert(stderr.includes(expectedFragment),
      `Expected SQL failure containing ${expectedFragment}, received: ${stderr}`);
  }
  assert(failed, `SQL unexpectedly succeeded; expected ${expectedFragment}.`);
}

function sqlUuid(value) {
  assert(/^[0-9a-f-]{36}$/i.test(value), `Unsafe UUID fixture value: ${value}`);
  return `'${value}'::uuid`;
}

const table = "warranty_claim_resolution_roll_allocations";
const expectedColumns = [
  "id",
  "resolution_id",
  "roll_id",
  "product_eligibility_basis",
  "status",
  "reserved_by_profile_id",
  "reserved_at",
  "released_by_profile_id",
  "release_reason",
  "released_at",
  "consumed_by_profile_id",
  "consumed_at",
  "created_at",
].join(",");

assert(querySql(`
  select string_agg(column_name, ',' order by ordinal_position)
  from information_schema.columns
  where table_schema = 'public' and table_name = '${table}';
`) === expectedColumns, "Cube R Roll allocation persistence column drift.");

assert(querySql(`select relrowsecurity from pg_class where oid = 'public.${table}'::regclass;`) === "t",
  "Claim Roll allocation history must have RLS enabled.");
for (const role of ["anon", "authenticated", "service_role"]) {
  for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
    assert(querySql(`select has_table_privilege('${role}', 'public.${table}', '${privilege}');`) === "f",
      `${role} unexpectedly has ${privilege} on ${table}.`);
  }
}

const constraints = new Set(querySql(`
  select conname from pg_constraint
  where conrelid = 'public.${table}'::regclass
  order by conname;
`).split("\n").filter(Boolean));
for (const name of [
  "warranty_claim_resolution_roll_allocations_basis_shape",
  "warranty_claim_resolution_roll_allocations_status_allowed",
  "warranty_claim_resolution_roll_allocations_release_reason_shape",
  "warranty_claim_resolution_roll_allocations_state_shape",
  "warranty_claim_resolution_roll_allocations_timestamp_shape",
]) {
  assert(constraints.has(name), `Missing allocation constraint ${name}.`);
}

assert(querySql(`
  select count(*)
  from pg_constraint
  where conrelid = 'public.${table}'::regclass
    and pg_get_constraintdef(oid) like '%same_product_default%';
`) === "0", "Allocation schema must not permanently freeze the V1 Product-policy basis code.");

const indexDefinitions = querySql(`
  select string_agg(indexname || ':' || indexdef, E'\n' order by indexname)
  from pg_indexes
  where schemaname = 'public' and tablename = '${table}';
`);
for (const fragment of [
  "warranty_claim_resolution_roll_allocations_resolution_active_uniq",
  "warranty_claim_resolution_roll_allocations_roll_active_uniq",
  "WHERE (status = ANY (ARRAY['reserved'::text, 'consumed'::text]))",
]) {
  assert(indexDefinitions.includes(fragment), `Allocation exclusivity index drift; missing ${fragment}.`);
}

assert(querySql(`
  select count(*) = 0
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('reserve_claim_resolution_roll', 'release_claim_resolution_roll');
`) === "t", "Persistence-only allocation increment must not expose reserve/release RPCs yet.");

const actorId = querySql(`
  select id from public.profiles where role = 'admin' and status = 'active' order by id limit 1;
`);
assert(actorId, "Cube R allocation verifier requires one active Admin fixture.");

const resolutionIds = querySql(`
  select id from public.warranty_claim_resolutions order by created_at, id limit 2;
`).split("\n").filter(Boolean);
assert(resolutionIds.length === 2, `Cube R allocation verifier requires two Resolution fixtures: ${resolutionIds}`);
const [resolutionA, resolutionB] = resolutionIds;

const rollIds = querySql(`
  select id from public.rolls order by created_at, id limit 2;
`).split("\n").filter(Boolean);
assert(rollIds.length === 2, `Cube R allocation verifier requires two Roll fixtures: ${rollIds}`);
const [rollA, rollB] = rollIds;

const releasedId = randomUUID();
const replacementId = randomUUID();
runSql(`
begin;
insert into public.${table} (
  id, resolution_id, roll_id, product_eligibility_basis, status,
  reserved_by_profile_id, reserved_at, created_at
) values (
  ${sqlUuid(releasedId)}, ${sqlUuid(resolutionA)}, ${sqlUuid(rollA)},
  'future_policy_fixture', 'reserved', ${sqlUuid(actorId)}, now(), now()
);

update public.${table}
set
  status = 'released',
  released_by_profile_id = ${sqlUuid(actorId)},
  release_reason = 'Verifier releases unused reserved material.',
  released_at = reserved_at + interval '1 second'
where id = ${sqlUuid(releasedId)};

insert into public.${table} (
  id, resolution_id, roll_id, product_eligibility_basis, status,
  reserved_by_profile_id, reserved_at, created_at
) values (
  ${sqlUuid(replacementId)}, ${sqlUuid(resolutionA)}, ${sqlUuid(rollA)},
  'same_product_default', 'reserved', ${sqlUuid(actorId)}, now() + interval '2 seconds', now()
);

do $$
begin
  if not exists (
    select 1 from public.${table}
    where id = ${sqlUuid(releasedId)}
      and status = 'released'
      and product_eligibility_basis = 'future_policy_fixture'
      and released_by_profile_id = ${sqlUuid(actorId)}
      and release_reason is not null
      and consumed_at is null
  ) then
    raise exception 'CUBE_R_RELEASED_ALLOCATION_SHAPE_FAILED';
  end if;
  if not exists (
    select 1 from public.${table}
    where id = ${sqlUuid(replacementId)} and status = 'reserved'
  ) then
    raise exception 'CUBE_R_RELEASED_ALLOCATION_DID_NOT_FREE_EXCLUSIVITY';
  end if;
end;
$$;
rollback;
`);

const consumedId = randomUUID();
runSql(`
begin;
insert into public.${table} (
  id, resolution_id, roll_id, product_eligibility_basis, status,
  reserved_by_profile_id, reserved_at, created_at
) values (
  ${sqlUuid(consumedId)}, ${sqlUuid(resolutionA)}, ${sqlUuid(rollA)},
  'same_product_default', 'reserved', ${sqlUuid(actorId)}, now(), now()
);
update public.${table}
set
  status = 'consumed',
  consumed_by_profile_id = ${sqlUuid(actorId)},
  consumed_at = reserved_at + interval '1 second'
where id = ${sqlUuid(consumedId)};
do $$
begin
  if not exists (
    select 1 from public.${table}
    where id = ${sqlUuid(consumedId)}
      and status = 'consumed'
      and consumed_by_profile_id = ${sqlUuid(actorId)}
      and released_at is null
  ) then
    raise exception 'CUBE_R_CONSUMED_ALLOCATION_SHAPE_FAILED';
  end if;
end;
$$;
rollback;
`);

expectSqlFailure(`
begin;
insert into public.${table} (
  resolution_id, roll_id, product_eligibility_basis, reserved_by_profile_id, reserved_at, created_at
) values (
  ${sqlUuid(resolutionA)}, ${sqlUuid(rollA)}, 'same_product_default', ${sqlUuid(actorId)}, now(), now()
);
insert into public.${table} (
  resolution_id, roll_id, product_eligibility_basis, reserved_by_profile_id, reserved_at, created_at
) values (
  ${sqlUuid(resolutionA)}, ${sqlUuid(rollB)}, 'same_product_default', ${sqlUuid(actorId)}, now(), now()
);
commit;
`, "warranty_claim_resolution_roll_allocations_resolution_active_uniq");

expectSqlFailure(`
begin;
insert into public.${table} (
  resolution_id, roll_id, product_eligibility_basis, reserved_by_profile_id, reserved_at, created_at
) values (
  ${sqlUuid(resolutionA)}, ${sqlUuid(rollA)}, 'same_product_default', ${sqlUuid(actorId)}, now(), now()
);
insert into public.${table} (
  resolution_id, roll_id, product_eligibility_basis, reserved_by_profile_id, reserved_at, created_at
) values (
  ${sqlUuid(resolutionB)}, ${sqlUuid(rollA)}, 'same_product_default', ${sqlUuid(actorId)}, now(), now()
);
commit;
`, "warranty_claim_resolution_roll_allocations_roll_active_uniq");

expectSqlFailure(`
begin;
insert into public.${table} (
  id, resolution_id, roll_id, product_eligibility_basis, reserved_by_profile_id, reserved_at, created_at
) values (
  ${sqlUuid(consumedId)}, ${sqlUuid(resolutionA)}, ${sqlUuid(rollA)},
  'same_product_default', ${sqlUuid(actorId)}, now(), now()
);
update public.${table}
set status = 'consumed', consumed_by_profile_id = ${sqlUuid(actorId)}, consumed_at = reserved_at + interval '1 second'
where id = ${sqlUuid(consumedId)};
update public.${table}
set consumed_at = consumed_at + interval '1 second'
where id = ${sqlUuid(consumedId)};
commit;
`, "PG_CLAIM_ROLL_ALLOCATION_TERMINAL");

expectSqlFailure(`
begin;
insert into public.${table} (
  id, resolution_id, roll_id, product_eligibility_basis, reserved_by_profile_id, reserved_at, created_at
) values (
  ${sqlUuid(releasedId)}, ${sqlUuid(resolutionA)}, ${sqlUuid(rollA)},
  'same_product_default', ${sqlUuid(actorId)}, now(), now()
);
delete from public.${table} where id = ${sqlUuid(releasedId)};
commit;
`, "PG_CLAIM_ROLL_ALLOCATION_IMMUTABLE");

expectSqlFailure(`
insert into public.${table} (
  resolution_id, roll_id, product_eligibility_basis, reserved_by_profile_id, reserved_at, created_at
) values (
  ${sqlUuid(resolutionA)}, ${sqlUuid(rollA)}, 'x', ${sqlUuid(actorId)}, now(), now()
);
`, "warranty_claim_resolution_roll_allocations_basis_shape");

console.log("Cube R replacement Roll allocation persistence foundation verified.");
