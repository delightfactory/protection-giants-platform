const apiUrl = process.env.API_URL;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
const anonKey = process.env.ANON_KEY;

if (!apiUrl || !serviceRoleKey || !anonKey) {
  throw new Error("Local Supabase API_URL, SERVICE_ROLE_KEY and ANON_KEY are required.");
}

const password = "Cube-K-Preinstall-Issues-2026!";
const bucket = "roll-preinstall-issue-evidence";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function request(path, { method = "GET", token = anonKey, key = anonKey, body } = {}) {
  const headers = { apikey: key, Authorization: `Bearer ${token}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { response, body: await readJson(response) };
}

async function rest(path, token) {
  return request(`/rest/v1/${path}`, { token });
}

async function rpc(name, body, token) {
  return request(`/rest/v1/rpc/${name}`, { method: "POST", token, body });
}

async function createUser({ email, role, agentId = null, dealerId = null }) {
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
          country_agent_id: agentId,
          dealer_id: dealerId,
          installation_center_id: null,
        },
      },
      user_metadata: { display_name: `Cube K boundary ${role}` },
    },
  });
  assert(result.response.ok && result.body?.id,
    `Could not create ${role} boundary user: ${result.response.status} ${JSON.stringify(result.body)}`);
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

const bucketResult = await request(`/storage/v1/bucket/${bucket}`, {
  key: serviceRoleKey,
  token: serviceRoleKey,
});
assert(bucketResult.response.ok && bucketResult.body?.public === false,
  `Cube K evidence bucket must remain private: ${bucketResult.response.status} ${JSON.stringify(bucketResult.body)}`);

const agentResult = await request("/rest/v1/country_agents?code=eq.CUBE-K-AGENT-EG&select=id", {
  key: serviceRoleKey,
  token: serviceRoleKey,
});
const dealerResult = await request("/rest/v1/dealers?code=eq.CUBE-K-DEALER-EG&select=id", {
  key: serviceRoleKey,
  token: serviceRoleKey,
});
assert(agentResult.response.ok && agentResult.body?.length === 1, "Cube K Agent fixture is missing.");
assert(dealerResult.response.ok && dealerResult.body?.length === 1, "Cube K Dealer fixture is missing.");

await createUser({ email: "cube-k-boundary-agent@example.test", role: "agent", agentId: agentResult.body[0].id });
await createUser({ email: "cube-k-boundary-dealer@example.test", role: "dealer", dealerId: dealerResult.body[0].id });
const agentToken = await signIn("cube-k-boundary-agent@example.test");
const dealerToken = await signIn("cube-k-boundary-dealer@example.test");

for (const [role, token] of [["Agent", agentToken], ["Dealer", dealerToken]]) {
  for (const table of ["roll_preinstall_issues", "roll_preinstall_issue_events", "roll_preinstall_issue_evidence"]) {
    const result = await rest(`${table}?select=id&limit=5`, token);
    assert(result.response.ok && Array.isArray(result.body) && result.body.length === 0,
      `${role} must not read ${table}: ${result.response.status} ${JSON.stringify(result.body)}`);
  }

  const list = await rpc("list_roll_preinstall_issues", { p_limit: 10, p_offset: 0 }, token);
  assert(!list.response.ok && list.body?.message === "PG_ROLL_ISSUE_FORBIDDEN",
    `${role} issue-list RPC must be denied: ${list.response.status} ${JSON.stringify(list.body)}`);
}

const clearedIssueResult = await request(
  "/rest/v1/roll_preinstall_issues?status=eq.cleared_for_use&select=id,roll_id,reporting_center_party_id&order=created_at.asc&limit=1",
  { key: serviceRoleKey, token: serviceRoleKey },
);
assert(clearedIssueResult.response.ok && clearedIssueResult.body?.length === 1,
  `Cleared Cube K issue fixture is missing: ${JSON.stringify(clearedIssueResult.body)}`);
const clearedIssue = clearedIssueResult.body[0];
const custodyResult = await request(
  `/rest/v1/roll_custody_current?roll_id=eq.${clearedIssue.roll_id}&select=custodian_party_id`,
  { key: serviceRoleKey, token: serviceRoleKey },
);
assert(custodyResult.response.ok && custodyResult.body?.length === 1,
  `Cleared issue custody fixture is missing: ${JSON.stringify(custodyResult.body)}`);
assert(custodyResult.body[0].custodian_party_id === clearedIssue.reporting_center_party_id,
  "Issue submission and Admin clearance must not move confirmed Roll custody.");

console.log("Cube K role, private Storage and custody boundaries passed.");
