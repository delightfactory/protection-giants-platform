const apiUrl = process.env.API_URL;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
const anonKey = process.env.ANON_KEY;

if (!apiUrl || !serviceRoleKey || !anonKey) {
  throw new Error("Local Supabase API_URL, SERVICE_ROLE_KEY and ANON_KEY are required.");
}

const password = "Center-Onboarding-Contract-2026!";

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

async function createOperationalUser({ email, role, countryAgentId = null, dealerId = null }) {
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
          country_agent_id: countryAgentId,
          dealer_id: dealerId,
          installation_center_id: null,
        },
      },
      user_metadata: { display_name: `Onboarding ${role}` },
    },
  });

  if (!result.response.ok || !result.body?.id) {
    throw new Error(`Could not create ${role} fixture: ${result.response.status} ${JSON.stringify(result.body)}`);
  }

  return result.body;
}

async function signIn(email, signInPassword = password) {
  const result = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email, password: signInPassword },
  });

  if (!result.response.ok || !result.body?.access_token) {
    throw new Error(`Could not sign in ${email}: ${result.response.status} ${JSON.stringify(result.body)}`);
  }

  return result.body.access_token;
}

const admin = await createOperationalUser({
  email: "onboarding-admin@example.test",
  role: "admin",
});
const adminToken = await signIn("onboarding-admin@example.test");

const agent = one(await rest("country_agents?select=id,code,country_code,status", {
  token: adminToken,
  key: anonKey,
  method: "POST",
  prefer: true,
  body: {
    code: "ONB-A-EG",
    name: "Onboarding Egypt Agent",
    country_code: "EG",
  },
}), "create onboarding Agent");

const dealer = one(await rest("dealers?select=id,code,country_agent_id,country_code,status", {
  token: adminToken,
  key: anonKey,
  method: "POST",
  prefer: true,
  body: {
    code: "ONB-D-EG",
    name: "Onboarding Dealer",
    country_code: "EG",
    country_agent_id: agent.id,
  },
}), "create onboarding Dealer");

const center = one(await rest("installation_centers?select=id,code,status,dealer_id", {
  token: adminToken,
  key: anonKey,
  method: "POST",
  prefer: true,
  body: {
    code: "ONB-C-1",
    name: "Onboarding Center One",
    country_code: "EG",
    city: "Cairo",
    dealer_id: dealer.id,
  },
}), "create onboarding Center One");

const centerTwo = one(await rest("installation_centers?select=id,code,status,country_agent_id", {
  token: adminToken,
  key: anonKey,
  method: "POST",
  prefer: true,
  body: {
    code: "ONB-C-2",
    name: "Onboarding Center Two",
    country_code: "EG",
    city: "Giza",
    country_agent_id: agent.id,
  },
}), "create onboarding Center Two");

const invitation = one(await rest("center_onboarding_invitations?select=id,installation_center_id,invited_email,auth_user_id,status", {
  method: "POST",
  prefer: true,
  body: {
    installation_center_id: center.id,
    invited_email: "center-invitee@example.test",
    invited_by_profile_id: admin.id,
  },
}), "create pending onboarding invitation");

if (invitation.status !== "pending" || invitation.auth_user_id !== null) {
  throw new Error(`Unexpected initial invitation state: ${JSON.stringify(invitation)}`);
}

const duplicateCenter = await rest("center_onboarding_invitations?select=id", {
  method: "POST",
  prefer: true,
  body: {
    installation_center_id: center.id,
    invited_email: "another-center-user@example.test",
    invited_by_profile_id: admin.id,
  },
});
if (duplicateCenter.response.ok) {
  throw new Error("A Center unexpectedly received two simultaneous pending onboarding invitations.");
}

const duplicateEmail = await rest("center_onboarding_invitations?select=id", {
  method: "POST",
  prefer: true,
  body: {
    installation_center_id: centerTwo.id,
    invited_email: invitation.invited_email,
    invited_by_profile_id: admin.id,
  },
});
if (duplicateEmail.response.ok) {
  throw new Error("The same email unexpectedly received two simultaneous pending onboarding invitations.");
}

const adminDirectRead = await rest("center_onboarding_invitations?select=id", {
  token: adminToken,
  key: anonKey,
});
if (adminDirectRead.response.ok) {
  throw new Error("Operational Admin unexpectedly received direct Data API read access to onboarding invitation audit rows.");
}

const adminDirectWrite = await rest("center_onboarding_invitations?select=id", {
  token: adminToken,
  key: anonKey,
  method: "POST",
  prefer: true,
  body: {
    installation_center_id: centerTwo.id,
    invited_email: "blocked-direct-write@example.test",
    invited_by_profile_id: admin.id,
  },
});
if (adminDirectWrite.response.ok) {
  throw new Error("Operational Admin unexpectedly received direct Data API write access to onboarding invitation audit rows.");
}

const inviteResult = await request("/auth/v1/invite", {
  method: "POST",
  key: serviceRoleKey,
  token: serviceRoleKey,
  body: {
    email: invitation.invited_email,
    data: { center_name: "Onboarding Center One" },
  },
});

if (!inviteResult.response.ok || !inviteResult.body?.id) {
  throw new Error(`Supabase invite creation failed: ${inviteResult.response.status} ${JSON.stringify(inviteResult.body)}`);
}
const inviteeId = inviteResult.body.id;

const boundInvitation = one(await rest(`center_onboarding_invitations?id=eq.${invitation.id}&select=id,auth_user_id,status`, {
  method: "PATCH",
  prefer: true,
  body: { auth_user_id: inviteeId },
}), "bind Auth user to pending invitation");

