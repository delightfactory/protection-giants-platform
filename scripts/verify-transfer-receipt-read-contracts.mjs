import { randomUUID } from "node:crypto";

const apiUrl = process.env.API_URL;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
const anonKey = process.env.ANON_KEY;

if (!apiUrl || !serviceRoleKey || !anonKey) {
  throw new Error("Local Supabase API_URL, SERVICE_ROLE_KEY and ANON_KEY are required.");
}

const password = "Transfer-Read-Cube-H-2026!";

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
      user_metadata: { display_name: `Cube H Read ${role}` },
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

async function createTransfer(senderToken, recipientTransferCode, rollIds) {
  const result = await rpc("create_roll_transfer", {
    p_request_id: randomUUID(),
    p_recipient_transfer_code: recipientTransferCode,
    p_roll_ids: rollIds,
  }, senderToken);
  assert(result.response.ok && typeof result.body === "string",
    `Could not create Transfer: ${JSON.stringify(result.body)}`);
  return result.body;
}

const emails = {
  admin: "cube-h-read-admin@example.test",
  agent: "cube-h-read-agent@example.test",
  dealer: "cube-h-read-dealer@example.test",
  center: "cube-h-read-center@example.test",
  outsider: "cube-h-read-outsider@example.test",
};

await createUser({ email: emails.admin, role: "admin" });
const adminToken = await signIn(emails.admin);

const agent = one(await rest("country_agents?select=id,code,status", adminToken, {
  method: "POST",
  prefer: true,
  body: { code: "CUBE-H-READ-AG", name: "Cube H Read Agent", country_code: "EG" },
}), "Create read Agent");
await createUser({ email: emails.agent, role: "agent", countryAgentId: agent.id });
const agentToken = await signIn(emails.agent);

const dealer = one(await rest("dealers?select=id,code,status,country_agent_id", adminToken, {
  method: "POST",
  prefer: true,
  body: {
    code: "CUBE-H-READ-DL",
    name: "Cube H Read Dealer",
    country_code: "EG",
    country_agent_id: agent.id,
  },
}), "Create read Dealer");
await createUser({ email: emails.dealer, role: "dealer", dealerId: dealer.id });

const center = one(await rest("installation_centers?select=id,code,status,dealer_id", adminToken, {
  method: "POST",
  prefer: true,
  body: {
    code: "CUBE-H-READ-CT",
    name: "Cube H Read Center",
    country_code: "EG",
    city: "Cairo",
    dealer_id: dealer.id,
  },
}), "Create read Center");
await createUser({ email: emails.center, role: "center", centerId: center.id });
const centerToken = await signIn(emails.center);

const outsiderAgent = one(await rest("country_agents?select=id,code,status", adminToken, {
  method: "POST",
  prefer: true,
  body: { code: "CUBE-H-READ-OUT", name: "Outside Agent", country_code: "SA" },
}), "Create outside Agent");
await createUser({ email: emails.outsider, role: "agent", countryAgentId: outsiderAgent.id });
const outsiderToken = await signIn(emails.outsider);

const centerParty = one(await rest(`operational_parties?installation_center_id=eq.${center.id}&select=id,transfer_code`, adminToken), "Center party");

const product = one(await rest("products?select=id,code,name,status", adminToken, {
  method: "POST",
  prefer: true,
  body: {
    code: "PG-CUBE-H-READ",
    name: "Cube H Read Product",
    slug: "cube-h-read-product",
    product_type: "PPF",
    category: "Paint Protection Film",
    version_name: "H-READ",
    width_mm: 1524,
    length_m: 15,
    thickness_mil: 7.5,
    weight_kg: 12.5,
    origin_country: "USA",
    default_warranty_months: 120,
    marketing_description: "Read projection fixture.",
    technical_description: "Read projection fixture.",
    features: ["Cube H Read"],
    warranty_coverage: "Test coverage.",
    care_instructions: "Test care.",
    publication_status: "draft",
  },
}), "Create read Product");

const order = await rpc("create_production_order", {
  p_request_id: randomUUID(),
  p_product_id: product.id,
  p_production_date: "2026-08-15",
  p_lots: [{ quantity: 5, source_reference: "CUBE-H-READ-LOT" }],
  p_source_reference: "CUBE-H-READ-ORDER",
  p_notes: "Cube H read projections",
}, adminToken);
assert(order.response.ok && typeof order.body === "string", `Production fixture failed: ${JSON.stringify(order.body)}`);
const orderId = order.body;

const lot = one(await rest(`production_lots?production_order_id=eq.${orderId}&select=id,lot_number,roll_count`, adminToken), "Read Lot");
const rollsResult = await rest(`rolls?production_order_id=eq.${orderId}&select=id,serial_number,erp_serial,roll_index&order=roll_index.asc`, adminToken);
assert(rollsResult.response.ok && rollsResult.body.length === 5, "Expected five read fixture Rolls.");
const rolls = rollsResult.body;

