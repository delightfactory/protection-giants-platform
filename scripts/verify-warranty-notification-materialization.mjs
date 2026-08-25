import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const apiUrl = process.env.API_URL;
const anonKey = process.env.ANON_KEY;

if (!apiUrl || !anonKey) {
  throw new Error("Local Supabase API_URL and ANON_KEY are required.");
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

async function request(path, { method = "GET", token = anonKey, body } = {}) {
  const headers = { apikey: anonKey, Authorization: `Bearer ${token}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { response, body: await readJson(response) };
}

async function rpc(name, body, token) {
  return request(`/rest/v1/rpc/${name}`, { method: "POST", body, token });
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

function dbContainerName() {
  const names = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" })
    .split("\n").map((value) => value.trim()).filter(Boolean);
  const name = names.find((value) => value.startsWith("supabase_db_"));
  assert(name, "Supabase database container was not found for Cube M notification verification.");
  return name;
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

const adminToken = await signIn("cube-j-admin@example.test");
const centerToken = await signIn("cube-j-center-a@example.test");

const target = querySql(`
  select concat_ws('|', warranty.id, warranty.warranty_number, warranty.activating_center_party_id, event.id)
  from public.warranties warranty
  join public.warranty_events event
    on event.warranty_id = warranty.id
   and event.event_kind = 'activated'
  where warranty.customer_name = 'Cube M Corrected Customer'
    and warranty.record_state = 'issued'
  order by warranty.activated_at desc, warranty.id desc
  limit 1;
`).split("|");
assert(target.length === 4 && target.every(Boolean), `Issued notification fixture missing: ${target}`);
const [warrantyId, warrantyNumber, centerPartyId, activationEventId] = target;

assert(querySql(`
  select count(*)
  from public.notifications
  where source_domain = 'warranty'
    and source_event_key = 'warranty_events:${activationEventId}';
`) === "0", "Normal successful Warranty activation must remain notification-silent.");

const activeCenterProfiles = Number(querySql(`
  select count(*)
  from private.notification_party_profile_ids(${sqlUuid(centerPartyId)});
`));
assert(activeCenterProfiles >= 1, "Notification fixture must have at least one active activating-Center Profile.");

const subscription = await rpc("register_push_subscription", {
  p_endpoint: "https://push.example.test/cube-m-center-device",
  p_p256dh: "abcdefghijklmnopQRSTUV0123456789_-",
  p_auth_secret: "authSecret0123456789_-",
}, centerToken);
assert(subscription.response.ok && typeof subscription.body === "string",
  `Could not register bounded Center Push fixture: ${subscription.response.status} ${JSON.stringify(subscription.body)}`);
const subscriptionId = subscription.body;

const correctionRequestId = randomUUID();
const correctionPayload = {
  p_action_request_id: correctionRequestId,
  p_warranty_id: warrantyId,
  p_customer_name: "Notification Corrected Customer",
  p_customer_phone: "+201011122233",
  p_customer_email: "notification-corrected@example.test",
  p_vehicle_make: "Notification Make",
  p_vehicle_model: "Notification Model",
  p_vehicle_year: 2026,
  p_vehicle_plate: "NTF 2026",
  p_vehicle_color: "Graphite",
  p_vehicle_vin: "NOTIFYVIN12345",
  p_reason: "Admin corrected the customer and vehicle details for notification verification.",
};
const correction = await rpc("correct_warranty_details", correctionPayload, adminToken);
assert(correction.response.ok && typeof correction.body === "string",
  `Notification correction fixture failed: ${correction.response.status} ${JSON.stringify(correction.body)}`);
const correctionEventId = correction.body;
const correctionSourceKey = `warranty_events:${correctionEventId}`;

const correctionRows = querySql(`
  select concat_ws('|',
    count(*),
    count(*) filter (where event_type = 'warranty.details_corrected'),
    count(*) filter (where attention_level = 'info'),
    count(*) filter (where push_eligible = false),
    count(*) filter (where action_path = '/operations/warranties/${warrantyId}'),
    count(*) filter (where body like '%' || '${warrantyNumber}' || '%'),
    count(*) filter (where body like '%+201011122233%' or body like '%NOTIFYVIN12345%' or body like '%Notification Corrected Customer%'),
    count(*) filter (where profile.role = 'center')
  )
  from public.notifications notification
  join public.profiles profile on profile.id = notification.recipient_profile_id
  where notification.source_domain = 'warranty'
    and notification.source_event_key = '${correctionSourceKey}';
`).split("|").map(Number);
assert(correctionRows[0] === activeCenterProfiles
  && correctionRows[1] === activeCenterProfiles
  && correctionRows[2] === activeCenterProfiles
  && correctionRows[3] === activeCenterProfiles
  && correctionRows[4] === activeCenterProfiles
  && correctionRows[5] === activeCenterProfiles
  && correctionRows[6] === 0
  && correctionRows[7] === activeCenterProfiles,
  `Correction notification routing/content contract failed: ${correctionRows}`);
assert(querySql(`
  select count(*)
  from public.notification_push_deliveries delivery
  join public.notifications notification on notification.id = delivery.notification_id
  where notification.source_domain = 'warranty'
    and notification.source_event_key = '${correctionSourceKey}';
`) === "0", "Details-corrected notification must remain Inbox-only even when the Center has an active Push subscription.");

const correctionRetry = await rpc("correct_warranty_details", correctionPayload, adminToken);
assert(correctionRetry.response.ok && correctionRetry.body === correctionEventId,
  "Matching correction retry must retain the original event identity for notification deduplication.");
assert(querySql(`
  select count(*)
  from public.notifications
  where source_domain = 'warranty'
    and source_event_key = '${correctionSourceKey}';
`) === String(activeCenterProfiles), "Correction retry must not duplicate Inbox notifications.");

const voidRequestId = randomUUID();
const voidPayload = {
  p_action_request_id: voidRequestId,
  p_warranty_id: warrantyId,
  p_reason: "Admin confirmed that this activation was recorded in error.",
};
const voided = await rpc("void_warranty_in_error", voidPayload, adminToken);
assert(voided.response.ok && typeof voided.body === "string",
  `Notification void fixture failed: ${voided.response.status} ${JSON.stringify(voided.body)}`);
const voidEventId = voided.body;
const voidSourceKey = `warranty_events:${voidEventId}`;

const voidRows = querySql(`
  select concat_ws('|',
    count(*),
    count(*) filter (where event_type = 'warranty.voided_in_error'),
    count(*) filter (where attention_level = 'warning'),
    count(*) filter (where push_eligible = true),
    count(*) filter (where action_path = '/operations/warranties/${warrantyId}'),
    count(*) filter (where body like '%' || '${warrantyNumber}' || '%'),
    count(*) filter (where body like '%+201011122233%' or body like '%NOTIFYVIN12345%' or body like '%Notification Corrected Customer%'),
    count(*) filter (where profile.role = 'center')
  )
  from public.notifications notification
  join public.profiles profile on profile.id = notification.recipient_profile_id
  where notification.source_domain = 'warranty'
    and notification.source_event_key = '${voidSourceKey}';
`).split("|").map(Number);
assert(voidRows[0] === activeCenterProfiles
  && voidRows[1] === activeCenterProfiles
  && voidRows[2] === activeCenterProfiles
  && voidRows[3] === activeCenterProfiles
  && voidRows[4] === activeCenterProfiles
  && voidRows[5] === activeCenterProfiles
  && voidRows[6] === 0
  && voidRows[7] === activeCenterProfiles,
  `Void notification routing/content contract failed: ${voidRows}`);

const currentCenterNotification = querySql(`
  select notification.id
  from public.notifications notification
  join public.push_subscriptions subscription
    on subscription.profile_id = notification.recipient_profile_id
   and subscription.id = ${sqlUuid(subscriptionId)}
  where notification.source_domain = 'warranty'
    and notification.source_event_key = '${voidSourceKey}'
  limit 1;
`);
assert(/^[0-9a-f-]{36}$/i.test(currentCenterNotification),
  "Void notification for the subscribed Center Profile was not materialized.");
assert(querySql(`
  select concat_ws('|', delivery.status, delivery.attempt_count)
  from public.notification_push_deliveries delivery
  where delivery.notification_id = ${sqlUuid(currentCenterNotification)}
    and delivery.subscription_id = ${sqlUuid(subscriptionId)};
`) === "pending|0", "Void warning must create a pending Push delivery without coupling delivery success to Warranty state.");
assert(querySql(`select record_state from public.warranties where id = ${sqlUuid(warrantyId)};`) === "voided_in_error",
  "Warranty state must already be voided while Push transport is still pending.");

const voidRetry = await rpc("void_warranty_in_error", voidPayload, adminToken);
assert(voidRetry.response.ok && voidRetry.body === voidEventId,
  "Matching void retry must retain the original event identity for notification deduplication.");
assert(querySql(`
  select count(*)
  from public.notifications
  where source_domain = 'warranty'
    and source_event_key = '${voidSourceKey}';
`) === String(activeCenterProfiles), "Void retry must not duplicate Inbox notifications.");

const inbox = await rpc("list_notifications", { p_limit: 100, p_offset: 0 }, centerToken);
assert(inbox.response.ok && Array.isArray(inbox.body),
  `Center Inbox could not be read after Warranty support notifications: ${inbox.response.status} ${JSON.stringify(inbox.body)}`);
const correctionInbox = inbox.body.find((item) => item.source_event_key === correctionSourceKey);
const voidInbox = inbox.body.find((item) => item.source_event_key === voidSourceKey);
assert(correctionInbox?.event_type === "warranty.details_corrected"
  && correctionInbox?.push_eligible === false
  && voidInbox?.event_type === "warranty.voided_in_error"
  && voidInbox?.attention_level === "warning"
  && voidInbox?.push_eligible === true,
  "Current activating-Center Profile must see the bounded correction and void notifications in its existing Cube L Inbox.");

console.log("Cube M bounded Warranty support notification materialization verified.");
