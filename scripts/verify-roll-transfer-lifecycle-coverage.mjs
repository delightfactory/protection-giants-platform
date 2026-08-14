import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const apiUrl = process.env.API_URL;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
const anonKey = process.env.ANON_KEY;

if (!apiUrl || !serviceRoleKey || !anonKey) {
  throw new Error("Local Supabase API_URL, SERVICE_ROLE_KEY and ANON_KEY are required.");
}

const password = "Roll-Transfer-Lifecycle-Coverage-2026!";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
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
  assert(!result.response.ok, `${name} unexpectedly succeeded for ${expectedMessage}.`);
  assert(result.body?.message === expectedMessage,
    `${name} expected ${expectedMessage}, received ${result.response.status} ${JSON.stringify(result.body)}`);
  return result;
}

async function createUser({ email, role, countryAgentId = null, dealerId = null }) {
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
          installation_center_id: null,
        },
      },
      user_metadata: { display_name: `Cube F lifecycle ${role}` },
    },
  });
  assert(result.response.ok && result.body?.id,
    `Could not create ${role} user: ${result.response.status} ${JSON.stringify(result.body)}`);
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
  assert(name, "Supabase database container was not found for Cube F lifecycle coverage.");
  return name;
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

function reservationCount(rollId) {
  return Number(querySql(`select count(*) from public.roll_transfer_reservations where roll_id = ${sqlUuid(rollId)};`));
}

function custodyParty(rollId) {
  return querySql(`select custodian_party_id from public.roll_custody_current where roll_id = ${sqlUuid(rollId)};`);
}

const adminEmail = "cube-f-lifecycle-admin@example.test";
const dealerEmail = "cube-f-lifecycle-dealer@example.test";

await createUser({ email: adminEmail, role: "admin" });
const adminToken = await signIn(adminEmail);

const agent = one(await rest("country_agents?select=id,status", adminToken, {
  method: "POST",
  prefer: true,
  body: {
    code: "CUBE-F-LIFECYCLE-AGENT",
    name: "Cube F Lifecycle Agent",
    country_code: "EG",
  },
}), "Create lifecycle Agent");

const dealer = one(await rest("dealers?select=id,status,country_agent_id", adminToken, {
  method: "POST",
  prefer: true,
  body: {
    code: "CUBE-F-LIFECYCLE-DEALER",
    name: "Cube F Lifecycle Dealer",
    country_code: "EG",
    country_agent_id: agent.id,
  },
}), "Create lifecycle Dealer");
await createUser({ email: dealerEmail, role: "dealer", dealerId: dealer.id });
const dealerToken = await signIn(dealerEmail);

const companyParty = one(
  await rest("operational_parties?party_type=eq.company&select=id,transfer_code", adminToken),
  "Read Company party",
);
const agentParty = one(
  await rest(`operational_parties?country_agent_id=eq.${agent.id}&select=id,transfer_code`, adminToken),
  "Read Agent party",
);
const dealerParty = one(
  await rest(`operational_parties?dealer_id=eq.${dealer.id}&select=id,transfer_code`, adminToken),
  "Read Dealer party",
);

const product = one(await rest("products?select=id,code", adminToken, {
  method: "POST",
  prefer: true,
  body: {
    code: "PG-CUBE-F-LIFECYCLE",
    name: "Cube F Lifecycle Coverage PPF",
    slug: "cube-f-lifecycle-coverage-ppf",
    product_type: "PPF",
    category: "Paint Protection Film",
    version_name: "Lifecycle Coverage",
    width_mm: 1524,
    length_m: 15,
    thickness_mil: 7.5,
    weight_kg: 12.5,
    origin_country: "USA",
    default_warranty_months: 120,
    marketing_description: "Cube F lifecycle coverage fixture.",
    technical_description: "Cube F lifecycle coverage fixture.",
    features: ["Lifecycle fixture"],
    warranty_coverage: "Test coverage.",
    care_instructions: "Test care.",
    publication_status: "draft",
  },
}), "Create lifecycle Product");

async function createOrder(reference) {
  const result = await rpc("create_production_order", {
    p_request_id: randomUUID(),
    p_product_id: product.id,
    p_production_date: "2026-08-14",
    p_lots: [{ quantity: 1, source_reference: `${reference}-LOT` }],
    p_source_reference: reference,
    p_notes: "Cube F lifecycle coverage",
  }, adminToken);
  assert(result.response.ok && typeof result.body === "string",
    `${reference} order failed: ${result.response.status} ${JSON.stringify(result.body)}`);
  return result.body;
}

async function firstRoll(orderId) {
  return one(await rest(
    `rolls?production_order_id=eq.${encodeURIComponent(orderId)}&select=id,production_order_id,serial_number`,
    adminToken,
  ), `Read first Roll for ${orderId}`);
}

