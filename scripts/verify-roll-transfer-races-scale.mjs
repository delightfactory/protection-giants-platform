import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const apiUrl = process.env.API_URL;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
const anonKey = process.env.ANON_KEY;

if (!apiUrl || !serviceRoleKey || !anonKey) {
  throw new Error("Local Supabase API_URL, SERVICE_ROLE_KEY and ANON_KEY are required.");
}

const password = "Roll-Transfer-Race-Scale-2026!";

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
      user_metadata: { display_name: `Cube F race ${role}` },
    },
  });
  assert(result.response.ok && result.body?.id, `Could not create ${role} user: ${JSON.stringify(result.body)}`);
}

async function signIn(email) {
  const result = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email, password },
  });
  assert(result.response.ok && result.body?.access_token, `Could not sign in ${email}: ${JSON.stringify(result.body)}`);
  return result.body.access_token;
}

function dbContainerName() {
  const names = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" })
    .split("\n").map((value) => value.trim()).filter(Boolean);
  const name = names.find((value) => value.startsWith("supabase_db_"));
  assert(name, "Supabase database container was not found for Cube F race tests.");
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

function reservationCount(rollId) {
  return Number(querySql(`select count(*) from public.roll_transfer_reservations where roll_id = ${sqlUuid(rollId)};`));
}

const adminEmail = "cube-f-race-admin@example.test";
const agentEmail = "cube-f-race-agent@example.test";
const dealerEmail = "cube-f-race-dealer@example.test";

await createUser({ email: adminEmail, role: "admin" });
const adminToken = await signIn(adminEmail);

const agent = one(await rest("country_agents?select=id,status", adminToken, {
  method: "POST",
  prefer: true,
  body: {
    code: "CUBE-F-RACE-AGENT",
    name: "Cube F Race Agent",
    country_code: "EG",
  },
}), "Create race Agent");
await createUser({ email: agentEmail, role: "agent", countryAgentId: agent.id });
const agentToken = await signIn(agentEmail);

const dealer = one(await rest("dealers?select=id,status,country_agent_id", adminToken, {
  method: "POST",
  prefer: true,
  body: {
    code: "CUBE-F-RACE-DEALER",
    name: "Cube F Race Dealer",
    country_code: "EG",
    country_agent_id: agent.id,
  },
}), "Create race Dealer");
await createUser({ email: dealerEmail, role: "dealer", dealerId: dealer.id });

const companyParty = one(await rest("operational_parties?party_type=eq.company&select=id,transfer_code", adminToken), "Read Company Party");
const agentParty = one(await rest(`operational_parties?country_agent_id=eq.${agent.id}&select=id,transfer_code`, adminToken), "Read Agent Party");
const dealerParty = one(await rest(`operational_parties?dealer_id=eq.${dealer.id}&select=id,transfer_code`, adminToken), "Read Dealer Party");

const product = one(await rest("products?select=id,code", adminToken, {
  method: "POST",
  prefer: true,
  body: {
    code: "PG-CUBE-F-RACE",
    name: "Cube F Race and Scale PPF",
    slug: "cube-f-race-scale-ppf",
    product_type: "PPF",
    category: "Paint Protection Film",
    version_name: "Race Scale",
    width_mm: 1524,
    length_m: 15,
    thickness_mil: 7.5,
    weight_kg: 12.5,
    origin_country: "USA",
    default_warranty_months: 120,
    marketing_description: "Cube F race and scale fixture.",
    technical_description: "Cube F race and scale fixture.",
    features: ["Race fixture"],
    warranty_coverage: "Test coverage.",
    care_instructions: "Test care.",
    publication_status: "draft",
  },
}), "Create race Product");

async function createOrder(quantity, reference) {
  const result = await rpc("create_production_order", {
    p_request_id: randomUUID(),
    p_product_id: product.id,
    p_production_date: "2026-08-14",
    p_lots: [{ quantity, source_reference: `${reference}-LOT` }],
    p_source_reference: reference,
    p_notes: "Cube F race/scale verification",
  }, adminToken);
  assert(result.response.ok && typeof result.body === "string",
    `${reference} order failed: ${result.response.status} ${JSON.stringify(result.body)}`);
  return result.body;
}

async function orderRolls(orderId) {
  const result = await rest(
    `rolls?production_order_id=eq.${encodeURIComponent(orderId)}&select=id,serial_number&order=serial_number.asc`,
    adminToken,
  );
  assert(result.response.ok, `Could not read order Rolls: ${JSON.stringify(result.body)}`);
  return result.body;
}

function orderRollIdsSql(orderId) {
  const output = querySql(`
select id::text
from public.rolls
where production_order_id = ${sqlUuid(orderId)}
order by serial_number;
`);
  return output ? output.split("\n").filter(Boolean) : [];
}

function assignAgentCustody(rollId) {
  runSql(`
begin;
update public.roll_custody_current
set custodian_party_id = ${sqlUuid(agentParty.id)}, confirmed_at = now()
where roll_id = ${sqlUuid(rollId)};
insert into public.roll_custody_events (roll_id, custody_sequence, custodian_party_id, confirmed_at)
values (${sqlUuid(rollId)}, 2, ${sqlUuid(agentParty.id)}, now());
commit;
`);
}

// Two different requests racing for one physical Roll must have exactly one
// reservation winner. The loser receives the stable reservation conflict.
const collisionOrderId = await createOrder(1, "CUBE-F-COLLISION");
const [collisionRoll] = await orderRolls(collisionOrderId);
const collisionResults = await Promise.all([
  rpc("create_roll_transfer", {
    p_request_id: randomUUID(),
    p_recipient_transfer_code: agentParty.transfer_code,
    p_roll_ids: [collisionRoll.id],
  }, adminToken),
  rpc("create_roll_transfer", {
    p_request_id: randomUUID(),
    p_recipient_transfer_code: dealerParty.transfer_code,
    p_roll_ids: [collisionRoll.id],
  }, adminToken),
]);
const collisionSuccesses = collisionResults.filter((result) => result.response.ok);
const collisionFailures = collisionResults.filter((result) => !result.response.ok);
assert(collisionSuccesses.length === 1 && collisionFailures.length === 1,
  `Reservation race did not produce one winner: ${JSON.stringify(collisionResults.map((r) => ({ status: r.response.status, body: r.body })))}`);
assert(collisionFailures[0].body?.message === "PG_TRANSFER_ROLL_RESERVED",
  `Reservation race loser had wrong error: ${JSON.stringify(collisionFailures[0].body)}`);
assert(reservationCount(collisionRoll.id) === 1, "Reservation race produced an invalid reservation count.");
await rpc("cancel_roll_transfer", { p_transfer_id: collisionSuccesses[0].body }, adminToken);
assert(reservationCount(collisionRoll.id) === 0, "Collision cleanup did not release reservation.");

// Transfer creation and Production void lock the same Production Order. Exactly
// one can establish its state first; never permit voided + active reservation.
const voidRaceOrderId = await createOrder(1, "CUBE-F-VOID-RACE");
const [voidRaceRoll] = await orderRolls(voidRaceOrderId);
const [createRace, voidRace] = await Promise.all([
  rpc("create_roll_transfer", {
    p_request_id: randomUUID(),
    p_recipient_transfer_code: agentParty.transfer_code,
    p_roll_ids: [voidRaceRoll.id],
  }, adminToken),
  rpc("void_production_order", {
    p_order_id: voidRaceOrderId,
    p_reason: "Concurrent Cube F void race verification",
  }, adminToken),
]);
assert(Number(createRace.response.ok) + Number(voidRace.response.ok) === 1,
  `Create-vs-void race expected exactly one winner: create=${createRace.response.status} ${JSON.stringify(createRace.body)}, void=${voidRace.response.status} ${JSON.stringify(voidRace.body)}`);
const voidRaceStatus = querySql(`select status from public.production_orders where id = ${sqlUuid(voidRaceOrderId)};`);
const voidRaceReservations = reservationCount(voidRaceRoll.id);
assert(!(voidRaceStatus === "voided" && voidRaceReservations > 0),
  "Invalid state detected: voided Production Order has an active Transfer reservation.");
if (createRace.response.ok) {
  assert(voidRace.body?.message === "PG_TRANSFER_PRODUCTION_VOID_RESERVED",
    `Void race loser had wrong error: ${JSON.stringify(voidRace.body)}`);
  await rpc("cancel_roll_transfer", { p_transfer_id: createRace.body }, adminToken);
} else {
  assert(createRace.body?.message === "PG_TRANSFER_PRODUCTION_VOIDED",
    `Create race loser had wrong error: ${JSON.stringify(createRace.body)}`);
  assert(voidRaceStatus === "voided" && voidRaceReservations === 0, "Void race winner did not leave a valid voided state.");
}

// Lifecycle race: sender suspension and Transfer creation serialize on the same
// entity row. A committed Transfer may be followed by suspension, or creation
// may reject the now-suspended sender; a stale-active commit is not possible.
const lifecycleOrderId = await createOrder(2, "CUBE-F-LIFECYCLE-RACE");
const lifecycleRolls = await orderRolls(lifecycleOrderId);
assignAgentCustody(lifecycleRolls[0].id);
assignAgentCustody(lifecycleRolls[1].id);
const [lifecycleCreate, lifecycleSuspend] = await Promise.all([
  rpc("create_roll_transfer", {
    p_request_id: randomUUID(),
    p_recipient_transfer_code: dealerParty.transfer_code,
    p_roll_ids: [lifecycleRolls[0].id],
  }, agentToken),
  rest(`country_agents?id=eq.${agent.id}&select=id,status`, adminToken, {
    method: "PATCH",
    prefer: true,
    body: { status: "suspended" },
  }),
]);
assert(lifecycleSuspend.response.ok && lifecycleSuspend.body?.[0]?.status === "suspended",
  `Lifecycle suspension failed: ${JSON.stringify(lifecycleSuspend.body)}`);
if (lifecycleCreate.response.ok) {
  assert(reservationCount(lifecycleRolls[0].id) === 1,
    "Successful pre-suspension create lost its explicit pending reservation.");
  const recovery = await rpc("admin_cancel_pending_roll_transfer", {
    p_transfer_id: lifecycleCreate.body,
    p_reason: "Resolve lifecycle-race reservation after Agent suspension",
  }, adminToken);
  assert(recovery.response.ok, `Could not recover lifecycle-race Transfer: ${JSON.stringify(recovery.body)}`);
} else {
  assert(lifecycleCreate.body?.message === "PG_TRANSFER_ACTOR_INACTIVE",
    `Lifecycle create failed for an unexpected reason: ${JSON.stringify(lifecycleCreate.body)}`);
  assert(reservationCount(lifecycleRolls[0].id) === 0,
    "Rejected post-suspension create left a reservation behind.");
}

const reactivateForCancel = await rest(`country_agents?id=eq.${agent.id}&select=id,status`, adminToken, {
  method: "PATCH",
  prefer: true,
  body: { status: "active" },
});
assert(reactivateForCancel.response.ok && reactivateForCancel.body?.[0]?.status === "active", "Could not reactivate Agent for cancel race.");

const cancelRaceTransfer = await rpc("create_roll_transfer", {
  p_request_id: randomUUID(),
  p_recipient_transfer_code: dealerParty.transfer_code,
  p_roll_ids: [lifecycleRolls[1].id],
}, agentToken);
assert(cancelRaceTransfer.response.ok, `Could not create cancellation-race fixture: ${JSON.stringify(cancelRaceTransfer.body)}`);
const [cancelRace, suspendRace] = await Promise.all([
  rpc("cancel_roll_transfer", { p_transfer_id: cancelRaceTransfer.body }, agentToken),
  rest(`country_agents?id=eq.${agent.id}&select=id,status`, adminToken, {
    method: "PATCH",
    prefer: true,
    body: { status: "suspended" },
  }),
]);
assert(suspendRace.response.ok && suspendRace.body?.[0]?.status === "suspended", "Cancel-race suspension failed.");
if (cancelRace.response.ok) {
  assert(reservationCount(lifecycleRolls[1].id) === 0,
    "Successful serialized cancellation did not release reservation.");
} else {
  assert(cancelRace.body?.message === "PG_TRANSFER_ACTOR_INACTIVE",
    `Cancel race failed for unexpected reason: ${JSON.stringify(cancelRace.body)}`);
  assert(reservationCount(lifecycleRolls[1].id) === 1,
    "Failed cancellation silently released reservation.");
  const recovery = await rpc("admin_cancel_pending_roll_transfer", {
    p_transfer_id: cancelRaceTransfer.body,
    p_reason: "Resolve cancellation race after Agent suspension",
  }, adminToken);
  assert(recovery.response.ok, `Could not recover cancel-race Transfer: ${JSON.stringify(recovery.body)}`);
}

const reactivateAgent = await rest(`country_agents?id=eq.${agent.id}&select=id,status`, adminToken, {
  method: "PATCH",
  prefer: true,
  body: { status: "active" },
});
assert(reactivateAgent.response.ok && reactivateAgent.body?.[0]?.status === "active", "Could not restore Agent after lifecycle tests.");

// Approved scale boundary: one set-based Transfer may contain 10,000 Rolls.
// Fixture IDs are read directly from local Postgres so the verification itself
// is not capped by PostgREST max-row configuration. The Transfer RPC remains a
// real Data API call with the full 10,000-Roll payload.
const scaleOrderId = await createOrder(10000, "CUBE-F-SCALE-10000");
const scaleRollIds = orderRollIdsSql(scaleOrderId);
assert(scaleRollIds.length === 10000, `Scale fixture expected 10,000 Rolls, got ${scaleRollIds.length}.`);

const tooLarge = await rpc("create_roll_transfer", {
  p_request_id: randomUUID(),
  p_recipient_transfer_code: agentParty.transfer_code,
  p_roll_ids: [...scaleRollIds, randomUUID()],
}, adminToken);
assert(!tooLarge.response.ok && tooLarge.body?.message === "PG_TRANSFER_ROLL_COUNT_INVALID",
  `10,001 Roll boundary returned unexpected result: ${tooLarge.response.status} ${JSON.stringify(tooLarge.body)}`);

const scaleRequestId = randomUUID();
const scaleCreate = await rpc("create_roll_transfer", {
  p_request_id: scaleRequestId,
  p_recipient_transfer_code: agentParty.transfer_code,
  p_roll_ids: scaleRollIds,
}, adminToken);
assert(scaleCreate.response.ok && typeof scaleCreate.body === "string",
  `10,000 Roll Transfer failed: ${scaleCreate.response.status} ${JSON.stringify(scaleCreate.body)}`);
const scaleTransferId = scaleCreate.body;
const scaleCounts = querySql(`
select
  (select count(*) from public.roll_transfer_items where transfer_id = ${sqlUuid(scaleTransferId)}) || '|' ||
  (select count(*) from public.roll_transfer_reservations where transfer_id = ${sqlUuid(scaleTransferId)}) || '|' ||
  (select count(*) from public.roll_transfer_events where transfer_id = ${sqlUuid(scaleTransferId)});
`);
assert(scaleCounts === "10000|10000|1", `10,000 Roll Transfer persisted incorrect counts: ${scaleCounts}`);

const scaleRetry = await rpc("create_roll_transfer", {
  p_request_id: scaleRequestId,
  p_recipient_transfer_code: agentParty.transfer_code,
  p_roll_ids: [...scaleRollIds].reverse(),
}, adminToken);
assert(scaleRetry.response.ok && scaleRetry.body === scaleTransferId,
  `10,000 Roll matching retry failed: ${scaleRetry.response.status} ${JSON.stringify(scaleRetry.body)}`);
const scaleRetryCounts = querySql(`
select
  (select count(*) from public.roll_transfer_items where transfer_id = ${sqlUuid(scaleTransferId)}) || '|' ||
  (select count(*) from public.roll_transfer_reservations where transfer_id = ${sqlUuid(scaleTransferId)}) || '|' ||
  (select count(*) from public.roll_transfer_events where transfer_id = ${sqlUuid(scaleTransferId)});
`);
assert(scaleRetryCounts === "10000|10000|1", `10,000 Roll retry duplicated state: ${scaleRetryCounts}`);

const scaleCancel = await rpc("cancel_roll_transfer", { p_transfer_id: scaleTransferId }, adminToken);
assert(scaleCancel.response.ok, `Could not cancel 10,000 Roll Transfer: ${JSON.stringify(scaleCancel.body)}`);
assert(Number(querySql(`select count(*) from public.roll_transfer_reservations where transfer_id = ${sqlUuid(scaleTransferId)};`)) === 0,
  "10,000 Roll cancellation did not release every reservation.");
assert(Number(querySql(`
select count(*)
from public.roll_custody_current rc
join public.rolls r on r.id = rc.roll_id
where r.production_order_id = ${sqlUuid(scaleOrderId)}
  and rc.custodian_party_id = ${sqlUuid(companyParty.id)};
`)) === 10000, "10,000 Roll Transfer path changed confirmed custody.");

console.log("Cube F Roll Transfer concurrency and 10,000-Roll scale verification passed.");
