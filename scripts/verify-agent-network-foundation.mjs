const apiUrl = process.env.API_URL;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
const anonKey = process.env.ANON_KEY;

if (!apiUrl || !serviceRoleKey || !anonKey) {
  throw new Error("Local Supabase API_URL, SERVICE_ROLE_KEY and ANON_KEY are required.");
}

const password = "Agent-Network-Foundation-2026!";
const transferPattern = /^PG-[PADC]-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;

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

async function adminCreateUser({ email, role, countryAgentId = null, dealerId = null, centerId = null }) {
  return request("/auth/v1/admin/users", {
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
      user_metadata: { display_name: `Network ${role}` },
    },
  });
}

async function createUser(input) {
  const result = await adminCreateUser(input);
  if (!result.response.ok || !result.body?.id) {
    throw new Error(`Could not create ${input.role} user: ${result.response.status} ${JSON.stringify(result.body)}`);
  }
  return result.body;
}

async function signIn(email) {
  const result = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email, password },
  });
  if (!result.response.ok || !result.body?.access_token) {
    throw new Error(`Could not sign in ${email}: ${result.response.status} ${JSON.stringify(result.body)}`);
  }
  return result.body.access_token;
}

async function rest(path, token, options = {}) {
  return request(`/rest/v1/${path}`, { ...options, token });
}

function one(result, label) {
  if (!result.response.ok || !Array.isArray(result.body) || result.body.length !== 1) {
    throw new Error(`${label}: ${result.response.status} ${JSON.stringify(result.body)}`);
  }
  return result.body[0];
}

function none(result, label) {
  if (!result.response.ok || !Array.isArray(result.body) || result.body.length !== 0) {
    throw new Error(`${label} unexpectedly returned data: ${result.response.status} ${JSON.stringify(result.body)}`);
  }
}

await createUser({ email: "network-admin@example.test", role: "admin" });
const adminToken = await signIn("network-admin@example.test");

const agentA = one(await rest("country_agents?select=id,code,name,country_code,status", adminToken, {
  method: "POST", prefer: true,
  body: { code: "NET-A-EG", name: "Egypt Network Agent", country_code: "EG" },
}), "Admin creates Agent A");
const agentB = one(await rest("country_agents?select=id,code,name,country_code,status", adminToken, {
  method: "POST", prefer: true,
  body: { code: "NET-A-SA", name: "Saudi Network Agent", country_code: "SA" },
}), "Admin creates Agent B");

const invalidAgentUser = await adminCreateUser({ email: "network-invalid-agent@example.test", role: "agent" });
if (invalidAgentUser.response.ok) throw new Error("Agent user unexpectedly provisioned without Country Agent binding.");

await createUser({ email: "network-agent-a@example.test", role: "agent", countryAgentId: agentA.id });
await createUser({ email: "network-agent-b@example.test", role: "agent", countryAgentId: agentB.id });
const agentAToken = await signIn("network-agent-a@example.test");
const agentBToken = await signIn("network-agent-b@example.test");

one(await rest(`country_agents?id=eq.${agentA.id}&select=id,code,status`, agentAToken), "Agent A reads own Agent");
none(await rest(`country_agents?id=eq.${agentB.id}&select=id,code,status`, agentAToken), "Agent A reads Agent B");

const dealerA = one(await rest("dealers?select=id,code,country_code,country_agent_id,status", agentAToken, {
  method: "POST", prefer: true,
  body: { code: "NET-D-EG", name: "Egypt Network Dealer", country_code: "EG", country_agent_id: agentA.id },
}), "Agent A creates own Dealer");

const crossDealerCreate = await rest("dealers?select=id", agentAToken, {
  method: "POST", prefer: true,
  body: { code: "NET-D-BLOCK", name: "Blocked Dealer", country_code: "SA", country_agent_id: agentB.id },
});
if (crossDealerCreate.response.ok) throw new Error("Agent A unexpectedly created a Dealer inside Agent B network.");

const dealerB = one(await rest("dealers?select=id,code,country_code,country_agent_id,status", agentBToken, {
  method: "POST", prefer: true,
  body: { code: "NET-D-SA", name: "Saudi Network Dealer", country_code: "SA", country_agent_id: agentB.id },
}), "Agent B creates own Dealer");

