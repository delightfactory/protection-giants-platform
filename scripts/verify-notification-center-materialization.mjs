import { execFileSync } from "node:child_process";

const apiUrl = process.env.API_URL;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
const anonKey = process.env.ANON_KEY;

if (!apiUrl || !serviceRoleKey || !anonKey) {
  throw new Error("Local Supabase API_URL, SERVICE_ROLE_KEY and ANON_KEY are required.");
}

const password = "Cube-L-Center-Notifications-2026!";

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
      user_metadata: { display_name: `Cube L Center ${role}` },
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
  assert(name, "Supabase database container was not found for Cube L Center fixtures.");
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

function latestCenterEventId(table, centerId, extraPredicate = "true") {
  const id = querySql(`
    select id
    from public.${table}
    where installation_center_id = ${sqlUuid(centerId)}
      and (${extraPredicate})
    order by created_at desc, id desc
    limit 1;
  `);
  assert(/^[0-9a-f-]{36}$/i.test(id), `No ${table} event found for Center ${centerId}.`);
  return id;
}

function notificationsFor(sourceDomain, sourceEventKey) {
  const safeDomain = String(sourceDomain).replaceAll("'", "''");
  const safeKey = String(sourceEventKey).replaceAll("'", "''");
  const raw = querySql(`
    select coalesce(json_agg(json_build_object(
      'profile_id', n.recipient_profile_id,
      'event_type', n.event_type,
      'attention', n.attention_level,
      'title', n.title,
      'body', n.body,
      'action_path', n.action_path,
      'push_eligible', n.push_eligible
    ) order by n.recipient_profile_id)::text, '[]')
    from public.notifications n
    where n.source_domain = '${safeDomain}'
      and n.source_event_key = '${safeKey}';
  `);
  return JSON.parse(raw || "[]");
}

function expectRecipients(rows, expectedProfileIds, label) {
  const actual = rows.map((row) => row.profile_id).sort();
  const expected = [...expectedProfileIds].sort();
  assert(JSON.stringify(actual) === JSON.stringify(expected),
    `${label} recipients mismatch. expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)} rows=${JSON.stringify(rows)}`);
  assert(rows.every((row) => row.push_eligible === true), `${label} must remain Push eligible.`);
}

const emails = {
  adminActor: "cube-l-center-admin-actor@example.test",
  adminOther: "cube-l-center-admin-other@example.test",
  agentOne: "cube-l-center-agent-one@example.test",
  agentTwo: "cube-l-center-agent-two@example.test",
  agentSuspended: "cube-l-center-agent-suspended@example.test",
  dealer: "cube-l-center-dealer@example.test",
  dealerCenter: "cube-l-center-dealer-center@example.test",
  directAgentCenter: "cube-l-center-direct-agent@example.test",
  companyCenter: "cube-l-center-company@example.test",
};

const adminActor = await createUser({ email: emails.adminActor, role: "admin" });
const adminOther = await createUser({ email: emails.adminOther, role: "admin" });
const adminToken = await signIn(emails.adminActor);

const agent = one(await rest("country_agents?select=id", adminToken, {
  method: "POST", prefer: true,
  body: { code: "CUBE-L-CT-AGENT", name: "Cube L Center Agent", country_code: "EG" },
}), "Create notification Agent");
const dealer = one(await rest("dealers?select=id", adminToken, {
  method: "POST", prefer: true,
  body: {
    code: "CUBE-L-CT-DEALER", name: "Cube L Center Dealer", country_code: "EG", country_agent_id: agent.id,
  },
}), "Create notification Dealer");

