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
  assert(name, "Supabase database container was not found for Cube N verification.");
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

function expectSqlFailure(sql, expectedMessage, label) {
  let output = "";
  let failed = false;
  try {
    runSql(sql);
  } catch (error) {
    failed = true;
    output = `${error?.stdout ?? ""}\n${error?.stderr ?? ""}\n${error?.message ?? ""}`;
  }
  assert(failed, `${label} unexpectedly succeeded.`);
  assert(output.includes(expectedMessage), `${label} failed for the wrong reason: ${output}`);
}

function sqlUuid(value) {
  assert(/^[0-9a-f-]{36}$/i.test(value), `Unsafe UUID fixture value: ${value}`);
  return `'${value}'::uuid`;
}

const initialRollCount = Number(scalar("select count(*) from public.rolls"));
assert(initialRollCount > 0, "Cube N verification requires at least one existing Roll fixture.");

const initialIdentityCount = Number(scalar("select count(*) from private.roll_public_identities"));
assert(
  initialIdentityCount === initialRollCount,
  `Every existing Roll must have one public identity: rolls=${initialRollCount}, identities=${initialIdentityCount}`,
);

assert(
  scalar(`
    select count(*)
    from public.rolls r
    left join private.roll_public_identities identity on identity.roll_id = r.id
    where identity.roll_id is null
  `) === "0",
  "A Roll exists without a public Warranty identity.",
);

assert(
  scalar(`
    select count(*)
    from private.roll_public_identities
    where public_code !~ '^[0-9a-f]{64}$'
  `) === "0",
  "A public Warranty code violates the 64-character lowercase hexadecimal contract.",
);

assert(
  scalar(`
    select count(*) - count(distinct public_code)
    from private.roll_public_identities
  `) === "0",
  "Duplicate public Warranty codes were detected.",
);

assert(
  scalar(`
    select count(*)
    from information_schema.tables
    where table_schema = 'private'
      and table_name = 'roll_public_identities'
  `) === "1",
  "Roll public identities are not stored in the private schema.",
);

for (const role of ["anon", "authenticated", "service_role"]) {
  for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
    assert(
      scalar(`select has_table_privilege('${role}', 'private.roll_public_identities', '${privilege}')`) === "f",
      `${role} unexpectedly has ${privilege} on private.roll_public_identities.`,
    );
  }

  assert(
    scalar(`select has_function_privilege('${role}', 'private.generate_roll_public_warranty_code()', 'EXECUTE')`) === "f",
    `${role} unexpectedly can execute the public-code generator directly.`,
  );
  assert(
    scalar(`select has_function_privilege('${role}', 'private.initialize_roll_public_warranty_identity()', 'EXECUTE')`) === "f",
    `${role} unexpectedly can execute the Roll identity initializer directly.`,
  );
}

assert(
  scalar(`
    select count(*)
    from pg_trigger
    where tgrelid = 'public.rolls'::regclass
      and tgname = 'rolls_initialize_public_warranty_identity'
      and not tgisinternal
  `) === "1",
  "Future Roll public-identity provisioning trigger is missing.",
);

assert(
  scalar(`
    select count(*)
    from pg_trigger
    where tgrelid = 'private.roll_public_identities'::regclass
      and tgname = 'roll_public_identities_immutable'
      and not tgisinternal
  `) === "1",
  "Roll public-identity immutability trigger is missing.",
);

const protectedRollId = scalar("select roll_id::text from private.roll_public_identities order by roll_id limit 1");
assert(/^[0-9a-f-]{36}$/i.test(protectedRollId), "Could not select a protected Roll identity fixture.");

expectSqlFailure(
  `update private.roll_public_identities set public_code = reverse(public_code) where roll_id = ${sqlUuid(protectedRollId)};`,
  "PG_ROLL_PUBLIC_IDENTITY_IMMUTABLE",
  "Direct public-identity update",
);
expectSqlFailure(
  `delete from private.roll_public_identities where roll_id = ${sqlUuid(protectedRollId)};`,
  "PG_ROLL_PUBLIC_IDENTITY_IMMUTABLE",
  "Direct public-identity delete",
);

