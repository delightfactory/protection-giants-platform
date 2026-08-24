import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const apiUrl = process.env.API_URL;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
const anonKey = process.env.ANON_KEY;

if (!apiUrl || !serviceRoleKey || !anonKey) {
  throw new Error("Local Supabase API_URL, SERVICE_ROLE_KEY and ANON_KEY are required.");
}

const password = "Cube-L-Push-Worker-State-2026!";

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

async function rpc(name, body, token, key = anonKey) {
  return request(`/rest/v1/rpc/${name}`, { method: "POST", token, key, body });
}

async function serviceRpc(name, body) {
  return rpc(name, body, serviceRoleKey, serviceRoleKey);
}

async function expectServiceRpcError(name, body, expectedMessage) {
  const result = await serviceRpc(name, body);
  assert(!result.response.ok, `${name} unexpectedly succeeded; expected ${expectedMessage}.`);
  assert(result.body?.message === expectedMessage,
    `${name} expected ${expectedMessage}, got ${result.response.status} ${JSON.stringify(result.body)}`);
}

async function createUser({ email, role, countryAgentId = null }) {
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
          dealer_id: null,
          installation_center_id: null,
        },
      },
      user_metadata: { display_name: `Cube L Worker ${role}` },
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
  assert(name, "Supabase database container was not found for Cube L worker fixtures.");
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

function subscriptionId(endpoint) {
  const value = querySql(`select id from public.push_subscriptions where endpoint = ${sqlText(endpoint)};`);
  assert(/^[0-9a-f-]{36}$/i.test(value), `Subscription not found for ${endpoint}`);
  return value;
}

function insertNotification(profileIdValue, suffix) {
  const id = randomUUID();
  runSql(`
    insert into public.notifications (
      id, recipient_profile_id, event_type, source_domain, source_event_key,
      attention_level, title, body, action_path, push_eligible
    ) values (
      ${sqlUuid(id)}, ${sqlUuid(profileIdValue)}, 'test.push_worker', 'cube_l_push_worker_test',
      ${sqlText(`worker:${suffix}:${randomUUID()}`)}, 'action_required',
      'إجراء تشغيلي مطلوب', 'يوجد إجراء جديد يحتاج مراجعتك داخل المنصة.',
      '/operations/notifications', true
    );
  `);
  return id;
}

function deliveryForNotification(notificationId) {
  const raw = querySql(`
    select row_to_json(row_data)::text
    from (
      select id, notification_id, subscription_id, status, attempt_count,
             next_attempt_at, last_attempt_at, last_http_status, last_error_code,
             sent_at, claim_token, claim_expires_at, last_completed_claim_token
      from public.notification_push_deliveries
      where notification_id = ${sqlUuid(notificationId)}
      order by id
      limit 1
    ) row_data;
  `);
  return raw ? JSON.parse(raw) : null;
}

function allDeliveriesForSubscription(subscriptionIdValue) {
  const raw = querySql(`
    select coalesce(json_agg(row_to_json(row_data) order by row_data.id)::text, '[]')
    from (
      select id, notification_id, status, attempt_count, last_error_code,
             claim_token, claim_expires_at, last_completed_claim_token
      from public.notification_push_deliveries
      where subscription_id = ${sqlUuid(subscriptionIdValue)}
    ) row_data;
  `);
  return JSON.parse(raw || "[]");
}

function forceDue(deliveryId) {
  runSql(`
    update public.notification_push_deliveries
    set next_attempt_at = last_attempt_at
    where id = ${sqlUuid(deliveryId)};
  `);
}

function expireClaim(deliveryId) {
  runSql(`
    update public.notification_push_deliveries
    set claim_expires_at = now() - interval '1 second'
    where id = ${sqlUuid(deliveryId)};
  `);
}

function retryDelaySeconds(row) {
  return (new Date(row.next_attempt_at).getTime() - new Date(row.last_attempt_at).getTime()) / 1000;
}

function assertDelay(row, expectedSeconds, label) {
  const actual = retryDelaySeconds(row);
  assert(Math.abs(actual - expectedSeconds) <= 3,
    `${label} expected ~${expectedSeconds}s retry delay, got ${actual}s.`);
}

