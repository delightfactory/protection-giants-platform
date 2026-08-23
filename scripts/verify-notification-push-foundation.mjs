import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const apiUrl = process.env.API_URL;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
const anonKey = process.env.ANON_KEY;

if (!apiUrl || !serviceRoleKey || !anonKey) {
  throw new Error("Local Supabase API_URL, SERVICE_ROLE_KEY and ANON_KEY are required.");
}

const password = "Cube-L-Push-Foundation-2026!";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

async function request(path, { method = "GET", token = anonKey, key = anonKey, body, prefer = false } = {}) {
  const headers = { apikey: key, Authorization: `Bearer ${token}` };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    if (prefer) headers.Prefer = "return=representation";
  }
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { response, body: await readJson(response) };
}

async function rest(path, token, options = {}) {
  return request(`/rest/v1/${path}`, { ...options, token });
}

async function rpc(name, body, token) {
  return rest(`rpc/${name}`, token, { method: "POST", body });
}

async function expectRpcError(name, body, token, expectedMessage) {
  const result = await rpc(name, body, token);
  assert(!result.response.ok, `${name} unexpectedly succeeded; expected ${expectedMessage}.`);
  assert(result.body?.message === expectedMessage,
    `${name} expected ${expectedMessage}, got ${result.response.status} ${JSON.stringify(result.body)}`);
  return result;
}

async function createUser({ email, role, countryAgentId = null, dealerId = null, centerId = null }) {
  const result = await request("/auth/v1/admin/users", {
    method: "POST",
    key: serviceRoleKey,
    token: serviceRoleKey,
    body: {
      email,
      password,
      email_confirm: true,
      app_metadata: {
        pg_provisioning: {
          version: "operational-v1",
          role,
          country_agent_id: countryAgentId,
          dealer_id: dealerId,
          installation_center_id: centerId,
        },
      },
      user_metadata: { display_name: `Cube L Push ${role}` },
    },
  });
  assert(result.response.ok && result.body?.id,
    `Could not create ${role} user: ${result.response.status} ${JSON.stringify(result.body)}`);
  return result.body;
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
  assert(name, "Supabase database container was not found for Cube L Push fixtures.");
  return name;
}

function runSql(sql) {
  execFileSync(
    "docker",
    ["exec", "-i", dbContainerName(), "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
    { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  );
}

function querySql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", dbContainerName(), "psql", "-At", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-c", sql],
    { encoding: "utf8" },
  ).trim();
}

function sqlUuid(value) {
  assert(/^[0-9a-f-]{36}$/i.test(value), `Unsafe UUID fixture: ${value}`);
  return `'${value}'::uuid`;
}

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function profileId(email) {
  const value = querySql(`
    select p.id
    from public.profiles p
    join auth.users u on u.id = p.id
    where u.email = ${sqlText(email)};
  `);
  assert(/^[0-9a-f-]{36}$/i.test(value), `Profile not found for ${email}`);
  return value;
}

function subscriptionRow(subscriptionId) {
  const raw = querySql(`
    select row_to_json(row_data)::text
    from (
      select id, profile_id, endpoint, p256dh, auth_secret, disabled_at, created_at, updated_at
      from public.push_subscriptions
      where id = ${sqlUuid(subscriptionId)}
    ) row_data;
  `);
  assert(raw, `Subscription ${subscriptionId} not found.`);
  return JSON.parse(raw);
}

function deliveryRows(notificationId) {
  const raw = querySql(`
    select coalesce(json_agg(json_build_object(
      'subscription_id', delivery.subscription_id,
      'status', delivery.status,
      'attempt_count', delivery.attempt_count,
      'last_error_code', delivery.last_error_code
    ) order by delivery.subscription_id)::text, '[]')
    from public.notification_push_deliveries delivery
    where delivery.notification_id = ${sqlUuid(notificationId)};
  `);
  return JSON.parse(raw || "[]");
}

function insertNotification({ profileIdValue, pushEligible, sourceKey }) {
  const notificationId = randomUUID();
  runSql(`
    insert into public.notifications (
      id,
      recipient_profile_id,
      event_type,
      source_domain,
      source_event_key,
      attention_level,
      title,
      body,
      action_path,
      push_eligible
    ) values (
      ${sqlUuid(notificationId)},
      ${sqlUuid(profileIdValue)},
      'test.push_foundation',
      'cube_l_push_test',
      ${sqlText(sourceKey)},
      'info',
      'اختبار إشعار',
      'اختبار تأسيس توصيل Web Push بدون أي بيانات حساسة.',
      '/operations/notifications',
      ${pushEligible ? "true" : "false"}
    );
  `);
  return notificationId;
}

