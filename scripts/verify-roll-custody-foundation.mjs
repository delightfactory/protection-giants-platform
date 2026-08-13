import { randomUUID } from "node:crypto";

const apiUrl = process.env.API_URL;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
const anonKey = process.env.ANON_KEY;

if (!apiUrl || !serviceRoleKey || !anonKey) {
  throw new Error("Local Supabase API_URL, SERVICE_ROLE_KEY and ANON_KEY are required.");
}

const password = "Roll-Custody-Foundation-2026!";
const adminEmail = "roll-custody-admin@example.test";
const agentEmail = "roll-custody-agent@example.test";

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

async function createUser({ email, role, countryAgentId = null }) {
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
          dealer_id: null,
          installation_center_id: null,
        },
      },
      user_metadata: { display_name: `Custody ${role}` },
    },
  });
  assert(result.response.ok && result.body?.id, `Could not create ${role} user: ${result.response.status} ${JSON.stringify(result.body)}`);
  return result.body;
}

async function signIn(email) {
  const result = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email, password },
  });
  assert(result.response.ok && result.body?.access_token, `Could not sign in ${email}: ${JSON.stringify(result.body)}`);
  return result.body.access_token;
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

function none(result, label) {
  assert(result.response.ok && Array.isArray(result.body) && result.body.length === 0,
    `${label} unexpectedly returned data: ${result.response.status} ${JSON.stringify(result.body)}`);
}

await createUser({ email: adminEmail, role: "admin" });
const adminToken = await signIn(adminEmail);

const agent = one(await rest("country_agents?select=id,code,status", adminToken, {
  method: "POST",
  prefer: true,
  body: {
    code: "CUSTODY-AGENT-EG",
    name: "Roll Custody Test Agent",
    country_code: "EG",
  },
}), "Create custody test Agent");
await createUser({ email: agentEmail, role: "agent", countryAgentId: agent.id });
const agentToken = await signIn(agentEmail);

const product = one(await rest("products?select=id,code", adminToken, {
  method: "POST",
  prefer: true,
  body: {
    code: "PG-CUSTODY-TEST",
    name: "Roll Custody Test PPF",
    slug: "roll-custody-test-ppf",
    product_type: "PPF",
    category: "Paint Protection Film",
    version_name: "Custody",
    width_mm: 1524,
    length_m: 15,
    thickness_mil: 7.5,
    weight_kg: 12.5,
    origin_country: "USA",
    default_warranty_months: 120,
    marketing_description: "Roll custody contract fixture.",
    technical_description: "Roll custody contract fixture.",
    features: ["Custody fixture"],
    warranty_coverage: "Test coverage.",
    care_instructions: "Test care.",
    publication_status: "draft",
  },
}), "Create custody test Product");

const createdOrder = await rpc("create_production_order", {
  p_request_id: randomUUID(),
  p_product_id: product.id,
  p_production_date: "2026-08-13",
  p_lots: [{ quantity: 2, source_reference: "CUSTODY-LOT" }],
  p_source_reference: "CUSTODY-PO",
  p_notes: "Cube D verification",
}, adminToken);
assert(createdOrder.response.ok && typeof createdOrder.body === "string", `Could not create custody production order: ${JSON.stringify(createdOrder.body)}`);
const orderId = createdOrder.body;

const rolls = await rest(`rolls?production_order_id=eq.${encodeURIComponent(orderId)}&select=id,serial_number,production_order_id&order=serial_number.asc`, adminToken);
assert(rolls.response.ok && rolls.body.length === 2, `Expected two generated Rolls: ${JSON.stringify(rolls.body)}`);
const rollIds = rolls.body.map((roll) => roll.id);

const companyParty = one(
  await rest("operational_parties?party_type=eq.company&select=id,party_type,transfer_code", adminToken),
  "Read singleton Company party",
);

const current = await rest(`roll_custody_current?roll_id=in.(${rollIds.join(",")})&select=roll_id,custodian_party_id,confirmed_at`, adminToken);
assert(current.response.ok && current.body.length === 2, `Every new Roll must have one current custody row: ${JSON.stringify(current.body)}`);
assert(current.body.every((row) => row.custodian_party_id === companyParty.id), "New Rolls did not initialize to Company custody.");
assert(new Set(current.body.map((row) => row.roll_id)).size === 2, "Duplicate current-custody projection detected.");

