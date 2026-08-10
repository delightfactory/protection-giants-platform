const apiUrl = process.env.API_URL;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
const anonKey = process.env.ANON_KEY;

if (!apiUrl || !serviceRoleKey || !anonKey) {
  throw new Error("Local Supabase API_URL, SERVICE_ROLE_KEY and ANON_KEY are required.");
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

async function adminCreateUser({ email, password, role, displayName, dealerId, centerId }) {
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
          ...(dealerId ? { dealer_id: dealerId } : {}),
          ...(centerId ? { installation_center_id: centerId } : {}),
        },
      },
      user_metadata: { display_name: displayName },
    },
  });

  if (!result.response.ok || !result.body?.id) {
    throw new Error(`Operational user create failed (${result.response.status}): ${JSON.stringify(result.body)}`);
  }

  return result.body;
}

async function signIn(email, password, shouldSucceed = true) {
  const result = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    token: anonKey,
    body: { email, password },
  });

  if (shouldSucceed && (!result.response.ok || !result.body?.access_token)) {
    throw new Error(`Expected sign-in success (${result.response.status}): ${JSON.stringify(result.body)}`);
  }

  if (!shouldSucceed && result.response.ok) {
    throw new Error(`Expected sign-in rejection but received success: ${JSON.stringify(result.body)}`);
  }

  return result;
}

async function createEntity(path, body, accessToken) {
  const result = await request(path, {
    method: "POST",
    token: accessToken,
    headers: { Prefer: "return=representation" },
    body,
  });

  if (!result.response.ok || !Array.isArray(result.body) || !result.body[0]?.id) {
    throw new Error(`Authenticated admin entity setup failed (${result.response.status}): ${JSON.stringify(result.body)}`);
  }

  return result.body[0];
}

async function readProfile(userId) {
  const result = await request(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,display_name,role,status,phone,dealer_id,installation_center_id`,
    { key: serviceRoleKey, token: serviceRoleKey },
  );

  if (!result.response.ok || !Array.isArray(result.body) || result.body.length !== 1) {
    throw new Error(`Profile read failed (${result.response.status}): ${JSON.stringify(result.body)}`);
  }

  return result.body[0];
}

const adminEmail = "user-lifecycle-admin@example.test";
const adminPassword = "User-Lifecycle-Admin-2026!";
await adminCreateUser({
  email: adminEmail,
  password: adminPassword,
  role: "admin",
  displayName: "مسؤول تجهيز دورة المستخدم",
});
const adminSession = await signIn(adminEmail, adminPassword, true);
const adminToken = adminSession.body.access_token;

const dealer = await createEntity("/rest/v1/dealers", {
  code: "CI-USER-LIFECYCLE-DEALER",
  name: "وكيل اختبار دورة المستخدم",
  country_code: "EG",
  status: "active",
}, adminToken);

const center = await createEntity("/rest/v1/installation_centers", {
  code: "CI-USER-LIFECYCLE-CENTER",
  name: "مركز اختبار دورة المستخدم",
  dealer_id: dealer.id,
  country_code: "EG",
  city: "Tanta",
  status: "active",
}, adminToken);

const originalEmail = "user-lifecycle-center@example.test";
const changedEmail = "user-lifecycle-center-updated@example.test";
const originalPassword = "User-Lifecycle-Original-2026!";
const changedPassword = "User-Lifecycle-Changed-2026!";

const createdUser = await adminCreateUser({
  email: originalEmail,
  password: originalPassword,
  role: "center",
  displayName: "مستخدم دورة الحسابات",
  centerId: center.id,
});

const userId = createdUser.id;
let profile = await readProfile(userId);

if (
  profile.role !== "center" ||
  profile.installation_center_id !== center.id ||
  profile.dealer_id !== null ||
  profile.status !== "active"
) {
  throw new Error(`Initial operational profile is invalid: ${JSON.stringify(profile)}`);
}

const profileUpdate = await request(`/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
  method: "PATCH",
  key: serviceRoleKey,
  token: serviceRoleKey,
  headers: { Prefer: "return=representation" },
  body: {
    display_name: "مستخدم دورة الحسابات بعد التعديل",
    phone: "+201000000100",
    role: "dealer",
    dealer_id: dealer.id,
    installation_center_id: null,
  },
});