// Simulate a Roll that existed immediately before the migration: disable only
// Cube N's future-provisioning trigger for one controlled insert, then run the
// same one-time missing-row backfill contract and prove completeness is restored.
const backfillRollId = randomUUID();
runSql(`
begin;
alter table public.rolls disable trigger rolls_initialize_public_warranty_identity;

do $$
declare
  v_source public.rolls%rowtype;
  v_index integer;
begin
  select * into v_source from public.rolls order by created_at, id limit 1;
  if v_source.id is null then
    raise exception 'PG_CUBE_N_TEST_SOURCE_ROLL_MISSING';
  end if;

  select coalesce(max(r.roll_index), 0) + 1
    into v_index
  from public.rolls r
  where r.production_lot_id = v_source.production_lot_id;

  if v_index > 10000 then
    raise exception 'PG_CUBE_N_TEST_LOT_FULL';
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
    ${sqlUuid(backfillRollId)},
    v_source.product_id,
    v_source.production_order_id,
    v_source.production_lot_id,
    v_index,
    format(
      'PG-R-20991231-88888888-88-%s',
      case when v_index = 10000 then '10000' else lpad(v_index::text, 4, '0') end
    ),
    'ERP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16))
  );
end;
$$;

alter table public.rolls enable trigger rolls_initialize_public_warranty_identity;
commit;
`);

assert(
  scalar(`select count(*) from private.roll_public_identities where roll_id = ${sqlUuid(backfillRollId)}`) === "0",
  "Backfill simulation Roll unexpectedly received a public identity while the Cube N trigger was disabled.",
);

runSql(`
insert into private.roll_public_identities (roll_id, public_code)
select
  r.id,
  private.generate_roll_public_warranty_code()
from public.rolls r
left join private.roll_public_identities identity on identity.roll_id = r.id
where identity.roll_id is null;
`);

assert(
  scalar(`select count(*) from private.roll_public_identities where roll_id = ${sqlUuid(backfillRollId)}`) === "1",
  "One-time migration backfill did not restore the missing Roll identity.",
);

// Prove transactional failure semantics. A test-only private-table trigger forces
// identity creation to fail; the Roll insert and the existing Cube D custody
// trigger effects must roll back with it.
const atomicRollId = randomUUID();
runSql(`
create function private.cube_n_test_force_identity_failure()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '23514', message = 'PG_CUBE_N_TEST_FORCED_IDENTITY_FAILURE';
end;
$$;

create trigger aa_cube_n_test_force_identity_failure
before insert on private.roll_public_identities
for each row execute function private.cube_n_test_force_identity_failure();

do $$
declare
  v_source public.rolls%rowtype;
  v_index integer;
begin
  select * into v_source from public.rolls order by created_at, id limit 1;
  if v_source.id is null then
    raise exception 'PG_CUBE_N_TEST_SOURCE_ROLL_MISSING';
  end if;

  select coalesce(max(r.roll_index), 0) + 1
    into v_index
  from public.rolls r
  where r.production_lot_id = v_source.production_lot_id;

  if v_index > 10000 then
    raise exception 'PG_CUBE_N_TEST_LOT_FULL';
  end if;

  begin
    insert into public.rolls (
      id,
      product_id,
      production_order_id,
      production_lot_id,
      roll_index,
      serial_number,
      erp_serial
    ) values (
      ${sqlUuid(atomicRollId)},
      v_source.product_id,
      v_source.production_order_id,
      v_source.production_lot_id,
      v_index,
      format(
        'PG-R-20991231-99999999-99-%s',
        case when v_index = 10000 then '10000' else lpad(v_index::text, 4, '0') end
      ),
      'ERP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16))
    );

    raise exception 'PG_CUBE_N_TEST_EXPECTED_FAILURE_NOT_RAISED';
  exception
    when others then
      if sqlerrm <> 'PG_CUBE_N_TEST_FORCED_IDENTITY_FAILURE' then
        raise;
      end if;
  end;

  if exists (select 1 from public.rolls where id = ${sqlUuid(atomicRollId)}) then
    raise exception 'PG_CUBE_N_TEST_ATOMIC_ROLL_SURVIVED';
  end if;

  if exists (select 1 from private.roll_public_identities where roll_id = ${sqlUuid(atomicRollId)}) then
    raise exception 'PG_CUBE_N_TEST_ATOMIC_IDENTITY_SURVIVED';
  end if;

  if exists (select 1 from public.roll_custody_current where roll_id = ${sqlUuid(atomicRollId)}) then
    raise exception 'PG_CUBE_N_TEST_ATOMIC_CUSTODY_SURVIVED';
  end if;
end;
$$;

drop trigger aa_cube_n_test_force_identity_failure on private.roll_public_identities;
drop function private.cube_n_test_force_identity_failure();
`);

const finalRollCount = Number(scalar("select count(*) from public.rolls"));
const finalIdentityCount = Number(scalar("select count(*) from private.roll_public_identities"));
assert(
  finalRollCount === finalIdentityCount,
  `Final one-Roll/one-public-identity invariant failed: rolls=${finalRollCount}, identities=${finalIdentityCount}`,
);

console.log("Cube N N1 Roll public identity verification PASS");