const events = await rest(`roll_custody_events?roll_id=in.(${rollIds.join(",")})&select=roll_id,custody_sequence,custodian_party_id,confirmed_at,recorded_at`, adminToken);
assert(events.response.ok && events.body.length === 2, `Every new Roll must have one initial custody event: ${JSON.stringify(events.body)}`);
assert(events.body.every((event) => event.custody_sequence === 1 && event.custodian_party_id === companyParty.id), "Initial custody history is not Company sequence 1.");

none(await rest(`rolls?production_order_id=eq.${encodeURIComponent(orderId)}&select=id,serial_number`, agentToken), "Agent reads Company-custodied Rolls");
none(await rest(`roll_custody_current?roll_id=in.(${rollIds.join(",")})&select=roll_id,custodian_party_id`, agentToken), "Agent reads Company current custody");
none(await rest(`roll_custody_events?roll_id=in.(${rollIds.join(",")})&select=id`, agentToken), "Agent reads custody audit history");

const anonymousCurrent = await request(`/rest/v1/roll_custody_current?roll_id=in.(${rollIds.join(",")})&select=roll_id`);
assert(!anonymousCurrent.response.ok, "Anonymous client unexpectedly received custody table access.");

const agentParty = one(
  await rest(`operational_parties?country_agent_id=eq.${agent.id}&select=id,party_type`, agentToken),
  "Agent reads own Operational Party",
);

const directCurrentUpdate = await rest(`roll_custody_current?roll_id=eq.${rollIds[0]}&select=roll_id,custodian_party_id`, adminToken, {
  method: "PATCH",
  prefer: true,
  body: { custodian_party_id: agentParty.id },
});
assert(!directCurrentUpdate.response.ok, "Admin directly changed confirmed custody outside a future controlled receipt path.");

const directEventInsert = await rest("roll_custody_events?select=id", adminToken, {
  method: "POST",
  prefer: true,
  body: {
    roll_id: rollIds[0],
    custody_sequence: 2,
    custodian_party_id: agentParty.id,
    confirmed_at: new Date().toISOString(),
  },
});
assert(!directEventInsert.response.ok, "Admin directly appended a custody event through the Data API.");

const directEventUpdate = await rest(`roll_custody_events?roll_id=eq.${rollIds[0]}&select=id`, adminToken, {
  method: "PATCH",
  prefer: true,
  body: { custody_sequence: 99 },
});
assert(!directEventUpdate.response.ok, "Admin mutated immutable custody history.");

const directEventDelete = await rest(`roll_custody_events?roll_id=eq.${rollIds[0]}`, adminToken, { method: "DELETE" });
assert(!directEventDelete.response.ok, "Admin deleted immutable custody history.");

const voided = await rpc("void_production_order", {
  p_order_id: orderId,
  p_reason: "Cube D voided-order custody eligibility test",
}, adminToken);
assert(voided.response.ok && voided.body === orderId, `Could not void custody test order: ${JSON.stringify(voided.body)}`);

const retainedCurrent = await rest(`roll_custody_current?roll_id=in.(${rollIds.join(",")})&select=roll_id,custodian_party_id`, adminToken);
const retainedEvents = await rest(`roll_custody_events?roll_id=in.(${rollIds.join(",")})&select=roll_id,custody_sequence`, adminToken);
assert(retainedCurrent.response.ok && retainedCurrent.body.length === 2, "Voiding destroyed confirmed custody audit state.");
assert(retainedEvents.response.ok && retainedEvents.body.length === 2, "Voiding destroyed custody history.");
none(await rest(`rolls?production_order_id=eq.${encodeURIComponent(orderId)}&select=id`, agentToken), "Agent reads voided Roll downstream");
none(await rest(`roll_custody_current?roll_id=in.(${rollIds.join(",")})&select=roll_id`, agentToken), "Agent reads voided custody downstream");

console.log("Roll Custody Foundation database/RLS verification passed.");
