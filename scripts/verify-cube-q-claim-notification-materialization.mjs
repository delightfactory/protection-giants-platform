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

async function request(path, {
  method = "GET",
  token = serviceRoleKey,
  key = serviceRoleKey,
  body,
} = {}) {
  const headers = { apikey: key, Authorization: `Bearer ${token}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { response, body: await readJson(response) };
}

async function rpc(name, body, token = serviceRoleKey, key = serviceRoleKey) {
  return request(`/rest/v1/rpc/${name}`, { method: "POST", body, token, key });
}

async function userRpc(name, body, token) {
  return rpc(name, body, token, anonKey);
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
  assert(name, "Supabase database container was not found for Cube Q notification verification.");
  return name;
}

function querySql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", dbContainerName(), "psql", "-At", "-F", "|", "-v", "ON_ERROR_STOP=1",
      "-U", "postgres", "-d", "postgres", "-c", sql],
    { encoding: "utf8" },
  ).trim();
}

function sqlUuid(value) {
  assert(/^[0-9a-f-]{36}$/i.test(value), `Unsafe UUID: ${value}`);
  return `'${value}'::uuid`;
}

function eventId(claimId, kind, extra = "") {
  const id = querySql(`
    select event.id
    from public.warranty_claim_events event
    where event.claim_id = ${sqlUuid(claimId)}
      and event.event_kind = '${kind}'
      ${extra}
    order by event.created_at desc, event.id desc
    limit 1;
  `);
  assert(/^[0-9a-f-]{36}$/i.test(id), `Missing ${kind} event for Claim ${claimId}.`);
  return id;
}

function notificationCount(eventIdValue, eventType) {
  return Number(querySql(`
    select count(*)
    from public.notifications notification
    where notification.source_domain = 'warranty_claim'
      and notification.source_event_key = 'warranty_claim_events:${eventIdValue}'
      and notification.event_type = '${eventType}';
  `));
}

function assertNotificationShape({
  eventIdValue,
  eventType,
  expectedCount,
  attention,
  pushEligible,
  actionPath,
  recipientRole,
  claimNumber,
}) {
  const rows = querySql(`
    select concat_ws('|',
      count(*),
      count(*) filter (where notification.attention_level = '${attention}'),
      count(*) filter (where notification.push_eligible = ${pushEligible ? "true" : "false"}),
      count(*) filter (where notification.action_path = '${actionPath}'),
      count(*) filter (where profile.role = '${recipientRole}'),
      count(*) filter (where notification.body like '%${claimNumber}%')
    )
    from public.notifications notification
    join public.profiles profile on profile.id = notification.recipient_profile_id
    where notification.source_domain = 'warranty_claim'
      and notification.source_event_key = 'warranty_claim_events:${eventIdValue}'
      and notification.event_type = '${eventType}';
  `).split("|").map(Number);

  assert(rows.length === 6 && rows.every((value) => value === expectedCount),
    `${eventType} notification contract failed: ${rows}; expected ${expectedCount} for every shape check.`);
}

const adminToken = await signIn("cube-j-admin@example.test");

const companyPartyId = querySql(`
  select id from public.operational_parties where party_type = 'company';
`);
const centerAPartyId = querySql(`
  select party.id
  from public.operational_parties party
  join public.installation_centers center on center.id = party.installation_center_id
  where party.party_type = 'center' and center.code = 'CUBE-J-CENTER-A';
`);
const centerBPartyId = querySql(`
  select party.id
  from public.operational_parties party
  join public.installation_centers center on center.id = party.installation_center_id
  where party.party_type = 'center' and center.code = 'CUBE-J-CENTER-B';
`);
assert(companyPartyId && centerAPartyId && centerBPartyId,
  "Cube Q notification verification requires Company and Center A/B operational parties.");

const activeAdminProfiles = Number(querySql(`
  select count(*) from private.notification_party_profile_ids(${sqlUuid(companyPartyId)});
`));
const activeCenterAProfiles = Number(querySql(`
  select count(*) from private.notification_party_profile_ids(${sqlUuid(centerAPartyId)});
`));
const activeCenterBProfiles = Number(querySql(`
  select count(*) from private.notification_party_profile_ids(${sqlUuid(centerBPartyId)});
`));
assert(activeAdminProfiles >= 1 && activeCenterAProfiles >= 1 && activeCenterBProfiles >= 1,
  "Notification verification requires active Company/Admin and Center A/B Profiles.");

const claimA = querySql(`
  select concat_ws('|', claim.id, claim.claim_number)
  from public.warranty_claims claim
  where exists (
    select 1 from public.warranty_claim_events event
    where event.claim_id = claim.id
      and event.event_kind = 'approval_cancelled_before_execution'
  )
  limit 1;
`).split("|");
assert(claimA.length === 2 && claimA.every(Boolean), `Could not identify Cube Q Claim A: ${claimA}`);
const [claimAId, claimANumber] = claimA;
assert(/^PG-C-\d{8}$/.test(claimANumber), `Unexpected Claim Number shape: ${claimANumber}`);

const submittedEventId = eventId(claimAId, "submitted");
const reviewStartedEventId = eventId(claimAId, "review_started");
const inspectionRequestedEventId = eventId(claimAId, "inspection_requested");
const pendingCancelledEventId = eventId(claimAId, "cancelled");
const pendingReopenEventId = eventId(
  claimAId,
  "decision_reopened_for_correction",
  "and event.event_data ->> 'resumed_status' = 'awaiting_inspection'",
);
const reassignedEventId = eventId(claimAId, "inspection_reassigned");
const inspectionSubmittedEventId = eventId(claimAId, "inspection_submitted");
const approvedEventId = eventId(claimAId, "approved");
const approvalCorrectionEventId = eventId(claimAId, "approval_cancelled_before_execution");

assertNotificationShape({
  eventIdValue: submittedEventId,
  eventType: "claim.submitted",
  expectedCount: activeAdminProfiles,
  attention: "action_required",
  pushEligible: true,
  actionPath: `/operations/claims/${claimAId}`,
  recipientRole: "admin",
  claimNumber: claimANumber,
});
assert(notificationCount(reviewStartedEventId, "claim.review_started") === 0
  && Number(querySql(`
    select count(*) from public.notifications
    where source_domain = 'warranty_claim'
      and source_event_key = 'warranty_claim_events:${reviewStartedEventId}';
  `)) === 0,
  "review_started must remain notification-silent.");

assertNotificationShape({
  eventIdValue: inspectionRequestedEventId,
  eventType: "claim.inspection_requested",
  expectedCount: activeCenterAProfiles,
  attention: "action_required",
  pushEligible: true,
  actionPath: "/operations/claim-inspections",
  recipientRole: "center",
  claimNumber: claimANumber,
});

assertNotificationShape({
  eventIdValue: pendingCancelledEventId,
  eventType: "claim.inspection_cancelled",
  expectedCount: activeCenterAProfiles,
  attention: "info",
  pushEligible: false,
  actionPath: "/operations/claim-inspections",
  recipientRole: "center",
  claimNumber: claimANumber,
});
assert(notificationCount(pendingCancelledEventId, "claim.cancelled") === Math.max(0, activeAdminProfiles - 1),
  "Ordinary pending-inspection cancellation must exclude the acting Admin from internal self-success notifications.");

assertNotificationShape({
  eventIdValue: pendingReopenEventId,
  eventType: "claim.inspection_resumed",
  expectedCount: activeCenterAProfiles,
  attention: "action_required",
  pushEligible: true,
  actionPath: "/operations/claim-inspections",
  recipientRole: "center",
  claimNumber: claimANumber,
});
assert(notificationCount(pendingReopenEventId, "claim.decision_reopened_for_correction")
  === Math.max(0, activeAdminProfiles - 1),
  "PD-078 internal correction visibility must exclude the acting Admin.");

assertNotificationShape({
  eventIdValue: reassignedEventId,
  eventType: "claim.inspection_reassigned",
  expectedCount: activeCenterBProfiles,
  attention: "action_required",
  pushEligible: true,
  actionPath: "/operations/claim-inspections",
  recipientRole: "center",
  claimNumber: claimANumber,
});
assert(Number(querySql(`
  select count(*)
  from public.notifications notification
  join public.profiles profile on profile.id = notification.recipient_profile_id
  where notification.source_domain = 'warranty_claim'
    and notification.source_event_key = 'warranty_claim_events:${reassignedEventId}'
    and notification.event_type = 'claim.inspection_reassigned'
    and profile.installation_center_id = (
      select center.id from public.installation_centers center where center.code = 'CUBE-J-CENTER-A'
    );
`)) === 0, "Inspection reassignment must notify the newly assigned Center, not the old Center.");

assertNotificationShape({
  eventIdValue: inspectionSubmittedEventId,
  eventType: "claim.inspection_submitted",
  expectedCount: activeAdminProfiles,
  attention: "action_required",
  pushEligible: true,
  actionPath: `/operations/claims/${claimAId}/review`,
  recipientRole: "admin",
  claimNumber: claimANumber,
});

for (const [eventIdValue, eventType] of [
  [approvedEventId, "claim.approved"],
  [approvalCorrectionEventId, "claim.approval_cancelled_before_execution"],
]) {
  assert(notificationCount(eventIdValue, eventType) === Math.max(0, activeAdminProfiles - 1),
    `${eventType} must exclude the acting Admin from self-success visibility.`);
}

assert(Number(querySql(`
  select count(*)
  from public.notifications notification
  join public.warranty_claim_events event
    on notification.source_event_key = 'warranty_claim_events:' || event.id::text
  join public.warranty_claims claim on claim.id = event.claim_id
  join public.warranties warranty on warranty.id = claim.warranty_id
  where notification.source_domain = 'warranty_claim'
    and (
      (coalesce(warranty.customer_phone, '') <> ''
        and position(warranty.customer_phone in notification.body) > 0)
      or (coalesce(warranty.customer_name, '') <> ''
        and position(warranty.customer_name in notification.body) > 0)
      or (coalesce(warranty.vehicle_vin, '') <> ''
        and position(warranty.vehicle_vin in notification.body) > 0)
    );
`)) === 0, "Claim notification bodies must not leak customer phone/name/VIN PII.");

const secondAdminEmail = `cube-q-notify-admin-${randomUUID()}@example.test`;
const createdSecondAdmin = await request("/auth/v1/admin/users", {
  method: "POST",
  body: {
    email: secondAdminEmail,
    password,
    email_confirm: true,
    app_metadata: {
      pg_provisioning: {
        version: "operational-v1",
        role: "admin",
      },
    },
    user_metadata: {
      display_name: "Cube Q Notification Admin",
    },
  },
});
assert(createdSecondAdmin.response.ok && /^[0-9a-f-]{36}$/i.test(createdSecondAdmin.body?.id ?? ""),
  `Could not create second Admin notification fixture: ${createdSecondAdmin.response.status} ${JSON.stringify(createdSecondAdmin.body)}`);
const secondAdminId = createdSecondAdmin.body.id;
const secondAdminToken = await signIn(secondAdminEmail);

assert(Number(querySql(`
  select count(*) from private.notification_party_profile_ids(${sqlUuid(companyPartyId)});
`)) === activeAdminProfiles + 1, "Second Admin must become an active Company notification recipient.");

const claimB = querySql(`
  select concat_ws('|', claim.id, claim.claim_number)
  from public.warranty_claims claim
  where claim.id <> ${sqlUuid(claimAId)}
    and claim.status in ('rejected', 'cancelled')
    and claim.closed_at is not null
    and not exists (
      select 1 from public.warranty_claim_resolutions resolution where resolution.claim_id = claim.id
    )
    and not exists (
      select 1
      from public.warranty_claims later_claim
      where later_claim.warranty_id = claim.warranty_id
        and later_claim.id <> claim.id
        and (
          later_claim.submitted_at > claim.submitted_at
          or (later_claim.submitted_at = claim.submitted_at and later_claim.id > claim.id)
        )
    )
  order by claim.submitted_at desc, claim.id desc
  limit 1;
`).split("|");
assert(claimB.length === 2 && claimB.every(Boolean), `Could not identify eligible Claim B: ${claimB}`);
const [claimBId, claimBNumber] = claimB;

const secondReopenRequestId = randomUUID();
const secondReopen = await userRpc("reopen_warranty_claim_decision_for_correction", {
  p_action_request_id: secondReopenRequestId,
  p_claim_id: claimBId,
  p_reason: "Notification verification reopens the latest bounded decision for second-Admin visibility.",
}, adminToken);
assert(secondReopen.response.ok && typeof secondReopen.body === "string",
  `Could not create second-Admin correction notification: ${secondReopen.response.status} ${JSON.stringify(secondReopen.body)}`);
const secondReopenEventId = secondReopen.body;

assertNotificationShape({
  eventIdValue: secondReopenEventId,
  eventType: "claim.decision_reopened_for_correction",
  expectedCount: 1,
  attention: "action_required",
  pushEligible: false,
  actionPath: `/operations/claims/${claimBId}/review`,
  recipientRole: "admin",
  claimNumber: claimBNumber,
});
assert(querySql(`
  select recipient_profile_id
  from public.notifications
  where source_domain = 'warranty_claim'
    and source_event_key = 'warranty_claim_events:${secondReopenEventId}'
    and event_type = 'claim.decision_reopened_for_correction';
`) === secondAdminId, "Correction notification must go to the other active Admin only.");
assert(notificationCount(secondReopenEventId, "claim.inspection_resumed") === 0,
  "A correction reopened to under_review must not fabricate a Center inspection notification.");

const finalRejectRequestId = randomUUID();
const finalRejectPayload = {
  p_action_request_id: finalRejectRequestId,
  p_claim_id: claimBId,
  p_reason: "Notification verification records one bounded final rejection after correction.",
  p_customer_message: "تم إغلاق المطالبة بعد استكمال المراجعة المصححة.",
};
const finalReject = await userRpc("reject_warranty_claim", finalRejectPayload, adminToken);
assert(finalReject.response.ok && typeof finalReject.body === "string",
  `Could not create second-Admin final-decision notification: ${finalReject.response.status} ${JSON.stringify(finalReject.body)}`);
const finalRejectEventId = finalReject.body;

assertNotificationShape({
  eventIdValue: finalRejectEventId,
  eventType: "claim.rejected",
  expectedCount: 1,
  attention: "info",
  pushEligible: false,
  actionPath: `/operations/claims/${claimBId}`,
  recipientRole: "admin",
  claimNumber: claimBNumber,
});
assert(querySql(`
  select recipient_profile_id
  from public.notifications
  where source_domain = 'warranty_claim'
    and source_event_key = 'warranty_claim_events:${finalRejectEventId}'
    and event_type = 'claim.rejected';
`) === secondAdminId, "Final decision notification must exclude the acting Admin and reach the other Admin.");

const finalRejectRetry = await userRpc("reject_warranty_claim", finalRejectPayload, adminToken);
assert(finalRejectRetry.response.ok && finalRejectRetry.body === finalRejectEventId,
  "Matching final-decision retry must return the same event identity.");
assert(notificationCount(finalRejectEventId, "claim.rejected") === 1,
  "Matching final-decision retry must not duplicate the Inbox projection.");

assert(querySql(`
  select count(*)
  from public.notification_push_deliveries delivery
  join public.notifications notification on notification.id = delivery.notification_id
  where notification.source_domain = 'warranty_claim'
    and notification.source_event_key in (
      'warranty_claim_events:${secondReopenEventId}',
      'warranty_claim_events:${finalRejectEventId}'
    );
`) === "0", "Bounded internal decision/correction visibility must remain Inbox-only.");

const secondAdminInbox = await userRpc("list_notifications", { p_limit: 100, p_offset: 0 }, secondAdminToken);
assert(secondAdminInbox.response.ok && Array.isArray(secondAdminInbox.body),
  `Second Admin Inbox read failed: ${secondAdminInbox.response.status} ${JSON.stringify(secondAdminInbox.body)}`);
assert(secondAdminInbox.body.some((item) =>
    item.source_event_key === `warranty_claim_events:${secondReopenEventId}`
    && item.event_type === "claim.decision_reopened_for_correction")
  && secondAdminInbox.body.some((item) =>
    item.source_event_key === `warranty_claim_events:${finalRejectEventId}`
    && item.event_type === "claim.rejected"),
  "Other active Admin must see bounded Claim correction/final-decision visibility in the existing Cube L Inbox.");

console.log("Cube Q bounded Claim notification materialization verified.");
