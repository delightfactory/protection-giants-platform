import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const apiUrl = process.env.API_URL;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
const anonKey = process.env.ANON_KEY;

if (!apiUrl || !serviceRoleKey || !anonKey) {
  throw new Error("Local Supabase API_URL, SERVICE_ROLE_KEY and ANON_KEY are required.");
}

const password = "Cube-L-Notification-Inbox-2026!";

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
  return request(`/rest/v1/rpc/${name}`, { method: "POST", body, token, key });
}

function one(result, label) {
  assert(result.response.ok && Array.isArray(result.body) && result.body.length === 1,
    `${label}: ${result.response.status} ${JSON.stringify(result.body)}`);
  return result.body[0];
}

async function expectFailure(resultPromise, label, expectedMessage = null) {
  const result = await resultPromise;
  assert(!result.response.ok, `${label} unexpectedly succeeded: ${JSON.stringify(result.body)}`);
  if (expectedMessage) {
    assert(result.body?.message === expectedMessage,
      `${label} expected ${expectedMessage}, received ${result.response.status} ${JSON.stringify(result.body)}`);
  }
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
      user_metadata: { display_name: `Cube L ${role}` },
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
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
  const name = names.find((value) => value.startsWith("supabase_db_"));
  assert(name, "Supabase database container was not found for Cube L verification.");
  return name;
}

function runSql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", dbContainerName(), "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
    { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  );
}

function sqlUuid(value) {
  assert(/^[0-9a-f-]{36}$/i.test(value), `Unsafe UUID fixture: ${value}`);
  return `'${value}'::uuid`;
}

function expectSqlFailure(sql, expectedMessage) {
  let failed = false;
  try {
    runSql(sql);
  } catch (error) {
    failed = true;
    const stderr = String(error.stderr ?? "");
    assert(stderr.includes(expectedMessage), `Expected ${expectedMessage}; received ${stderr}`);
  }
  assert(failed, `SQL unexpectedly succeeded; expected ${expectedMessage}.`);
}

const emails = {
  admin: "cube-l-admin@example.test",
  agent: "cube-l-agent@example.test",
  dealer: "cube-l-dealer@example.test",
  center: "cube-l-center@example.test",
  outsider: "cube-l-outsider@example.test",
};

const adminUser = await createUser({ email: emails.admin, role: "admin" });
const adminToken = await signIn(emails.admin);

const agent = one(await rest("country_agents?select=id,status", adminToken, {
  method: "POST",
  prefer: true,
  body: { code: "CUBE-L-AG-EG", name: "Cube L Agent", country_code: "EG" },
}), "Create Cube L Agent");
const agentUser = await createUser({ email: emails.agent, role: "agent", countryAgentId: agent.id });
const agentToken = await signIn(emails.agent);

const dealer = one(await rest("dealers?select=id,status,country_agent_id", adminToken, {
  method: "POST",
  prefer: true,
  body: {
    code: "CUBE-L-DL-EG",
    name: "Cube L Dealer",
    country_code: "EG",
    country_agent_id: agent.id,
  },
}), "Create Cube L Dealer");
const dealerUser = await createUser({ email: emails.dealer, role: "dealer", dealerId: dealer.id });
const dealerToken = await signIn(emails.dealer);

const center = one(await rest("installation_centers?select=id,status,dealer_id", adminToken, {
  method: "POST",
  prefer: true,
  body: {
    code: "CUBE-L-CT-EG",
    name: "Cube L Center",
    country_code: "EG",
    city: "Cairo",
    dealer_id: dealer.id,
  },
}), "Create Cube L Center");
const centerUser = await createUser({ email: emails.center, role: "center", centerId: center.id });
const centerToken = await signIn(emails.center);

const outsiderAgent = one(await rest("country_agents?select=id,status", adminToken, {
  method: "POST",
  prefer: true,
  body: { code: "CUBE-L-OUT-SA", name: "Cube L Outsider", country_code: "SA" },
}), "Create Cube L outsider Agent");
const outsiderUser = await createUser({ email: emails.outsider, role: "agent", countryAgentId: outsiderAgent.id });
const outsiderToken = await signIn(emails.outsider);