await createUser({ email: "network-dealer-a@example.test", role: "dealer", dealerId: dealerA.id });
const dealerAToken = await signIn("network-dealer-a@example.test");

const directCenter = one(await rest("installation_centers?select=id,code,country_code,dealer_id,country_agent_id,status", agentAToken, {
  method: "POST", prefer: true,
  body: {
    code: "NET-C-DIRECT",
    name: "Direct Agent Center",
    country_code: "EG",
    city: "Cairo",
    country_agent_id: agentA.id,
  },
}), "Agent creates direct Center");

const dealerCenter = one(await rest("installation_centers?select=id,code,country_code,dealer_id,country_agent_id,status", agentAToken, {
  method: "POST", prefer: true,
  body: {
    code: "NET-C-DEALER",
    name: "Agent Dealer Center",
    country_code: "EG",
    city: "Tanta",
    dealer_id: dealerA.id,
  },
}), "Agent creates Center under own Dealer");

const dealerCreatedCenter = one(await rest("installation_centers?select=id,code,country_code,dealer_id,country_agent_id,status", dealerAToken, {
  method: "POST", prefer: true,
  body: {
    code: "NET-C-DSELF",
    name: "Dealer Created Center",
    country_code: "EG",
    city: "Giza",
    dealer_id: dealerA.id,
  },
}), "Dealer creates own Center");

const dealerDirectCreate = await rest("installation_centers?select=id", dealerAToken, {
  method: "POST", prefer: true,
  body: {
    code: "NET-C-BLOCK1",
    name: "Blocked Direct Center",
    country_code: "EG",
    city: "Cairo",
    country_agent_id: agentA.id,
  },
});
if (dealerDirectCreate.response.ok) throw new Error("Dealer unexpectedly created a direct-Agent Center.");

const dealerCrossCreate = await rest("installation_centers?select=id", dealerAToken, {
  method: "POST", prefer: true,
  body: {
    code: "NET-C-BLOCK2",
    name: "Blocked Cross Center",
    country_code: "SA",
    city: "Riyadh",
    dealer_id: dealerB.id,
  },
});
if (dealerCrossCreate.response.ok) throw new Error("Dealer unexpectedly created a Center for another Dealer.");

const reparented = one(await rest(`installation_centers?id=eq.${dealerCenter.id}&select=id,dealer_id,country_agent_id,country_code`, agentAToken, {
  method: "PATCH", prefer: true,
  body: { dealer_id: null, country_agent_id: agentA.id },
}), "Agent reassigns Center inside own network");
if (reparented.dealer_id !== null || reparented.country_agent_id !== agentA.id) {
  throw new Error(`In-network Center reassignment failed: ${JSON.stringify(reparented)}`);
}

const agentADealerRows = await rest("dealers?select=id,country_agent_id", agentAToken);
if (!agentADealerRows.response.ok || agentADealerRows.body.length !== 1 || agentADealerRows.body[0].id !== dealerA.id) {
  throw new Error(`Agent A Dealer visibility leaked across networks: ${JSON.stringify(agentADealerRows.body)}`);
}
const agentACenters = await rest("installation_centers?select=id,dealer_id,country_agent_id", agentAToken);
if (!agentACenters.response.ok || agentACenters.body.length !== 3) {
  throw new Error(`Agent A Center visibility is incorrect: ${JSON.stringify(agentACenters.body)}`);
}

const dealerAVisibleCenters = await rest("installation_centers?select=id,dealer_id,country_agent_id", dealerAToken);
if (
  !dealerAVisibleCenters.response.ok ||
  dealerAVisibleCenters.body.length !== 1 ||
  dealerAVisibleCenters.body[0].id !== dealerCreatedCenter.id
) {
  throw new Error(`Dealer scope is incorrect after Agent reassignment: ${JSON.stringify(dealerAVisibleCenters.body)}`);
}

