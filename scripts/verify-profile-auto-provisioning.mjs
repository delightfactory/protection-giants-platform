const apiUrl = process.env.API_URL;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
const anonKey = process.env.ANON_KEY;

if (!apiUrl || !serviceRoleKey || !anonKey) {
  throw new Error("Local Supabase API_URL, SERVICE_ROLE_KEY and ANON_KEY are required.");
}

async function readJson(response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function adminCreateUser(payload) {
  const response = await fetch(`${apiUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const body = await readJson(response);

  return { response, body };
}

async function readProfile(userId) {
  const response = await fetch(
    `${apiUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,display_name,role,status,phone,dealer_id,installation_center_id`,
    {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    },
  );
  const body = await readJson(response);

  if (!response.ok) {
    throw new Error(`Profile lookup failed (${response.status}): ${JSON.stringify(body)}`);
  }

  return body;
}

const trustedAdmin = await adminCreateUser({
  email: "profile-trigger-admin@example.test",
  password: "Profile-Trigger-Test-2026!",
  email_confirm: true,
  app_metadata: {
    pg_provisioning: "operational-v1",
  },
  user_metadata: {
    display_name: "مسؤول اختبار المنصة",
    phone: "+201000000001",
    role: "admin",
  },
});

if (!trustedAdmin.response.ok || !trustedAdmin.body?.id) {
  throw new Error(
    `Trusted operational user creation failed (${trustedAdmin.response.status}): ${JSON.stringify(trustedAdmin.body)}`,
  );
}

const trustedProfile = await readProfile(trustedAdmin.body.id);

if (!Array.isArray(trustedProfile) || trustedProfile.length !== 1) {
  throw new Error(`Expected one auto-created profile, received: ${JSON.stringify(trustedProfile)}`);
}

const [profile] = trustedProfile;

if (
  profile.display_name !== "مسؤول اختبار المنصة" ||
  profile.role !== "admin" ||
  profile.status !== "active" ||
  profile.phone !== "+201000000001" ||
  profile.dealer_id !== null ||
  profile.installation_center_id !== null
) {
  throw new Error(`Auto-created profile has unexpected values: ${JSON.stringify(profile)}`);
}

const missingBinding = await adminCreateUser({
  email: "profile-trigger-invalid-dealer@example.test",
  password: "Profile-Trigger-Test-2026!",
  email_confirm: true,
  app_metadata: {
    pg_provisioning: "operational-v1",
  },
  user_metadata: {
    display_name: "وكيل بدون ربط",
    role: "dealer",
  },
});

if (missingBinding.response.ok) {
  throw new Error("Dealer user creation unexpectedly succeeded without a dealer binding.");
}

const publicSignupResponse = await fetch(`${apiUrl}/auth/v1/signup`, {
  method: "POST",
  headers: {
    apikey: anonKey,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    email: "profile-trigger-public-signup@example.test",
    password: "Profile-Trigger-Test-2026!",
    data: {
      display_name: "محاولة تسجيل عام",
      role: "admin",
    },
  }),
});
const publicSignupBody = await readJson(publicSignupResponse);

if (publicSignupResponse.ok) {
  throw new Error(
    `Public signup unexpectedly bypassed operational provisioning: ${JSON.stringify(publicSignupBody)}`,
  );
}

console.log("Profile auto-provisioning smoke test passed.");