const ids = {
  adminNewest: randomUUID(),
  adminOlder: randomUUID(),
  adminRead: randomUUID(),
  agent: randomUUID(),
  dealer: randomUUID(),
  center: randomUUID(),
  outsider: randomUUID(),
};

runSql(`
insert into public.notifications (
  id, recipient_profile_id, event_type, source_domain, source_event_key,
  attention_level, title, body, action_path, push_eligible, created_at, read_at
) values
  (${sqlUuid(ids.adminOlder)}, ${sqlUuid(adminUser.id)}, 'transfer_incoming_created', 'transfers', 'cube-l-admin-older', 'action_required', 'تحويل وارد', 'يوجد تحويل وارد يحتاج المراجعة.', '/operations/transfers', true, '2026-08-23T10:00:00Z', null),
  (${sqlUuid(ids.adminRead)}, ${sqlUuid(adminUser.id)}, 'center_approved', 'centers', 'cube-l-admin-read', 'info', 'تم اعتماد مركز', 'تم اعتماد المركز داخل الشبكة.', '/operations/centers', false, '2026-08-23T10:30:00Z', '2026-08-23T10:35:00Z'),
  (${sqlUuid(ids.adminNewest)}, ${sqlUuid(adminUser.id)}, 'issue_submitted', 'roll_preinstall_issues', 'cube-l-admin-newest', 'warning', 'بلاغ جودة جديد', 'يوجد بلاغ جودة جديد يحتاج المراجعة.', '/operations/rolls/issues', true, '2026-08-23T11:00:00Z', null),
  (${sqlUuid(ids.agent)}, ${sqlUuid(agentUser.id)}, 'center_location_review', 'centers', 'cube-l-agent', 'action_required', 'مركز يحتاج مراجعة', 'تم تسجيل موقع مركز ويحتاج مراجعة الاعتماد.', '/operations/centers', true, '2026-08-23T11:10:00Z', null),
  (${sqlUuid(ids.dealer)}, ${sqlUuid(dealerUser.id)}, 'transfer_received', 'transfers', 'cube-l-dealer', 'info', 'تم استلام التحويل', 'تم استلام التحويل بالكامل.', '/operations/transfers', false, '2026-08-23T11:20:00Z', null),
  (${sqlUuid(ids.center)}, ${sqlUuid(centerUser.id)}, 'issue_cleared', 'roll_preinstall_issues', 'cube-l-center', 'info', 'تمت مراجعة البلاغ', 'تم السماح باستخدام الرول بعد المراجعة.', '/operations/rolls/issues', true, '2026-08-23T11:30:00Z', null),
  (${sqlUuid(ids.outsider)}, ${sqlUuid(outsiderUser.id)}, 'transfer_incoming_created', 'transfers', 'cube-l-outsider', 'action_required', 'تحويل منفصل', 'إشعار يخص شبكة تشغيلية أخرى.', '/operations/transfers', true, '2026-08-23T11:40:00Z', null);
`);

// Shape constraints and event identity deduplication are database invariants.
expectSqlFailure(`insert into public.notifications (recipient_profile_id,event_type,source_domain,source_event_key,attention_level,title,body) values (${sqlUuid(adminUser.id)},'bad','test','bad-level','urgent','عنوان','نص');`, "notifications_attention_level_allowed");
expectSqlFailure(`insert into public.notifications (recipient_profile_id,event_type,source_domain,source_event_key,attention_level,title,body,action_path) values (${sqlUuid(adminUser.id)},'bad','test','bad-path','info','عنوان','نص','//evil.example');`, "notifications_action_path_shape");
expectSqlFailure(`insert into public.notifications (recipient_profile_id,event_type,source_domain,source_event_key,attention_level,title,body) values (${sqlUuid(adminUser.id)},'issue_submitted','roll_preinstall_issues','cube-l-admin-newest','warning','عنوان آخر','نص آخر');`, "notifications_event_recipient_unique");