const parties = await rest("operational_parties?select=id,party_type,country_agent_id,dealer_id,installation_center_id,transfer_code", adminToken);
if (!parties.response.ok || !Array.isArray(parties.body)) {
  throw new Error(`Admin could not read operational parties: ${JSON.stringify(parties.body)}`);
}
const companyParties = parties.body.filter((party) => party.party_type === "company");
if (companyParties.length !== 1) throw new Error(`Expected one Company party, found ${companyParties.length}.`);
const transferCodes = parties.body.map((party) => party.transfer_code);
if (transferCodes.some((code) => !transferPattern.test(code))) {
  throw new Error(`Invalid Transfer ID format found: ${JSON.stringify(transferCodes)}`);
}
if (new Set(transferCodes).size !== transferCodes.length) throw new Error("Transfer IDs are not globally unique.");

for (const [type, id, field] of [
  ["agent", agentA.id, "country_agent_id"],
  ["agent", agentB.id, "country_agent_id"],
  ["dealer", dealerA.id, "dealer_id"],
  ["dealer", dealerB.id, "dealer_id"],
  ["center", directCenter.id, "installation_center_id"],
  ["center", dealerCenter.id, "installation_center_id"],
  ["center", dealerCreatedCenter.id, "installation_center_id"],
]) {
  const matches = parties.body.filter((party) => party.party_type === type && party[field] === id);
  if (matches.length !== 1) throw new Error(`Entity ${id} does not have exactly one ${type} party.`);
}

const agentBParty = parties.body.find((party) => party.country_agent_id === agentB.id);
if (!agentBParty) throw new Error("Agent B party was not generated.");

const ordinaryPartyBrowse = await rest(`operational_parties?country_agent_id=eq.${agentB.id}&select=id,transfer_code`, agentAToken);
none(ordinaryPartyBrowse, "Agent A browses Agent B party");

const resolvedCrossNetwork = one(await rest("rpc/resolve_transfer_recipient", agentAToken, {
  method: "POST",
  body: { p_transfer_code: agentBParty.transfer_code },
}), "Exact cross-network Transfer ID resolver");
if (
  resolvedCrossNetwork.party_id !== agentBParty.id ||
  resolvedCrossNetwork.entity_type !== "agent" ||
  resolvedCrossNetwork.display_name !== agentB.name ||
  resolvedCrossNetwork.country_code !== "SA"
) {
  throw new Error(`Resolver returned an unexpected minimal card: ${JSON.stringify(resolvedCrossNetwork)}`);
}

none(await rest("rpc/resolve_transfer_recipient", agentAToken, {
  method: "POST",
  body: { p_transfer_code: agentBParty.transfer_code.slice(0, 8) },
}), "Partial Transfer ID resolver");
none(await rest("rpc/resolve_transfer_recipient", agentAToken, {
  method: "POST",
  body: { p_transfer_code: "PG-A-AAAA-AAAA-AAAA" },
}), "Invalid exact Transfer ID resolver");

const partyMutation = await rest(`operational_parties?id=eq.${agentBParty.id}`, adminToken, {
  method: "PATCH", prefer: true,
  body: { transfer_code: "PG-A-AAAA-AAAA-AAAB" },
});
if (partyMutation.response.ok) throw new Error("Operational Party Transfer ID unexpectedly allowed Data API mutation.");

one(await rest(`country_agents?id=eq.${agentB.id}&select=id,status`, adminToken, {
  method: "PATCH", prefer: true,
  body: { status: "suspended" },
}), "Admin suspends Agent B");

none(await rest("rpc/resolve_transfer_recipient", agentAToken, {
  method: "POST",
  body: { p_transfer_code: agentBParty.transfer_code },
}), "Suspended recipient resolver");
none(await rest(`country_agents?id=eq.${agentB.id}&select=id,status`, agentBToken), "Suspended Agent own access");

const childAfterAgentSuspension = one(
  await rest(`dealers?id=eq.${dealerB.id}&select=id,status,country_agent_id`, adminToken),
  "Dealer remains independently active after Agent suspension",
);
if (childAfterAgentSuspension.status !== "active") throw new Error("Agent suspension cascaded to Dealer status.");

console.log("Agent & Network Foundation database/RLS/Transfer ID verification passed.");
