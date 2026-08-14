import { randomUUID } from "node:crypto";

const apiUrl = process.env.API_URL;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
const anonKey = process.env.ANON_KEY;
if (!apiUrl || !serviceRoleKey || !anonKey) throw new Error("Local Supabase environment is required.");

const password = "Cube-H-Recovery-Reads-2026!";
function assert(condition, message) { if (!condition) throw new Error(message); }
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
  const response = await fetch(`${apiUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { response, body: await readJson(response) };
}
async function rest(path, token, options = {}) { return request(`/rest/v1/${path}`, { ...options, token }); }
async function rpc(name, body, token, key = anonKey) { return request(`/rest/v1/rpc/${name}`, { method: "POST", body, token, key }); }
function one(result, label) {
  assert(result.response.ok && Array.isArray(result.body) && result.body.length === 1,
    `${label}: ${result.response.status} ${JSON.stringify(result.body)}`);
  return result.body[0];
}
async function createUser(email, role, centerId = null, agentId = null) {
  const result = await request("/auth/v1/admin/users", {
    method: "POST", key: serviceRoleKey, token: serviceRoleKey,
    body: {
      email, password, email_confirm: true,
      app_metadata: { pg_provisioning: {
        version: "operational-v1", role,
        country_agent_id: agentId, dealer_id: null, installation_center_id: centerId,
      } },
      user_metadata: { display_name: `Cube H recovery ${role}` },
    },
  });
  assert(result.response.ok, `Could not create ${role}: ${JSON.stringify(result.body)}`);
}
async function signIn(email) {
  const result = await request("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } });
  assert(result.response.ok && result.body?.access_token, `Sign-in failed: ${JSON.stringify(result.body)}`);
  return result.body.access_token;
}

await createUser("cube-h-recovery-admin@example.test", "admin");
const adminToken = await signIn("cube-h-recovery-admin@example.test");

const center = one(await rest("installation_centers?select=id,code,status", adminToken, {
  method: "POST", prefer: true,
  body: {
    code: "CUBE-H-RECOVERY-CENTER",
    name: "Cube H Recovery Center",
    country_code: "EG",
    city: "Cairo",
    dealer_id: null,
    country_agent_id: null,
  },
}), "Create recovery Center");
await createUser("cube-h-recovery-center@example.test", "center", center.id);
const centerToken = await signIn("cube-h-recovery-center@example.test");
const centerParty = one(await rest(`operational_parties?installation_center_id=eq.${center.id}&select=id,transfer_code`, adminToken), "Center party");

const outsiderAgent = one(await rest("country_agents?select=id", adminToken, {
  method: "POST", prefer: true,
  body: { code: "CUBE-H-RECOVERY-OUT", name: "Cube H Recovery Outsider", country_code: "SA" },
}), "Create outsider Agent");
await createUser("cube-h-recovery-out@example.test", "agent", null, outsiderAgent.id);
const outsiderToken = await signIn("cube-h-recovery-out@example.test");

const product = one(await rest("products?select=id", adminToken, {
  method: "POST", prefer: true,
  body: {
    code: "PG-CUBE-H-RECOVERY", name: "Cube H Recovery PPF", slug: "cube-h-recovery-ppf",
    product_type: "PPF", category: "Paint Protection Film", version_name: "RECOVERY",
    width_mm: 1524, length_m: 15, thickness_mil: 7.5, weight_kg: 12.5,
    origin_country: "USA", default_warranty_months: 120,
    marketing_description: "Recovery fixture.", technical_description: "Recovery fixture.",
    features: ["Recovery"], warranty_coverage: "Test coverage.", care_instructions: "Test care.",
    publication_status: "draft",
  },
}), "Create recovery Product");

const production = await rpc("create_production_order", {
  p_request_id: randomUUID(), p_product_id: product.id, p_production_date: "2026-08-15",
  p_lots: [{ quantity: 4, source_reference: "CUBE-H-RECOVERY-LOT" }],
  p_source_reference: "CUBE-H-RECOVERY-ORDER", p_notes: "Recovery read contracts",
}, adminToken);
assert(production.response.ok && typeof production.body === "string", `Production failed: ${JSON.stringify(production.body)}`);
const orderId = production.body;
const lot = one(await rest(`production_lots?production_order_id=eq.${orderId}&select=id,lot_number,roll_count`, adminToken), "Recovery Lot");
const rollsResult = await rest(`rolls?production_order_id=eq.${orderId}&select=id,serial_number&order=roll_index.asc`, adminToken);
assert(rollsResult.response.ok && rollsResult.body.length === 4, "Expected four recovery Rolls.");
const rolls = rollsResult.body;

const created = await rpc("create_roll_transfer", {
  p_request_id: randomUUID(),
  p_recipient_transfer_code: centerParty.transfer_code,
  p_roll_ids: rolls.slice(0, 3).map((roll) => roll.id),
}, adminToken);
assert(created.response.ok && typeof created.body === "string", `Transfer failed: ${JSON.stringify(created.body)}`);
const transferId = created.body;

const centerCountsBefore = one(await rpc("get_roll_transfer_attention_counts", {}, centerToken), "Center attention before receipt");
assert(Number(centerCountsBefore.incoming_action_count) === 1 && Number(centerCountsBefore.outgoing_action_count) === 0,
  `Center attention counts wrong before receipt: ${JSON.stringify(centerCountsBefore)}`);
const companyCountsBefore = one(await rpc("get_roll_transfer_attention_counts", {}, adminToken), "Company attention before receipt");
assert(Number(companyCountsBefore.incoming_action_count) === 0 && Number(companyCountsBefore.outgoing_action_count) === 0,
  `Company pending send should not be marked unresolved: ${JSON.stringify(companyCountsBefore)}`);

const initialReconcile = await rpc("reconcile_roll_transfer_receipt_selection", {
  p_transfer_id: transferId,
  p_roll_ids: [rolls[0].id, rolls[1].id, rolls[3].id],
}, centerToken);
assert(initialReconcile.response.ok && initialReconcile.body.length === 2
  && initialReconcile.body.includes(rolls[0].id) && initialReconcile.body.includes(rolls[1].id)
  && !initialReconcile.body.includes(rolls[3].id),
  `Reconcile discovered/kept invalid membership: ${JSON.stringify(initialReconcile.body)}`);

const receiptLotBefore = one(await rpc("expand_roll_transfer_receipt_lot", {
  p_transfer_id: transferId, p_lot_id: lot.id,
}, centerToken), "Recipient Lot before receipt");
assert(receiptLotBefore.production_lot_total === 4 && receiptLotBefore.transfer_count === 3
  && receiptLotBefore.pending_count === 3 && receiptLotBefore.pending_roll_ids.length === 3
  && receiptLotBefore.transfer_contains_full_lot === false,
  `Recipient Lot expansion misrepresented transfer subset: ${JSON.stringify(receiptLotBefore)}`);

const received = await rpc("receive_roll_transfer_items", {
  p_request_id: randomUUID(), p_transfer_id: transferId, p_roll_ids: [rolls[0].id],
}, centerToken);
assert(received.response.ok, `Partial receipt failed: ${JSON.stringify(received.body)}`);

const reconciledAfter = await rpc("reconcile_roll_transfer_receipt_selection", {
  p_transfer_id: transferId,
  p_roll_ids: [rolls[0].id, rolls[1].id, rolls[2].id],
}, centerToken);
assert(reconciledAfter.response.ok && reconciledAfter.body.length === 2
  && !reconciledAfter.body.includes(rolls[0].id)
  && reconciledAfter.body.includes(rolls[1].id) && reconciledAfter.body.includes(rolls[2].id),
  `Reconcile did not remove already-received item: ${JSON.stringify(reconciledAfter.body)}`);

const centerCountsAfter = one(await rpc("get_roll_transfer_attention_counts", {}, centerToken), "Center attention after partial receipt");
const companyCountsAfter = one(await rpc("get_roll_transfer_attention_counts", {}, adminToken), "Company attention after partial receipt");
assert(Number(centerCountsAfter.incoming_action_count) === 1,
  `Recipient lost active receipt attention after partial receipt: ${JSON.stringify(centerCountsAfter)}`);
assert(Number(companyCountsAfter.outgoing_action_count) === 1,
  `Sender did not gain unresolved attention after partial receipt: ${JSON.stringify(companyCountsAfter)}`);

const unresolvedLot = one(await rpc("expand_roll_transfer_unresolved_lot", {
  p_transfer_id: transferId, p_lot_id: lot.id,
}, adminToken), "Sender unresolved Lot");
assert(unresolvedLot.transfer_count === 3 && unresolvedLot.received_count === 1
  && unresolvedLot.pending_count === 2 && unresolvedLot.pending_roll_ids.length === 2
  && unresolvedLot.pending_roll_ids.includes(rolls[1].id) && unresolvedLot.pending_roll_ids.includes(rolls[2].id),
  `Sender unresolved Lot expansion is wrong: ${JSON.stringify(unresolvedLot)}`);

const recipientUnresolvedLot = await rpc("expand_roll_transfer_unresolved_lot", {
  p_transfer_id: transferId, p_lot_id: lot.id,
}, centerToken);
assert(recipientUnresolvedLot.response.ok && recipientUnresolvedLot.body.length === 0,
  `Recipient gained sender resolution helper: ${JSON.stringify(recipientUnresolvedLot.body)}`);
const outsiderReconcile = await rpc("reconcile_roll_transfer_receipt_selection", {
  p_transfer_id: transferId, p_roll_ids: [rolls[1].id],
}, outsiderToken);
assert(outsiderReconcile.response.ok && outsiderReconcile.body.length === 0,
  `Unrelated party could reconcile hidden Transfer membership: ${JSON.stringify(outsiderReconcile.body)}`);

for (const [name, body] of [
  ["get_roll_transfer_attention_counts", {}],
  ["reconcile_roll_transfer_receipt_selection", { p_transfer_id: transferId, p_roll_ids: [rolls[1].id] }],
  ["expand_roll_transfer_unresolved_lot", { p_transfer_id: transferId, p_lot_id: lot.id }],
]) {
  const service = await rpc(name, body, serviceRoleKey, serviceRoleKey);
  assert(!service.response.ok, `service_role unexpectedly executed ${name}: ${JSON.stringify(service.body)}`);
}

console.log("Cube H receipt recovery/attention read contracts verified.");
