import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const apiUrl = process.env.API_URL;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
const anonKey = process.env.ANON_KEY;

if (!apiUrl || !serviceRoleKey || !anonKey) {
  throw new Error("Local Supabase API_URL, SERVICE_ROLE_KEY and ANON_KEY are required.");
}

const password = "Cube-J-Recovery-2026!";

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

async function expectRpcError(name, body, token, expectedMessage) {
  const result = await rpc(name, body, token);
  assert(!result.response.ok, `${name} unexpectedly succeeded; expected ${expectedMessage}.`);
  assert(result.body?.message === expectedMessage,
    `${name} expected ${expectedMessage}, received ${result.response.status} ${JSON.stringify(result.body)}`);
  return result;
}

async function createUser({ email, role, agentId = null, centerId = null }) {
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
          country_agent_id: agentId,
          dealer_id: null,
          installation_center_id: centerId,
        },
      },
      user_metadata: { display_name: `Cube J Recovery ${role}` },
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
  assert(name, "Supabase database container was not found for Cube J recovery fixtures.");
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
    ["exec", "-i", dbContainerName(), "psql", "-At", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-c", sql],
    { encoding: "utf8" },
  ).trim();
}

function sqlUuid(value) {
  assert(/^[0-9a-f-]{36}$/i.test(value), `Unsafe UUID fixture value: ${value}`);
  return `'${value}'::uuid`;
}

const emails = {
  admin: "cube-j-recovery-admin@example.test",
  agentA: "cube-j-recovery-agent-a@example.test",
  agentB: "cube-j-recovery-agent-b@example.test",
  centerA: "cube-j-recovery-center-a@example.test",
  centerB: "cube-j-recovery-center-b@example.test",
};

await createUser({ email: emails.admin, role: "admin" });
const adminToken = await signIn(emails.admin);

async function createNetwork(suffix, city) {
  const agent = one(await rest("country_agents?select=id,opened_roll_recovery_enabled", adminToken, {
    method: "POST", prefer: true,
    body: { code: `CJR-AGENT-${suffix}`, name: `Cube J Recovery Agent ${suffix}`, country_code: "EG" },
  }), `Create Agent ${suffix}`);
  assert(agent.opened_roll_recovery_enabled === false, "Agent recovery capability must default off.");

  const dealer = one(await rest("dealers?select=id", adminToken, {
    method: "POST", prefer: true,
    body: {
      code: `CJR-DEALER-${suffix}`,
      name: `Cube J Recovery Dealer ${suffix}`,
      country_code: "EG",
      country_agent_id: agent.id,
    },
  }), `Create Dealer ${suffix}`);

  const center = one(await rest("installation_centers?select=id,status", adminToken, {
    method: "POST", prefer: true,
    body: {
      code: `CJR-CENTER-${suffix}`,
      name: `Cube J Recovery Center ${suffix}`,
      country_code: "EG",
      city,
      dealer_id: dealer.id,
    },
  }), `Create Center ${suffix}`);

  return { agent, dealer, center };
}

const networkA = await createNetwork("A", "Cairo");
const networkB = await createNetwork("B", "Alexandria");

await createUser({ email: emails.agentA, role: "agent", agentId: networkA.agent.id });
await createUser({ email: emails.agentB, role: "agent", agentId: networkB.agent.id });
await createUser({ email: emails.centerA, role: "center", centerId: networkA.center.id });
await createUser({ email: emails.centerB, role: "center", centerId: networkB.center.id });

const agentAToken = await signIn(emails.agentA);
const centerAToken = await signIn(emails.centerA);
const centerBToken = await signIn(emails.centerB);

const agentAParty = one(await rest(
  `operational_parties?country_agent_id=eq.${networkA.agent.id}&party_type=eq.agent&select=id`, adminToken,
), "Read Agent A party");
const centerAParty = one(await rest(
  `operational_parties?installation_center_id=eq.${networkA.center.id}&select=id`, adminToken,
), "Read Center A party");
const centerBParty = one(await rest(
  `operational_parties?installation_center_id=eq.${networkB.center.id}&select=id`, adminToken,
), "Read Center B party");
const companyParty = one(await rest("operational_parties?party_type=eq.company&select=id", adminToken), "Read Company party");