if (!profileUpdate.response.ok) {
  throw new Error(`Valid profile update failed (${profileUpdate.response.status}): ${JSON.stringify(profileUpdate.body)}`);
}

profile = await readProfile(userId);
if (profile.role !== "dealer" || profile.dealer_id !== dealer.id || profile.installation_center_id !== null) {
  throw new Error(`Role/entity update did not persist correctly: ${JSON.stringify(profile)}`);
}

const invalidBinding = await request(`/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
  method: "PATCH",
  key: serviceRoleKey,
  token: serviceRoleKey,
  headers: { Prefer: "return=representation" },
  body: {
    role: "center",
    dealer_id: dealer.id,
    installation_center_id: null,
  },
});

if (invalidBinding.response.ok) {
  throw new Error("Invalid role/entity binding unexpectedly passed the database constraint.");
}

profile = await readProfile(userId);
if (profile.role !== "dealer" || profile.dealer_id !== dealer.id) {
  throw new Error(`Rejected binding update changed the stored profile: ${JSON.stringify(profile)}`);
}

const authUpdate = await request(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
  method: "PUT",
  key: serviceRoleKey,
  token: serviceRoleKey,
  body: {
    email: changedEmail,
    email_confirm: true,
    password: changedPassword,
  },
});

if (!authUpdate.response.ok || authUpdate.body?.email !== changedEmail) {
  throw new Error(`Auth email/password update failed (${authUpdate.response.status}): ${JSON.stringify(authUpdate.body)}`);
}

await signIn(changedEmail, changedPassword, true);
await signIn(originalEmail, originalPassword, false);

const banResult = await request(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
  method: "PUT",
  key: serviceRoleKey,
  token: serviceRoleKey,
  body: { ban_duration: "876000h" },
});

if (!banResult.response.ok) {
  throw new Error(`Auth suspension failed (${banResult.response.status}): ${JSON.stringify(banResult.body)}`);
}

const profileSuspend = await request(`/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
  method: "PATCH",
  key: serviceRoleKey,
  token: serviceRoleKey,
  headers: { Prefer: "return=representation" },
  body: { status: "suspended" },
});

if (!profileSuspend.response.ok) {
  throw new Error(`Profile suspension failed (${profileSuspend.response.status}): ${JSON.stringify(profileSuspend.body)}`);
}

await signIn(changedEmail, changedPassword, false);
profile = await readProfile(userId);
if (profile.status !== "suspended") {
  throw new Error(`Profile suspension did not persist: ${JSON.stringify(profile)}`);
}

const unbanResult = await request(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
  method: "PUT",
  key: serviceRoleKey,
  token: serviceRoleKey,
  body: { ban_duration: "none" },
});

if (!unbanResult.response.ok) {
  throw new Error(`Auth reactivation failed (${unbanResult.response.status}): ${JSON.stringify(unbanResult.body)}`);
}

const profileReactivate = await request(`/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
  method: "PATCH",
  key: serviceRoleKey,
  token: serviceRoleKey,
  headers: { Prefer: "return=representation" },
  body: { status: "active" },
});

if (!profileReactivate.response.ok) {
  throw new Error(`Profile reactivation failed (${profileReactivate.response.status}): ${JSON.stringify(profileReactivate.body)}`);
}

await signIn(changedEmail, changedPassword, true);
profile = await readProfile(userId);
if (profile.status !== "active") {
  throw new Error(`Profile reactivation did not persist: ${JSON.stringify(profile)}`);
}

console.log("Operational user lifecycle smoke test passed.");
