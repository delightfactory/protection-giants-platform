const apiUrl = process.env.API_URL;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
const anonKey = process.env.ANON_KEY;

if (!apiUrl || !serviceRoleKey || !anonKey) throw new Error("Local Supabase env is required.");
const password = "Operational-Entities-Test-2026!";

async function json(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

async function createUser({ email, role, countryAgentId = null, dealerId = null, centerId = null }) {
  const response = await fetch(`${apiUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      app_metadata: { pg_provisioning: {
        version: "operational-v1",
        role,
        country_agent_id: countryAgentId,
        dealer_id: dealerId,
        installation_center_id: centerId,
      } },
      user_metadata: { display_name: `Test ${role}` },
    }),
  });
  const body = await json(response);
  if (!response.ok || !body?.id) throw new Error(`Could not create ${role}: ${response.status} ${JSON.stringify(body)}`);
  return body;
}

async function signIn(email) {
  const response = await fetch(`${apiUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await json(response);
  if (!response.ok || !body?.access_token) throw new Error(`Could not sign in ${email}: ${response.status}`);
  return body.access_token;
}

async function rest(path, token, { method = "GET", body } = {}) {
  const headers = { apikey: anonKey, Authorization: `Bearer ${token}` };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    headers.Prefer = "return=representation";
  }
  const response = await fetch(`${apiUrl}/rest/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { response, body: await json(response) };
}

function one(result, label) {
  if (!result.response.ok || !Array.isArray(result.body) || result.body.length !== 1) {
    throw new Error(`${label}: ${result.response.status} ${JSON.stringify(result.body)}`);
  }
  return result.body[0];
}

await createUser({ email: "entities-admin@example.test", role: "admin" });
const adminToken = await signIn("entities-admin@example.test");

const agent = one(await rest("country_agents?select=id,code,country_code,status", adminToken, {
  method: "POST",
  body: { code: "ENTITY-A1", name: "Test Country Agent", country_code: "EG" },
}), "Admin Agent create");

const dealerOne = one(await rest("dealers?select=id,code,country_code,country_agent_id,status", adminToken, {
  method: "POST",
  body: { code: "ENTITY-D1", name: "Test Dealer One", country_code: "EG", country_agent_id: agent.id },
}), "Admin Dealer one create");

const dealerTwo = one(await rest("dealers?select=id,code,country_code,country_agent_id,status", adminToken, {
  method: "POST",
  body: { code: "ENTITY-D2", name: "Test Dealer Two", country_code: "EG", country_agent_id: agent.id },
}), "Admin Dealer two create");

const invalidCountry = await rest(`dealers?id=eq.${dealerOne.id}&select=id`, adminToken, {
  method: "PATCH",
  body: { country_code: "SA" },
});
if (invalidCountry.response.ok) throw new Error("Dealer country changed independently from Agent country.");

const centerOne = one(await rest("installation_centers?select=id,code,dealer_id,country_agent_id,status", adminToken, {
  method: "POST",
  body: { code: "ENTITY-C1", name: "Test Center One", country_code: "EG", city: "Tanta", dealer_id: dealerOne.id },
}), "Admin Center one create");

const centerTwo = one(await rest("installation_centers?select=id,code,dealer_id,country_agent_id,status", adminToken, {
  method: "POST",
  body: { code: "ENTITY-C2", name: "Test Center Two", country_code: "EG", city: "Cairo", dealer_id: dealerTwo.id },
}), "Admin Center two create");

await createUser({ email: "entities-agent@example.test", role: "agent", countryAgentId: agent.id });
await createUser({ email: "entities-dealer@example.test", role: "dealer", dealerId: dealerOne.id });
await createUser({ email: "entities-center@example.test", role: "center", centerId: centerOne.id });
const agentToken = await signIn("entities-agent@example.test");
const dealerToken = await signIn("entities-dealer@example.test");
const centerToken = await signIn("entities-center@example.test");

one(await rest(`country_agents?id=eq.${agent.id}&select=id,status`, agentToken), "Agent own row");
const agentDealers = await rest("dealers?select=id,country_agent_id", agentToken);
if (!agentDealers.response.ok || agentDealers.body.length !== 2 || agentDealers.body.some((d) => d.country_agent_id !== agent.id)) {
  throw new Error(`Agent Dealer scope invalid: ${JSON.stringify(agentDealers.body)}`);
}

one(await rest(`dealers?id=eq.${dealerOne.id}&select=id,status`, dealerToken), "Dealer own row");
const otherDealer = await rest(`dealers?id=eq.${dealerTwo.id}&select=id`, dealerToken);
if (!otherDealer.response.ok || otherDealer.body.length !== 0) throw new Error("Dealer read another Dealer.");

const dealerCenters = await rest("installation_centers?select=id,dealer_id", dealerToken);
if (!dealerCenters.response.ok || dealerCenters.body.length !== 1 || dealerCenters.body[0].id !== centerOne.id) {
  throw new Error(`Dealer Center scope invalid: ${JSON.stringify(dealerCenters.body)}`);
}

one(await rest(`installation_centers?id=eq.${centerOne.id}&select=id,status`, centerToken), "Center own row");
const otherCenter = await rest(`installation_centers?id=eq.${centerTwo.id}&select=id`, centerToken);
if (!otherCenter.response.ok || otherCenter.body.length !== 0) throw new Error("Center read another Center.");

console.log("Operational Agent/Dealer/Center lifecycle regression smoke test passed.");