const emails = {
  adminA: "cube-l-push-admin-a@example.test",
  adminB: "cube-l-push-admin-b@example.test",
  suspendedAdmin: "cube-l-push-admin-suspended@example.test",
  agent: "cube-l-push-agent@example.test",
};

await createUser({ email: emails.adminA, role: "admin" });
await createUser({ email: emails.adminB, role: "admin" });
await createUser({ email: emails.suspendedAdmin, role: "admin" });
const adminAToken = await signIn(emails.adminA);
const adminBToken = await signIn(emails.adminB);
const suspendedAdminToken = await signIn(emails.suspendedAdmin);
const adminAId = profileId(emails.adminA);
const adminBId = profileId(emails.adminB);
const suspendedAdminId = profileId(emails.suspendedAdmin);

const agentResult = await rest("country_agents?select=id", adminAToken, {
  method: "POST",
  prefer: true,
  body: { code: "CUBE-L-PUSH-AGENT", name: "Cube L Push Agent", country_code: "EG" },
});
assert(agentResult.response.ok && Array.isArray(agentResult.body) && agentResult.body.length === 1,
  `Could not create Push Agent: ${agentResult.response.status} ${JSON.stringify(agentResult.body)}`);
const agent = agentResult.body[0];
await createUser({ email: emails.agent, role: "agent", countryAgentId: agent.id });
const agentToken = await signIn(emails.agent);
const agentProfileId = profileId(emails.agent);

const endpointOne = "https://push.example.test/subscription/device-one";
const endpointTwo = "https://push.example.test/subscription/device-two";
const endpointSuspended = "https://push.example.test/subscription/suspended";
const endpointAgent = "https://push.example.test/subscription/agent";
const keyOne = "BElongBase64UrlP256dhKey_DeviceOne_1234567890";
const keyOneUpdated = "BEupdatedBase64UrlP256dhKey_DeviceOne_123456789";
const keyTwo = "BElongBase64UrlP256dhKey_DeviceTwo_1234567890";
const authOne = "AuthSecretDeviceOne_123456";
const authOneUpdated = "AuthSecretDeviceOne_UPDATED_123";
const authTwo = "AuthSecretDeviceTwo_123456";

// Data API hardening: subscription and delivery tables are not a client-readable
// or client-mutable directory, even for an authenticated Profile.
for (const table of ["push_subscriptions", "notification_push_deliveries"]) {
  const selectAttempt = await rest(`${table}?select=*`, adminAToken);
  assert(!selectAttempt.response.ok, `${table} must not be directly readable by authenticated clients.`);
  const insertAttempt = await rest(table, adminAToken, {
    method: "POST",
    body: table === "push_subscriptions"
      ? { profile_id: adminAId, endpoint: endpointOne, p256dh: keyOne, auth_secret: authOne }
      : { notification_id: randomUUID(), subscription_id: randomUUID() },
  });
  assert(!insertAttempt.response.ok, `${table} must not be directly insertable by authenticated clients.`);
}

const anonymousRegister = await rpc("register_push_subscription", {
  p_endpoint: endpointOne,
  p_p256dh: keyOne,
  p_auth_secret: authOne,
}, anonKey);
assert(!anonymousRegister.response.ok, "Anonymous role must not execute Push subscription registration.");

await expectRpcError("register_push_subscription", {
  p_endpoint: "http://push.example.test/not-secure",
  p_p256dh: keyOne,
  p_auth_secret: authOne,
}, adminAToken, "PG_PUSH_ENDPOINT_INVALID");

const firstRegistration = await rpc("register_push_subscription", {
  p_endpoint: endpointOne,
  p_p256dh: keyOne,
  p_auth_secret: authOne,
}, adminAToken);
assert(firstRegistration.response.ok && /^[0-9a-f-]{36}$/i.test(firstRegistration.body),
  `First Push registration failed: ${firstRegistration.response.status} ${JSON.stringify(firstRegistration.body)}`);
const subscriptionOneId = firstRegistration.body;

const exactRetry = await rpc("register_push_subscription", {
  p_endpoint: endpointOne,
  p_p256dh: keyOne,
  p_auth_secret: authOne,
}, adminAToken);
assert(exactRetry.response.ok && exactRetry.body === subscriptionOneId,
  "Exact subscription registration retry must be idempotent.");

