import { execFileSync } from "node:child_process";
import fs from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function dbContainerName() {
  const names = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" })
    .split("\n").map((value) => value.trim()).filter(Boolean);
  const name = names.find((value) => value.startsWith("supabase_db_"));
  assert(name, "Supabase database container was not found for Cube R completion-notification verification.");
  return name;
}

function querySql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", dbContainerName(), "psql", "-At", "-F", "|", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-c", sql],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
}

function intValue(sql, label) {
  const value = Number(querySql(sql));
  assert(Number.isInteger(value) && value >= 0, `${label} did not return a non-negative integer.`);
  return value;
}

const migrationPath = "supabase/migrations/20260827092000_cube_r_completion_notification_materialization.sql";
const source = fs.readFileSync(migrationPath, "utf8");

assert(source.includes("create or replace function private.materialize_warranty_claim_resolution_notification_event()"),
  "Completion notification increment must extend the existing Resolution projector in place.");
assert(!source.includes("create trigger warranty_claim_resolution_events_materialize_notification"),
  "Completion notification increment must not add a second Resolution notification trigger.");
assert(source.includes("new.event_kind in ('resolution_completed', 'resolution_completed_admin_recovery')"),
  "Both normal Center completion and Admin recovery completion events must be projected.");
assert(source.includes("v_resolution.completed_by_profile_id is distinct from new.actor_profile_id"),
  "Completion projection must bind the event actor to authoritative Resolution completion truth.");
assert(source.includes("v_resolution.completion_actor_kind <> 'center'")
  && source.includes("v_resolution.completion_actor_kind <> 'admin_recovery'"),
  "Completion projection must validate normal vs recovery actor kind from the completed Resolution.");
assert(source.includes("where recipients.profile_id is distinct from new.actor_profile_id"),
  "Company completion Inbox must exclude the acting Profile to prevent self-success noise.");
assert(source.includes("'claim_resolution.completed'"),
  "Normal and recovery completion must share one stable Inbox event type.");
assert(source.includes("'info'") && source.includes("false,"),
  "Completion Inbox materialization must remain informational and Push-ineligible.");
assert(source.includes("'/operations/claims/' || v_claim.id::text"),
  "Completion notification must route to the existing exact Claim detail page, not a dead Resolution UI path.");

assert(source.includes("'resolution_cancelled_customer_withdrawal'"),
  "Completion increment must preserve the previously qualified PD-079 projector branch.");
assert(source.includes("v_customer_message := nullif(new.event_data ->> 'customer_message', '')"),
  "PD-079 projector must preserve exact customer-message event validation.");
assert(source.includes("v_resolution.status <> 'cancelled'")
  && source.includes("v_resolution.customer_cancellation_message <> v_customer_message"),
  "PD-079 projector must preserve terminal Resolution/customer-message validation.");
assert(source.includes("'claim_resolution.cancelled_customer_withdrawal'"),
  "PD-079 Center notification event type must remain present.");
assert(source.includes("'تم إغلاق تنفيذ مطالبة الضمان'"),
  "PD-079 Center notification title must remain present.");
assert(source.includes("'claim_resolution.assigned'")
  && source.includes("'claim_resolution.reassigned'")
  && source.includes("'action_required'")
  && source.includes("true,"),
  "Previously qualified assigned/reassigned notification semantics must remain present.");

assert(intValue(`
  select count(*)
  from pg_trigger trigger
  join pg_class relation on relation.oid = trigger.tgrelid
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relname = 'warranty_claim_resolution_events'
    and trigger.tgname = 'warranty_claim_resolution_events_materialize_notification'
    and not trigger.tgisinternal;
`, "Resolution notification trigger count") === 1,
"Cube R must retain exactly one Resolution-event notification trigger.");

const centerCompletionEvents = intValue(`
  select count(*)
  from public.warranty_claim_resolution_events event
  where event.event_kind = 'resolution_completed'
    and event.actor_kind = 'center';
`, "normal Center completion event count");
assert(centerCompletionEvents > 0,
  "Completion notification verifier requires normal Center completion fixtures from the preceding Cube R regression.");

const recoveryCompletionEvents = intValue(`
  select count(*)
  from public.warranty_claim_resolution_events event
  where event.event_kind = 'resolution_completed_admin_recovery'
    and event.actor_kind = 'admin';
`, "Admin recovery completion event count");
assert(recoveryCompletionEvents > 0,
  "Completion notification verifier requires Admin recovery fixtures from the preceding Cube R regression.");

const expectedCompanyNotifications = intValue(`
  with company_party as (
    select party.id
    from public.operational_parties party
    where party.party_type = 'company'
  ), completion_events as (
    select event.id as event_id, event.actor_profile_id
    from public.warranty_claim_resolution_events event
    where event.event_kind in ('resolution_completed', 'resolution_completed_admin_recovery')
  )
  select count(*)
  from completion_events event
  cross join company_party company
  cross join lateral private.notification_party_profile_ids(company.id) recipient
  where recipient.profile_id is distinct from event.actor_profile_id;
`, "expected Company completion notification count");
assert(expectedCompanyNotifications > 0,
  "At least one normal Center completion must target an active Company/Admin Inbox Profile.");

