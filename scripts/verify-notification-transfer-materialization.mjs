import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const apiUrl = process.env.API_URL;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
const anonKey = process.env.ANON_KEY;

if (!apiUrl || !serviceRoleKey || !anonKey) {
  throw new Error("Local Supabase API_URL, SERVICE_ROLE_KEY and ANON_KEY are required.");
}

const password = "Cube-L-Transfer-Notifications-2026!";

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

function one(result, label) {
  assert(result.response.ok && Array.isArray(result.body) && result.body.length === 1,
    `${label}: ${result.response.status} ${JSON.stringify(result.body)}`);
  return result.body[0];
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
    .split("\n").map((value) => value.trim()).filter(Boolean);
  const name = names.find((value) => value.startsWith("supabase_db_"));
  assert(name, "Supabase database container was not found for Cube L Transfer fixtures.");
  return name;
}

function querySql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", dbContainerName(), "psql", "-At", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-c", sql],
    { encoding: "utf8" },
  ).trim();
}

function runSql(sql) {
  execFileSync(
    "docker",
    ["exec", "-i", dbContainerName(), "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
    { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  );
}

function sqlUuid(value) {
  assert(/^[0-9a-f-]{36}$/i.test(value), `Unsafe UUID fixture value: ${value}`);
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

function notificationsForEvent(eventId) {
  const raw = querySql(`
    select coalesce(json_agg(json_build_object(
      'profile_id', n.recipient_profile_id,
      'event_type', n.event_type,
      'attention', n.attention_level,
      'title', n.title,
      'body', n.body,
      'action_path', n.action_path,
      'push_eligible', n.push_eligible,
      'source_event_key', n.source_event_key
    ) order by n.recipient_profile_id)::text, '[]')
    from public.notifications n
    where n.source_domain = 'roll_transfer'
      and n.source_event_key = 'roll_transfer_events:' || ${sqlUuid(eventId)}::text;
  `);
  return JSON.parse(raw || "[]");
}

function insertTransfer({ number, senderPartyId, recipientPartyId, status, creatorProfileId, kind = "standard" }) {
  const transferId = randomUUID();
  const closedAt = ["received", "partially_completed", "cancelled", "rejected"].includes(status) ? "now()" : "null";
  runSql(`
    insert into public.roll_transfers (
      id, transfer_number, request_id, sender_party_id, recipient_party_id,
      status, roll_count, created_by_profile_id, closed_at, transfer_kind
    ) values (
      ${sqlUuid(transferId)}, ${sqlText(number)}, ${sqlUuid(randomUUID())},
      ${sqlUuid(senderPartyId)}, ${sqlUuid(recipientPartyId)}, ${sqlText(status)},
      1, ${sqlUuid(creatorProfileId)}, ${closedAt}, ${sqlText(kind)}
    );
  `);
  return transferId;
}

function insertEvent({ transferId, sequence = 1, type, actorProfileId, actorPartyId = null, reason = null, affectedRollCount = null }) {
  const eventId = randomUUID();
  const actionRequestId = ["received", "unresolved_released", "administrative_unresolved_released"].includes(type)
    ? randomUUID()
    : null;
  runSql(`
    insert into public.roll_transfer_events (
      id, transfer_id, event_sequence, event_type, actor_profile_id, actor_party_id,
      reason, action_request_id, affected_roll_count, occurred_at
    ) values (
      ${sqlUuid(eventId)}, ${sqlUuid(transferId)}, ${sequence}, ${sqlText(type)},
      ${sqlUuid(actorProfileId)}, ${actorPartyId ? sqlUuid(actorPartyId) : "null"},
      ${reason ? sqlText(reason) : "null"}, ${actionRequestId ? sqlUuid(actionRequestId) : "null"},
      ${affectedRollCount === null ? "null" : Number(affectedRollCount)}, now()
    );
  `);
  return eventId;
}

function expectRecipients(rows, expectedProfileIds, label) {
  const actual = rows.map((row) => row.profile_id).sort();
  const expected = [...expectedProfileIds].sort();
  assert(JSON.stringify(actual) === JSON.stringify(expected),
    `${label} recipients mismatch. expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)} rows=${JSON.stringify(rows)}`);
  for (const row of rows) {
    assert(row.push_eligible === true, `${label} must remain Push eligible.`);
    assert(row.action_path.startsWith("/operations/transfers/"), `${label} action path must be an internal Transfer route.`);
    assert(!row.body.includes("private-reason"), `${label} leaked a private administrative/resolution reason.`);
  }
}

const emails = {
  adminActor: "cube-l-transfer-admin-actor@example.test",
  adminOther: "cube-l-transfer-admin-other@example.test",
  agentOne: "cube-l-transfer-agent-one@example.test",
  agentTwo: "cube-l-transfer-agent-two@example.test",
  agentSuspended: "cube-l-transfer-agent-suspended@example.test",
  center: "cube-l-transfer-center@example.test",
};

await createUser({ email: emails.adminActor, role: "admin" });
await createUser({ email: emails.adminOther, role: "admin" });
const adminToken = await signIn(emails.adminActor);

const agent = one(await rest("country_agents?select=id", adminToken, {
  method: "POST", prefer: true,
  body: { code: "CUBE-L-TR-AGENT", name: "Cube L Transfer Agent", country_code: "EG" },
}), "Create Cube L Transfer Agent");

const dealer = one(await rest("dealers?select=id", adminToken, {
  method: "POST", prefer: true,
  body: {
    code: "CUBE-L-TR-DEALER",
    name: "Cube L Transfer Dealer",
    country_code: "EG",
    country_agent_id: agent.id,
  },
}), "Create Cube L Transfer Dealer");

const center = one(await rest("installation_centers?select=id", adminToken, {
  method: "POST", prefer: true,
  body: {
    code: "CUBE-L-TR-CENTER",
    name: "Cube L Transfer Center",
    country_code: "EG",
    city: "Cairo",
    dealer_id: dealer.id,
  },
}), "Create Cube L Transfer Center");

await createUser({ email: emails.agentOne, role: "agent", countryAgentId: agent.id });
await createUser({ email: emails.agentTwo, role: "agent", countryAgentId: agent.id });
await createUser({ email: emails.agentSuspended, role: "agent", countryAgentId: agent.id });
await createUser({ email: emails.center, role: "center", centerId: center.id });

const ids = Object.fromEntries(Object.entries(emails).map(([key, email]) => [key, profileId(email)]));
runSql(`update public.profiles set status = 'suspended' where id = ${sqlUuid(ids.agentSuspended)};`);

const companyParty = one(await rest("operational_parties?party_type=eq.company&select=id", adminToken), "Read Company party");
const agentParty = one(await rest(`operational_parties?country_agent_id=eq.${agent.id}&select=id`, adminToken), "Read Agent party");
const centerParty = one(await rest(`operational_parties?installation_center_id=eq.${center.id}&select=id`, adminToken), "Read Center party");

let transfer = insertTransfer({
  number: "PG-T-20260823-90000001", senderPartyId: companyParty.id, recipientPartyId: agentParty.id,
  status: "pending", creatorProfileId: ids.adminActor,
});
let eventId = insertEvent({ transferId: transfer, type: "created", actorProfileId: ids.adminActor, actorPartyId: companyParty.id });
let rows = notificationsForEvent(eventId);
expectRecipients(rows, [ids.agentOne, ids.agentTwo], "standard created");
assert(rows.every((row) => row.event_type === "transfer.incoming_created" && row.attention === "action_required"),
  `standard created presentation mismatch: ${JSON.stringify(rows)}`);
assert(rows.every((row) => row.body.includes("Protection Giants")), "Created notification must identify the sender without exposing private detail.");

transfer = insertTransfer({
  number: "PG-T-20260823-90000002", senderPartyId: companyParty.id, recipientPartyId: agentParty.id,
  status: "rejected", creatorProfileId: ids.adminActor,
});
eventId = insertEvent({ transferId: transfer, type: "rejected", actorProfileId: ids.agentOne, actorPartyId: agentParty.id });
rows = notificationsForEvent(eventId);
expectRecipients(rows, [ids.adminActor, ids.adminOther], "rejected");
assert(rows.every((row) => row.event_type === "transfer.rejected" && row.attention === "warning"), "Rejected mapping mismatch.");

transfer = insertTransfer({
  number: "PG-T-20260823-90000003", senderPartyId: companyParty.id, recipientPartyId: agentParty.id,
  status: "cancelled", creatorProfileId: ids.adminActor,
});
eventId = insertEvent({ transferId: transfer, type: "cancelled", actorProfileId: ids.adminActor, actorPartyId: companyParty.id });
rows = notificationsForEvent(eventId);
expectRecipients(rows, [ids.agentOne, ids.agentTwo], "sender cancelled");
assert(rows.every((row) => row.event_type === "transfer.sender_cancelled" && row.attention === "info"), "Cancelled mapping mismatch.");

transfer = insertTransfer({
  number: "PG-T-20260823-90000004", senderPartyId: companyParty.id, recipientPartyId: agentParty.id,
  status: "cancelled", creatorProfileId: ids.adminActor,
});
eventId = insertEvent({
  transferId: transfer, type: "administrative_cancelled", actorProfileId: ids.adminActor,
  reason: "private-reason administrative cancellation",
});
rows = notificationsForEvent(eventId);
expectRecipients(rows, [ids.adminOther, ids.agentOne, ids.agentTwo], "administrative cancelled");
assert(rows.every((row) => row.event_type === "transfer.administrative_cancelled" && row.attention === "warning"), "Administrative cancel mapping mismatch.");

transfer = insertTransfer({
  number: "PG-T-20260823-90000005", senderPartyId: companyParty.id, recipientPartyId: agentParty.id,
  status: "partially_received", creatorProfileId: ids.adminActor,
});
eventId = insertEvent({
  transferId: transfer, type: "received", actorProfileId: ids.agentOne,
  actorPartyId: agentParty.id, affectedRollCount: 1,
});
rows = notificationsForEvent(eventId);
expectRecipients(rows, [ids.adminActor, ids.adminOther], "partial receipt");
assert(rows.every((row) => row.event_type === "transfer.partially_received" && row.attention === "action_required"), "Partial receipt mapping mismatch.");

transfer = insertTransfer({
  number: "PG-T-20260823-90000006", senderPartyId: companyParty.id, recipientPartyId: agentParty.id,
  status: "received", creatorProfileId: ids.adminActor,
});
eventId = insertEvent({
  transferId: transfer, type: "received", actorProfileId: ids.agentOne,
  actorPartyId: agentParty.id, affectedRollCount: 1,
});
rows = notificationsForEvent(eventId);
expectRecipients(rows, [ids.adminActor, ids.adminOther], "full standard receipt");
assert(rows.every((row) => row.event_type === "transfer.received" && row.attention === "info"), "Full receipt mapping mismatch.");

transfer = insertTransfer({
  number: "PG-T-20260823-90000007", senderPartyId: companyParty.id, recipientPartyId: agentParty.id,
  status: "partially_completed", creatorProfileId: ids.adminActor,
});
eventId = insertEvent({
  transferId: transfer, type: "unresolved_released", actorProfileId: ids.adminActor,
  actorPartyId: companyParty.id, reason: "private-reason sender resolution", affectedRollCount: 1,
});
rows = notificationsForEvent(eventId);
expectRecipients(rows, [ids.agentOne, ids.agentTwo], "sender unresolved release");
assert(rows.every((row) => row.event_type === "transfer.unresolved_released" && row.attention === "info"), "Unresolved release mapping mismatch.");

transfer = insertTransfer({
  number: "PG-T-20260823-90000008", senderPartyId: companyParty.id, recipientPartyId: agentParty.id,
  status: "partially_completed", creatorProfileId: ids.adminActor,
});
eventId = insertEvent({
  transferId: transfer, type: "administrative_unresolved_released", actorProfileId: ids.adminActor,
  reason: "private-reason admin resolution", affectedRollCount: 1,
});
rows = notificationsForEvent(eventId);
expectRecipients(rows, [ids.adminOther, ids.agentOne, ids.agentTwo], "administrative unresolved release");
assert(rows.every((row) => row.event_type === "transfer.administrative_unresolved_released" && row.attention === "warning"), "Administrative unresolved mapping mismatch.");

transfer = insertTransfer({
  number: "PG-T-20260823-90000009", senderPartyId: centerParty.id, recipientPartyId: companyParty.id,
  status: "received", creatorProfileId: ids.adminActor, kind: "opened_roll_recovery",
});
const recoveryCreatedEvent = insertEvent({
  transferId: transfer, sequence: 1, type: "opened_roll_recovery_created",
  actorProfileId: ids.adminActor, actorPartyId: companyParty.id,
  reason: "authorized recovery handoff", affectedRollCount: 1,
});
assert(notificationsForEvent(recoveryCreatedEvent).length === 0,
  "opened_roll_recovery_created must remain silent; completion is authoritative.");

eventId = insertEvent({
  transferId: transfer, sequence: 2, type: "received", actorProfileId: ids.adminActor,
  actorPartyId: companyParty.id, affectedRollCount: 1,
});
rows = notificationsForEvent(eventId);
expectRecipients(rows, [ids.center], "opened Roll recovery completion");
assert(rows.length === 1 && rows[0].event_type === "transfer.recovery_completed" && rows[0].attention === "info",
  `Recovery completion mapping mismatch: ${JSON.stringify(rows)}`);
assert(!rows.some((row) => row.event_type === "transfer.received"), "Recovery completion must suppress the generic Transfer received notification.");

console.log("Cube L Transfer notification materialization verification passed.");
