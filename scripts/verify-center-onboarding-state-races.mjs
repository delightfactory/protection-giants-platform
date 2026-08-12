const apiUrl = process.env.API_URL;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
const anonKey = process.env.ANON_KEY;

if (!apiUrl || !serviceRoleKey || !anonKey) {
  throw new Error("Local Supabase API_URL, SERVICE_ROLE_KEY and ANON_KEY are required.");
}

const password = "Center-Onboarding-Race-2026!";

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

async function rest(path, { token = serviceRoleKey, key = serviceRoleKey, ...options } = {}) {
  return request(`/rest/v1/${path}`, { ...options, token, key });
}

function one(result, label) {
  if (!result.response.ok || !Array.isArray(result.body) || result.body.length !== 1) {
    throw new Error(`${label}: ${result.response.status} ${JSON.stringify(result.body)}`);
  }
  return result.body[0];
}

function none(result, label) {
  if (!result.response.ok || !Array.isArray(result.body) || result.body.length !== 0) {
    throw new Error(`${label}: ${result.response.status} ${JSON.stringify(result.body)}`);
  }
}

async function createAdmin() {
  const result = await request("/auth/v1/admin/users", {
    method: "POST",
    key: serviceRoleKey,
    token: serviceRoleKey,
    body: {
      email: "onboarding-race-admin@example.test",
      password,
      email_confirm: true,
      app_metadata: {
        pg_provisioning: {
          version: "operational-v1",
          role: "admin",
          country_agent_id: null,
          dealer_id: null,
          installation_center_id: null,
        },
      },
      user_metadata: { display_name: "Onboarding Race Admin" },
    },
  });

  if (!result.response.ok || !result.body?.id) {
    throw new Error(`Could not create onboarding race Admin: ${result.response.status} ${JSON.stringify(result.body)}`);
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

async function createDirectCenter(adminToken, code, name, city) {
  return one(await rest("installation_centers?select=id,code,name,status", {
    token: adminToken,
    key: anonKey,
    method: "POST",
    prefer: true,
    body: {
      code,
      name,
      country_code: "EG",
      city,
    },
  }), `create ${code}`);
}

const admin = await createAdmin();
const adminToken = await signIn("onboarding-race-admin@example.test");

const primaryCenter = await createDirectCenter(
  adminToken,
  "ONB-RACE-1",
  "Onboarding Race Center One",
  "Cairo",
);

const invitation = one(await rest("center_onboarding_invitations?select=id,installation_center_id,invited_email,status,auth_user_id", {
  method: "POST",
  prefer: true,
  body: {
    installation_center_id: primaryCenter.id,
    invited_email: "onboarding-race-user@example.test",
    invited_by_profile_id: admin.id,
  },
}), "create race invitation");

const inviteResult = await request("/auth/v1/invite", {
  method: "POST",
  key: serviceRoleKey,
  token: serviceRoleKey,
  body: {
    email: invitation.invited_email,
    data: { center_name: primaryCenter.name },
  },
});
if (!inviteResult.response.ok || !inviteResult.body?.id) {
  throw new Error(`Race invite Auth creation failed: ${inviteResult.response.status} ${JSON.stringify(inviteResult.body)}`);
}
const inviteeId = inviteResult.body.id;

one(await rest(`center_onboarding_invitations?id=eq.${invitation.id}&status=eq.pending&select=id,auth_user_id,status`, {
  method: "PATCH",
  prefer: true,
  body: { auth_user_id: inviteeId },
}), "bind race invite Auth user");

const staged = await request(`/auth/v1/admin/users/${inviteeId}`, {
  method: "PUT",
  key: serviceRoleKey,
  token: serviceRoleKey,
  body: {
    password,
    email_confirm: true,
    user_metadata: {
      center_name: primaryCenter.name,
      center_code: primaryCenter.code,
      display_name: "Race Center User",
      phone: "+201000000002",
    },
  },
});
if (!staged.response.ok) {
  throw new Error(`Race user metadata staging failed: ${staged.response.status} ${JSON.stringify(staged.body)}`);
}

const accepted = one(await rest(`center_onboarding_invitations?id=eq.${invitation.id}&auth_user_id=eq.${inviteeId}&status=eq.pending&select=id,status,accepted_at`, {
  method: "PATCH",
  prefer: true,
  body: { status: "accepted", accepted_at: new Date().toISOString() },
}), "claim pending invitation before provisioning");
if (accepted.status !== "accepted" || !accepted.accepted_at) {
  throw new Error(`Invitation claim did not produce accepted state: ${JSON.stringify(accepted)}`);
}

const parallelCenterOpen = await rest("center_onboarding_invitations?select=id", {
  method: "POST",
  prefer: true,
  body: {
    installation_center_id: primaryCenter.id,
    invited_email: "parallel-center@example.test",
    invited_by_profile_id: admin.id,
  },
});
if (parallelCenterOpen.response.ok) {
  throw new Error("Accepted/finalizing invitation did not block another open invitation for the same Center.");
}

const provisioning = await request(`/auth/v1/admin/users/${inviteeId}`, {
  method: "PUT",
  key: serviceRoleKey,
  token: serviceRoleKey,
  body: {
    app_metadata: {
      pg_provisioning: {
        version: "operational-v1",
        role: "center",
        installation_center_id: primaryCenter.id,
      },
    },
  },
});
if (!provisioning.response.ok) {
  throw new Error(`Race protected provisioning failed: ${provisioning.response.status} ${JSON.stringify(provisioning.body)}`);
}

const profile = one(await rest(`profiles?id=eq.${inviteeId}&select=id,display_name,phone,role,status,country_agent_id,dealer_id,installation_center_id`), "verify race Center profile");
if (
  profile.role !== "center" ||
  profile.status !== "active" ||
  profile.installation_center_id !== primaryCenter.id ||
  profile.country_agent_id !== null ||
  profile.dealer_id !== null ||
  profile.display_name !== "Race Center User" ||
  profile.phone !== "+201000000002"
) {
  throw new Error(`Race Center profile is not exact: ${JSON.stringify(profile)}`);
}

const anotherCenter = await createDirectCenter(
  adminToken,
  "ONB-RACE-2",
  "Onboarding Race Center Two",
  "Giza",
);

const acceptedEmailReuse = await rest("center_onboarding_invitations?select=id", {
  method: "POST",
  prefer: true,
  body: {
    installation_center_id: anotherCenter.id,
    invited_email: invitation.invited_email,
    invited_by_profile_id: admin.id,
  },
});
if (acceptedEmailReuse.response.ok) {
  throw new Error("Accepted/finalizing invitation did not block the same email on another open invitation.");
}

const cancelledInvitation = one(await rest("center_onboarding_invitations?select=id,status", {
  method: "POST",
  prefer: true,
  body: {
    installation_center_id: anotherCenter.id,
    invited_email: "cancelled-race@example.test",
    invited_by_profile_id: admin.id,
  },
}), "create cancellable invitation");

one(await rest(`center_onboarding_invitations?id=eq.${cancelledInvitation.id}&status=eq.pending&select=id,status,cancelled_at`, {
  method: "PATCH",
  prefer: true,
  body: { status: "cancelled", cancelled_at: new Date().toISOString() },
}), "cancel race invitation");

none(await rest(`center_onboarding_invitations?id=eq.${cancelledInvitation.id}&status=eq.pending&select=id,status`, {
  method: "PATCH",
  prefer: true,
  body: { status: "accepted", accepted_at: new Date().toISOString() },
}), "cancelled invitation cannot be claimed");

const replacementAfterCancel = one(await rest("center_onboarding_invitations?select=id,status,invited_email", {
  method: "POST",
  prefer: true,
  body: {
    installation_center_id: anotherCenter.id,
    invited_email: "cancelled-race@example.test",
    invited_by_profile_id: admin.id,
  },
}), "closed invitation permits a fresh replacement");

one(await rest(`center_onboarding_invitations?id=eq.${replacementAfterCancel.id}&status=eq.pending&select=id,status,superseded_at`, {
  method: "PATCH",
  prefer: true,
  body: { status: "superseded", superseded_at: new Date().toISOString() },
}), "supersede replacement invitation");

none(await rest(`center_onboarding_invitations?id=eq.${replacementAfterCancel.id}&status=eq.pending&select=id,status`, {
  method: "PATCH",
  prefer: true,
  body: { status: "accepted", accepted_at: new Date().toISOString() },
}), "superseded invitation cannot be claimed");

const authConflictCenter = await createDirectCenter(
  adminToken,
  "ONB-RACE-3",
  "Onboarding Race Center Three",
  "Alexandria",
);
const authConflictInvitation = one(await rest("center_onboarding_invitations?select=id,status,auth_user_id", {
  method: "POST",
  prefer: true,
  body: {
    installation_center_id: authConflictCenter.id,
    invited_email: "auth-conflict-race@example.test",
    invited_by_profile_id: admin.id,
  },
}), "create Auth conflict invitation");

const duplicateOpenAuth = await rest(`center_onboarding_invitations?id=eq.${authConflictInvitation.id}&select=id`, {
  method: "PATCH",
  prefer: true,
  body: { auth_user_id: inviteeId },
});
if (duplicateOpenAuth.response.ok) {
  throw new Error("Accepted/finalizing Auth user unexpectedly bound to another open Center invitation.");
}

console.log("Center onboarding state-transition and race contracts passed.");