const actualCompanyNotifications = intValue(`
  select count(*)
  from public.notifications notification
  join public.warranty_claim_resolution_events event
    on notification.source_event_key = 'warranty_claim_resolution_events:' || event.id::text
  where event.event_kind in ('resolution_completed', 'resolution_completed_admin_recovery')
    and notification.source_domain = 'warranty_claim_resolution'
    and notification.event_type = 'claim_resolution.completed';
`, "actual Company completion notification count");
assert(actualCompanyNotifications === expectedCompanyNotifications,
  `Expected ${expectedCompanyNotifications} completion Inbox rows, found ${actualCompanyNotifications}.`);

assert(intValue(`
  with company_party as (
    select party.id
    from public.operational_parties party
    where party.party_type = 'company'
  ), completion_events as (
    select
      event.id as event_id,
      event.actor_profile_id,
      resolution.claim_id,
      claim.claim_number
    from public.warranty_claim_resolution_events event
    join public.warranty_claim_resolutions resolution on resolution.id = event.resolution_id
    join public.warranty_claims claim on claim.id = resolution.claim_id
    where event.event_kind in ('resolution_completed', 'resolution_completed_admin_recovery')
  )
  select count(*)
  from completion_events event
  cross join company_party company
  cross join lateral private.notification_party_profile_ids(company.id) recipient
  where recipient.profile_id is distinct from event.actor_profile_id
    and not exists (
      select 1
      from public.notifications notification
      where notification.recipient_profile_id = recipient.profile_id
        and notification.source_domain = 'warranty_claim_resolution'
        and notification.source_event_key = 'warranty_claim_resolution_events:' || event.event_id::text
        and notification.event_type = 'claim_resolution.completed'
        and notification.attention_level = 'info'
        and notification.title = 'تم إكمال معالجة مطالبة ضمان'
        and notification.body like '%' || event.claim_number || '%'
        and notification.action_path = '/operations/claims/' || event.claim_id::text
        and notification.push_eligible = false
    );
`, "missing or malformed completion notification count") === 0,
"Every eligible Company/Admin recipient must receive the exact informational Claim-detail completion Inbox row.");

assert(intValue(`
  select count(*)
  from public.notifications notification
  join public.warranty_claim_resolution_events event
    on notification.source_event_key = 'warranty_claim_resolution_events:' || event.id::text
  where event.event_kind in ('resolution_completed', 'resolution_completed_admin_recovery')
    and notification.source_domain = 'warranty_claim_resolution'
    and notification.event_type = 'claim_resolution.completed'
    and notification.recipient_profile_id = event.actor_profile_id;
`, "completion self-notification count") === 0,
"Completion notifications must never be materialized back to the acting Center/Admin Profile.");

assert(intValue(`
  with company_party as (
    select party.id
    from public.operational_parties party
    where party.party_type = 'company'
  )
  select count(*)
  from public.notifications notification
  join public.warranty_claim_resolution_events event
    on notification.source_event_key = 'warranty_claim_resolution_events:' || event.id::text
  where event.event_kind in ('resolution_completed', 'resolution_completed_admin_recovery')
    and notification.source_domain = 'warranty_claim_resolution'
    and notification.event_type = 'claim_resolution.completed'
    and not exists (
      select 1
      from company_party company
      cross join lateral private.notification_party_profile_ids(company.id) recipient
      where recipient.profile_id = notification.recipient_profile_id
        and recipient.profile_id is distinct from event.actor_profile_id
    );
`, "completion recipient leakage count") === 0,
"Completion Inbox rows must not leak to Center/customer/unrelated operational Profiles.");

assert(intValue(`
  select count(*)
  from public.notifications notification
  join public.warranty_claim_resolution_events event
    on notification.source_event_key = 'warranty_claim_resolution_events:' || event.id::text
  where event.event_kind in ('resolution_completed', 'resolution_completed_admin_recovery')
    and notification.source_domain = 'warranty_claim_resolution'
    and notification.push_eligible = true;
`, "completion Push-eligible row count") === 0,
"Completion notifications must remain Inbox-only and must not enqueue Push delivery.");

assert(intValue(`
  select count(*)
  from public.notifications notification
  join public.warranty_claim_resolution_events event
    on notification.source_event_key = 'warranty_claim_resolution_events:' || event.id::text
  where event.event_kind not in (
      'resolution_assigned',
      'resolution_reassigned',
      'resolution_cancelled_customer_withdrawal',
      'resolution_completed',
      'resolution_completed_admin_recovery'
    )
    and notification.source_domain = 'warranty_claim_resolution';
`, "unrelated Resolution-event notification count") === 0,
"Material allocation/consumption/remedy and other unrelated Resolution events must remain notification-silent in this projector.");

console.log("Cube R completion notification materialization PASS: one cumulative projector/trigger, preserved assignment/reassignment/PD-079 semantics, normal+recovery Company Inbox coverage, actor exclusion, Claim-detail routing, no completion Push or unrelated-recipient/event leakage.");
