import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const apiUrl = process.env.API_URL;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
const anonKey = process.env.ANON_KEY;

if (!apiUrl || !serviceRoleKey || !anonKey) {
  throw new Error("Local Supabase API_URL, SERVICE_ROLE_KEY and ANON_KEY are required.");
}

const password = "Transfer-Send-Cube-G-2026!";

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

async function expectRpcError(name, body, token, expectedMessage, key = anonKey) {
  const result = await rpc(name, body, token, key);
  assert(!result.response.ok, `${name} unexpectedly succeeded for ${expectedMessage}.`);
  assert(result.body?.message === expectedMessage,
    `${name} expected ${expectedMessage}, received ${result.response.status} ${JSON.stringify(result.body)}`);
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
      user_metadata: { display_name: `Cube G ${role}` },
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
    `Could not sign in ${email}: ${JSON.stringify(result.body)}`);
  return result.body.access_token;
}

function dbContainerName() {
  const names = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" })
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
  const name = names.find((value) => value.startsWith("supabase_db_"));
  assert(name, "Supabase database container was not found for Cube G fixtures.");
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
  assert(/^[0-9a-f-]{36}$/i.test(value), `Unsafe UUID fixture value: ${value}`);
  return `'${value}'::uuid`;
}

const emails = {
  admin: "cube-g-admin@example.test",
  agent: "cube-g-agent@example.test",
  dealer: "cube-g-dealer@example.test",
  center: "cube-g-center@example.test",
};

await createUser({ email: emails.admin, role: "admin" });
const adminToken = await signIn(emails.admin);

const agent = one(await rest("country_agents?select=id,code,status", adminToken, {
  method: "POST",
  prefer: true,
  body: {
    code: "CUBE-G-AGENT-EG",
    name: "Cube G Agent",
    country_code: "EG",
  },
}), "Create Cube G Agent");
await createUser({ email: emails.agent, role: "agent", countryAgentId: agent.id });
const agentToken = await signIn(emails.agent);

const dealer = one(await rest("dealers?select=id,code,status,country_agent_id", adminToken, {
  method: "POST",
  prefer: true,
  body: {
    code: "CUBE-G-DEALER",
    name: "Cube G Dealer",
    country_code: "EG",
    country_agent_id: agent.id,
  },
}), "Create Cube G Dealer");
await createUser({ email: emails.dealer, role: "dealer", dealerId: dealer.id });
const dealerToken = await signIn(emails.dealer);

const center = one(await rest("installation_centers?select=id,code,status,dealer_id", adminToken, {
  method: "POST",
  prefer: true,
  body: {
    code: "CUBE-G-CENTER",
    name: "Cube G Center",
    country_code: "EG",
    city: "Cairo",
    dealer_id: dealer.id,
  },
}), "Create Cube G Center");
await createUser({ email: emails.center, role: "center", centerId: center.id });
const centerToken = await signIn(emails.center);

const companyParty = one(await rest("operational_parties?party_type=eq.company&select=id,transfer_code", adminToken), "Company party");
const dealerParty = one(await rest(`operational_parties?dealer_id=eq.${dealer.id}&select=id,transfer_code`, adminToken), "Dealer party");
const centerParty = one(await rest(`operational_parties?installation_center_id=eq.${center.id}&select=id,transfer_code`, adminToken), "Center party");

const product = one(await rest("products?select=id,code,name,status", adminToken, {
  method: "POST",
  prefer: true,
  body: {
    code: "PG-CUBE-G-PPF",
    name: "Cube G Transfer PPF",
    slug: "cube-g-transfer-ppf",
    product_type: "PPF",
    category: "Paint Protection Film",
    version_name: "G1",
    width_mm: 1524,
    length_m: 15,
    thickness_mil: 7.5,
    weight_kg: 12.5,
    origin_country: "USA",
    default_warranty_months: 120,
    marketing_description: "Cube G sender inventory fixture.",
    technical_description: "Cube G sender inventory fixture.",
    features: ["Cube G"],
    warranty_coverage: "Test coverage.",
    care_instructions: "Test care.",
    publication_status: "draft",
  },
}), "Create Cube G Product");