const product = one(await rest("products?select=id", adminToken, {
  method: "POST", prefer: true,
  body: {
    code: "PG-CJR-TEST",
    name: "Cube J Recovery Test PPF",
    slug: "cube-j-recovery-test-ppf",
    product_type: "PPF",
    category: "Paint Protection Film",
    version_name: "Cube J Recovery",
    width_mm: 1524,
    length_m: 15,
    thickness_mil: 7.5,
    weight_kg: 12.5,
    origin_country: "USA",
    default_warranty_months: 120,
    marketing_description: "Cube J recovery contract fixture.",
    technical_description: "Cube J recovery contract fixture.",
    features: ["Recovery fixture"],
    warranty_coverage: "Test coverage.",
    care_instructions: "Test care.",
    publication_status: "draft",
  },
}), "Create recovery Product");

const orderResult = await rpc("create_production_order", {
  p_request_id: randomUUID(),
  p_product_id: product.id,
  p_production_date: "2026-08-22",
  p_lots: [{ quantity: 4, source_reference: "CJR-LOT" }],
  p_source_reference: "CJR",
  p_notes: "Cube J recovery verification",
}, adminToken);
assert(orderResult.response.ok && typeof orderResult.body === "string",
  `Could not create recovery Production Order: ${orderResult.response.status} ${JSON.stringify(orderResult.body)}`);

const rollResult = await rest(
  `rolls?production_order_id=eq.${encodeURIComponent(orderResult.body)}&select=id,serial_number&order=serial_number.asc`,
  adminToken,
);
assert(rollResult.response.ok && rollResult.body.length === 4,
  `Expected four recovery Rolls: ${JSON.stringify(rollResult.body)}`);
const rolls = rollResult.body;

function seedCenterCustody(roll, partyId) {
  runSql(`
begin;
update public.roll_custody_current
set custodian_party_id = ${sqlUuid(partyId)}, confirmed_at = now()
where roll_id = ${sqlUuid(roll.id)};
insert into public.roll_custody_events (roll_id, custody_sequence, custodian_party_id, confirmed_at)
values (${sqlUuid(roll.id)}, 2, ${sqlUuid(partyId)}, now());
commit;
`);
}

seedCenterCustody(rolls[0], centerAParty.id);
seedCenterCustody(rolls[1], centerAParty.id);
seedCenterCustody(rolls[2], centerBParty.id);
seedCenterCustody(rolls[3], centerAParty.id);

for (const [roll, token] of [[rolls[0], centerAToken], [rolls[1], centerAToken], [rolls[2], centerBToken], [rolls[3], centerAToken]]) {
  const opening = await rpc("open_roll", {
    p_request_id: randomUUID(),
    p_roll_serial: roll.serial_number,
  }, token);
  assert(opening.response.ok && opening.body === roll.id,
    `Could not open recovery fixture Roll ${roll.serial_number}: ${opening.response.status} ${JSON.stringify(opening.body)}`);
}

await expectRpcError("recover_opened_roll", {
  p_request_id: randomUUID(),
  p_roll_serial: rolls[0].serial_number,
  p_reason: "Physical defect discovered after opening",
  p_confirm_physical_receipt: true,
}, agentAToken, "PG_ROLL_RECOVERY_AGENT_NOT_ENABLED");

await expectRpcError("recover_opened_roll", {
  p_request_id: randomUUID(),
  p_roll_serial: rolls[0].serial_number,
  p_reason: "Center cannot self recover this opened Roll",
  p_confirm_physical_receipt: true,
}, centerAToken, "PG_ROLL_RECOVERY_NOT_AUTHORIZED");