if (boundInvitation.auth_user_id !== inviteeId || boundInvitation.status !== "pending") {
  throw new Error(`Auth user binding failed: ${JSON.stringify(boundInvitation)}`);
}

none(await rest(`profiles?id=eq.${inviteeId}&select=id,role,installation_center_id`), "invite creates no operational profile before protected provisioning");

const prepareInvitee = await request(`/auth/v1/admin/users/${inviteeId}`, {
  method: "PUT",
  key: serviceRoleKey,
  token: serviceRoleKey,
  body: {
    password,
    email_confirm: true,
    user_metadata: { center_name: "Onboarding Center One" },
  },
});
if (!prepareInvitee.response.ok) {
  throw new Error(`Could not prepare invited Auth user for RLS probe: ${prepareInvitee.response.status} ${JSON.stringify(prepareInvitee.body)}`);
}

const inviteeToken = await signIn(invitation.invited_email);
const inviteeAuditRead = await rest("center_onboarding_invitations?select=id,invited_email", {
  token: inviteeToken,
  key: anonKey,
});
if (inviteeAuditRead.response.ok) {
  throw new Error("Invited Auth user unexpectedly received direct Data API read access to onboarding invitation audit rows.");
}

const inviteeAuditWrite = await rest(`center_onboarding_invitations?id=eq.${invitation.id}&select=id`, {
  token: inviteeToken,
  key: anonKey,
  method: "PATCH",
  prefer: true,
  body: { status: "accepted", accepted_at: new Date().toISOString() },
});
if (inviteeAuditWrite.response.ok) {
  throw new Error("Invited Auth user unexpectedly received direct Data API write access to onboarding invitation audit rows.");
}

none(await rest(`installation_centers?id=eq.${center.id}&select=id`, {
  token: inviteeToken,
  key: anonKey,
}), "unprovisioned invitee cannot browse Center entities");

const duplicateAuthInvitation = one(await rest("center_onboarding_invitations?select=id,auth_user_id,status", {
  method: "POST",
  prefer: true,
  body: {
    installation_center_id: centerTwo.id,
    invited_email: "third-center-user@example.test",
    invited_by_profile_id: admin.id,
  },
}), "create second invitation for Auth binding uniqueness probe");

const duplicateAuthBinding = await rest(`center_onboarding_invitations?id=eq.${duplicateAuthInvitation.id}&select=id`, {
  method: "PATCH",
  prefer: true,
  body: { auth_user_id: inviteeId },
});
if (duplicateAuthBinding.response.ok) {
  throw new Error("One Auth user unexpectedly bound to two simultaneous pending Center invitations.");
}

const provisioningResult = await request(`/auth/v1/admin/users/${inviteeId}`, {
  method: "PUT",
  key: serviceRoleKey,
  token: serviceRoleKey,
  body: {
    password,
    user_metadata: {
      center_name: "Onboarding Center One",
      display_name: "Center Invitee",
      phone: "+201000000001",
    },
    app_metadata: {
      pg_provisioning: {
        version: "operational-v1",
        role: "center",
        installation_center_id: center.id,
      },
    },
  },
});

if (!provisioningResult.response.ok) {
  throw new Error(`Protected onboarding provisioning failed: ${provisioningResult.response.status} ${JSON.stringify(provisioningResult.body)}`);
}

const centerProfile = one(await rest(`profiles?id=eq.${inviteeId}&select=id,display_name,phone,role,status,country_agent_id,dealer_id,installation_center_id`), "protected metadata creates Center profile");
if (
  centerProfile.role !== "center" ||
  centerProfile.status !== "active" ||
  centerProfile.installation_center_id !== center.id ||
  centerProfile.country_agent_id !== null ||
  centerProfile.dealer_id !== null ||
  centerProfile.display_name !== "Center Invitee" ||
  centerProfile.phone !== "+201000000001"
) {
  throw new Error(`Provisioned Center profile is not exact: ${JSON.stringify(centerProfile)}`);
}

const acceptedAt = new Date().toISOString();
const acceptedInvitation = one(await rest(`center_onboarding_invitations?id=eq.${invitation.id}&status=eq.pending&select=id,status,accepted_at,cancelled_at,superseded_at`, {
  method: "PATCH",
  prefer: true,
  body: { status: "accepted", accepted_at: acceptedAt },
}), "accept onboarding invitation audit");
if (
  acceptedInvitation.status !== "accepted" ||
  !acceptedInvitation.accepted_at ||
  acceptedInvitation.cancelled_at !== null ||
  acceptedInvitation.superseded_at !== null
) {
  throw new Error(`Accepted invitation audit is invalid: ${JSON.stringify(acceptedInvitation)}`);
}

const invalidCancel = await rest(`center_onboarding_invitations?id=eq.${duplicateAuthInvitation.id}&select=id`, {
  method: "PATCH",
  prefer: true,
  body: { status: "cancelled" },
});
if (invalidCancel.response.ok) {
  throw new Error("Invitation status changed to cancelled without its required audit timestamp.");
}

one(await rest(`center_onboarding_invitations?id=eq.${duplicateAuthInvitation.id}&select=id,status,cancelled_at`, {
  method: "PATCH",
  prefer: true,
  body: { status: "cancelled", cancelled_at: new Date().toISOString() },
}), "cancel invitation with audit timestamp");

console.log("Center onboarding invitation and protected provisioning contracts passed.");