const orderCreate = await rpc("create_production_order", {
  p_request_id: randomUUID(),
  p_product_id: product.id,
  p_production_date: "2026-08-14",
  p_lots: [{ quantity: 6, source_reference: "CUBE-G-LOT" }],
  p_source_reference: "CUBE-G-ORDER",
  p_notes: "Cube G sender read contracts",
}, adminToken);
assert(orderCreate.response.ok && typeof orderCreate.body === "string",
  `Could not create Cube G production order: ${JSON.stringify(orderCreate.body)}`);
const orderId = orderCreate.body;

const lotsResult = await rest(`production_lots?production_order_id=eq.${orderId}&select=id,lot_number,roll_count`, adminToken);
assert(lotsResult.response.ok && lotsResult.body.length === 1, `Expected one Cube G Lot: ${JSON.stringify(lotsResult.body)}`);
const lot = lotsResult.body[0];

const rollsResult = await rest(`rolls?production_order_id=eq.${orderId}&select=id,serial_number,erp_serial,roll_index&order=roll_index.asc`, adminToken);
assert(rollsResult.response.ok && rollsResult.body.length === 6, `Expected six Cube G Rolls: ${JSON.stringify(rollsResult.body)}`);
const rolls = rollsResult.body;

runSql(`
begin;
${rolls.slice(0, 4).map((roll) => `
update public.roll_custody_current
set custodian_party_id = ${sqlUuid(dealerParty.id)}, confirmed_at = now()
where roll_id = ${sqlUuid(roll.id)};
insert into public.roll_custody_events (roll_id, custody_sequence, custodian_party_id, confirmed_at)
values (${sqlUuid(roll.id)}, 2, ${sqlUuid(dealerParty.id)}, now());`).join("\n")}
update public.roll_custody_current
set custodian_party_id = ${sqlUuid(centerParty.id)}, confirmed_at = now()
where roll_id = ${sqlUuid(rolls[4].id)};
insert into public.roll_custody_events (roll_id, custody_sequence, custodian_party_id, confirmed_at)
values (${sqlUuid(rolls[4].id)}, 2, ${sqlUuid(centerParty.id)}, now());
commit;
`);

const reservedTransfer = await rpc("create_roll_transfer", {
  p_request_id: randomUUID(),
  p_recipient_transfer_code: centerParty.transfer_code,
  p_roll_ids: [rolls[3].id],
}, dealerToken);
assert(reservedTransfer.response.ok && typeof reservedTransfer.body === "string",
  `Could not reserve Cube G Roll through Cube F: ${JSON.stringify(reservedTransfer.body)}`);

const dealerRolls = await rpc("list_transfer_send_rolls", {
  p_search: null,
  p_lot_id: lot.id,
  p_limit: 50,
  p_offset: 0,
}, dealerToken);
assert(dealerRolls.response.ok && dealerRolls.body.length === 4,
  `Dealer sender list should contain four held Rolls: ${JSON.stringify(dealerRolls.body)}`);
assert(dealerRolls.body.filter((row) => row.availability === "reserved").length === 1,
  `Dealer sender list should expose exactly one reserved Roll: ${JSON.stringify(dealerRolls.body)}`);
assert(dealerRolls.body.every((row) => row.product_code === "PG-CUBE-G-PPF" && row.lot_number === lot.lot_number),
  "Sender Roll rows lost Product/Lot identification snapshots.");

const exactReserved = await rpc("list_transfer_send_rolls", {
  p_search: rolls[3].serial_number,
  p_lot_id: null,
  p_limit: 10,
  p_offset: 0,
}, dealerToken);
assert(exactReserved.response.ok && exactReserved.body.length === 1 && exactReserved.body[0].availability === "reserved",
  `Exact sender lookup did not return reserved status: ${JSON.stringify(exactReserved.body)}`);