const enableResult = await rpc("set_agent_opened_roll_recovery", {
  p_agent_id: networkA.agent.id,
  p_enabled: true,
}, adminToken);
assert(enableResult.response.ok && enableResult.body === true,
  `Admin could not enable Agent recovery: ${enableResult.response.status} ${JSON.stringify(enableResult.body)}`);

const directAgentUpdate = await rest(`country_agents?id=eq.${networkA.agent.id}`, agentAToken, {
  method: "PATCH",
  body: { opened_roll_recovery_enabled: false },
  prefer: true,
});
assert(!directAgentUpdate.response.ok,
  `Agent must not directly mutate recovery capability: ${directAgentUpdate.response.status} ${JSON.stringify(directAgentUpdate.body)}`);

await expectRpcError("recover_opened_roll", {
  p_request_id: randomUUID(),
  p_roll_serial: rolls[0].serial_number,
  p_reason: "No receipt confirmation",
  p_confirm_physical_receipt: false,
}, agentAToken, "PG_ROLL_RECOVERY_PHYSICAL_RECEIPT_REQUIRED");

await expectRpcError("recover_opened_roll", {
  p_request_id: randomUUID(),
  p_roll_serial: rolls[0].serial_number,
  p_reason: "bad",
  p_confirm_physical_receipt: true,
}, agentAToken, "PG_ROLL_RECOVERY_REASON_INVALID");

await expectRpcError("recover_opened_roll", {
  p_request_id: randomUUID(),
  p_roll_serial: rolls[2].serial_number,
  p_reason: "Attempting recovery outside the Agent network",
  p_confirm_physical_receipt: true,
}, agentAToken, "PG_ROLL_RECOVERY_OUTSIDE_AGENT_SCOPE");

const agentRecoveryRequest = randomUUID();
const agentRecoveryReason = "Physical defect found after the Center opened the Roll";
const agentRecovery = await rpc("recover_opened_roll", {
  p_request_id: agentRecoveryRequest,
  p_roll_serial: rolls[0].serial_number,
  p_reason: agentRecoveryReason,
  p_confirm_physical_receipt: true,
}, agentAToken);
assert(agentRecovery.response.ok && typeof agentRecovery.body === "string",
  `Agent recovery failed: ${agentRecovery.response.status} ${JSON.stringify(agentRecovery.body)}`);

const recoveryTransfer = one(await rest(
  `roll_transfers?id=eq.${agentRecovery.body}&select=id,status,transfer_kind,sender_party_id,recipient_party_id,roll_count`,
  agentAToken,
), "Read Agent recovery Transfer");
assert(recoveryTransfer.status === "received", "Recovery Transfer must commit terminally as received.");
assert(recoveryTransfer.transfer_kind === "opened_roll_recovery", "Recovery Transfer kind must be explicit.");
assert(recoveryTransfer.sender_party_id === centerAParty.id, "Recovery sender must remain the actual prior custodian.");
assert(recoveryTransfer.recipient_party_id === agentAParty.id, "Agent recovery destination must be the Agent party.");
assert(recoveryTransfer.roll_count === 1, "Recovery must remain single-Roll in Cube J.");

const custodyAfterAgent = querySql(
  `select custodian_party_id from public.roll_custody_current where roll_id = ${sqlUuid(rolls[0].id)};`,
);
assert(custodyAfterAgent === agentAParty.id, "Agent recovery must move confirmed custody to the Agent.");
assert(Number(querySql(
  `select count(*) from public.roll_transfer_reservations where roll_id = ${sqlUuid(rolls[0].id)};`,
)) === 0, "Completed Recovery must leave no active reservation.");
assert(Number(querySql(
  `select count(*) from public.roll_openings where roll_id = ${sqlUuid(rolls[0].id)};`,
)) === 1, "Recovery must never erase the original Opening.");

const eventTypes = querySql(
  `select string_agg(event_type, ',' order by event_sequence) from public.roll_transfer_events where transfer_id = ${sqlUuid(agentRecovery.body)};`,
);
assert(eventTypes === "opened_roll_recovery_created,received",
  `Recovery audit events were unexpected: ${eventTypes}`);
