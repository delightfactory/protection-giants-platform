const apiUrl = process.env.API_URL;
const anonKey = process.env.ANON_KEY;

if (!apiUrl || !anonKey) {
  throw new Error("Local Supabase API_URL and ANON_KEY are required.");
}

const password = "Operational-Entities-Test-2026!";

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function signIn(email) {
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

const adminToken = await signIn("entities-admin@example.test");
const dealerToken = await signIn("entities-dealer@example.test");
const centerToken = await signIn("entities-center@example.test");

const dealer = expectOne(
  await rest("dealers?code=eq.ENTITY-D1&select=id,status", adminToken),
  "Entity access dealer fixture lookup",
);
const center = expectOne(
  await rest("installation_centers?code=eq.ENTITY-C1&select=id,dealer_id,status", adminToken),
  "Entity access center fixture lookup",
);

expectOne(
  await rest(`dealers?id=eq.${encodeURIComponent(dealer.id)}&select=id,status`, dealerToken),
  "Active dealer own-row read",
);
expectOne(
  await rest(`installation_centers?id=eq.${encodeURIComponent(center.id)}&select=id,dealer_id,status`, centerToken),
  "Active center own-row read",
);

expectOne(
  await rest(`dealers?id=eq.${encodeURIComponent(dealer.id)}&select=id,status`, adminToken, {
    method: "PATCH",
    body: { status: "suspended" },
  }),
  "Dealer suspension for entity access gate",
);

expectNoRows(
  await rest(`dealers?id=eq.${encodeURIComponent(dealer.id)}&select=id,status`, dealerToken),
  "Suspended dealer own-row read",
);
expectNoRows(
  await rest(`installation_centers?dealer_id=eq.${encodeURIComponent(dealer.id)}&select=id,dealer_id,status`, dealerToken),
  "Suspended dealer center-scope read",
);

// Deferred business rule: suspending the parent dealer does not automatically suspend a separately active center account.
expectOne(
  await rest(`installation_centers?id=eq.${encodeURIComponent(center.id)}&select=id,dealer_id,status`, centerToken),
  "Active center read while parent dealer is suspended",
);

expectOne(
  await rest(`dealers?id=eq.${encodeURIComponent(dealer.id)}&select=id,status`, adminToken, {
    method: "PATCH",
    body: { status: "active" },
  }),
  "Dealer reactivation for entity access gate",
);

expectOne(
  await rest(`installation_centers?id=eq.${encodeURIComponent(center.id)}&select=id,status`, adminToken, {
    method: "PATCH",
    body: { status: "suspended" },
  }),
  "Center suspension for entity access gate",
);

expectNoRows(
  await rest(`installation_centers?id=eq.${encodeURIComponent(center.id)}&select=id,dealer_id,status`, centerToken),
  "Suspended center own-row read",
);

expectOne(
  await rest(`installation_centers?id=eq.${encodeURIComponent(center.id)}&select=id,status`, adminToken, {
    method: "PATCH",
    body: { status: "active" },
  }),
  "Center reactivation for entity access gate",
);

expectOne(
  await rest(`dealers?id=eq.${encodeURIComponent(dealer.id)}&select=id,status`, dealerToken),
  "Reactivated dealer own-row read",
);
expectOne(
  await rest(`installation_centers?id=eq.${encodeURIComponent(center.id)}&select=id,dealer_id,status`, centerToken),
  "Reactivated center own-row read",
);

console.log("Operational entity status access smoke test passed.");