const transfer = await createTransfer(adminToken, centerParty.transfer_code, rolls.slice(0, 3).map((roll) => roll.id));
await rpc("receive_roll_transfer_items", {
  p_request_id: randomUUID(),
  p_transfer_id: transfer,
  p_roll_ids: [rolls[0].id],
}, centerToken);

const incoming = await rpc("list_roll_transfers", {
  p_direction: "incoming",
  p_scope: "active",
  p_search: null,
  p_limit: 30,
  p_offset: 0,
}, centerToken);
assert(incoming.response.ok && incoming.body.some((row) => row.transfer_id === transfer),
  `Incoming active Transfer missing: ${JSON.stringify(incoming.body)}`);
const incomingRow = incoming.body.find((row) => row.transfer_id === transfer);
assert(
  incomingRow.status === "partially_received"
    && incomingRow.roll_count === 3
    && incomingRow.received_count === 1
    && incomingRow.pending_count === 2
    && incomingRow.released_to_sender_count === 0
    && incomingRow.needs_action === true,
  `Incoming summary counts/action are wrong: ${JSON.stringify(incomingRow)}`,
);
assert(incomingRow.sender_name === "Protection Giants" && incomingRow.recipient_name === "Cube H Read Center",
  `Minimal party identities are wrong: ${JSON.stringify(incomingRow)}`);

const outgoingCompany = await rpc("list_roll_transfers", {
  p_direction: "outgoing",
  p_scope: "active",
  p_search: null,
  p_limit: 30,
  p_offset: 0,
}, adminToken);
assert(outgoingCompany.response.ok && outgoingCompany.body.some((row) => row.transfer_id === transfer),
  `Company outgoing view missing Transfer: ${JSON.stringify(outgoingCompany.body)}`);
assert(outgoingCompany.body.find((row) => row.transfer_id === transfer).needs_action === true,
  "Partially received outgoing Transfer should require sender attention.");

const outsiderIncoming = await rpc("list_roll_transfers", {
  p_direction: "incoming",
  p_scope: "all",
  p_search: null,
  p_limit: 30,
  p_offset: 0,
}, outsiderToken);
assert(outsiderIncoming.response.ok && outsiderIncoming.body.every((row) => row.transfer_id !== transfer),
  `Unrelated party could browse Transfer list: ${JSON.stringify(outsiderIncoming.body)}`);

const adminAll = await rpc("list_roll_transfers", {
  p_direction: "all",
  p_scope: "active",
  p_search: incomingRow.transfer_number,
  p_limit: 30,
  p_offset: 0,
}, adminToken);
assert(adminAll.response.ok && adminAll.body.length === 1 && adminAll.body[0].transfer_id === transfer,
  `Admin exact-number audit search failed: ${JSON.stringify(adminAll.body)}`);

await expectRpcError(
  "list_roll_transfers",
  { p_direction: "all", p_scope: "all", p_search: null, p_limit: 30, p_offset: 0 },
  centerToken,
  "PG_TRANSFER_LIST_DIRECTION_INVALID",
);
await expectRpcError(
  "list_roll_transfers",
  { p_direction: "incoming", p_scope: "all", p_search: "PG-T-BAD", p_limit: 30, p_offset: 0 },
  centerToken,
  "PG_TRANSFER_LIST_SEARCH_INVALID",
);
await expectRpcError(
  "list_roll_transfers",
  { p_direction: "incoming", p_scope: "all", p_search: null, p_limit: 101, p_offset: 0 },
  centerToken,
  "PG_TRANSFER_LIST_LIMIT_INVALID",
);

const detailRecipient = one(await rpc("get_roll_transfer_detail", { p_transfer_id: transfer }, centerToken), "Recipient detail");
assert(detailRecipient.viewer_is_recipient === true && detailRecipient.viewer_is_sender === false,
  `Recipient relationship flags are wrong: ${JSON.stringify(detailRecipient)}`);
assert(detailRecipient.can_receive === true && detailRecipient.can_reject === false && detailRecipient.can_cancel === false,
  `Recipient action flags are wrong after partial receipt: ${JSON.stringify(detailRecipient)}`);
assert(detailRecipient.received_count === 1 && detailRecipient.pending_count === 2,
  `Detail counts are wrong: ${JSON.stringify(detailRecipient)}`);
assert(Array.isArray(detailRecipient.lot_groups) && detailRecipient.lot_groups.length === 1,
  `Lot summary missing from detail: ${JSON.stringify(detailRecipient.lot_groups)}`);
const detailLot = detailRecipient.lot_groups[0];
assert(
  detailLot.production_lot_total === 5
    && detailLot.transfer_count === 3
    && detailLot.received_count === 1
    && detailLot.pending_count === 2
    && detailLot.transfer_contains_full_lot === false,
  `Detail Lot arithmetic is wrong: ${JSON.stringify(detailLot)}`,
);
assert(Array.isArray(detailRecipient.timeline)
  && detailRecipient.timeline.some((event) => event.event_type === "created")
  && detailRecipient.timeline.some((event) => event.event_type === "received"),
  `Timeline missing immutable events: ${JSON.stringify(detailRecipient.timeline)}`);
assert(detailRecipient.timeline.every((event) => event.reason === null),
  "Ordinary recipient timeline leaked support reasons.");