const storedReason = querySql(
  `select reason from public.roll_transfer_events where transfer_id = ${sqlUuid(agentRecovery.body)} and event_type = 'opened_roll_recovery_created';`,
);
assert(storedReason === agentRecoveryReason, "Recovery reason must be immutable audit evidence.");

const custodyEventCountBeforeRetry = Number(querySql(
  `select count(*) from public.roll_custody_events where roll_id = ${sqlUuid(rolls[0].id)};`,
));
const retryRecovery = await rpc("recover_opened_roll", {
  p_request_id: agentRecoveryRequest,
  p_roll_serial: rolls[0].serial_number,
  p_reason: agentRecoveryReason,
  p_confirm_physical_receipt: true,
}, agentAToken);
assert(retryRecovery.response.ok && retryRecovery.body === agentRecovery.body,
  `Matching recovery retry failed: ${retryRecovery.response.status} ${JSON.stringify(retryRecovery.body)}`);
const custodyEventCountAfterRetry = Number(querySql(
  `select count(*) from public.roll_custody_events where roll_id = ${sqlUuid(rolls[0].id)};`,
));
assert(custodyEventCountAfterRetry === custodyEventCountBeforeRetry,
  "Matching Recovery retry must not append another custody event.");

await expectRpcError("recover_opened_roll", {
  p_request_id: agentRecoveryRequest,
  p_roll_serial: rolls[0].serial_number,
  p_reason: "Different recovery reason for same request id",
  p_confirm_physical_receipt: true,
}, agentAToken, "PG_ROLL_RECOVERY_REQUEST_CONFLICT");

const adminRecoveryRequest = randomUUID();
const adminRecovery = await rpc("recover_opened_roll", {
  p_request_id: adminRecoveryRequest,
  p_roll_serial: rolls[0].serial_number,
  p_reason: "Company physically received the opened Roll from the Agent",
  p_confirm_physical_receipt: true,
}, adminToken);
assert(adminRecovery.response.ok && typeof adminRecovery.body === "string",
  `Admin recovery from Agent failed: ${adminRecovery.response.status} ${JSON.stringify(adminRecovery.body)}`);

const custodyAfterAdmin = querySql(
  `select custodian_party_id from public.roll_custody_current where roll_id = ${sqlUuid(rolls[0].id)};`,
);
assert(custodyAfterAdmin === companyParty.id, "Admin recovery must move confirmed custody to Company.");
assert(Number(querySql(
  `select count(*) from public.roll_openings where roll_id = ${sqlUuid(rolls[0].id)};`,
)) === 1, "Admin recovery must preserve the original Opening.");

await expectRpcError("recover_opened_roll", {
  p_request_id: randomUUID(),
  p_roll_serial: rolls[0].serial_number,
  p_reason: "Already physically held by Company",
  p_confirm_physical_receipt: true,
}, adminToken, "PG_ROLL_RECOVERY_ALREADY_AT_DESTINATION");

const disableResult = await rpc("set_agent_opened_roll_recovery", {
  p_agent_id: networkA.agent.id,
  p_enabled: false,
}, adminToken);
assert(disableResult.response.ok && disableResult.body === false,
  `Admin could not disable Agent recovery: ${disableResult.response.status} ${JSON.stringify(disableResult.body)}`);

await expectRpcError("recover_opened_roll", {
  p_request_id: randomUUID(),
  p_roll_serial: rolls[1].serial_number,
  p_reason: "Capability was disabled before this recovery",
  p_confirm_physical_receipt: true,
}, agentAToken, "PG_ROLL_RECOVERY_AGENT_NOT_ENABLED");

await expectRpcError("void_production_order", {
  p_order_id: orderResult.body,
  p_reason: "Attempt to void after physical Roll use began",
}, adminToken, "PG_ROLL_OPENING_PRODUCTION_VOID_BLOCKED");

console.log("Cube J Opened Roll Recovery database contracts verified.");