const hiddenOtherHolder = await rpc("list_transfer_send_rolls", {
  p_search: rolls[4].serial_number,
  p_lot_id: null,
  p_limit: 10,
  p_offset: 0,
}, dealerToken);
assert(hiddenOtherHolder.response.ok && hiddenOtherHolder.body.length === 0,
  `Sender read leaked a Roll held elsewhere: ${JSON.stringify(hiddenOtherHolder.body)}`);

const dealerLots = await rpc("list_transfer_send_lots", {
  p_search: lot.lot_number,
  p_limit: 20,
  p_offset: 0,
}, dealerToken);
assert(dealerLots.response.ok && dealerLots.body.length === 1,
  `Dealer Lot summary missing: ${JSON.stringify(dealerLots.body)}`);
const dealerLot = dealerLots.body[0];
assert(
  dealerLot.total_count === 6
    && dealerLot.held_count === 4
    && dealerLot.available_count === 3
    && dealerLot.reserved_count === 1
    && dealerLot.elsewhere_count === 2,
  `Dealer Lot arithmetic is incorrect: ${JSON.stringify(dealerLot)}`,
);
assert(!Object.keys(dealerLot).some((key) => /custodian|recipient|transfer/i.test(key)),
  `Lot summary exposes forbidden holder/Transfer identity: ${JSON.stringify(dealerLot)}`);

const expanded = await rpc("expand_transfer_send_lot", { p_lot_id: lot.id }, dealerToken);
assert(expanded.response.ok && expanded.body.length === 1,
  `Lot expansion failed: ${JSON.stringify(expanded.body)}`);
const expansion = expanded.body[0];
assert(expansion.available_count === 3 && expansion.available_roll_ids.length === 3,
  `Lot expansion count mismatch: ${JSON.stringify(expansion)}`);
assert(!expansion.available_roll_ids.includes(rolls[3].id), "Reserved Roll leaked into available Lot expansion.");
assert(expansion.available_roll_ids.every((rollId) => rolls.slice(0, 3).some((roll) => roll.id === rollId)),
  `Lot expansion returned a Roll outside sender availability: ${JSON.stringify(expansion.available_roll_ids)}`);

const centerLots = await rpc("list_transfer_send_lots", {
  p_search: lot.lot_number,
  p_limit: 20,
  p_offset: 0,
}, centerToken);
assert(centerLots.response.ok && centerLots.body.length === 1,
  `Center Lot summary missing: ${JSON.stringify(centerLots.body)}`);
assert(centerLots.body[0].held_count === 1 && centerLots.body[0].available_count === 1 && centerLots.body[0].elsewhere_count === 5,
  `Center Lot scope is incorrect: ${JSON.stringify(centerLots.body[0])}`);

const companyLots = await rpc("list_transfer_send_lots", {
  p_search: lot.lot_number,
  p_limit: 20,
  p_offset: 0,
}, adminToken);
assert(companyLots.response.ok && companyLots.body.length === 1,
  `Company Lot summary missing: ${JSON.stringify(companyLots.body)}`);
assert(companyLots.body[0].held_count === 1 && companyLots.body[0].available_count === 1 && companyLots.body[0].elsewhere_count === 5,
  `Admin must act as Company rather than browse all sender inventory: ${JSON.stringify(companyLots.body[0])}`);

await expectRpcError(
  "list_transfer_send_rolls",
  { p_search: "BAD%SEARCH", p_lot_id: null, p_limit: 20, p_offset: 0 },
  dealerToken,
  "PG_TRANSFER_SEND_SEARCH_INVALID",
);
await expectRpcError(
  "list_transfer_send_lots",
  { p_search: null, p_limit: 101, p_offset: 0 },
  dealerToken,
  "PG_TRANSFER_SEND_LIMIT_INVALID",
);
await expectRpcError(
  "list_transfer_send_rolls",
  { p_search: null, p_lot_id: null, p_limit: 20, p_offset: -1 },
  dealerToken,
  "PG_TRANSFER_SEND_OFFSET_INVALID",
);

