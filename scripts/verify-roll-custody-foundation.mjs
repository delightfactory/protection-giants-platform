import { execFileSync } from "node:child_process";
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
const dealerEmail = "roll-custody-dealer@example.test";
const centerEmail = "roll-custody-center@example.test";

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

function dbContainerName() {
  const names = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" })
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
  const name = names.find((value) => value.startsWith("supabase_db_"));
  assert(name, "Supabase database container was not found for custody fixture setup.");
  return name;
}

function runSql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", dbContainerName(), "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
    { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  );
}

function expectSqlFailure(sql, message) {
  let failed = false;
  try {
    runSql(sql);
  } catch {
    failed = true;
  }
  assert(failed, message);
}

function sqlUuid(value) {
  assert(/^[0-9a-f-]{36}$/i.test(value), `Unsafe UUID fixture value: ${value}`);
  return `'${value}'::uuid`;
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

const dealer = one(await rest("dealers?select=id,code,country_agent_id,status", agentToken, {
  method: "POST",
  prefer: true,
  body: {
    code: "CUSTODY-DEALER-EG",
    name: "Roll Custody Test Dealer",
    country_code: "EG",
    country_agent_id: agent.id,
  },
}), "Create custody test Dealer");
await createUser({ email: dealerEmail, role: "dealer", dealerId: dealer.id });
const dealerToken = await signIn(dealerEmail);

const center = one(await rest("installation_centers?select=id,code,dealer_id,status", dealerToken, {
  method: "POST",
  prefer: true,
  body: {
    code: "CUSTODY-CENTER-EG",
    name: "Roll Custody Test Center",
    country_code: "EG",
    city: "Cairo",
    dealer_id: dealer.id,
  },
}), "Create custody test Center");
const centerUser = await createUser({ email: centerEmail, role: "center", centerId: center.id });
const centerToken = await signIn(centerEmail);

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
  p_lots: [{ quantity: 4, source_reference: "CUSTODY-LOT" }],
  p_source_reference: "CUSTODY-PO",
  p_notes: "Cube D verification",
}, adminToken);
assert(createdOrder.response.ok && typeof createdOrder.body === "string", `Could not create custody production order: ${JSON.stringify(createdOrder.body)}`);
const orderId = createdOrder.body;

const rolls = await rest(`rolls?production_order_id=eq.${encodeURIComponent(orderId)}&select=id,serial_number,production_order_id&order=serial_number.asc`, adminToken);
assert(rolls.response.ok && rolls.body.length === 4, `Expected four generated Rolls: ${JSON.stringify(rolls.body)}`);
const [companyRoll, agentRoll, dealerRoll, centerRoll] = rolls.body;
const rollIds = rolls.body.map((roll) => roll.id);

const companyParty = one(
  await rest("operational_parties?party_type=eq.company&select=id,party_type,transfer_code", adminToken),
  "Read singleton Company party",
);
const agentParty = one(
  await rest(`operational_parties?country_agent_id=eq.${agent.id}&select=id,party_type`, agentToken),
  "Agent reads own Operational Party",
);
const dealerParty = one(
  await rest(`operational_parties?dealer_id=eq.${dealer.id}&select=id,party_type`, dealerToken),
  "Dealer reads own Operational Party",
);
const centerParty = one(
  await rest(`operational_parties?installation_center_id=eq.${center.id}&select=id,party_type`, centerToken),
  "Center reads own Operational Party",
);

const current = await rest(`roll_custody_current?roll_id=in.(${rollIds.join(",")})&select=roll_id,custodian_party_id,confirmed_at`, adminToken);
assert(current.response.ok && current.body.length === 4, `Every new Roll must have one current custody row: ${JSON.stringify(current.body)}`);
assert(current.body.every((row) => row.custodian_party_id === companyParty.id), "New Rolls did not initialize to Company custody.");
assert(new Set(current.body.map((row) => row.roll_id)).size === 4, "Duplicate current-custody projection detected.");

const events = await rest(`roll_custody_events?roll_id=in.(${rollIds.join(",")})&select=roll_id,custody_sequence,custodian_party_id,confirmed_at,recorded_at`, adminToken);
assert(events.response.ok && events.body.length === 4, `Every new Roll must have one initial custody event: ${JSON.stringify(events.body)}`);
assert(events.body.every((event) => event.custody_sequence === 1 && event.custodian_party_id === companyParty.id), "Initial custody history is not Company sequence 1.");

