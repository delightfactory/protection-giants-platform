import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const apiUrl = process.env.API_URL;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
const anonKey = process.env.ANON_KEY;
const artifactDir = process.env.ACC_C_ARTIFACT_DIR?.trim() || "artifacts/acc-01-c";

if (!apiUrl || !serviceRoleKey || !anonKey) {
  throw new Error("Local Supabase API_URL, SERVICE_ROLE_KEY and ANON_KEY are required.");
}

const password = "Agent-Network-Foundation-2026!";
const adminEmail = "network-admin@example.test";

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

const adminToken = await signIn(adminEmail);

const companyParty = one(
  await rest("operational_parties?party_type=eq.company&select=id,transfer_code", adminToken),
  "Read Company party",
);
const agentParty = one(
  await rest("operational_parties?party_type=eq.agent&country_agent_id=not.is.null&select=id,transfer_code,country_agent_id&order=created_at.asc&limit=1", adminToken),
  "Read Agent A party",
);

const product = one(await rest("products?select=id,code", adminToken, {
  method: "POST",
  prefer: true,
  body: {
    code: "PG-ACC-01-C",
    name: "ACC 01 C Transfer Acceptance PPF",
    slug: "acc-01-c-transfer-acceptance-ppf",
    product_type: "PPF",
    category: "Paint Protection Film",
    version_name: "ACC-01-C",
    width_mm: 1524,
    length_m: 15,
    thickness_mil: 7.5,
    weight_kg: 12.5,
    origin_country: "USA",
    default_warranty_months: 120,
    marketing_description: "Bounded ACC-01-C browser acceptance fixture.",
    technical_description: "Bounded ACC-01-C browser acceptance fixture.",
    features: ["ACC-01-C fixture"],
    warranty_coverage: "Acceptance fixture only.",
    care_instructions: "Acceptance fixture only.",
    publication_status: "draft",
  },
}), "Create ACC-01-C Product");

async function createRoll(reference) {
  const orderResult = await rpc("create_production_order", {
    p_request_id: randomUUID(),
    p_product_id: product.id,
    p_production_date: "2026-09-02",
    p_lots: [{ quantity: 1, source_reference: `${reference}-LOT` }],
    p_source_reference: reference,
    p_notes: "ACC-01-C bounded browser acceptance fixture",
  }, adminToken);
  assert(orderResult.response.ok && typeof orderResult.body === "string",
    `${reference} production order failed: ${orderResult.response.status} ${JSON.stringify(orderResult.body)}`);

  return one(await rest(
    `rolls?production_order_id=eq.${encodeURIComponent(orderResult.body)}&select=id,serial_number,production_order_id`,
    adminToken,
  ), `Read ${reference} Roll`);
}

const mobileRoll = await createRoll("ACC-01-C-MOBILE");
const desktopRoll = await createRoll("ACC-01-C-DESKTOP");

const fixture = {
  sender: {
    email: adminEmail,
    partyId: companyParty.id,
    transferCode: companyParty.transfer_code,
  },
  recipient: {
    email: "network-agent-a@example.test",
    partyId: agentParty.id,
    transferCode: agentParty.transfer_code,
  },
  scenarios: [
    { name: "mobile-390", width: 390, height: 844, rollId: mobileRoll.id, serialNumber: mobileRoll.serial_number },
    { name: "desktop", width: 1440, height: 1000, rollId: desktopRoll.id, serialNumber: desktopRoll.serial_number },
  ],
};

fs.mkdirSync(artifactDir, { recursive: true });
fs.writeFileSync(path.join(artifactDir, "fixture.json"), `${JSON.stringify(fixture, null, 2)}\n`);
console.log(`ACC-01-C transfer fixture ready: ${fixture.scenarios.map((item) => item.serialNumber).join(", ")}`);
