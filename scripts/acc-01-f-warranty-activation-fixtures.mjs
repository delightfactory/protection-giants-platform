import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const apiUrl = process.env.API_URL;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
const anonKey = process.env.ANON_KEY;
const dArtifactDir = process.env.ACC_D_ARTIFACT_DIR?.trim() || "artifacts/acc-01-d";
const artifactDir = process.env.ACC_F_ARTIFACT_DIR?.trim() || "artifacts/acc-01-f";
const password = "Agent-Network-Foundation-2026!";
const adminEmail = "network-admin@example.test";

if (!apiUrl || !serviceRoleKey || !anonKey) {
  throw new Error("Local Supabase API_URL, SERVICE_ROLE_KEY and ANON_KEY are required.");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

async function request(pathname, { method = "GET", token = anonKey, key = anonKey, body, prefer = false } = {}) {
  const headers = { apikey: key, Authorization: `Bearer ${token}` };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    if (prefer) headers.Prefer = "return=representation";
  }
  const response = await fetch(`${apiUrl}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { response, body: await readJson(response) };
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

async function rest(resource, token, options = {}) {
  return request(`/rest/v1/${resource}`, { ...options, token });
}

async function rpc(name, body, token) {
  return rest(`rpc/${name}`, token, { method: "POST", body });
}

function one(result, label) {
  assert(result.response.ok && Array.isArray(result.body) && result.body.length === 1,
    `${label}: ${result.response.status} ${JSON.stringify(result.body)}`);
  return result.body[0];
}

const dFixture = JSON.parse(fs.readFileSync(path.join(dArtifactDir, "fixture.json"), "utf8"));
const adminToken = await signIn(adminEmail);
const centerToken = await signIn(dFixture.actor.email);

const product = one(
  await rest("products?code=eq.PG-ACC-01-D&select=id,code,name,default_warranty_months,warranty_coverage,care_instructions", adminToken),
  "Read ACC-01-D warranty-ready Product",
);
assert(product.default_warranty_months === 120, "ACC-01-F requires the frozen 120-month fixture policy.");
assert(product.warranty_coverage && product.care_instructions, "ACC-01-F requires complete warranty policy snapshots.");

const orderResult = await rpc("create_production_order", {
  p_request_id: randomUUID(),
  p_product_id: product.id,
  p_production_date: "2026-09-03",
  p_lots: [{ quantity: 1, source_reference: "ACC-01-F-LOT" }],
  p_source_reference: "ACC-01-F-WARRANTY",
  p_notes: "ACC-01-F bounded Warranty Activation browser acceptance fixture",
}, adminToken);
assert(orderResult.response.ok && typeof orderResult.body === "string",
  `ACC-01-F production order failed: ${orderResult.response.status} ${JSON.stringify(orderResult.body)}`);

const roll = one(
  await rest(`rolls?production_order_id=eq.${encodeURIComponent(orderResult.body)}&select=id,serial_number,production_order_id,roll_index`, adminToken),
  "Read ACC-01-F Roll",
);

const transferResult = await rpc("create_roll_transfer", {
  p_request_id: randomUUID(),
  p_recipient_transfer_code: dFixture.actor.transferCode,
  p_roll_ids: [roll.id],
}, adminToken);
assert(transferResult.response.ok && typeof transferResult.body === "string",
  `ACC-01-F transfer to Center failed: ${transferResult.response.status} ${JSON.stringify(transferResult.body)}`);

const receiptResult = await rpc("receive_roll_transfer_items", {
  p_request_id: randomUUID(),
  p_transfer_id: transferResult.body,
  p_roll_ids: [roll.id],
}, centerToken);
assert(receiptResult.response.ok && receiptResult.body === transferResult.body,
  `ACC-01-F Center receipt failed: ${receiptResult.response.status} ${JSON.stringify(receiptResult.body)}`);

const custody = one(
  await rest(`roll_custody_current?roll_id=eq.${roll.id}&select=roll_id,custodian_party_id`, adminToken),
  "Verify ACC-01-F Center custody",
);
assert(custody.custodian_party_id === dFixture.actor.partyId, "ACC-01-F Roll did not reach the Center.");

const fixture = {
  actor: dFixture.actor,
  positive: {
    name: "mobile-390",
    width: 390,
    height: 844,
    rollId: roll.id,
    serialNumber: roll.serial_number,
    productId: product.id,
    productCode: product.code,
    productName: product.name,
    warrantyMonths: product.default_warranty_months,
    warrantyCoverage: product.warranty_coverage,
    careInstructions: product.care_instructions,
  },
  blocked: {
    name: "desktop-issue-pending",
    width: 1440,
    height: 1000,
    rollId: dFixture.scenarios[1].rollId,
    serialNumber: dFixture.scenarios[1].serialNumber,
  },
};

fs.mkdirSync(artifactDir, { recursive: true });
fs.writeFileSync(path.join(artifactDir, "fixture.json"), `${JSON.stringify(fixture, null, 2)}\n`);
console.log(`ACC-01-F Warranty Activation fixture ready at Center: ${fixture.positive.serialNumber}`);