none(await rest(`rolls?production_order_id=eq.${encodeURIComponent(orderId)}&select=id,serial_number`, agentToken), "Agent reads Company-custodied Rolls");
none(await rest(`roll_custody_current?roll_id=in.(${rollIds.join(",")})&select=roll_id,custodian_party_id`, agentToken), "Agent reads Company current custody");
none(await rest(`roll_custody_events?roll_id=in.(${rollIds.join(",")})&select=id`, agentToken), "Agent reads custody audit history");
none(await rest(`rolls?production_order_id=eq.${encodeURIComponent(orderId)}&select=id,serial_number`, dealerToken), "Dealer reads Company-custodied Rolls");
none(await rest(`roll_custody_current?roll_id=in.(${rollIds.join(",")})&select=roll_id,custodian_party_id`, dealerToken), "Dealer reads Company current custody");
none(await rest(`roll_custody_events?roll_id=in.(${rollIds.join(",")})&select=id`, dealerToken), "Dealer reads custody audit history");
none(await rest(`rolls?production_order_id=eq.${encodeURIComponent(orderId)}&select=id,serial_number`, centerToken), "Center reads Company-custodied Rolls");
none(await rest(`roll_custody_current?roll_id=in.(${rollIds.join(",")})&select=roll_id,custodian_party_id`, centerToken), "Center reads Company current custody");
none(await rest(`roll_custody_events?roll_id=in.(${rollIds.join(",")})&select=id`, centerToken), "Center reads custody audit history");

const anonymousCurrent = await request(`/rest/v1/roll_custody_current?roll_id=in.(${rollIds.join(",")})&select=roll_id`);
assert(!anonymousCurrent.response.ok, "Anonymous client unexpectedly received custody table access.");

const serviceCurrent = await request(`/rest/v1/roll_custody_current?roll_id=in.(${rollIds.join(",")})&select=roll_id`, {
  key: serviceRoleKey,
  token: serviceRoleKey,
});
assert(!serviceCurrent.response.ok, "Service-role Data API unexpectedly received custody table access.");
const serviceEvents = await request(`/rest/v1/roll_custody_events?roll_id=in.(${rollIds.join(",")})&select=id`, {
  key: serviceRoleKey,
  token: serviceRoleKey,
});
assert(!serviceEvents.response.ok, "Service-role Data API unexpectedly received custody history access.");

const directCurrentUpdate = await rest(`roll_custody_current?roll_id=eq.${companyRoll.id}&select=roll_id,custodian_party_id`, adminToken, {
  method: "PATCH",
  prefer: true,
  body: { custodian_party_id: agentParty.id },
});
assert(!directCurrentUpdate.response.ok, "Admin directly changed confirmed custody outside a future controlled receipt path.");

const directEventInsert = await rest("roll_custody_events?select=id", adminToken, {
  method: "POST",
  prefer: true,
  body: {
    roll_id: companyRoll.id,
    custody_sequence: 2,
    custodian_party_id: agentParty.id,
    confirmed_at: new Date().toISOString(),
  },
});
assert(!directEventInsert.response.ok, "Admin directly appended a custody event through the Data API.");

const directEventUpdate = await rest(`roll_custody_events?roll_id=eq.${companyRoll.id}&select=id`, adminToken, {
  method: "PATCH",
  prefer: true,
  body: { custody_sequence: 99 },
});
assert(!directEventUpdate.response.ok, "Admin mutated immutable custody history.");

const directEventDelete = await rest(`roll_custody_events?roll_id=eq.${companyRoll.id}`, adminToken, { method: "DELETE" });
assert(!directEventDelete.response.ok, "Admin deleted immutable custody history.");

// Test-only SQL fixture: simulate confirmed receipt outcomes that later cubes will own,
// so Cube D's role isolation can be verified without exposing a production mutation API.
runSql(`
begin;
update public.roll_custody_current
set custodian_party_id = ${sqlUuid(agentParty.id)}, confirmed_at = now()
where roll_id = ${sqlUuid(agentRoll.id)};
insert into public.roll_custody_events (roll_id, custody_sequence, custodian_party_id, confirmed_at)
values (${sqlUuid(agentRoll.id)}, 2, ${sqlUuid(agentParty.id)}, now());

update public.roll_custody_current
set custodian_party_id = ${sqlUuid(dealerParty.id)}, confirmed_at = now()
where roll_id = ${sqlUuid(dealerRoll.id)};
insert into public.roll_custody_events (roll_id, custody_sequence, custodian_party_id, confirmed_at)
values (${sqlUuid(dealerRoll.id)}, 2, ${sqlUuid(dealerParty.id)}, now());

update public.roll_custody_current
set custodian_party_id = ${sqlUuid(centerParty.id)}, confirmed_at = now()
where roll_id = ${sqlUuid(centerRoll.id)};
insert into public.roll_custody_events (roll_id, custody_sequence, custodian_party_id, confirmed_at)
values (${sqlUuid(centerRoll.id)}, 2, ${sqlUuid(centerParty.id)}, now());
commit;
`);

const agentVisibleRolls = await rest(`rolls?production_order_id=eq.${encodeURIComponent(orderId)}&select=id`, agentToken);
assert(agentVisibleRolls.response.ok && agentVisibleRolls.body.length === 1 && agentVisibleRolls.body[0].id === agentRoll.id,
  `Agent custody isolation is incorrect: ${JSON.stringify(agentVisibleRolls.body)}`);
const dealerVisibleRolls = await rest(`rolls?production_order_id=eq.${encodeURIComponent(orderId)}&select=id`, dealerToken);
assert(dealerVisibleRolls.response.ok && dealerVisibleRolls.body.length === 1 && dealerVisibleRolls.body[0].id === dealerRoll.id,
  `Dealer custody isolation is incorrect: ${JSON.stringify(dealerVisibleRolls.body)}`);
