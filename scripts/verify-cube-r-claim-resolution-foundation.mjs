// Cube R exact-head qualification verifier: persistence/state foundation remains intentionally allocation-free.
import { execFileSync } from "node:child_process";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function dbContainerName() {
  const names = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" })
    .split("\n").map((value) => value.trim()).filter(Boolean);
  const name = names.find((value) => value.startsWith("supabase_db_"));
  assert(name, "Supabase database container was not found for Cube R Resolution verification.");
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

const expectedColumns = [
  "id",
  "claim_id",
  "status",
  "authorized_by_profile_id",
  "authorized_at",
  "created_at",
  "updated_at",
  "remedy_kind",
  "performing_center_party_id",
  "assigned_by_profile_id",
  "assigned_at",
  "completed_by_profile_id",
  "completion_actor_kind",
  "completion_note",
  "completed_at",
  "cancelled_by_profile_id",
  "cancellation_reason",
  "customer_cancellation_message",
  "cancelled_at",
].join(",");

const resolutionColumns = querySql(`
  select string_agg(column_name, ',' order by ordinal_position)
  from information_schema.columns
  where table_schema = 'public' and table_name = 'warranty_claim_resolutions';
`);
assert(resolutionColumns === expectedColumns,
  `Cube R Resolution foundation column drift: ${resolutionColumns}`);

for (const table of ["warranty_claim_resolutions", "warranty_claim_resolution_events"]) {
  assert(querySql(`select relrowsecurity from pg_class where oid = 'public.${table}'::regclass;`) === "t",
    `${table} must have RLS enabled.`);
  for (const role of ["anon", "authenticated", "service_role"]) {
    for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
      assert(querySql(`select has_table_privilege('${role}', 'public.${table}', '${privilege}');`) === "f",
        `${role} unexpectedly has ${privilege} on ${table}.`);
    }
  }
}

const resolutionConstraints = new Set(querySql(`
  select conname
  from pg_catalog.pg_constraint
  where conrelid = 'public.warranty_claim_resolutions'::regclass
  order by conname;
`).split("\n").filter(Boolean));
for (const name of [
  "warranty_claim_resolutions_r_status_allowed",
  "warranty_claim_resolutions_remedy_kind_allowed",
  "warranty_claim_resolutions_completion_actor_kind_allowed",
  "warranty_claim_resolutions_completion_note_shape",
  "warranty_claim_resolutions_cancellation_reason_shape",
  "warranty_claim_resolutions_customer_cancellation_message_shape",
  "warranty_claim_resolutions_r_state_shape",
  "warranty_claim_resolutions_r_timestamp_shape",
]) {
  assert(resolutionConstraints.has(name), `Missing Cube R Resolution constraint ${name}.`);
}
assert(!resolutionConstraints.has("warranty_claim_resolutions_q_status_allowed"),
  "Cube Q authorized-only Resolution status constraint must be replaced by Cube R.");

const triggerNames = new Set(querySql(`
  select tgname
  from pg_catalog.pg_trigger
  where not tgisinternal
    and tgrelid in (
      'public.warranty_claim_resolutions'::regclass,
      'public.warranty_claim_resolution_events'::regclass
    )
  order by tgname;
`).split("\n").filter(Boolean));
assert(triggerNames.has("warranty_claim_resolutions_guard_mutation"),
  "Cube R structural Resolution mutation guard is missing.");
assert(triggerNames.has("warranty_claim_resolution_events_immutable"),
  "Cube R Resolution event immutability trigger is missing.");
assert(!triggerNames.has("warranty_claim_resolutions_q_immutable"),
  "Cube Q blanket Resolution immutability trigger must be replaced, not stacked with R.");

assert(querySql(`select to_regclass('public.warranty_claim_resolution_roll_allocations') is null;`) === "t",
  "Resolution foundation increment must not introduce Roll allocation persistence yet.");
assert(querySql(`
  select count(*) = 0
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'assign_warranty_claim_resolution',
      'reassign_warranty_claim_resolution',
      'change_claim_resolution_remedy',
      'complete_warranty_claim_resolution',
      'cancel_assigned_claim_resolution_for_customer_withdrawal'
    );
`) === "t", "Persistence-only increment must not expose R mutation RPCs yet.");

const authorizedFixture = querySql(`
  select concat_ws('|', resolution.id, claim.id, claim.status,
    resolution.status,
    resolution.remedy_kind is null,
    resolution.performing_center_party_id is null,
    resolution.assigned_at is null)
  from public.warranty_claim_resolutions resolution
  join public.warranty_claims claim on claim.id = resolution.claim_id
  where resolution.status = 'authorized'
  order by resolution.authorized_at, resolution.id
  limit 1;
`).split("|");
assert(authorizedFixture.length === 7 && authorizedFixture[0]
  && authorizedFixture[2] === "cancelled"
  && authorizedFixture.slice(3).join("|") === "authorized|t|t|t",
  `Cube Q historical authorized Resolution must survive R migration unchanged: ${authorizedFixture}`);
const [resolutionId] = authorizedFixture;

const actorFixture = querySql(`
  select concat_ws('|',
    (select p.id from public.profiles p where p.role = 'admin' and p.status = 'active' order by p.id limit 1),
    center_profile.id,
    center_party.id
  )
  from public.profiles center_profile
  join public.operational_parties center_party
    on center_party.party_type = 'center'
   and center_party.installation_center_id = center_profile.installation_center_id
  join public.installation_centers center
    on center.id = center_profile.installation_center_id
  where center_profile.role = 'center'
    and center_profile.status = 'active'
    and center.status = 'active'
  order by center_profile.id
  limit 1;
`).split("|");
assert(actorFixture.length === 3 && actorFixture.every(Boolean),
  `Cube R requires active Admin/Center fixtures: ${actorFixture}`);
