const apiUrl = process.env.API_URL;
const anonKey = process.env.ANON_KEY;

if (!apiUrl || !anonKey) {
  throw new Error("Local Supabase API_URL and ANON_KEY are required.");
}

const productPassword = "Product-Foundation-Test-2026!";
const agentPassword = "Agent-Network-Foundation-2026!";

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function signIn(email, password = productPassword) {
  const response = await fetch(`${apiUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  const body = await readJson(response);
  if (!response.ok || !body?.access_token) {
    throw new Error(`Could not sign in ${email} (${response.status}): ${JSON.stringify(body)}`);
  }
  return body.access_token;
}

async function rest(path, token, { method = "GET", body = undefined } = {}) {
  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${token}`,
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

function expectOne(result, label) {
  if (!result.response.ok || !Array.isArray(result.body) || result.body.length !== 1) {
    throw new Error(`${label} failed (${result.response.status}): ${JSON.stringify(result.body)}`);
  }
  return result.body[0];
}

function expectNoRows(result, label) {
  if (!result.response.ok || !Array.isArray(result.body) || result.body.length !== 0) {
    throw new Error(`${label} unexpectedly returned data (${result.response.status}): ${JSON.stringify(result.body)}`);
  }
}

const adminToken = await signIn("product-foundation-admin@example.test");
const agentToken = await signIn("network-agent-a@example.test", agentPassword);
const dealerToken = await signIn("product-foundation-dealer@example.test");
const centerToken = await signIn("product-foundation-center@example.test");

const product = expectOne(
  await rest("products?code=eq.PG-AI-PRO&select=id,code", adminToken),
  "Product fixture lookup",
);
const agent = expectOne(
  await rest("country_agents?code=eq.NET-A-EG&select=id,status", adminToken),
  "Agent fixture lookup",
);
const dealer = expectOne(
  await rest("dealers?code=eq.PF-DEALER&select=id,status", adminToken),
  "Dealer fixture lookup",
);
const center = expectOne(
  await rest("installation_centers?code=eq.PF-CENTER&select=id,status", adminToken),
  "Center fixture lookup",
);

expectOne(
  await rest(`products?id=eq.${encodeURIComponent(product.id)}&select=id,code`, agentToken),
  "Active Agent Product read",
);
expectOne(
  await rest(`products?id=eq.${encodeURIComponent(product.id)}&select=id,code`, dealerToken),
  "Active dealer Product read",
);
expectOne(
  await rest(`products?id=eq.${encodeURIComponent(product.id)}&select=id,code`, centerToken),
  "Active center Product read",
);

expectOne(
  await rest(`country_agents?id=eq.${encodeURIComponent(agent.id)}&select=id,status`, adminToken, {
    method: "PATCH",
    body: { status: "suspended" },
  }),
  "Agent suspension for Product access gate",
);
expectNoRows(
  await rest(`products?id=eq.${encodeURIComponent(product.id)}&select=id,code`, agentToken),
  "Suspended Agent Product read",
);
expectOne(
  await rest(`country_agents?id=eq.${encodeURIComponent(agent.id)}&select=id,status`, adminToken, {
    method: "PATCH",
    body: { status: "active" },
  }),
  "Agent reactivation for Product access gate",
);
expectOne(
  await rest(`products?id=eq.${encodeURIComponent(product.id)}&select=id,code`, agentToken),
  "Reactivated Agent Product read",
);

expectOne(
  await rest(`dealers?id=eq.${encodeURIComponent(dealer.id)}&select=id,status`, adminToken, {
    method: "PATCH",
    body: { status: "suspended" },
  }),
  "Dealer suspension for Product access gate",
);

expectNoRows(
  await rest(`products?id=eq.${encodeURIComponent(product.id)}&select=id,code`, dealerToken),
  "Suspended dealer Product read",
);

expectOne(
  await rest(`dealers?id=eq.${encodeURIComponent(dealer.id)}&select=id,status`, adminToken, {
    method: "PATCH",
    body: { status: "active" },
  }),
  "Dealer reactivation for Product access gate",
);

expectOne(
  await rest(`products?id=eq.${encodeURIComponent(product.id)}&select=id,code`, dealerToken),
  "Reactivated dealer Product read",
);

expectOne(
  await rest(`installation_centers?id=eq.${encodeURIComponent(center.id)}&select=id,status`, adminToken, {
    method: "PATCH",
    body: { status: "suspended" },
  }),
  "Center suspension for Product access gate",
);

expectNoRows(
  await rest(`products?id=eq.${encodeURIComponent(product.id)}&select=id,code`, centerToken),
  "Suspended center Product read",
);

expectOne(
  await rest(`installation_centers?id=eq.${encodeURIComponent(center.id)}&select=id,status`, adminToken, {
    method: "PATCH",
    body: { status: "active" },
  }),
  "Center reactivation for Product access gate",
);

expectOne(
  await rest(`products?id=eq.${encodeURIComponent(product.id)}&select=id,code`, centerToken),
  "Reactivated center Product read",
);

console.log("Product operational binding access smoke test passed for Agent/Dealer/Center.");