async function register(token, endpoint, keySeed) {
  const result = await rpc("register_push_subscription", {
    p_endpoint: endpoint,
    p_p256dh: `BWorkerP256dh_${keySeed}_12345678901234567890`,
    p_auth_secret: `WorkerAuth_${keySeed}_12345678901234567890`,
  }, token);
  assert(result.response.ok && /^[0-9a-f-]{36}$/i.test(result.body),
    `Push registration failed for ${endpoint}: ${result.response.status} ${JSON.stringify(result.body)}`);
  return result.body;
}

async function claim(limit = 50) {
  const result = await serviceRpc("claim_notification_push_deliveries", { p_limit: limit });
  assert(result.response.ok && Array.isArray(result.body),
    `Worker claim failed: ${result.response.status} ${JSON.stringify(result.body)}`);
  return result.body;
}

async function record({ deliveryId, claimToken, result, httpStatus = null, errorCode = null }) {
  const response = await serviceRpc("record_notification_push_delivery_result", {
    p_delivery_id: deliveryId,
    p_claim_token: claimToken,
    p_result: result,
    p_http_status: httpStatus,
    p_error_code: errorCode,
  });
  assert(response.response.ok,
    `Worker result failed: ${response.response.status} ${JSON.stringify(response.body)}`);
  return response.body;
}

const emails = {
  adminA: "cube-l-worker-admin-a@example.test",
  adminB: "cube-l-worker-admin-b@example.test",
  agent: "cube-l-worker-agent@example.test",
};

await createUser({ email: emails.adminA, role: "admin" });
await createUser({ email: emails.adminB, role: "admin" });
const adminAToken = await signIn(emails.adminA);
const adminBToken = await signIn(emails.adminB);
const adminAId = profileId(emails.adminA);
const adminBId = profileId(emails.adminB);

const agentCreate = await rest("country_agents?select=id", adminAToken, {
  method: "POST",
  prefer: true,
  body: { code: "CUBE-L-WORKER-AGENT", name: "Cube L Worker Agent", country_code: "EG" },
});
assert(agentCreate.response.ok && Array.isArray(agentCreate.body) && agentCreate.body.length === 1,
  `Could not create worker Agent fixture: ${agentCreate.response.status} ${JSON.stringify(agentCreate.body)}`);
const agent = agentCreate.body[0];
await createUser({ email: emails.agent, role: "agent", countryAgentId: agent.id });
const agentToken = await signIn(emails.agent);
const agentId = profileId(emails.agent);

const endpointA = "https://push.example.test/worker/admin-a";
const endpointB = "https://push.example.test/worker/admin-b";
const endpointAgent = "https://push.example.test/worker/agent";
await register(adminAToken, endpointA, "adminA");
await register(adminBToken, endpointB, "adminB");
await register(agentToken, endpointAgent, "agent");
const subscriptionA = subscriptionId(endpointA);
const subscriptionB = subscriptionId(endpointB);
const subscriptionAgent = subscriptionId(endpointAgent);

// Worker RPCs are not a browser/user surface.
for (const token of [anonKey, adminAToken]) {
  const denied = await rpc("claim_notification_push_deliveries", { p_limit: 1 }, token);
  assert(!denied.response.ok, "Only service_role may claim Push deliveries.");
}
await expectServiceRpcError("claim_notification_push_deliveries", { p_limit: 0 }, "PG_PUSH_CLAIM_LIMIT_INVALID");
await expectServiceRpcError("claim_notification_push_deliveries", { p_limit: 101 }, "PG_PUSH_CLAIM_LIMIT_INVALID");

// Retry ladder: attempt 1 immediate, then +5, +30, +120, then dead after attempt 4.
const retryNotification = insertNotification(adminAId, "retry-ladder");
let claimed = await claim(1);
assert(claimed.length === 1, `Expected one retry-ladder claim, got ${JSON.stringify(claimed)}`);
let current = claimed[0];
const expectedClaimKeys = [
  "action_path", "attempt_number", "attention_level", "auth_secret", "body",
  "claim_expires_at", "claim_token", "delivery_id", "endpoint", "notification_id",
  "p256dh", "title",
].sort();
assert(JSON.stringify(Object.keys(current).sort()) === JSON.stringify(expectedClaimKeys),
  `Worker claim exposes an unexpected surface: ${JSON.stringify(Object.keys(current).sort())}`);