const beforeRepair = subscriptionRow(subscriptionOneId);
const repair = await rpc("register_push_subscription", {
  p_endpoint: endpointOne,
  p_p256dh: keyOneUpdated,
  p_auth_secret: authOneUpdated,
}, adminAToken);
assert(repair.response.ok && repair.body === subscriptionOneId,
  "Same owner must repair keys on the same endpoint without creating a new subscription.");
const afterRepair = subscriptionRow(subscriptionOneId);
assert(afterRepair.p256dh === keyOneUpdated && afterRepair.auth_secret === authOneUpdated,
  "Subscription repair did not persist replacement key material.");
assert(afterRepair.created_at === beforeRepair.created_at,
  "Subscription repair must preserve original creation identity.");

await expectRpcError("register_push_subscription", {
  p_endpoint: endpointOne,
  p_p256dh: keyOne,
  p_auth_secret: authOne,
}, adminBToken, "PG_PUSH_ENDPOINT_OWNED");

const ownerState = await rpc("current_push_subscription_state", { p_endpoint: endpointOne }, adminAToken);
assert(ownerState.response.ok && ownerState.body === "subscribed",
  `Owner current-device state mismatch: ${JSON.stringify(ownerState.body)}`);
const otherState = await rpc("current_push_subscription_state", { p_endpoint: endpointOne }, adminBToken);
assert(otherState.response.ok && otherState.body === "missing",
  "Another Profile must not learn ownership/secret state for a foreign endpoint.");

const secondRegistration = await rpc("register_push_subscription", {
  p_endpoint: endpointTwo,
  p_p256dh: keyTwo,
  p_auth_secret: authTwo,
}, adminAToken);
assert(secondRegistration.response.ok && /^[0-9a-f-]{36}$/i.test(secondRegistration.body),
  `Second-device registration failed: ${JSON.stringify(secondRegistration.body)}`);
const subscriptionTwoId = secondRegistration.body;
assert(subscriptionTwoId !== subscriptionOneId,
  "One Profile must be able to own multiple independent browser/device subscriptions.");

const foreignDisable = await rpc("disable_push_subscription", { p_endpoint: endpointTwo }, adminBToken);
assert(foreignDisable.response.ok && foreignDisable.body === false,
  "A different Profile must not disable another Profile's device subscription.");

const disableTwo = await rpc("disable_push_subscription", { p_endpoint: endpointTwo }, adminAToken);
assert(disableTwo.response.ok && disableTwo.body === true, "Owner device disable failed.");
const disableTwoRetry = await rpc("disable_push_subscription", { p_endpoint: endpointTwo }, adminAToken);
assert(disableTwoRetry.response.ok && disableTwoRetry.body === true,
  "Owner device disable retry must be idempotent.");
const disabledState = await rpc("current_push_subscription_state", { p_endpoint: endpointTwo }, adminAToken);
assert(disabledState.response.ok && disabledState.body === "disabled",
  "Disabled current-device state was not preserved.");

// Outbox fan-out is event-time only: active subscriptions existing when a new
// Push-eligible durable notification is inserted receive one delivery identity.
const firstNotificationId = insertNotification({
  profileIdValue: adminAId,
  pushEligible: true,
  sourceKey: `push-foundation:${randomUUID()}:one-active-device`,
});
let rows = deliveryRows(firstNotificationId);
assert(rows.length === 1 && rows[0].subscription_id === subscriptionOneId,
  `Expected exactly one event-time delivery for the only active device: ${JSON.stringify(rows)}`);
assert(rows[0].status === "pending" && rows[0].attempt_count === 0,
  `Fresh outbox delivery must be pending with zero attempts: ${JSON.stringify(rows)}`);

const nonPushNotificationId = insertNotification({
  profileIdValue: adminAId,
  pushEligible: false,
  sourceKey: `push-foundation:${randomUUID()}:not-push-eligible`,
});
assert(deliveryRows(nonPushNotificationId).length === 0,
  "A non-Push-eligible durable Inbox notification must not create outbox delivery rows.");

const reenableTwo = await rpc("register_push_subscription", {
  p_endpoint: endpointTwo,
  p_p256dh: keyTwo,
  p_auth_secret: authTwo,
}, adminAToken);
assert(reenableTwo.response.ok && reenableTwo.body === subscriptionTwoId,
  "Re-enabling the same owned endpoint must reuse its subscription identity.");