const dealerCenter = one(await rest("installation_centers?select=id,name", adminToken, {
  method: "POST", prefer: true,
  body: {
    code: "CUBE-L-CT-DCH", name: "Cube L Dealer Child Center", country_code: "EG", city: "Cairo", dealer_id: dealer.id,
  },
}), "Create Dealer-child Center");
const directAgentCenter = one(await rest("installation_centers?select=id,name", adminToken, {
  method: "POST", prefer: true,
  body: {
    code: "CUBE-L-CT-ADC", name: "Cube L Direct Agent Center", country_code: "EG", city: "Giza", country_agent_id: agent.id,
  },
}), "Create Agent-direct Center");
const companyCenter = one(await rest("installation_centers?select=id,name", adminToken, {
  method: "POST", prefer: true,
  body: {
    code: "CUBE-L-CT-CMP", name: "Cube L Company Center", country_code: "EG", city: "Tanta",
  },
}), "Create Company-direct Center");
const adminCorrectionCenter = one(await rest("installation_centers?select=id,name", adminToken, {
  method: "POST", prefer: true,
  body: {
    code: "CUBE-L-CT-ADM", name: "Cube L Admin Location Center", country_code: "EG", city: "Mansoura", country_agent_id: agent.id,
  },
}), "Create admin-correction Center");

const agentOne = await createUser({ email: emails.agentOne, role: "agent", countryAgentId: agent.id });
const agentTwo = await createUser({ email: emails.agentTwo, role: "agent", countryAgentId: agent.id });
const agentSuspended = await createUser({ email: emails.agentSuspended, role: "agent", countryAgentId: agent.id });
const dealerUser = await createUser({ email: emails.dealer, role: "dealer", dealerId: dealer.id });
const dealerCenterUser = await createUser({ email: emails.dealerCenter, role: "center", centerId: dealerCenter.id });
await createUser({ email: emails.directAgentCenter, role: "center", centerId: directAgentCenter.id });
await createUser({ email: emails.companyCenter, role: "center", centerId: companyCenter.id });
runSql(`update public.profiles set status = 'suspended' where id = ${sqlUuid(agentSuspended.id)};`);

const agentToken = await signIn(emails.agentOne);
const dealerCenterToken = await signIn(emails.dealerCenter);
const directAgentCenterToken = await signIn(emails.directAgentCenter);
const companyCenterToken = await signIn(emails.companyCenter);

let result = await rpc("update_own_center_location", {
  p_latitude: 30.04442, p_longitude: 31.235712, p_accuracy_m: 18.5,
}, dealerCenterToken);
const dealerCapture = one(result, "Dealer-child Center captures device location");
let eventId = latestCenterEventId("center_location_events", dealerCenter.id, "source = 'center_device'");
let rows = notificationsFor("center_location", `center_location_events:${eventId}`);
expectRecipients(rows, [agentOne.id, agentTwo.id], "Dealer-child location approval request");
assert(rows.every((row) => row.event_type === "center.location_approval_required" && row.attention === "action_required"),
  `Dealer-child location mapping mismatch: ${JSON.stringify(rows)}`);
assert(rows.every((row) => row.action_path === `/operations/centers/${dealerCenter.id}/approval`), "Location approval deep link mismatch.");
assert(rows.every((row) => row.body.includes(dealerCenter.name)), "Location approval message must identify the Center.");
assert(rows.every((row) => !row.body.includes("30.04442") && !row.body.includes("31.235712")), "Location notification leaked raw coordinates.");
assert(!rows.some((row) => [dealerUser.id, dealerCenterUser.id, agentSuspended.id].includes(row.profile_id)), "Dealer, Center or suspended Agent received approver-only notification.");

result = await rpc("update_own_center_location", {
  p_latitude: 30.0131, p_longitude: 31.2089, p_accuracy_m: 12.4,
}, directAgentCenterToken);
one(result, "Direct-Agent Center captures device location");
eventId = latestCenterEventId("center_location_events", directAgentCenter.id, "source = 'center_device'");
rows = notificationsFor("center_location", `center_location_events:${eventId}`);
expectRecipients(rows, [agentOne.id, agentTwo.id], "Direct-Agent location approval request");

result = await rpc("update_own_center_location", {
  p_latitude: 30.7865, p_longitude: 31.0004, p_accuracy_m: 15.0,
}, companyCenterToken);
one(result, "Company-direct Center captures device location");
eventId = latestCenterEventId("center_location_events", companyCenter.id, "source = 'center_device'");
rows = notificationsFor("center_location", `center_location_events:${eventId}`);
expectRecipients(rows, [adminActor.id, adminOther.id], "Company-direct location approval request");

