import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const apiUrl = process.env.API_URL;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
const anonKey = process.env.ANON_KEY;
const artifactDir = process.env.ACC_D_ARTIFACT_DIR?.trim() || "artifacts/acc-01-d";

if (!apiUrl || !serviceRoleKey || !anonKey) {
  throw new Error("Local Supabase API_URL, SERVICE_ROLE_KEY and ANON_KEY are required.");
}

const password = "Agent-Network-Foundation-2026!";
const adminEmail = "network-admin@example.test";
const centerEmail = "acc-role-center@example.test";

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

function jwtSubject(token) {
  const parts = token.split(".");
  assert(parts.length >= 2, "JWT payload missing.");
  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  assert(typeof payload.sub === "string", "JWT subject missing.");
  return payload.sub;
}

const adminToken = await signIn(adminEmail);
const centerToken = await signIn(centerEmail);
const centerProfileId = jwtSubject(centerToken);

const center = one(
  await rest("installation_centers?code=eq.NET-C-DSELF&select=id,code,status,name", adminToken),
  "Read ACC-01-B Center",
);
assert(center.status === "active", "ACC-01-D Center must remain active.");

const centerParty = one(
  await rest(`operational_parties?party_type=eq.center&installation_center_id=eq.${center.id}&select=id,transfer_code,installation_center_id`, adminToken),
  "Read ACC-01-D Center party",
);

const product = one(await rest("products?select=id,code", adminToken, {
  method: "POST",
  prefer: true,
  body: {
    code: "PG-ACC-01-D",
    name: "ACC 01 D Roll Opening Acceptance PPF",
    slug: "acc-01-d-roll-opening-acceptance-ppf",
    product_type: "PPF",
    category: "Paint Protection Film",
    version_name: "ACC-01-D",
    width_mm: 1524,
    length_m: 15,
    thickness_mil: 7.5,
    weight_kg: 12.5,
    origin_country: "USA",
    default_warranty_months: 120,
    marketing_description: "Bounded ACC-01-D browser acceptance fixture.",
    technical_description: "Bounded ACC-01-D browser acceptance fixture.",
    features: ["ACC-01-D fixture"],
    warranty_coverage: "Acceptance fixture only.",
    care_instructions: "Acceptance fixture only.",
    publication_status: "draft",
  },
}), "Create ACC-01-D Product");

const orderResult = await rpc("create_production_order", {
  p_request_id: randomUUID(),
  p_product_id: product.id,
  p_production_date: "2026-09-02",
  p_lots: [{ quantity: 2, source_reference: "ACC-01-D-LOT" }],
  p_source_reference: "ACC-01-D-OPENING",
  p_notes: "ACC-01-D bounded Roll Opening browser acceptance fixture",
}, adminToken);
assert(orderResult.response.ok && typeof orderResult.body === "string",
  `ACC-01-D production order failed: ${orderResult.response.status} ${JSON.stringify(orderResult.body)}`);

const rollsResult = await rest(
  `rolls?production_order_id=eq.${encodeURIComponent(orderResult.body)}&select=id,serial_number,production_order_id,roll_index&order=roll_index.asc`,
  adminToken,
);
assert(rollsResult.response.ok && Array.isArray(rollsResult.body) && rollsResult.body.length === 2,
  `Expected two ACC-01-D Rolls: ${rollsResult.response.status} ${JSON.stringify(rollsResult.body)}`);

const transferResult = await rpc("create_roll_transfer", {
  p_request_id: randomUUID(),
  p_recipient_transfer_code: centerParty.transfer_code,
  p_roll_ids: rollsResult.body.map((roll) => roll.id),
}, adminToken);
assert(transferResult.response.ok && typeof transferResult.body === "string",
  `ACC-01-D transfer to Center failed: ${transferResult.response.status} ${JSON.stringify(transferResult.body)}`);

const receiptResult = await rpc("receive_roll_transfer_items", {
  p_request_id: randomUUID(),
  p_transfer_id: transferResult.body,
  p_roll_ids: rollsResult.body.map((roll) => roll.id),
}, centerToken);
assert(receiptResult.response.ok && receiptResult.body === transferResult.body,
  `ACC-01-D Center receipt failed: ${receiptResult.response.status} ${JSON.stringify(receiptResult.body)}`);

for (const roll of rollsResult.body) {
  const custody = one(
    await rest(`roll_custody_current?roll_id=eq.${roll.id}&select=roll_id,custodian_party_id`, adminToken),
    `Verify ${roll.serial_number} Center custody`,
  );
  assert(custody.custodian_party_id === centerParty.id,
    `${roll.serial_number} did not reach the ACC-01-D Center.`);
}

const fixture = {
  actor: {
    email: centerEmail,
    profileId: centerProfileId,
    centerId: center.id,
    centerName: center.name,
    partyId: centerParty.id,
    transferCode: centerParty.transfer_code,
  },
  scenarios: [
    {
      name: "mobile-390",
      width: 390,
      height: 844,
      rollId: rollsResult.body[0].id,
      serialNumber: rollsResult.body[0].serial_number,
    },
    {
      name: "desktop",
      width: 1440,
      height: 1000,
      rollId: rollsResult.body[1].id,
      serialNumber: rollsResult.body[1].serial_number,
    },
  ],
};

fs.mkdirSync(artifactDir, { recursive: true });
fs.writeFileSync(path.join(artifactDir, "fixture.json"), `${JSON.stringify(fixture, null, 2)}\n`);
console.log(`ACC-01-D Roll Opening fixture ready at Center: ${fixture.scenarios.map((item) => item.serialNumber).join(", ")}`);
