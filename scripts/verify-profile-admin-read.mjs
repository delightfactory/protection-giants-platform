const apiUrl = process.env.API_URL;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
const anonKey = process.env.ANON_KEY;

if (!apiUrl || !serviceRoleKey || !anonKey) {
  throw new Error("Local Supabase API_URL, SERVICE_ROLE_KEY and ANON_KEY are required.");
}

const testPassword = "Profile-Read-Test-2026!";

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

async function createOperationalUser({ email, displayName, role, dealerId }) {
  const result = await request("/auth/v1/admin/users", {
    method: "POST",
    key: serviceRoleKey,
    token: serviceRoleKey,
    body: {
      email,
      password: testPassword,
      email_confirm: true,
      app_metadata: {
        pg_provisioning: {
          version: "operational-v1",
          role,
          ...(dealerId ? { dealer_id: dealerId } : {}),
        },
      },
      user_metadata: {
        display_name: displayName,
      },
    },
  });

  if (!result.response.ok || !result.body?.id) {
    throw new Error(`Operational user creation failed (${result.response.status}): ${JSON.stringify(result.body)}`);
  }

  return result.body;
}

async function signIn(email) {
  const result = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email, password: testPassword },
    token: anonKey,
  });

  if (!result.response.ok || !result.body?.access_token) {
    throw new Error(`Sign-in failed (${result.response.status}): ${JSON.stringify(result.body)}`);
  }

  return result.body.access_token;
}

async function readSelectedProfiles(accessToken, ids) {
  const filter = `in.(${ids.join(",")})`;
  const result = await request(
    `/rest/v1/profiles?select=id,role,status&id=${encodeURIComponent(filter)}`,
    { token: accessToken },
  );

  if (!result.response.ok || !Array.isArray(result.body)) {
    throw new Error(`Profile RLS read failed (${result.response.status}): ${JSON.stringify(result.body)}`);
  }

  return result.body;
}

const dealerResult = await request("/rest/v1/dealers", {
  method: "POST",
  key: serviceRoleKey,
  token: serviceRoleKey,
  headers: { Prefer: "return=representation" },
  body: {
    code: "CI-USER-READ",
    name: "وكيل اختبار قراءة المستخدمين",
    country_code: "EG",
    status: "active",
  },
});

if (!dealerResult.response.ok || !Array.isArray(dealerResult.body) || !dealerResult.body[0]?.id) {
  throw new Error(`Dealer setup failed (${dealerResult.response.status}): ${JSON.stringify(dealerResult.body)}`);
}

const dealerId = dealerResult.body[0].id;
const adminEmail = "profile-read-admin@example.test";
const dealerEmail = "profile-read-dealer@example.test";

const adminUser = await createOperationalUser({
  email: adminEmail,
  displayName: "مسؤول اختبار قراءة الحسابات",
  role: "admin",
});

const dealerUser = await createOperationalUser({
  email: dealerEmail,
  displayName: "مستخدم وكيل اختبار القراءة",
  role: "dealer",
  dealerId,
});

const ids = [adminUser.id, dealerUser.id];
const adminToken = await signIn(adminEmail);
const adminProfiles = await readSelectedProfiles(adminToken, ids);

if (adminProfiles.length !== 2 || !ids.every((id) => adminProfiles.some((profile) => profile.id === id))) {
  throw new Error(`Active admin did not receive the expected profile read scope: ${JSON.stringify(adminProfiles)}`);
}

const dealerToken = await signIn(dealerEmail);
const dealerProfiles = await readSelectedProfiles(dealerToken, ids);

if (
  dealerProfiles.length !== 1 ||
  dealerProfiles[0]?.id !== dealerUser.id ||
  dealerProfiles[0]?.role !== "dealer"
) {
  throw new Error(`Dealer profile scope exceeded own-profile access: ${JSON.stringify(dealerProfiles)}`);
}

console.log("Profile admin-read RLS smoke test passed.");