const centerVisibleRolls = await rest(`rolls?production_order_id=eq.${encodeURIComponent(orderId)}&select=id`, centerToken);
assert(centerVisibleRolls.response.ok && centerVisibleRolls.body.length === 1 && centerVisibleRolls.body[0].id === centerRoll.id,
  `Center custody isolation is incorrect: ${JSON.stringify(centerVisibleRolls.body)}`);

one(await rest(`roll_custody_current?roll_id=eq.${agentRoll.id}&select=roll_id,custodian_party_id`, agentToken), "Agent reads own current custody");
none(await rest(`roll_custody_current?roll_id=eq.${dealerRoll.id}&select=roll_id`, agentToken), "Agent reads Dealer current custody");
one(await rest(`roll_custody_current?roll_id=eq.${dealerRoll.id}&select=roll_id,custodian_party_id`, dealerToken), "Dealer reads own current custody");
none(await rest(`roll_custody_current?roll_id=eq.${centerRoll.id}&select=roll_id`, dealerToken), "Dealer reads Center current custody");
one(await rest(`roll_custody_current?roll_id=eq.${centerRoll.id}&select=roll_id,custodian_party_id`, centerToken), "Center reads own current custody");
none(await rest(`roll_custody_current?roll_id=eq.${agentRoll.id}&select=roll_id`, centerToken), "Center reads Agent current custody");
none(await rest(`roll_custody_events?roll_id=in.(${rollIds.join(",")})&select=id`, agentToken), "Agent reads custody history after fixture reassignment");
none(await rest(`roll_custody_events?roll_id=in.(${rollIds.join(",")})&select=id`, dealerToken), "Dealer reads custody history after fixture reassignment");
none(await rest(`roll_custody_events?roll_id=in.(${rollIds.join(",")})&select=id`, centerToken), "Center reads custody history after fixture reassignment");

// Active-profile/entity gates must remove visibility even when the party still owns current custody.
runSql(`update public.profiles set status = 'suspended' where id = ${sqlUuid(centerUser.id)};`);
none(await rest(`rolls?id=eq.${centerRoll.id}&select=id`, centerToken), "Suspended Center profile reads owned Roll");
none(await rest(`roll_custody_current?roll_id=eq.${centerRoll.id}&select=roll_id`, centerToken), "Suspended Center profile reads owned custody");
runSql(`update public.profiles set status = 'active' where id = ${sqlUuid(centerUser.id)};`);

runSql(`update public.dealers set status = 'suspended' where id = ${sqlUuid(dealer.id)};`);
none(await rest(`rolls?id=eq.${dealerRoll.id}&select=id`, dealerToken), "Suspended Dealer entity reads owned Roll");
none(await rest(`roll_custody_current?roll_id=eq.${dealerRoll.id}&select=roll_id`, dealerToken), "Suspended Dealer entity reads owned custody");
runSql(`update public.dealers set status = 'active' where id = ${sqlUuid(dealer.id)};`);

expectSqlFailure(
  `insert into public.roll_custody_current (roll_id, custodian_party_id, confirmed_at) values (${sqlUuid(companyRoll.id)}, ${sqlUuid(companyParty.id)}, now());`,
  "Duplicate current custody row unexpectedly succeeded.",
);
expectSqlFailure(
  `insert into public.roll_custody_events (roll_id, custody_sequence, custodian_party_id, confirmed_at) values (${sqlUuid(agentRoll.id)}, 2, ${sqlUuid(agentParty.id)}, now());`,
  "Duplicate custody sequence unexpectedly succeeded.",
);

// Cube H strengthens the historical Cube D void boundary: once any physical
// Roll has confirmed custody sequence > 1, the Production Order is distributed
// and must remain generated. The custody projection/history must remain intact.
const voidDistributed = await rpc("void_production_order", {
  p_order_id: orderId,
  p_reason: "Cube H distributed-order void guard regression",
}, adminToken);
assert(!voidDistributed.response.ok && voidDistributed.body?.message === "PG_TRANSFER_PRODUCTION_VOID_DISTRIBUTED",
  `Distributed custody order was unexpectedly voided: ${JSON.stringify(voidDistributed.body)}`);

const retainedCurrent = await rest(`roll_custody_current?roll_id=in.(${rollIds.join(",")})&select=roll_id,custodian_party_id`, adminToken);
const retainedEvents = await rest(`roll_custody_events?roll_id=in.(${rollIds.join(",")})&select=roll_id,custody_sequence`, adminToken);
assert(retainedCurrent.response.ok && retainedCurrent.body.length === 4, "Distributed-order void rejection damaged confirmed custody state.");
assert(retainedEvents.response.ok && retainedEvents.body.length === 7, "Distributed-order void rejection damaged custody history.");
assert((await rest(`production_orders?id=eq.${encodeURIComponent(orderId)}&select=id,status`, adminToken)).body?.[0]?.status === "generated",
  "Distributed Production Order did not remain generated after rejected void.");

console.log("Roll Custody Foundation database/RLS verification passed through Cube H void hardening.");