async function createCompanyTransfer(recipientCode, rollIds) {
  const result = await rpc("create_roll_transfer", {
    p_request_id: randomUUID(),
    p_recipient_transfer_code: recipientCode,
    p_roll_ids: rollIds,
  }, adminToken);
  assert(result.response.ok && typeof result.body === "string",
    `Company Transfer failed: ${result.response.status} ${JSON.stringify(result.body)}`);
  return result.body;
}

// One Transfer may atomically span physical Rolls from multiple generated
// Production Orders. The state engine must lock every affected order in a
// deterministic order while leaving confirmed custody with Company.
const mixedOrderA = await createOrder("CUBE-F-MIXED-A");
const mixedOrderB = await createOrder("CUBE-F-MIXED-B");
const mixedRollA = await firstRoll(mixedOrderA);
const mixedRollB = await firstRoll(mixedOrderB);
const mixedTransfer = await createCompanyTransfer(agentParty.transfer_code, [mixedRollB.id, mixedRollA.id]);
const mixedCounts = querySql(`
select
  (select count(*) from public.roll_transfer_items where transfer_id = ${sqlUuid(mixedTransfer)}) || '|' ||
  (select count(*) from public.roll_transfer_reservations where transfer_id = ${sqlUuid(mixedTransfer)}) || '|' ||
  (select count(distinct r.production_order_id)
     from public.roll_transfer_items i
     join public.rolls r on r.id = i.roll_id
    where i.transfer_id = ${sqlUuid(mixedTransfer)});
`);
assert(mixedCounts === "2|2|2", `Mixed-Production-Order Transfer persisted incorrect counts: ${mixedCounts}`);
assert(custodyParty(mixedRollA.id) === companyParty.id && custodyParty(mixedRollB.id) === companyParty.id,
  "Mixed-Production-Order Transfer changed confirmed custody.");
const mixedCancel = await rpc("cancel_roll_transfer", { p_transfer_id: mixedTransfer }, adminToken);
assert(mixedCancel.response.ok, `Could not cancel mixed-order Transfer: ${JSON.stringify(mixedCancel.body)}`);
assert(reservationCount(mixedRollA.id) === 0 && reservationCount(mixedRollB.id) === 0,
  "Mixed-order cancellation did not release both reservations.");

// A recipient that becomes suspended before a new creation is revalidated
// inside the RPC transaction and cannot receive a new pending Transfer.
const inactiveRecipientOrder = await createOrder("CUBE-F-INACTIVE-RECIPIENT");
const inactiveRecipientRoll = await firstRoll(inactiveRecipientOrder);
const suspendAgent = await rest(`country_agents?id=eq.${agent.id}&select=id,status`, adminToken, {
  method: "PATCH",
  prefer: true,
  body: { status: "suspended" },
});
assert(suspendAgent.response.ok && suspendAgent.body?.[0]?.status === "suspended",
  `Could not suspend recipient Agent: ${JSON.stringify(suspendAgent.body)}`);
await expectRpcError("create_roll_transfer", {
  p_request_id: randomUUID(),
  p_recipient_transfer_code: agentParty.transfer_code,
  p_roll_ids: [inactiveRecipientRoll.id],
}, adminToken, "PG_TRANSFER_RECIPIENT_INACTIVE");
assert(reservationCount(inactiveRecipientRoll.id) === 0,
  "Inactive-recipient creation left a reservation behind.");
const reactivateAgent = await rest(`country_agents?id=eq.${agent.id}&select=id,status`, adminToken, {
  method: "PATCH",
  prefer: true,
  body: { status: "active" },
});
assert(reactivateAgent.response.ok && reactivateAgent.body?.[0]?.status === "active",
  "Could not reactivate recipient Agent.");

// Recipient rejection and recipient suspension serialize on the Dealer row.
// Rejection may win before suspension, or it must fail after observing the
// suspended Dealer; neither ordering may silently drop or corrupt reservation.
const rejectRaceOrder = await createOrder("CUBE-F-REJECT-RACE");
const rejectRaceRoll = await firstRoll(rejectRaceOrder);
const rejectRaceTransfer = await createCompanyTransfer(dealerParty.transfer_code, [rejectRaceRoll.id]);
const [rejectRace, dealerSuspend] = await Promise.all([
  rpc("reject_roll_transfer", { p_transfer_id: rejectRaceTransfer }, dealerToken),
  rest(`dealers?id=eq.${dealer.id}&select=id,status`, adminToken, {
    method: "PATCH",
    prefer: true,
    body: { status: "suspended" },
  }),
]);
assert(dealerSuspend.response.ok && dealerSuspend.body?.[0]?.status === "suspended",
  `Reject-race Dealer suspension failed: ${JSON.stringify(dealerSuspend.body)}`);
