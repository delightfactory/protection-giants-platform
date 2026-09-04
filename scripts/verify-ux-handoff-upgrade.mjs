import { execFileSync } from "node:child_process";
import fs from "node:fs";

const migrationPath = "supabase/migrations/20260831183000_ux_handoff_01_claim_resolution_notification_routes.sql";
const migrationVersion = "20260831183000";
const dbProjectName = "protection-giants-platform";
const claimId = "00000000-0000-0000-0000-000000000301";
const claimEventId = "00000000-0000-0000-0000-000000000401";
const resolutionId = "00000000-0000-0000-0000-000000000402";
const resolutionEventId = "00000000-0000-0000-0000-000000000404";
const futureClaimEventId = "00000000-0000-0000-0000-000000000405";
const futureResolutionEventId = "00000000-0000-0000-0000-000000000406";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function dbContainerName() {
  const names = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" })
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
  const exact = "supabase_db_" + dbProjectName;
  const name = names.find((value) => value === exact);
  assert(name, "Expected local database container " + exact + ".");
  return name;
}

function querySql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", dbContainerName(), "psql", "-At", "-F", "|", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-c", sql],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
}

function runSql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", dbContainerName(), "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
    { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  );
}

function expectSqlFailure(sql, expectedMessage) {
  try {
    runSql(sql);
  } catch (error) {
    const output = [error.stdout, error.stderr].filter(Boolean).join("\n");
    assert(output.includes(expectedMessage), "Expected " + expectedMessage + ", received: " + output);
    return;
  }
  throw new Error("Expected SQL failure " + expectedMessage + ", but the statement succeeded.");
}