const [adminProfileId, centerProfileId, centerPartyId] = actorFixture;

runSql(`
begin;
update public.warranty_claim_resolutions
set
  status = 'assigned',
  remedy_kind = 'service_reinstall',
  performing_center_party_id = ${sqlUuid(centerPartyId)},
  assigned_by_profile_id = ${sqlUuid(adminProfileId)},
  assigned_at = authorized_at + interval '1 second',
  updated_at = authorized_at + interval '1 second'
where id = ${sqlUuid(resolutionId)};

update public.warranty_claim_resolutions
set
  status = 'completed',
  completed_by_profile_id = ${sqlUuid(centerProfileId)},
  completion_actor_kind = 'center',
  completion_note = 'Verified Cube R service completion evidence note.',
  completed_at = assigned_at + interval '1 second',
  updated_at = assigned_at + interval '1 second'
where id = ${sqlUuid(resolutionId)};

do $$
begin
  if not exists (
    select 1 from public.warranty_claim_resolutions
    where id = ${sqlUuid(resolutionId)}
      and status = 'completed'
      and completion_actor_kind = 'center'
      and cancelled_at is null
  ) then
    raise exception 'CUBE_R_COMPLETED_SHAPE_ASSERTION_FAILED';
  end if;
end;
$$;
rollback;
`);

runSql(`
begin;
update public.warranty_claim_resolutions
set
  status = 'assigned',
  remedy_kind = 'replacement_roll_reinstall',
  performing_center_party_id = ${sqlUuid(centerPartyId)},
  assigned_by_profile_id = ${sqlUuid(adminProfileId)},
  assigned_at = authorized_at + interval '1 second',
  updated_at = authorized_at + interval '1 second'
where id = ${sqlUuid(resolutionId)};

update public.warranty_claim_resolutions
set
  status = 'cancelled',
  cancelled_by_profile_id = ${sqlUuid(adminProfileId)},
  cancellation_reason = 'Customer declined the authorized physical service after assignment.',
  customer_cancellation_message = 'تم إغلاق تنفيذ الخدمة بناءً على عدم رغبة العميل في استكمال المعالجة.',
  cancelled_at = assigned_at + interval '1 second',
  updated_at = assigned_at + interval '1 second'
where id = ${sqlUuid(resolutionId)};

do $$
begin
  if not exists (
    select 1 from public.warranty_claim_resolutions
    where id = ${sqlUuid(resolutionId)}
      and status = 'cancelled'
      and completed_at is null
      and cancellation_reason is not null
      and customer_cancellation_message is not null
  ) then
    raise exception 'CUBE_R_CANCELLED_SHAPE_ASSERTION_FAILED';
  end if;
end;
$$;
rollback;
`);

expectSqlFailure(`
begin;
update public.warranty_claim_resolutions
set
  status = 'completed',
  completed_by_profile_id = ${sqlUuid(centerProfileId)},
  completion_actor_kind = 'center',
  completion_note = 'Invalid completion without assignment must fail structurally.',
  completed_at = authorized_at + interval '1 second',
  updated_at = authorized_at + interval '1 second'
where id = ${sqlUuid(resolutionId)};
commit;
`, "PG_CLAIM_RESOLUTION_INVALID_TRANSITION");

expectSqlFailure(`
begin;
update public.warranty_claim_resolutions
set
  status = 'assigned',
  remedy_kind = 'service_reinstall',
  performing_center_party_id = ${sqlUuid(centerPartyId)},
  assigned_by_profile_id = ${sqlUuid(adminProfileId)},
  assigned_at = authorized_at + interval '1 second',
  updated_at = authorized_at + interval '1 second'
where id = ${sqlUuid(resolutionId)};
update public.warranty_claim_resolutions
set
  status = 'completed',
  completed_by_profile_id = ${sqlUuid(centerProfileId)},
  completion_actor_kind = 'center',
  completion_note = 'Terminal Resolution cannot be edited after completion.',
  completed_at = assigned_at + interval '1 second',
  updated_at = assigned_at + interval '1 second'
where id = ${sqlUuid(resolutionId)};
update public.warranty_claim_resolutions
set completion_note = 'Attempted terminal rewrite must fail.'
where id = ${sqlUuid(resolutionId)};
commit;
`, "PG_CLAIM_RESOLUTION_TERMINAL");

expectSqlFailure(`
begin;
insert into public.warranty_claim_resolution_events (
  resolution_id, action_request_id, event_kind, actor_profile_id, actor_kind, reason, event_data
) values (
  ${sqlUuid(resolutionId)}, gen_random_uuid(), 'resolution_assigned',
  ${sqlUuid(adminProfileId)}, 'admin', null, jsonb_build_object('fixture', true)
);
update public.warranty_claim_resolution_events
set event_data = jsonb_build_object('rewritten', true)
where resolution_id = ${sqlUuid(resolutionId)};
commit;
`, "PG_CLAIM_RESOLUTION_EVENT_IMMUTABLE");

expectSqlFailure(`
insert into public.warranty_claim_resolution_events (
  resolution_id, action_request_id, event_kind, actor_profile_id, actor_kind, reason
) values (
  ${sqlUuid(resolutionId)}, gen_random_uuid(), 'resolution_assigned',
  ${sqlUuid(centerProfileId)}, 'center', null
);
`, "warranty_claim_resolution_events_actor_shape");

console.log("Cube R Resolution persistence/state foundation verified.");
