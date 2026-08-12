import { randomUUID } from "node:crypto";

const apiUrl = process.env.API_URL;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
const anonKey = process.env.ANON_KEY;

if (!apiUrl || !serviceRoleKey || !anonKey) {
  throw new Error("Local Supabase API_URL, SERVICE_ROLE_KEY and ANON_KEY are required.");
}

const password = "Production-Boundary-Test-2026!";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

async function adminCreateUser({ email, role, dealerId = null, displayName }) {
  const response = await fetch(`${apiUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      app_metadata: {
        pg_provisioning: {
          version: "operational-v1",
          role,
          dealer_id: dealerId,
          installation_center_id: null,
        },
      },
      user_metadata: { display_name: displayName },
    }),
  });
  const body = await readJson(response);
  assert(response.ok && body?.id, `Could not create ${role} user: ${JSON.stringify(body)}`);
  return body;
}

async function signIn(email) {
  const response = await fetch(`${apiUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await readJson(response);
  assert(response.ok && body?.access_token, `Could not sign in ${email}: ${JSON.stringify(body)}`);
  return body.access_token;
}

async function rest(path, { method = "GET", token, body } = {}) {
  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${token ?? anonKey}`,
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    headers.Prefer = "return=representation";
  }
  const response = await fetch(`${apiUrl}/rest/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { response, body: await readJson(response) };
}

async function exactCount(path, token) {
  const response = await fetch(`${apiUrl}/rest/v1/${path}`, {
    method: "HEAD",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      Prefer: "count=exact",
    },
  });
  assert(response.ok, `Could not count ${path}: ${response.status}`);
  const contentRange = response.headers.get("content-range") ?? "";
  const match = contentRange.match(/\/(\d+)$/);
  assert(match, `Missing exact count for ${path}: ${contentRange}`);
  return Number(match[1]);
}

async function rpc(name, body, token) {
  const response = await fetch(`${apiUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return { response, body: await readJson(response) };
}

function expectSingleRow(result, label) {
  assert(result.response.ok && Array.isArray(result.body) && result.body.length === 1,
    `${label} failed: ${JSON.stringify(result.body)}`);
  return result.body[0];
}

const primaryAdminEmail = "production-boundary-admin@example.test";
const secondAdminEmail = "production-boundary-admin-2@example.test";
const dealerEmail = "production-boundary-dealer@example.test";

await adminCreateUser({ email: primaryAdminEmail, role: "admin", displayName: "مسؤول حدود الإنتاج" });
await adminCreateUser({ email: secondAdminEmail, role: "admin", displayName: "مسؤول حدود الإنتاج الثاني" });
const adminToken = await signIn(primaryAdminEmail);
const secondAdminToken = await signIn(secondAdminEmail);

const product = expectSingleRow(
  await rest("products?select=id", {
    method: "POST",
    token: adminToken,
    body: {
      code: "PG-PRODUCTION-BOUNDARY",
      name: "Production Boundary PPF",
      slug: "production-boundary-ppf",
      product_type: "PPF",
      version_name: "Boundary",
      width_mm: 1524,
      length_m: 15,
      thickness_mil: 7.5,
      weight_kg: 12.5,
      origin_country: "USA",
      default_warranty_months: 120,
      marketing_description: "Boundary test product.",
      warranty_coverage: "Boundary coverage.",
      care_instructions: "Boundary care.",
      publication_status: "draft",
    },
  }),
  "Boundary product creation",
);

const maxRequestId = randomUUID();
const maxCreateBody = {
  p_request_id: maxRequestId,
  p_product_id: product.id,
  p_production_date: "2026-08-12",
  p_lots: [{ quantity: 10000, source_reference: "MAX-LOT" }],
};
const maxCreated = await rpc("create_production_order", maxCreateBody, adminToken);
assert(maxCreated.response.ok && typeof maxCreated.body === "string", `10,000 Roll order failed: ${JSON.stringify(maxCreated.body)}`);
const maxOrderId = maxCreated.body;

const maxOrder = expectSingleRow(
  await rest(`production_orders?id=eq.${encodeURIComponent(maxOrderId)}&select=id,total_rolls`, { token: adminToken }),
  "10,000 Roll order read",
);
assert(maxOrder.total_rolls === 10000, `10,000 Roll order header mismatch: ${JSON.stringify(maxOrder)}`);
assert(
  await exactCount(`rolls?production_order_id=eq.${encodeURIComponent(maxOrderId)}&select=id`, adminToken) === 10000,
  "10,000 Roll order did not persist exactly 10,000 physical Roll rows.",
);
const lastRoll = expectSingleRow(
  await rest(`rolls?production_order_id=eq.${encodeURIComponent(maxOrderId)}&roll_index=eq.10000&select=roll_index,serial_number`, { token: adminToken }),
  "10,000th Roll read",
);
assert(lastRoll.roll_index === 10000 && /-10000$/.test(lastRoll.serial_number), `10,000th Roll identity is invalid: ${JSON.stringify(lastRoll)}`);

const crossAdminRetry = await rpc("create_production_order", maxCreateBody, secondAdminToken);
assert(!crossAdminRetry.response.ok, "A second administrator reused another administrator's idempotency key.");

const fiftyLots = Array.from({ length: 50 }, (_, index) => ({
  quantity: 1,
  source_reference: `LOT-${String(index + 1).padStart(2, "0")}`,
}));
const fiftyCreated = await rpc("create_production_order", {
  p_request_id: randomUUID(),
  p_product_id: product.id,
  p_production_date: "2026-08-12",
  p_lots: fiftyLots,
}, adminToken);
assert(fiftyCreated.response.ok && typeof fiftyCreated.body === "string", `50-Lot order failed: ${JSON.stringify(fiftyCreated.body)}`);
const fiftyOrderId = fiftyCreated.body;
assert(
  await exactCount(`production_lots?production_order_id=eq.${encodeURIComponent(fiftyOrderId)}&select=id`, adminToken) === 50,
  "50-Lot boundary order did not persist exactly 50 Lots.",
);
const finalLot = expectSingleRow(
  await rest(`production_lots?production_order_id=eq.${encodeURIComponent(fiftyOrderId)}&lot_sequence=eq.50&select=lot_sequence,lot_number`, { token: adminToken }),
  "50th Lot read",
);
assert(finalLot.lot_sequence === 50 && /-50$/.test(finalLot.lot_number), `50th Lot identity is invalid: ${JSON.stringify(finalLot)}`);

const fiftyOneRejected = await rpc("create_production_order", {
  p_request_id: randomUUID(),
  p_product_id: product.id,
  p_production_date: "2026-08-12",
  p_lots: Array.from({ length: 51 }, () => ({ quantity: 1 })),
}, adminToken);
assert(!fiftyOneRejected.response.ok, "51 Lots unexpectedly passed the Production RPC boundary.");

const totalOverflowRejected = await rpc("create_production_order", {
  p_request_id: randomUUID(),
  p_product_id: product.id,
  p_production_date: "2026-08-12",
  p_lots: [{ quantity: 5001 }, { quantity: 5000 }],
}, adminToken);
assert(!totalOverflowRejected.response.ok, "A 10,001 Roll total unexpectedly passed the Production RPC boundary.");

const shortVoidRejected = await rpc("void_production_order", {
  p_order_id: maxOrderId,
  p_reason: "bad",
}, adminToken);
assert(!shortVoidRejected.response.ok, "A too-short void reason unexpectedly passed the audit contract.");

const dealer = expectSingleRow(
  await rest("dealers?select=id", {
    method: "POST",
    token: adminToken,
    body: { code: "BOUNDARY-DEALER", name: "Boundary Dealer", country_code: "EG" },
  }),
  "Boundary dealer creation",
);
await adminCreateUser({ email: dealerEmail, role: "dealer", dealerId: dealer.id, displayName: "Boundary Dealer User" });
const dealerToken = await signIn(dealerEmail);

for (const [table, filter] of [
  ["production_orders", `id=eq.${encodeURIComponent(maxOrderId)}`],
  ["production_lots", `production_order_id=eq.${encodeURIComponent(maxOrderId)}`],
  ["rolls", `production_order_id=eq.${encodeURIComponent(maxOrderId)}`],
]) {
  const result = await rest(`${table}?${filter}&select=id`, { token: dealerToken });
  assert(result.response.ok && Array.isArray(result.body) && result.body.length === 0, `Dealer unexpectedly read ${table}.`);
}

console.log("Production boundary contracts passed: 10,000 Rolls, 50 Lots, overflow rejection, idempotency ownership, void validation, and RLS.");
