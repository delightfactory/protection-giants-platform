const apiUrl = process.env.API_URL;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
const anonKey = process.env.ANON_KEY;

if (!apiUrl || !serviceRoleKey || !anonKey) {
  throw new Error("Local Supabase API_URL, SERVICE_ROLE_KEY and ANON_KEY are required.");
}

const testPassword = "Data-Api-Grants-2026!";

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function request(path, { method = "GET", key = anonKey, token = key, body, headers = {} } = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  return { response, body: await readJson(response) };
}

async function expectDenied(label, promise) {
  const result = await promise;
  if (result.response.ok) {
    throw new Error(`${label} unexpectedly succeeded: ${JSON.stringify(result.body)}`);
  }
}

for (const table of ["profiles", "products", "dealers", "installation_centers"]) {
  await expectDenied(
    `anon read on ${table}`,
    request(`/rest/v1/${table}?select=*`, { key: anonKey, token: anonKey }),
  );
}

await expectDenied(
  "service_role product read",
  request("/rest/v1/products?select=id", { key: serviceRoleKey, token: serviceRoleKey }),
);

await expectDenied(
  "service_role dealer insert",
  request("/rest/v1/dealers", {
    method: "POST",
    key: serviceRoleKey,
    token: serviceRoleKey,
    headers: { Prefer: "return=representation" },
    body: {
      code: "CI-GRANT-SERVICE-DENIED",
      name: "Service role must not create dealers",
      country_code: "EG",
      status: "active",
    },
  }),
);

const adminEmail = "data-api-grants-admin@example.test";
const adminCreate = await request("/auth/v1/admin/users", {
  method: "POST",
  key: serviceRoleKey,
  token: serviceRoleKey,
  body: {
    email: adminEmail,
    password: testPassword,
    email_confirm: true,
    app_metadata: {
      pg_provisioning: { version: "operational-v1", role: "admin" },
    },
    user_metadata: { display_name: "مسؤول اختبار صلاحيات Data API" },
  },
});

if (!adminCreate.response.ok || !adminCreate.body?.id) {
  throw new Error(`Grant-contract admin creation failed (${adminCreate.response.status}): ${JSON.stringify(adminCreate.body)}`);
}

const adminId = adminCreate.body.id;
const signIn = await request("/auth/v1/token?grant_type=password", {
  method: "POST",
  token: anonKey,
  body: { email: adminEmail, password: testPassword },
});

if (!signIn.response.ok || !signIn.body?.access_token) {
  throw new Error(`Grant-contract admin sign-in failed (${signIn.response.status}): ${JSON.stringify(signIn.body)}`);
}

const adminToken = signIn.body.access_token;
const dealerCreate = await request("/rest/v1/dealers", {
  method: "POST",
  token: adminToken,
  headers: { Prefer: "return=representation" },
  body: {
    code: "CI-GRANT-DEALER",
    name: "وكيل اختبار صلاحيات Data API",
    country_code: "EG",
    status: "active",
  },
});

if (!dealerCreate.response.ok || !dealerCreate.body?.[0]?.id) {
  throw new Error(`Authenticated admin dealer creation failed (${dealerCreate.response.status}): ${JSON.stringify(dealerCreate.body)}`);
}

const dealerId = dealerCreate.body[0].id;
const centerCreate = await request("/rest/v1/installation_centers", {
  method: "POST",
  token: adminToken,
  headers: { Prefer: "return=representation" },
  body: {
    code: "CI-GRANT-CENTER",
    name: "مركز اختبار صلاحيات Data API",
    dealer_id: dealerId,
    country_code: "EG",
    city: "Tanta",
    status: "active",
  },
});

if (!centerCreate.response.ok || !centerCreate.body?.[0]?.id) {
  throw new Error(`Authenticated admin center creation failed (${centerCreate.response.status}): ${JSON.stringify(centerCreate.body)}`);
}

for (const path of [
  `/rest/v1/profiles?id=eq.${encodeURIComponent(adminId)}&select=id,role,status`,
  `/rest/v1/dealers?id=eq.${encodeURIComponent(dealerId)}&select=id,status`,
  `/rest/v1/installation_centers?id=eq.${encodeURIComponent(centerCreate.body[0].id)}&select=id,status`,
]) {
  const result = await request(path, { key: serviceRoleKey, token: serviceRoleKey });
  if (!result.response.ok || !Array.isArray(result.body) || result.body.length !== 1) {
    throw new Error(`Expected service_role read access failed (${result.response.status}): ${JSON.stringify(result.body)}`);
  }
}

const profileUpdate = await request(`/rest/v1/profiles?id=eq.${encodeURIComponent(adminId)}`, {
  method: "PATCH",
  key: serviceRoleKey,
  token: serviceRoleKey,
  headers: { Prefer: "return=representation" },
  body: { phone: "+201000000777" },
});

if (!profileUpdate.response.ok || profileUpdate.body?.[0]?.phone !== "+201000000777") {
  throw new Error(`Expected service_role profile update failed (${profileUpdate.response.status}): ${JSON.stringify(profileUpdate.body)}`);
}

await expectDenied(
  "service_role dealer update",
  request(`/rest/v1/dealers?id=eq.${encodeURIComponent(dealerId)}`, {
    method: "PATCH",
    key: serviceRoleKey,
    token: serviceRoleKey,
    body: { name: "Unexpected service update" },
  }),
);

console.log("Data API explicit-grant contract smoke test passed.");