// Direct authenticated table reads are strictly own-profile and active-context.
for (const [label, token, expectedId] of [
  ["Admin", adminToken, ids.adminNewest],
  ["Agent", agentToken, ids.agent],
  ["Dealer", dealerToken, ids.dealer],
  ["Center", centerToken, ids.center],
  ["Outsider", outsiderToken, ids.outsider],
]) {
  const result = await rest("notifications?select=id,recipient_profile_id,event_type,read_at&order=created_at.desc", token);
  assert(result.response.ok && result.body.length >= 1,
    `${label} could not read own Inbox: ${result.response.status} ${JSON.stringify(result.body)}`);
  assert(result.body.some((row) => row.id === expectedId), `${label} own notification missing.`);
  const expectedRecipient = label === "Admin" ? adminUser.id
    : label === "Agent" ? agentUser.id
      : label === "Dealer" ? dealerUser.id
        : label === "Center" ? centerUser.id
          : outsiderUser.id;
  assert(result.body.every((row) => row.recipient_profile_id === expectedRecipient),
    `${label} could read another Profile Inbox: ${JSON.stringify(result.body)}`);
}

const adminDirect = await rest("notifications?select=id&order=created_at.desc", adminToken);
assert(adminDirect.response.ok && adminDirect.body.length === 3,
  `Admin must see only its own three Inbox rows, not all Profiles: ${JSON.stringify(adminDirect.body)}`);

await expectFailure(rest("notifications", centerToken, {
  method: "POST",
  prefer: true,
  body: {
    recipient_profile_id: centerUser.id,
    event_type: "forged",
    source_domain: "client",
    source_event_key: "forged-client-insert",
    attention_level: "info",
    title: "مزور",
    body: "يجب ألا يستطيع العميل إنشاء هذا الإشعار.",
  },
}), "Authenticated direct notification INSERT");

await expectFailure(rest(`notifications?id=eq.${ids.center}`, centerToken, {
  method: "PATCH",
  prefer: true,
  body: { read_at: new Date().toISOString() },
}), "Authenticated direct notification UPDATE");

await expectFailure(rest(`notifications?id=eq.${ids.center}`, centerToken, { method: "DELETE" }),
  "Authenticated direct notification DELETE");

// Inbox RPCs return only current Profile state with bounded pagination.
const adminList = await rpc("list_notifications", { p_limit: 2, p_offset: 0 }, adminToken);
assert(adminList.response.ok && adminList.body.length === 2,
  `Admin list_notifications failed: ${adminList.response.status} ${JSON.stringify(adminList.body)}`);
assert(adminList.body[0].id === ids.adminNewest && adminList.body[1].id === ids.adminRead,
  `Inbox ordering must be newest-first: ${JSON.stringify(adminList.body)}`);

const adminSecondPage = await rpc("list_notifications", { p_limit: 2, p_offset: 2 }, adminToken);
assert(adminSecondPage.response.ok && adminSecondPage.body.length === 1 && adminSecondPage.body[0].id === ids.adminOlder,
  `Inbox offset pagination failed: ${JSON.stringify(adminSecondPage.body)}`);

await expectFailure(rpc("list_notifications", { p_limit: 101, p_offset: 0 }, adminToken),
  "Oversized Inbox pagination", "PG_NOTIFICATION_PAGINATION_INVALID");

const unreadBefore = await rpc("notification_unread_count", {}, adminToken);
assert(unreadBefore.response.ok && unreadBefore.body === 2,
  `Admin unread count expected 2: ${JSON.stringify(unreadBefore.body)}`);

const firstRead = await rpc("mark_notification_read", { p_notification_id: ids.adminNewest }, adminToken);
assert(firstRead.response.ok && typeof firstRead.body === "string",
  `mark_notification_read failed: ${firstRead.response.status} ${JSON.stringify(firstRead.body)}`);
const retryRead = await rpc("mark_notification_read", { p_notification_id: ids.adminNewest }, adminToken);
assert(retryRead.response.ok && retryRead.body === firstRead.body,
  `mark_notification_read must be idempotent: first=${firstRead.body} retry=${retryRead.body}`);

await expectFailure(rpc("mark_notification_read", { p_notification_id: ids.agent }, adminToken),
  "Mark another Profile notification", "PG_NOTIFICATION_NOT_FOUND");