if (rejectRace.response.ok) {
  assert(reservationCount(rejectRaceRoll.id) === 0,
    "Successful serialized rejection did not release reservation.");
} else {
  assert(rejectRace.body?.message === "PG_TRANSFER_ACTOR_INACTIVE",
    `Reject race failed for unexpected reason: ${JSON.stringify(rejectRace.body)}`);
  assert(reservationCount(rejectRaceRoll.id) === 1,
    "Failed rejection silently released reservation.");
  const recovery = await rpc("admin_cancel_pending_roll_transfer", {
    p_transfer_id: rejectRaceTransfer,
    p_reason: "Resolve rejection race after Dealer suspension",
  }, adminToken);
  assert(recovery.response.ok,
    `Could not recover rejection-race Transfer: ${recovery.response.status} ${JSON.stringify(recovery.body)}`);
  assert(reservationCount(rejectRaceRoll.id) === 0,
    "Rejection-race Admin recovery did not release reservation.");
}

const dealerReactivate = await rest(`dealers?id=eq.${dealer.id}&select=id,status`, adminToken, {
  method: "PATCH",
  prefer: true,
  body: { status: "active" },
});
assert(dealerReactivate.response.ok && dealerReactivate.body?.[0]?.status === "active",
  "Could not reactivate Dealer after rejection race.");

// Admin recovery and party reactivation also serialize on the same lifecycle
// row. Recovery can commit only while the Dealer is still suspended; if
// reactivation wins first, recovery must observe active state and be rejected.
const recoveryRaceOrder = await createOrder("CUBE-F-RECOVERY-REACTIVATION-RACE");
const recoveryRaceRoll = await firstRoll(recoveryRaceOrder);
const recoveryRaceTransfer = await createCompanyTransfer(dealerParty.transfer_code, [recoveryRaceRoll.id]);
const suspendForRecovery = await rest(`dealers?id=eq.${dealer.id}&select=id,status`, adminToken, {
  method: "PATCH",
  prefer: true,
  body: { status: "suspended" },
});
assert(suspendForRecovery.response.ok && suspendForRecovery.body?.[0]?.status === "suspended",
  "Could not suspend Dealer for Admin recovery/reactivation race.");
assert(reservationCount(recoveryRaceRoll.id) === 1,
  "Suspension silently released recovery-race reservation.");

const [recoveryRace, reactivationRace] = await Promise.all([
  rpc("admin_cancel_pending_roll_transfer", {
    p_transfer_id: recoveryRaceTransfer,
    p_reason: "Concurrent Dealer reactivation recovery verification",
  }, adminToken),
  rest(`dealers?id=eq.${dealer.id}&select=id,status`, adminToken, {
    method: "PATCH",
    prefer: true,
    body: { status: "active" },
  }),
]);
assert(reactivationRace.response.ok && reactivationRace.body?.[0]?.status === "active",
  `Dealer reactivation race failed: ${JSON.stringify(reactivationRace.body)}`);

if (recoveryRace.response.ok) {
  assert(recoveryRace.body === recoveryRaceTransfer,
    "Successful Admin recovery returned the wrong Transfer ID.");
  assert(reservationCount(recoveryRaceRoll.id) === 0,
    "Successful Admin recovery did not release reservation.");
  const audit = querySql(`
select event_type || '|' || coalesce(actor_party_id::text, 'NULL')
from public.roll_transfer_events
where transfer_id = ${sqlUuid(recoveryRaceTransfer)} and event_sequence = 2;
`);
  assert(audit === "administrative_cancelled|NULL",
    `Recovery/reactivation audit evidence is incorrect: ${audit}`);
} else {
  assert(recoveryRace.body?.message === "PG_TRANSFER_ADMIN_RECOVERY_NOT_ALLOWED",
    `Recovery race failed for unexpected reason: ${JSON.stringify(recoveryRace.body)}`);
  assert(reservationCount(recoveryRaceRoll.id) === 1,
    "Rejected Admin recovery silently released reservation.");
  const recipientCleanup = await rpc("reject_roll_transfer", {
    p_transfer_id: recoveryRaceTransfer,
  }, dealerToken);
  assert(recipientCleanup.response.ok,
    `Could not clean up recovery-race Transfer through active recipient: ${JSON.stringify(recipientCleanup.body)}`);
  assert(reservationCount(recoveryRaceRoll.id) === 0,
    "Recipient cleanup did not release recovery-race reservation.");
}

console.log("Cube F multi-order and lifecycle race coverage passed.");