assert(deliveryRows(firstNotificationId).length === 1,
  "Enabling a device must not replay historical Inbox notifications into Push deliveries.");

const twoDeviceNotificationId = insertNotification({
  profileIdValue: adminAId,
  pushEligible: true,
  sourceKey: `push-foundation:${randomUUID()}:two-active-devices`,
});
rows = deliveryRows(twoDeviceNotificationId);
assert(rows.length === 2,
  `One notification + two active devices must create two delivery identities: ${JSON.stringify(rows)}`);
assert(rows.every((row) => row.status === "pending" && row.attempt_count === 0),
  "Both new device deliveries must start pending with zero attempts.");

const disableOne = await rpc("disable_push_subscription", { p_endpoint: endpointOne }, adminAToken);
assert(disableOne.response.ok && disableOne.body === true,
  "Disabling first device failed.");
rows = deliveryRows(twoDeviceNotificationId);
const deviceOneDelivery = rows.find((row) => row.subscription_id === subscriptionOneId);
const deviceTwoDelivery = rows.find((row) => row.subscription_id === subscriptionTwoId);
assert(deviceOneDelivery?.status === "dead" && deviceOneDelivery?.last_error_code === "subscription_disabled",
  `Disabled device's unsent delivery must be terminalized: ${JSON.stringify(rows)}`);
assert(deviceTwoDelivery?.status === "pending",
  "Disabling one device must not affect another active device's pending delivery.");

const reenableOne = await rpc("register_push_subscription", {
  p_endpoint: endpointOne,
  p_p256dh: keyOneUpdated,
  p_auth_secret: authOneUpdated,
}, adminAToken);
assert(reenableOne.response.ok && reenableOne.body === subscriptionOneId,
  "Re-enable after disable must preserve subscription identity.");
rows = deliveryRows(twoDeviceNotificationId);
assert(rows.find((row) => row.subscription_id === subscriptionOneId)?.status === "dead",
  "Re-enabling a device must not revive already-terminal historical delivery rows.");

const futureNotificationId = insertNotification({
  profileIdValue: adminAId,
  pushEligible: true,
  sourceKey: `push-foundation:${randomUUID()}:after-reenable`,
});
rows = deliveryRows(futureNotificationId);
assert(rows.length === 2 && rows.every((row) => row.status === "pending"),
  "Re-enabled device must participate normally in future Push-eligible notifications.");

// Active Profile and active bound-entity semantics are inherited from the same
// helper used by the durable Inbox authorization contract.
runSql(`update public.profiles set status = 'suspended' where id = ${sqlUuid(suspendedAdminId)};`);
await expectRpcError("register_push_subscription", {
  p_endpoint: endpointSuspended,
  p_p256dh: keyOne,
  p_auth_secret: authOne,
}, suspendedAdminToken, "PG_PUSH_ACCESS_INACTIVE");

runSql(`update public.country_agents set status = 'suspended' where id = ${sqlUuid(agent.id)};`);
await expectRpcError("register_push_subscription", {
  p_endpoint: endpointAgent,
  p_p256dh: keyOne,
  p_auth_secret: authOne,
}, agentToken, "PG_PUSH_ACCESS_INACTIVE");
assert(querySql(`select status from public.profiles where id = ${sqlUuid(agentProfileId)};`) === "active",
  "Agent lifecycle fixture must prove entity suspension independently of Profile status.");

// Current Inbox/list surface remains secret-free by contract.
const inbox = await rpc("list_notifications", { p_limit: 30, p_offset: 0 }, adminAToken);
assert(inbox.response.ok && Array.isArray(inbox.body),
  `Inbox read failed during Push privacy verification: ${JSON.stringify(inbox.body)}`);
const serializedInbox = JSON.stringify(inbox.body);
for (const secret of [endpointOne, endpointTwo, keyOneUpdated, authOneUpdated, keyTwo, authTwo]) {
  assert(!serializedInbox.includes(secret), "Inbox/list RPC leaked Push subscription secret material.");
}

// Sanity: endpoint uniqueness truly remains platform-wide at storage level.
assert(querySql(`select count(*) from public.push_subscriptions where endpoint = ${sqlText(endpointOne)};`) === "1",
  "Endpoint uniqueness was not preserved.");
assert(querySql(`select count(*) from public.push_subscriptions where profile_id = ${sqlUuid(adminBId)};`) === "0",
  "Foreign ownership test unexpectedly created a subscription for Admin B.");

console.log("Cube L Push subscription and outbox foundation contract verified.");