const serviceRoleRead = await rpc(
  "list_transfer_send_rolls",
  { p_search: null, p_lot_id: null, p_limit: 20, p_offset: 0 },
  serviceRoleKey,
  serviceRoleKey,
);
assert(!serviceRoleRead.response.ok,
  `service_role unexpectedly gained Cube G sender inventory RPC access: ${JSON.stringify(serviceRoleRead.body)}`);

const suspended = await rest(`dealers?id=eq.${dealer.id}&select=id,status`, adminToken, {
  method: "PATCH",
  prefer: true,
  body: { status: "suspended" },
});
assert(suspended.response.ok && suspended.body[0]?.status === "suspended",
  `Could not suspend Cube G Dealer fixture: ${JSON.stringify(suspended.body)}`);
await expectRpcError(
  "list_transfer_send_rolls",
  { p_search: null, p_lot_id: null, p_limit: 20, p_offset: 0 },
  dealerToken,
  "PG_TRANSFER_ACTOR_INACTIVE",
);

const reactivated = await rest(`dealers?id=eq.${dealer.id}&select=id,status`, adminToken, {
  method: "PATCH",
  prefer: true,
  body: { status: "active" },
});
assert(reactivated.response.ok && reactivated.body[0]?.status === "active",
  `Could not reactivate Cube G Dealer fixture: ${JSON.stringify(reactivated.body)}`);

const voidOrderCreate = await rpc("create_production_order", {
  p_request_id: randomUUID(),
  p_product_id: product.id,
  p_production_date: "2026-08-14",
  p_lots: [{ quantity: 1 }],
  p_source_reference: "CUBE-G-VOID",
  p_notes: "Cube G void exclusion",
}, adminToken);
assert(voidOrderCreate.response.ok && typeof voidOrderCreate.body === "string",
  `Could not create void exclusion order: ${JSON.stringify(voidOrderCreate.body)}`);
const voidOrderId = voidOrderCreate.body;

const voidLot = one(await rest(`production_lots?production_order_id=eq.${voidOrderId}&select=id,lot_number`, adminToken), "Void exclusion Lot");
const beforeVoid = await rpc("list_transfer_send_lots", { p_search: voidLot.lot_number, p_limit: 20, p_offset: 0 }, adminToken);
assert(beforeVoid.response.ok && beforeVoid.body.length === 1,
  `Generated Company Lot should be transfer-send visible: ${JSON.stringify(beforeVoid.body)}`);

const voided = await rpc("void_production_order", {
  p_order_id: voidOrderId,
  p_reason: "Cube G downstream eligibility check",
}, adminToken);
assert(voided.response.ok && voided.body === voidOrderId,
  `Could not void Cube G exclusion order: ${JSON.stringify(voided.body)}`);

const afterVoid = await rpc("list_transfer_send_lots", { p_search: voidLot.lot_number, p_limit: 20, p_offset: 0 }, adminToken);
assert(afterVoid.response.ok && afterVoid.body.length === 0,
  `Voided Production Order remained visible in sender Lot inventory: ${JSON.stringify(afterVoid.body)}`);

const agentInventory = await rpc("list_transfer_send_rolls", {
  p_search: null,
  p_lot_id: lot.id,
  p_limit: 20,
  p_offset: 0,
}, agentToken);
assert(agentInventory.response.ok && agentInventory.body.length === 0,
  `Agent sender read leaked descendant custody instead of own custody: ${JSON.stringify(agentInventory.body)}`);

console.log("Cube G sender inventory read contracts verified.");