assert(current.notification_id === retryNotification && current.endpoint === endpointA && current.attempt_number === 1,
  `Unexpected first claim payload: ${JSON.stringify(current)}`);
assert(current.action_path === "/operations/notifications" && current.attention_level === "action_required",
  "Worker claim must return only the bounded notification presentation fields needed by 5B.");

const concurrent = await claim(100);
assert(!concurrent.some((row) => row.delivery_id === current.delivery_id),
  "An active lease must prevent a concurrent worker from claiming the same delivery.");

let state = await record({
  deliveryId: current.delivery_id,
  claimToken: current.claim_token,
  result: "retryable_failure",
  httpStatus: 429,
  errorCode: "provider_rate_limited",
});
assert(state === "retry", `Attempt 1 should retry, got ${state}.`);
let row = deliveryForNotification(retryNotification);
assert(row.status === "retry" && row.attempt_count === 1 && row.claim_token === null,
  `Attempt 1 state mismatch: ${JSON.stringify(row)}`);
assertDelay(row, 5 * 60, "Attempt 1");

const duplicateFirst = await record({
  deliveryId: current.delivery_id,
  claimToken: current.claim_token,
  result: "retryable_failure",
  httpStatus: 429,
  errorCode: "provider_rate_limited",
});
assert(duplicateFirst === "retry", "Exact result retry must be idempotent.");
assert(deliveryForNotification(retryNotification).attempt_count === 1,
  "Idempotent result retry must not consume another attempt.");

for (const step of [
  { attempt: 2, delay: 30 * 60, status: 502 },
  { attempt: 3, delay: 120 * 60, status: 500 },
  { attempt: 4, delay: null, status: 503 },
]) {
  forceDue(current.delivery_id);
  claimed = await claim(1);
  assert(claimed.length === 1 && claimed[0].delivery_id === current.delivery_id,
    `Attempt ${step.attempt} was not claimable after forcing due.`);
  current = claimed[0];
  assert(current.attempt_number === step.attempt, `Expected attempt ${step.attempt}, got ${current.attempt_number}.`);
  state = await record({
    deliveryId: current.delivery_id,
    claimToken: current.claim_token,
    result: "retryable_failure",
    httpStatus: step.status,
    errorCode: "provider_5xx",
  });
  row = deliveryForNotification(retryNotification);
  if (step.attempt < 4) {
    assert(state === "retry" && row.status === "retry" && row.attempt_count === step.attempt,
      `Attempt ${step.attempt} should remain retry: ${JSON.stringify(row)}`);
    assertDelay(row, step.delay, `Attempt ${step.attempt}`);
  } else {
    assert(state === "dead" && row.status === "dead" && row.attempt_count === 4,
      `Attempt 4 failure must dead-letter: ${JSON.stringify(row)}`);
  }
}

// Expired lease can be reclaimed, while the older worker token becomes stale.
const staleNotification = insertNotification(adminAId, "stale-lease");
claimed = await claim(1);
assert(claimed.length === 1 && claimed[0].notification_id === staleNotification,
  "Stale-lease fixture was not claimed.");
const oldClaim = claimed[0];
expireClaim(oldClaim.delivery_id);
claimed = await claim(1);
assert(claimed.length === 1 && claimed[0].delivery_id === oldClaim.delivery_id,
  "Expired lease should be reclaimable.");
const newClaim = claimed[0];
assert(newClaim.claim_token !== oldClaim.claim_token && newClaim.attempt_number === 1,
  "Lease recovery must replace token without consuming an attempt.");