result = await rpc("admin_update_center_location", {
  p_center_id: adminCorrectionCenter.id, p_latitude: 31.0409, p_longitude: 31.3785,
}, adminToken);
one(result, "Admin corrects Center location");
eventId = latestCenterEventId("center_location_events", adminCorrectionCenter.id, "source = 'admin'");
rows = notificationsFor("center_location", `center_location_events:${eventId}`);
assert(rows.length === 0, `Admin location correction must not create L-CT-01: ${JSON.stringify(rows)}`);

result = await rpc("approve_center_network", {
  p_center_id: dealerCenter.id,
  p_expected_location_captured_at: dealerCapture.captured_at,
}, agentToken);
one(result, "Agent approves Dealer-child Center");
eventId = latestCenterEventId("center_network_approval_events", dealerCenter.id, "action = 'approved'");
rows = notificationsFor("center_network_approval", `center_network_approval_events:${eventId}`);
expectRecipients(rows, [dealerCenterUser.id], "Center approval granted");
assert(rows[0].event_type === "center.network_approved" && rows[0].attention === "info", "Approval notification mapping mismatch.");
assert(rows[0].action_path === "/operations/location", "Approved Center must receive a Center-safe location route.");
assert(!rows[0].body.includes("العهدة") && !rows[0].body.includes("الضمان"), "Approval copy must not imply custody or Warranty authority.");

result = await rpc("revoke_center_network_approval", { p_center_id: dealerCenter.id }, agentToken);
one(result, "Agent revokes Dealer-child Center approval");
eventId = latestCenterEventId("center_network_approval_events", dealerCenter.id, "action = 'revoked'");
rows = notificationsFor("center_network_approval", `center_network_approval_events:${eventId}`);
expectRecipients(rows, [dealerCenterUser.id], "Center approval revoked");
assert(rows[0].event_type === "center.network_approval_revoked" && rows[0].attention === "warning", "Revocation notification mapping mismatch.");
assert(!rows[0].body.includes(adminActor.id) && !rows[0].body.includes(agentOne.id), "Revocation Push copy leaked actor detail.");

const recapture = one(await rpc("update_own_center_location", {
  p_latitude: 30.045, p_longitude: 31.236, p_accuracy_m: 10.0,
}, dealerCenterToken), "Center refreshes location before reapproval");
one(await rpc("approve_center_network", {
  p_center_id: dealerCenter.id,
  p_expected_location_captured_at: recapture.captured_at,
}, agentToken), "Agent reapproves Dealer-child Center");

one(await rpc("update_own_center_location", {
  p_latitude: 30.046, p_longitude: 31.237, p_accuracy_m: 9.0,
}, dealerCenterToken), "Approved Center changes device location");
const invalidatedEventId = latestCenterEventId("center_network_approval_events", dealerCenter.id, "action = 'location_changed'");
rows = notificationsFor("center_network_approval", `center_network_approval_events:${invalidatedEventId}`);
expectRecipients(rows, [dealerCenterUser.id], "Center approval invalidated by location change");
assert(rows[0].event_type === "center.network_approval_location_changed" && rows[0].attention === "warning", "Location-changed approval mapping mismatch.");
assert(rows[0].action_path === "/operations/location", "Location-changed notification must use Center-safe route.");
assert(rows[0].body.includes("يلزم اعتماد الموقع من جديد"), "Location-changed copy must explain re-approval without implying suspension.");
assert(!rows[0].body.includes("موقوف"), "Location-changed copy must not imply Center suspension.");

const latestDeviceEventId = latestCenterEventId("center_location_events", dealerCenter.id, "source = 'center_device'");
rows = notificationsFor("center_location", `center_location_events:${latestDeviceEventId}`);
expectRecipients(rows, [agentOne.id, agentTwo.id], "Reapproval request after approved Center moves");
assert(rows.every((row) => row.attention === "action_required"), "Moved Center must create a new approval request for the responsible Agent.");

console.log("Cube L Center notification materialization verification passed.");
