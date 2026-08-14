import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const apiUrl = process.env.API_URL;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
const anonKey = process.env.ANON_KEY;

if (!apiUrl || !serviceRoleKey || !anonKey) {
  throw new Error("Local Supabase API_URL, SERVICE_ROLE_KEY and ANON_KEY are required.");
}

const password = "Transfer-Receipt-Scale-H-2026!";

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
  return request(`/rest/v1/rpc/${name}`, { method: "POST", body, token });
}

function one(result, label) {
  assert(result.response.ok && Array.isArray(result.body) && result.body.length === 1,
    `${label}: ${result.response.status} ${JSON.stringify(result.body)}`);
  return result.body[0];
}

async function createUser({ email, role, centerId = null }) {
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
          country_agent_id: null,
          dealer_id: null,
          installation_center_id: centerId,
        },
      },
      user_metadata: { display_name: `Cube H scale ${role}` },
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
    `Could not sign in ${email}: ${JSON.stringify(result.body)}`);
  return result.body.access_token;
}

function dbContainerName() {
  const names = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" })
    .split("\n").map((value) => value.trim()).filter(Boolean);
  const name = names.find((value) => value.startsWith("supabase_db_"));
  assert(name, "Supabase database container was not found for Cube H scale verification.");
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

const adminEmail = "cube-h-scale-admin@example.test";
const centerEmail = "cube-h-scale-center@example.test";

await createUser({ email: adminEmail, role: "admin" });
const adminToken = await signIn(adminEmail);

const center = one(await rest("installation_centers?select=id,code,status", adminToken, {
  method: "POST",
  prefer: true,
  body: {
    code: "CUBE-H-SCALE-CENTER",
    name: "Cube H Scale Center",
    country_code: "EG",
    city: "Cairo",
    dealer_id: null,
    country_agent_id: null,
  },
}), "Create direct Company Center");
await createUser({ email: centerEmail, role: "center", centerId: center.id });
const centerToken = await signIn(centerEmail);

const centerParty = one(await rest(`operational_parties?installation_center_id=eq.${center.id}&select=id,transfer_code`, adminToken), "Scale Center party");

const product = one(await rest("products?select=id,code", adminToken, {
  method: "POST",
  prefer: true,
  body: {
    code: "PG-CUBE-H-SCALE",
    name: "Cube H Scale PPF",
    slug: "cube-h-scale-ppf",
    product_type: "PPF",
    category: "Paint Protection Film",
    version_name: "H-SCALE",
    width_mm: 1524,
    length_m: 15,
    thickness_mil: 7.5,
    weight_kg: 12.5,
    origin_country: "USA",
    default_warranty_months: 120,
    marketing_description: "Cube H scale fixture.",
    technical_description: "Cube H scale fixture.",
    features: ["Scale"],
    warranty_coverage: "Test coverage.",
    care_instructions: "Test care.",
    publication_status: "draft",
  },
}), "Create scale Product");

const order = await rpc("create_production_order", {
  p_request_id: randomUUID(),
  p_product_id: product.id,
  p_production_date: "2026-08-15",
  p_lots: [{ quantity: 10000, source_reference: "CUBE-H-SCALE-LOT" }],
  p_source_reference: "CUBE-H-SCALE-ORDER",
  p_notes: "Cube H 10,000 Roll receipt verification",
}, adminToken);
assert(order.response.ok && typeof order.body === "string",
  `10,000 Roll Production fixture failed: ${order.response.status} ${JSON.stringify(order.body)}`);
const orderId = order.body;

const idsOutput = querySql(`
select id::text
from public.rolls
where production_order_id = ${sqlUuid(orderId)}
order by serial_number;
`);
const rollIds = idsOutput.split("\n").filter(Boolean);
assert(rollIds.length === 10000, `Expected 10,000 scale Roll IDs, got ${rollIds.length}.`);

const transfer = await rpc("create_roll_transfer", {
  p_request_id: randomUUID(),
  p_recipient_transfer_code: centerParty.transfer_code,
  p_roll_ids: rollIds,
}, adminToken);
assert(transfer.response.ok && typeof transfer.body === "string",
  `10,000 Roll Transfer creation failed: ${transfer.response.status} ${JSON.stringify(transfer.body)}`);
const transferId = transfer.body;

const receiptRequestId = randomUUID();
const receipt = await rpc("receive_roll_transfer_items", {
  p_request_id: receiptRequestId,
  p_transfer_id: transferId,
  p_roll_ids: rollIds,
}, centerToken);
assert(receipt.response.ok && receipt.body === transferId,
  `10,000 Roll receipt failed: ${receipt.response.status} ${JSON.stringify(receipt.body)}`);

const persisted = querySql(`
select
  (select status from public.roll_transfers where id = ${sqlUuid(transferId)}) || '|' ||
  (select count(*) from public.roll_transfer_item_states where transfer_id = ${sqlUuid(transferId)} and status = 'received') || '|' ||
  (select count(*) from public.roll_transfer_reservations where transfer_id = ${sqlUuid(transferId)}) || '|' ||
  (select count(*) from public.roll_custody_current custody
     join public.rolls roll on roll.id = custody.roll_id
     where roll.production_order_id = ${sqlUuid(orderId)}
       and custody.custodian_party_id = ${sqlUuid(centerParty.id)}) || '|' ||
  (select count(*) from public.roll_custody_events where transfer_id = ${sqlUuid(transferId)}) || '|' ||
  (select count(*) from public.roll_transfer_events where transfer_id = ${sqlUuid(transferId)} and event_type = 'received');
`);
assert(persisted === "received|10000|0|10000|10000|1",
  `10,000 Roll receipt persisted inconsistent state: ${persisted}`);

const retry = await rpc("receive_roll_transfer_items", {
  p_request_id: receiptRequestId,
  p_transfer_id: transferId,
  p_roll_ids: [...rollIds].reverse(),
}, centerToken);
assert(retry.response.ok && retry.body === transferId,
  `10,000 Roll idempotent retry failed: ${retry.response.status} ${JSON.stringify(retry.body)}`);

const afterRetry = querySql(`
select
  (select count(*) from public.roll_custody_events where transfer_id = ${sqlUuid(transferId)}) || '|' ||
  (select count(*) from public.roll_transfer_events where transfer_id = ${sqlUuid(transferId)} and event_type = 'received');
`);
assert(afterRetry === "10000|1", `10,000 Roll retry duplicated audit state: ${afterRetry}`);

console.log("Cube H 10,000-Roll atomic receipt scale verification passed.");