const detailSender = one(await rpc("get_roll_transfer_detail", { p_transfer_id: transfer }, adminToken), "Sender/Admin detail");
assert(detailSender.viewer_is_sender === true && detailSender.viewer_is_admin === true,
  `Admin-as-Company sender relationship is wrong: ${JSON.stringify(detailSender)}`);
assert(detailSender.can_resolve_unreceived === true && detailSender.can_admin_resolve_unreceived === true,
  `Sender/Admin resolution availability is wrong: ${JSON.stringify(detailSender)}`);

const hiddenDetail = await rpc("get_roll_transfer_detail", { p_transfer_id: transfer }, outsiderToken);
assert(hiddenDetail.response.ok && Array.isArray(hiddenDetail.body) && hiddenDetail.body.length === 0,
  `Unrelated party could read Transfer detail: ${JSON.stringify(hiddenDetail.body)}`);

const items = await rpc("list_roll_transfer_items", {
  p_transfer_id: transfer,
  p_search: null,
  p_status: null,
  p_limit: 50,
  p_offset: 0,
}, centerToken);
assert(items.response.ok && items.body.length === 3,
  `Recipient item list should contain exactly Transfer membership: ${JSON.stringify(items.body)}`);
assert(items.body.filter((row) => row.item_status === "received").length === 1
  && items.body.filter((row) => row.item_status === "pending").length === 2,
  `Item list receipt states are wrong: ${JSON.stringify(items.body)}`);
assert(items.body.every((row) => row.product_code === "PG-CUBE-H-READ" && row.lot_number === lot.lot_number),
  "Item list lost Product/Lot identity.");

const exactItem = await rpc("list_roll_transfer_items", {
  p_transfer_id: transfer,
  p_search: rolls[1].serial_number,
  p_status: "pending",
  p_limit: 10,
  p_offset: 0,
}, centerToken);
assert(exactItem.response.ok && exactItem.body.length === 1 && exactItem.body[0].roll_id === rolls[1].id,
  `Exact pending serial lookup failed: ${JSON.stringify(exactItem.body)}`);

const lotExpansion = one(await rpc("expand_roll_transfer_receipt_lot", {
  p_transfer_id: transfer,
  p_lot_id: lot.id,
}, centerToken), "Receipt Lot expansion");
assert(
  lotExpansion.production_lot_total === 5
    && lotExpansion.transfer_count === 3
    && lotExpansion.received_count === 1
    && lotExpansion.pending_count === 2
    && lotExpansion.transfer_contains_full_lot === false
    && lotExpansion.pending_roll_ids.length === 2
    && lotExpansion.pending_roll_ids.includes(rolls[1].id)
    && lotExpansion.pending_roll_ids.includes(rolls[2].id),
  `Receipt Lot expansion is dishonest/incomplete: ${JSON.stringify(lotExpansion)}`,
);

const senderLotExpansion = await rpc("expand_roll_transfer_receipt_lot", {
  p_transfer_id: transfer,
  p_lot_id: lot.id,
}, adminToken);
assert(senderLotExpansion.response.ok && senderLotExpansion.body.length === 0,
  `Sender/Admin audit context unexpectedly gained recipient Lot expansion: ${JSON.stringify(senderLotExpansion.body)}`);

// Historical closed items report zero pending and remain non-actionable.
const rejectedTransfer = await createTransfer(adminToken, centerParty.transfer_code, [rolls[3].id]);
await rpc("reject_roll_transfer", { p_transfer_id: rejectedTransfer }, centerToken);
const history = await rpc("list_roll_transfers", {
  p_direction: "incoming",
  p_scope: "history",
  p_search: null,
  p_limit: 30,
  p_offset: 0,
}, centerToken);
assert(history.response.ok && history.body.some((row) => row.transfer_id === rejectedTransfer),
  `Rejected Transfer missing from history: ${JSON.stringify(history.body)}`);
const rejectedRow = history.body.find((row) => row.transfer_id === rejectedTransfer);
assert(rejectedRow.status === "rejected" && rejectedRow.pending_count === 0
  && rejectedRow.closed_unreceived_count === 1 && rejectedRow.needs_action === false,
  `Rejected history counts are misleading: ${JSON.stringify(rejectedRow)}`);

const outsiderDirectStates = await rest(
  `roll_transfer_item_states?transfer_id=eq.${transfer}&select=roll_id,status`,
  outsiderToken,
);
assert(outsiderDirectStates.response.ok && outsiderDirectStates.body.length === 0,
  `Direct item-state RLS leaked Transfer state: ${JSON.stringify(outsiderDirectStates.body)}`);

const serviceList = await rpc(
  "list_roll_transfers",
  { p_direction: "all", p_scope: "all", p_search: null, p_limit: 30, p_offset: 0 },
  serviceRoleKey,
  serviceRoleKey,
);
assert(!serviceList.response.ok,
  `service_role unexpectedly gained Cube H read RPC access: ${JSON.stringify(serviceList.body)}`);

console.log("Cube H Transfer read/privacy contracts verified.");
