import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const apiUrl = process.env.API_URL;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
const anonKey = process.env.ANON_KEY;
const phase = process.argv[2];
const fixturePath = "/tmp/roll-custody-backfill-fixture.json";

if (!apiUrl || !serviceRoleKey || !anonKey) {
  throw new Error("Local Supabase API_URL, SERVICE_ROLE_KEY and ANON_KEY are required.");
}
if (!new Set(["seed", "verify"]).has(phase)) {
  throw new Error("Usage: node scripts/verify-roll-custody-backfill.mjs <seed|verify>");
}

const password = "Roll-Custody-Backfill-2026!";
const adminEmail = "roll-custody-backfill-admin@example.test";

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

async function createAdmin() {
  const result = await request("/auth/v1/admin/users", {
    method: "POST",
    key: serviceRoleKey,
    token: serviceRoleKey,
    body: {
      email: adminEmail,
      password,
      email_confirm: true,
      app_metadata: {
        pg_provisioning: {
          version: "operational-v1",
          role: "admin",
          country_agent_id: null,
          dealer_id: null,
          installation_center_id: null,
        },
      },
      user_metadata: { display_name: "Custody Backfill Admin" },
    },
  });
  assert(result.response.ok && result.body?.id, `Could not create backfill admin: ${result.response.status} ${JSON.stringify(result.body)}`);
}

async function signIn() {
  const result = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email: adminEmail, password },
  });
  assert(result.response.ok && result.body?.access_token, `Could not sign in backfill admin: ${JSON.stringify(result.body)}`);
  return result.body.access_token;
}

if (phase === "seed") {
  await createAdmin();
  const adminToken = await signIn();

  const product = one(await rest("products?select=id,code", adminToken, {
    method: "POST",
    prefer: true,
    body: {
      code: "PG-CUSTODY-BACKFILL",
      name: "Roll Custody Backfill PPF",
      slug: "roll-custody-backfill-ppf",
      product_type: "PPF",
      category: "Paint Protection Film",
      version_name: "Backfill",
      width_mm: 1524,
      length_m: 15,
      thickness_mil: 7.5,
      weight_kg: 12.5,
      origin_country: "USA",
      default_warranty_months: 120,
      marketing_description: "Roll custody historical backfill fixture.",
      technical_description: "Roll custody historical backfill fixture.",
      features: ["Backfill fixture"],
      warranty_coverage: "Test coverage.",
      care_instructions: "Test care.",
      publication_status: "draft",
    },
  }), "Create backfill Product");

  const createdOrder = await rpc("create_production_order", {
    p_request_id: randomUUID(),
    p_product_id: product.id,
    p_production_date: "2026-08-13",
    p_lots: [{ quantity: 1, source_reference: "BACKFILL-LOT" }],
    p_source_reference: "BACKFILL-PO",
    p_notes: "Pre-Cube-D custody backfill fixture",
  }, adminToken);
  assert(createdOrder.response.ok && typeof createdOrder.body === "string", `Could not create pre-Cube-D Production Order: ${JSON.stringify(createdOrder.body)}`);

  const roll = one(await rest(`rolls?production_order_id=eq.${encodeURIComponent(createdOrder.body)}&select=id,created_at,serial_number`, adminToken), "Read pre-Cube-D Roll");
  const companyParty = one(await rest("operational_parties?party_type=eq.company&select=id", adminToken), "Read singleton Company party before Cube D");

  const preCurrent = await rest(`roll_custody_current?roll_id=eq.${roll.id}&select=roll_id`, adminToken);
  assert(!preCurrent.response.ok, "Custody table unexpectedly exists before Cube D migration boundary.");

  await writeFile(fixturePath, JSON.stringify({ rollId: roll.id, rollCreatedAt: roll.created_at, companyPartyId: companyParty.id }), "utf8");
  console.log("Pre-Cube-D Roll fixture created.");
} else {
  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  const adminToken = await signIn();

  const current = one(await rest(`roll_custody_current?roll_id=eq.${fixture.rollId}&select=roll_id,custodian_party_id,confirmed_at`, adminToken), "Backfilled current custody");
  assert(current.custodian_party_id === fixture.companyPartyId, `Backfill did not assign Company custody: ${JSON.stringify(current)}`);
  assert(
    new Date(current.confirmed_at).getTime() === new Date(fixture.rollCreatedAt).getTime(),
    `Backfill confirmed_at drifted from Roll created_at: ${JSON.stringify(current)}`,
  );

  const event = one(await rest(`roll_custody_events?roll_id=eq.${fixture.rollId}&select=roll_id,custody_sequence,custodian_party_id,confirmed_at`, adminToken), "Backfilled custody event");
  assert(event.custody_sequence === 1, `Backfill did not create sequence 1: ${JSON.stringify(event)}`);
  assert(event.custodian_party_id === fixture.companyPartyId, `Backfill event did not assign Company: ${JSON.stringify(event)}`);
  assert(
    new Date(event.confirmed_at).getTime() === new Date(fixture.rollCreatedAt).getTime(),
    `Backfill event confirmed_at drifted from Roll created_at: ${JSON.stringify(event)}`,
  );

  console.log("Roll Custody historical backfill verification passed.");
}