function runLocalMigrationPath() {
  return execFileSync("supabase", ["migration", "up", "--local"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

const source = fs.readFileSync(migrationPath, "utf8").replace(/\r\n/g, "\n");
const disableTrigger = "alter table public.notifications\n  disable trigger notifications_guard_mutation;";
const enableTrigger = "alter table public.notifications\n  enable trigger notifications_guard_mutation;";
const firstBackfill = source.indexOf("update public.notifications notification\nset action_path = '/operations/claims/'");
const secondBackfill = source.indexOf("update public.notifications notification\nset action_path = '/operations/claim-resolution-tasks/'");
const disableAt = source.indexOf(disableTrigger);
const enableAt = source.indexOf(enableTrigger);
assert(disableAt >= 0 && enableAt > disableAt, "The compatibility trigger window is missing or out of order.");
assert(firstBackfill > disableAt && secondBackfill > firstBackfill && enableAt > secondBackfill,
  "Only the two historical UX-HANDOFF backfills may run inside the trigger window.");
assert((source.match(/update public\.notifications notification/g) ?? []).length === 2,
  "UX-HANDOFF must retain exactly the two approved historical notification backfills.");
assert(querySql("select count(*) from supabase_migrations.schema_migrations where version = '20260831114500';") === "1",
  "Upgrade verifier must start after the first three UX migrations.");
assert(querySql("select count(*) from supabase_migrations.schema_migrations where version = '" + migrationVersion + "';") === "0",
  "UX-HANDOFF must be unapplied before the upgrade regression.");

const seedSql = String.raw`
begin;

insert into public.products (
  id, code, slug, name, default_warranty_months, status, product_type,
  version_name, width_mm, length_m, thickness_mil, weight_kg, origin_country
) values (
  '00000000-0000-0000-0000-000000000101',
  'UPGRADE-PPF',
  'upgrade-ppf',
  'Upgrade PPF Fixture',
  60,
  'active',
  'PPF',
  'v1',
  1500,
  15,
  8,
  20,
  'IT'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000001',
  'authenticated',
  'authenticated',
  'ux-handoff-upgrade-admin@example.test',
  'not-used',
  now(),
  '{"pg_provisioning":{"version":"operational-v1","role":"admin"}}'::jsonb,
  '{"display_name":"UX Handoff Upgrade Admin"}'::jsonb,
  now(),
  now()
);

insert into public.installation_centers (
  id, code, name, country_code, city, status
) values (
  '00000000-0000-0000-0000-000000000105',
  'UPGRADE-CENTER',
  'UX Handoff Upgrade Center',
  'IT',
  'Rome',
  'active'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000002',
  'authenticated',
  'authenticated',
  'ux-handoff-upgrade-center@example.test',
  'not-used',
  now(),
  jsonb_build_object(
    'pg_provisioning',
    jsonb_build_object(
      'version', 'operational-v1',
      'role', 'center',
      'installation_center_id', '00000000-0000-0000-0000-000000000105'
    )
  ),
  '{"display_name":"UX Handoff Upgrade Center"}'::jsonb,
  now(),
  now()
);

insert into public.production_orders (
  id, order_number, product_id, production_date, source_reference, notes,
  total_rolls, created_by, created_at, status,
  product_code_snapshot, product_name_snapshot, product_version_snapshot,
  width_mm_snapshot, length_m_snapshot, thickness_mil_snapshot,
  weight_kg_snapshot, origin_country_snapshot, request_id
) values
(
  '00000000-0000-0000-0000-000000000102',
  'PG-PO-20260904-00000001',
  '00000000-0000-0000-0000-000000000101',
  date '2026-09-04',
  'UX-HANDOFF-UPGRADE-1',
  'Bounded local upgrade regression fixture.',
  1,
  '00000000-0000-0000-0000-000000000001',
  now() - interval '10 minutes',
  'generated',
  'UPGRADE-PPF',
  'Upgrade PPF Fixture',
  'v1',
  1500,
  15,
  8,
  20,
  'IT',
  '00000000-0000-0000-0000-000000000112'
),
(
  '00000000-0000-0000-0000-000000000107',
  'PG-PO-20260904-00000002',
  '00000000-0000-0000-0000-000000000101',
  date '2026-09-04',
  'UX-HANDOFF-UPGRADE-2',
  'Bounded local upgrade regression fixture.',
  1,
  '00000000-0000-0000-0000-000000000001',
  now() - interval '9 minutes',
  'generated',
  'UPGRADE-PPF',
  'Upgrade PPF Fixture',
  'v1',
  1500,
  15,
  8,
  20,
  'IT',
  '00000000-0000-0000-0000-000000000117'
);

insert into public.production_lots (
  id, production_order_id, product_id, lot_number, lot_sequence,
  source_lot_reference, roll_count, created_at
) values
(
  '00000000-0000-0000-0000-000000000103',
  '00000000-0000-0000-0000-000000000102',
  '00000000-0000-0000-0000-000000000101',
  'PG-L-20260904-00000001-01',
  1,
  'UX-HANDOFF-UPGRADE-1',
  1,
  now() - interval '10 minutes'
),
(
  '00000000-0000-0000-0000-000000000108',
  '00000000-0000-0000-0000-000000000107',
  '00000000-0000-0000-0000-000000000101',
  'PG-L-20260904-00000002-01',
  1,
  'UX-HANDOFF-UPGRADE-2',
  1,
  now() - interval '9 minutes'
);

insert into public.rolls (
  id, product_id, production_order_id, production_lot_id, roll_index,
  serial_number, erp_serial, created_at
) values
(
  '00000000-0000-0000-0000-000000000104',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000102',
  '00000000-0000-0000-0000-000000000103',
  1,
  'PG-R-20260904-00000001-01-0001',
  'ERP-0000000000000001',
  now() - interval '8 minutes'
),
(
  '00000000-0000-0000-0000-000000000109',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000107',
  '00000000-0000-0000-0000-000000000108',
  1,
  'PG-R-20260904-00000002-01-0001',
  'ERP-0000000000000002',
  now() - interval '7 minutes'
);

insert into public.warranties (
  id, request_id, roll_id, warranty_number, record_state,
  activated_by_profile_id, activating_center_party_id,
  activating_center_name_snapshot, activated_at, coverage_expires_at,
  product_id, product_code_snapshot, product_name_snapshot, product_version_snapshot,
  warranty_months_snapshot, warranty_coverage_snapshot, care_instructions_snapshot,
  customer_name, customer_phone, customer_email,
  vehicle_make, vehicle_model, vehicle_year, vehicle_plate, vehicle_color, vehicle_vin,
  created_at, updated_at
) values
(
  '00000000-0000-0000-0000-000000000201',
  '00000000-0000-0000-0000-000000000211',
  '00000000-0000-0000-0000-000000000104',
  'PG-W-2026090401',
  'issued',
  '00000000-0000-0000-0000-000000000002',
  (select id from public.operational_parties where installation_center_id = '00000000-0000-0000-0000-000000000105'),
  'UX Handoff Upgrade Center',
  now() - interval '7 minutes',
  now() + interval '60 months',
  '00000000-0000-0000-0000-000000000101',
  'UPGRADE-PPF',
  'Upgrade PPF Fixture',
  'v1',
  60,
  'Bounded coverage for local upgrade regression.',
  'Bounded care instructions for local upgrade regression.',
  'Upgrade Customer One',
  '+393331234567',
  null,
  'Fiat',
  'Panda',
  2024,
  'UX-UPGRADE-1',
  'Black',
  'ZFA12345678901234',
  now() - interval '7 minutes',
  now() - interval '7 minutes'
),
(
  '00000000-0000-0000-0000-000000000202',
  '00000000-0000-0000-0000-000000000212',
  '00000000-0000-0000-0000-000000000109',
  'PG-W-2026090402',
  'issued',
  '00000000-0000-0000-0000-000000000002',
  (select id from public.operational_parties where installation_center_id = '00000000-0000-0000-0000-000000000105'),
  'UX Handoff Upgrade Center',
  now() - interval '6 minutes',
  now() + interval '60 months',
  '00000000-0000-0000-0000-000000000101',
  'UPGRADE-PPF',
  'Upgrade PPF Fixture',
  'v1',
  60,
  'Bounded coverage for local upgrade regression.',
  'Bounded care instructions for local upgrade regression.',
  'Upgrade Customer Two',
  '+393331234568',
  null,
  'Fiat',
  'Panda',
  2024,
  'UX-UPGRADE-2',
  'Black',
  'ZFA12345678901235',
  now() - interval '6 minutes',
  now() - interval '6 minutes'
);

insert into public.warranty_claims (
  id, request_id, warranty_id, claim_number, category, affected_area,
  description, status, submitted_at, closed_at, created_at, updated_at,
  decided_by_profile_id, decision_reason, customer_decision_message, decided_at
) values
(
  '00000000-0000-0000-0000-000000000301',
  '00000000-0000-0000-0000-000000000311',
  '00000000-0000-0000-0000-000000000201',
  'PG-C-2026090401',
  'other',
  'Front panel',
  'Existing claim notification fixture for the populated upgrade regression.',
  'submitted',
  now() - interval '6 minutes',
  null,
  now() - interval '6 minutes',
  now() - interval '6 minutes',
  null, null, null, null
),
(
  '00000000-0000-0000-0000-000000000302',
  '00000000-0000-0000-0000-000000000312',
  '00000000-0000-0000-0000-000000000202',
  'PG-C-2026090402',
  'other',
  'Rear panel',
  'Existing resolution notification fixture for the populated upgrade regression.',
  'approved',
  now() - interval '5 minutes',
  null,
  now() - interval '5 minutes',
  now() - interval '4 minutes',
  '00000000-0000-0000-0000-000000000001',
  'Approved for upgrade regression.',
  'تم اعتماد المطالبة لاختبار ترقية الإشعارات.',
  now() - interval '4 minutes'
);

insert into public.warranty_claim_events (
  id, claim_id, action_request_id, event_kind, actor_profile_id,
  actor_kind, reason, event_data, created_at
) values
(
  '00000000-0000-0000-0000-000000000401',
  '00000000-0000-0000-0000-000000000301',
  '00000000-0000-0000-0000-000000000411',
  'submitted',
  null,
  'customer_verified_phone',
  null,
  '{"source":"ux-handoff-upgrade-regression"}'::jsonb,
  now() - interval '5 minutes'
),
(
  '00000000-0000-0000-0000-000000000403',
  '00000000-0000-0000-0000-000000000302',
  '00000000-0000-0000-0000-000000000413',
  'submitted',
  null,
  'customer_verified_phone',
  null,
  '{"source":"ux-handoff-upgrade-regression"}'::jsonb,
  now() - interval '4 minutes'
);

insert into public.warranty_claim_resolutions (
  id, claim_id, status, authorized_by_profile_id, authorized_at,
  created_at, updated_at, remedy_kind, performing_center_party_id,
  assigned_by_profile_id, assigned_at
) values (
  '00000000-0000-0000-0000-000000000402',
  '00000000-0000-0000-0000-000000000302',
  'assigned',
  '00000000-0000-0000-0000-000000000001',
  now() - interval '3 minutes',
  now() - interval '4 minutes',
  now() - interval '3 minutes',
  'service_reinstall',
  (select id from public.operational_parties where installation_center_id = '00000000-0000-0000-0000-000000000105'),
  '00000000-0000-0000-0000-000000000001',
  now() - interval '3 minutes'
);

insert into public.warranty_claim_resolution_events (
  id, resolution_id, action_request_id, event_kind, actor_profile_id,
  actor_kind, reason, event_data, created_at
) values (
  '00000000-0000-0000-0000-000000000404',
  '00000000-0000-0000-0000-000000000402',
  '00000000-0000-0000-0000-000000000414',
  'resolution_assigned',
  '00000000-0000-0000-0000-000000000001',
  'admin',
  null,
  jsonb_build_object(
    'claim_id', '00000000-0000-0000-0000-000000000302',
    'remedy_kind', 'service_reinstall',
    'performing_center_party_id',
      (select id from public.operational_parties where installation_center_id = '00000000-0000-0000-0000-000000000105')
  ),
  now() - interval '2 minutes'
);

commit;
`;

runSql(seedSql);
assert(querySql("select count(*) from public.notifications where source_event_key = 'warranty_claim_events:" + claimEventId + "' and event_type = 'warranty.claim_submitted' and action_path is null;") === "1",
  "Pre-HANDOFF claim notification fixture was not null-routed.");
assert(querySql("select count(*) from public.notifications where source_event_key = 'warranty_claim_resolution_events:" + resolutionEventId + "' and event_type = 'claim_resolution.assigned' and action_path is null;") === "1",
  "Pre-HANDOFF resolution notification fixture was not null-routed.");

runLocalMigrationPath();
assert(querySql("select count(*) from supabase_migrations.schema_migrations where version = '" + migrationVersion + "';") === "1",
  "UX-HANDOFF was not recorded after the upgrade path.");

const claimRoute = "/operations/claims/" + claimId + "/review";
const resolutionRoute = "/operations/claim-resolution-tasks/" + resolutionId;
assert(querySql("select action_path from public.notifications where source_event_key = 'warranty_claim_events:" + claimEventId + "' and event_type = 'warranty.claim_submitted';") === claimRoute,
  "Historical claim notification was not backfilled to the exact Claim review route.");
assert(querySql("select action_path from public.notifications where source_event_key = 'warranty_claim_resolution_events:" + resolutionEventId + "' and event_type = 'claim_resolution.assigned';") === resolutionRoute,
  "Historical Resolution notification was not backfilled to the exact task route.");

runSql(String.raw`
insert into public.warranty_claim_events (
  id, claim_id, action_request_id, event_kind, actor_profile_id,
  actor_kind, reason, event_data, created_at
) values (
  '00000000-0000-0000-0000-000000000405',
  '00000000-0000-0000-0000-000000000301',
  '00000000-0000-0000-0000-000000000415',
  'inspection_submitted',
  '00000000-0000-0000-0000-000000000002',
  'center',
  null,
  '{"inspection_id":"00000000-0000-0000-0000-000000000499"}'::jsonb,
  now()
);

insert into public.warranty_claim_resolution_events (
  id, resolution_id, action_request_id, event_kind, actor_profile_id,
  actor_kind, reason, event_data, created_at
) values (
  '00000000-0000-0000-0000-000000000406',
  '00000000-0000-0000-0000-000000000402',
  '00000000-0000-0000-0000-000000000416',
  'resolution_reassigned',
  '00000000-0000-0000-0000-000000000001',
  'admin',
  'Future UX-HANDOFF reassignment regression.',
  jsonb_build_object(
    'claim_id', '00000000-0000-0000-0000-000000000302',
    'remedy_kind', 'service_reinstall',
    'performing_center_party_id',
      (select id from public.operational_parties where installation_center_id = '00000000-0000-0000-0000-000000000105')
  ),
  now()
);
`);

assert(querySql("select action_path from public.notifications where source_event_key = 'warranty_claim_events:" + futureClaimEventId + "' and event_type = 'claim.inspection_submitted';") === claimRoute,
  "Future Claim projector did not create the exact review route.");
assert(querySql("select action_path from public.notifications where source_event_key = 'warranty_claim_resolution_events:" + futureResolutionEventId + "' and event_type = 'claim_resolution.reassigned';") === resolutionRoute,
  "Future Resolution projector did not create the exact task route.");

const triggerState = querySql("select t.tgenabled from pg_trigger t where t.tgrelid = 'public.notifications'::regclass and t.tgname = 'notifications_guard_mutation' and not t.tgisinternal;");
assert(triggerState === "O", "notifications_guard_mutation is not enabled after migration.");
assert(querySql("select count(*) from pg_proc where oid = 'private.guard_notification_mutation()'::regprocedure;") === "1",
  "private.guard_notification_mutation() is missing.");

expectSqlFailure(
  "update public.notifications set action_path = '/operations/forbidden' where source_event_key = 'warranty_claim_events:" + claimEventId + "';",
  "PG_NOTIFICATION_CONTENT_IMMUTABLE",
);
expectSqlFailure(
  "update public.notifications set title = 'Forbidden mutation' where source_event_key = 'warranty_claim_events:" + claimEventId + "';",
  "PG_NOTIFICATION_CONTENT_IMMUTABLE",
);
assert(querySql("select action_path from public.notifications where source_event_key = 'warranty_claim_events:" + claimEventId + "' and event_type = 'warranty.claim_submitted';") === claimRoute,
  "Failed ordinary mutation changed the historical notification.");

console.log("UX-HANDOFF populated upgrade regression verified.");
console.log("Historical claim: " + claimRoute);
console.log("Historical resolution: " + resolutionRoute);
console.log("Future Claim and Resolution projector routes: verified.");
console.log("notifications_guard_mutation enabled (function: private.guard_notification_mutation).");
console.log("Ordinary action_path and title mutations: PG_NOTIFICATION_CONTENT_IMMUTABLE.");