await expectServiceRpcError("record_notification_push_delivery_result", {
  p_delivery_id: oldClaim.delivery_id,
  p_claim_token: oldClaim.claim_token,
  p_result: "sent",
  p_http_status: 201,
  p_error_code: null,
}, "PG_PUSH_CLAIM_STALE");
state = await record({
  deliveryId: newClaim.delivery_id,
  claimToken: newClaim.claim_token,
  result: "sent",
  httpStatus: 201,
});
assert(state === "sent", "Current lease should record success.");
row = deliveryForNotification(staleNotification);
assert(row.status === "sent" && row.attempt_count === 1 && row.sent_at,
  `Sent delivery state mismatch: ${JSON.stringify(row)}`);
const exactSentRetry = await record({
  deliveryId: newClaim.delivery_id,
  claimToken: newClaim.claim_token,
  result: "sent",
  httpStatus: 201,
});
assert(exactSentRetry === "sent" && deliveryForNotification(staleNotification).attempt_count === 1,
  "Sent result retry must be idempotent.");

// 404/410 invalidation disables the subscription immediately and terminalizes
// every other unsent delivery for that endpoint.
const goneOne = insertNotification(adminBId, "gone-one");
const goneTwo = insertNotification(adminBId, "gone-two");
claimed = await claim(1);
assert(claimed.length === 1 && [goneOne, goneTwo].includes(claimed[0].notification_id),
  `Expected one Admin B gone claim, got ${JSON.stringify(claimed)}`);
const goneClaim = claimed[0];
await expectServiceRpcError("record_notification_push_delivery_result", {
  p_delivery_id: goneClaim.delivery_id,
  p_claim_token: goneClaim.claim_token,
  p_result: "subscription_gone",
  p_http_status: 500,
  p_error_code: "wrong_classification",
}, "PG_PUSH_RESULT_STATUS_MISMATCH");
state = await record({
  deliveryId: goneClaim.delivery_id,
  claimToken: goneClaim.claim_token,
  result: "subscription_gone",
  httpStatus: 410,
  errorCode: "subscription_gone",
});
assert(state === "dead", "410 result must dead-letter current delivery.");
const goneRows = allDeliveriesForSubscription(subscriptionB);
assert(goneRows.length === 2 && goneRows.every((item) => item.status === "dead"),
  `410 must terminalize all unsent rows for the subscription: ${JSON.stringify(goneRows)}`);
const subscriptionBDisabled = querySql(`select disabled_at is not null from public.push_subscriptions where id = ${sqlUuid(subscriptionB)};`);
assert(subscriptionBDisabled === "t", "410 must disable the subscription immediately.");
const afterGone = insertNotification(adminBId, "after-gone");
assert(deliveryForNotification(afterGone) === null,
  "A disabled subscription must not receive future outbox rows until browser re-registration.");

// Re-check the active bound entity at delivery time, not only at subscription time.
const agentNotification = insertNotification(agentId, "agent-suspended-after-queue");
assert(deliveryForNotification(agentNotification)?.subscription_id === subscriptionAgent,
  "Agent delivery should exist before bound-entity suspension.");
runSql(`update public.country_agents set status = 'suspended' where id = ${sqlUuid(agent.id)};`);
claimed = await claim(100);
assert(!claimed.some((item) => item.notification_id === agentNotification),
  "Worker must not claim a delivery after the recipient bound entity becomes inactive.");
row = deliveryForNotification(agentNotification);
assert(row.status === "dead" && row.attempt_count === 0 && row.last_error_code === "recipient_inactive",
  `Inactive-recipient delivery must terminalize without consuming an attempt: ${JSON.stringify(row)}`);
assert(querySql(`select status from public.profiles where id = ${sqlUuid(agentId)};`) === "active",
  "Agent fixture must prove bound-entity suspension independently from Profile suspension.");

// Sanity: Admin A subscription remains active and tracks success/failure timestamps.
const subscriptionAState = JSON.parse(querySql(`
  select row_to_json(row_data)::text
  from (
    select disabled_at, last_success_at, last_failure_at
    from public.push_subscriptions
    where id = ${sqlUuid(subscriptionA)}
  ) row_data;
`));
assert(subscriptionAState.disabled_at === null && subscriptionAState.last_success_at && subscriptionAState.last_failure_at,
  `Active subscription lifecycle timestamps are incomplete: ${JSON.stringify(subscriptionAState)}`);

console.log("Cube L Push worker claim/result state machine verified.");