const unreadAfterOne = await rpc("notification_unread_count", {}, adminToken);
assert(unreadAfterOne.response.ok && unreadAfterOne.body === 1,
  `Unread count after one read expected 1: ${JSON.stringify(unreadAfterOne.body)}`);

const markAll = await rpc("mark_all_notifications_read", {}, adminToken);
assert(markAll.response.ok && markAll.body === 1,
  `mark_all_notifications_read expected one remaining row: ${JSON.stringify(markAll.body)}`);
const markAllRetry = await rpc("mark_all_notifications_read", {}, adminToken);
assert(markAllRetry.response.ok && markAllRetry.body === 0,
  `mark_all_notifications_read retry must be idempotent: ${JSON.stringify(markAllRetry.body)}`);
const unreadAfterAll = await rpc("notification_unread_count", {}, adminToken);
assert(unreadAfterAll.response.ok && unreadAfterAll.body === 0,
  `Admin unread count expected 0 after mark all: ${JSON.stringify(unreadAfterAll.body)}`);

const agentUnreadUnaffected = await rpc("notification_unread_count", {}, agentToken);
assert(agentUnreadUnaffected.response.ok && agentUnreadUnaffected.body === 1,
  "Admin mark-all must not touch another Profile Inbox.");

// Active bound-entity lifecycle is part of Inbox authorization.
one(await rest(`country_agents?id=eq.${agent.id}&select=id,status`, adminToken, {
  method: "PATCH",
  prefer: true,
  body: { status: "suspended" },
}), "Suspend Agent entity");
const suspendedAgentDirect = await rest("notifications?select=id", agentToken);
assert(suspendedAgentDirect.response.ok && suspendedAgentDirect.body.length === 0,
  `Suspended Agent entity must hide Inbox through RLS: ${JSON.stringify(suspendedAgentDirect.body)}`);
await expectFailure(rpc("notification_unread_count", {}, agentToken),
  "Suspended Agent unread count", "PG_NOTIFICATION_ACCESS_INACTIVE");

one(await rest(`country_agents?id=eq.${agent.id}&select=id,status`, adminToken, {
  method: "PATCH",
  prefer: true,
  body: { status: "active" },
}), "Reactivate Agent entity");
const reactivatedAgentUnread = await rpc("notification_unread_count", {}, agentToken);
assert(reactivatedAgentUnread.response.ok && reactivatedAgentUnread.body === 1,
  "Reactivated Agent must regain own Inbox access.");

one(await rest(`profiles?id=eq.${centerUser.id}&select=id,status`, serviceRoleKey, {
  method: "PATCH",
  key: serviceRoleKey,
  prefer: true,
  body: { status: "suspended" },
}), "Suspend Center Profile");
const suspendedCenterDirect = await rest("notifications?select=id", centerToken);
assert(suspendedCenterDirect.response.ok && suspendedCenterDirect.body.length === 0,
  "Suspended Profile must not read Inbox through RLS.");
await expectFailure(rpc("list_notifications", { p_limit: 30, p_offset: 0 }, centerToken),
  "Suspended Center list", "PG_NOTIFICATION_ACCESS_INACTIVE");

// Even privileged SQL cannot rewrite notification content, unread a row, or delete history.
expectSqlFailure(`update public.notifications set title = 'Changed' where id = ${sqlUuid(ids.adminNewest)};`, "PG_NOTIFICATION_CONTENT_IMMUTABLE");
expectSqlFailure(`update public.notifications set read_at = null where id = ${sqlUuid(ids.adminNewest)};`, "PG_NOTIFICATION_READ_MONOTONIC");
expectSqlFailure(`delete from public.notifications where id = ${sqlUuid(ids.adminNewest)};`, "PG_NOTIFICATION_IMMUTABLE");

// Anonymous callers receive neither table data nor RPC execution authority.
await expectFailure(request("/rest/v1/notifications?select=id"), "Anonymous Inbox table read");
await expectFailure(rpc("notification_unread_count", {}, anonKey), "Anonymous Inbox RPC");

console.log("Cube L Notification Inbox database/RLS/read-state verification passed.");
