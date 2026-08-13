const apiUrl = process.env.API_URL;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
const anonKey = process.env.ANON_KEY;

if (!apiUrl || !serviceRoleKey || !anonKey) {
  throw new Error("Local Supabase API_URL, SERVICE_ROLE_KEY and ANON_KEY are required.");
}

const password = "Center-Onboarding-Review-2026!";

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

async function rest(path, options = {}) {
  return request(`/rest/v1/${path}`, {
    key: serviceRoleKey,
    token: serviceRoleKey,
    ...options,
  });
}

function one(result, label) {
  if (!result.response.ok || !Array.isArray(result.body) || result.body.length !== 1) {
    throw new Error(`${label}: ${result.response.status} ${JSON.stringify(result.body)}`);
  }
  return result.body[0];
}

async function createAdmin() {
  const result = await request("/auth/v1/admin/users", {
    method: "POST",
    key: serviceRoleKey,
    token: serviceRoleKey,
    body: {
      email: "onboarding-review-admin@example.test",
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
      user_metadata: { display_name: "Onboarding Review Admin" },
    },
  });

  if (!result.response.ok || !result.body?.id) {
    throw new Error(`Could not create review Admin: ${result.response.status} ${JSON.stringify(result.body)}`);
  }
  return result.body;
}

async function signIn(email) {
  const result = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email, password },
  });
  if (!result.response.ok || !result.body?.access_token) {
    throw new Error(`Could not sign in review Admin: ${result.response.status} ${JSON.stringify(result.body)}`);
  }
  return result.body.access_token;
}

const admin = await createAdmin();
const adminToken = await signIn("onboarding-review-admin@example.test");

const centerResult = await request("/rest/v1/installation_centers?select=id,code,status", {
  method: "POST",
  key: anonKey,
  token: adminToken,
  prefer: true,
  body: {
    code: "ONB-REVIEW-1",
    name: "Onboarding Review Center",
    country_code: "EG",
    city: "Cairo",
  },
});
const center = one(centerResult, "create review Center");

const invitation = one(await rest("center_onboarding_invitations?select=id,status,accepted_at,review_required_at,failure_code", {
  method: "POST",
  prefer: true,
  body: {
    installation_center_id: center.id,
    invited_email: "onboarding-review-user@example.test",
    invited_by_profile_id: admin.id,
  },
}), "create review invitation");

const illegalPendingMarker = await rest(`center_onboarding_invitations?id=eq.${invitation.id}&select=id`, {
  method: "PATCH",
  prefer: true,
  body: {
    review_required_at: new Date().toISOString(),
    failure_code: "profile-mismatch",
  },
});
if (illegalPendingMarker.response.ok) {
  throw new Error("Pending invitation unexpectedly accepted a review-required marker.");
}

const acceptedAt = new Date().toISOString();
const reviewAt = new Date().toISOString();
const reviewLocked = one(await rest(`center_onboarding_invitations?id=eq.${invitation.id}&status=eq.pending&select=id,status,accepted_at,review_required_at,failure_code`, {
  method: "PATCH",
  prefer: true,
  body: {
    status: "accepted",
    accepted_at: acceptedAt,
    review_required_at: reviewAt,
    failure_code: "profile-mismatch",
  },
}), "mark accepted invitation for review");

if (
  reviewLocked.status !== "accepted" ||
  !reviewLocked.accepted_at ||
  !reviewLocked.review_required_at ||
  reviewLocked.failure_code !== "profile-mismatch"
) {
  throw new Error(`Review marker did not persist correctly: ${JSON.stringify(reviewLocked)}`);
}

const invalidFailureCode = await rest(`center_onboarding_invitations?id=eq.${invitation.id}&select=id`, {
  method: "PATCH",
  prefer: true,
  body: { failure_code: "arbitrary-failure" },
});
if (invalidFailureCode.response.ok) {
  throw new Error("Review marker unexpectedly accepted an arbitrary failure code.");
}

const reopenWithoutClearing = await rest(`center_onboarding_invitations?id=eq.${invitation.id}&select=id`, {
  method: "PATCH",
  prefer: true,
  body: { status: "pending", accepted_at: null },
});
if (reopenWithoutClearing.response.ok) {
  throw new Error("Review-locked invitation reopened without clearing review metadata.");
}

const reopened = one(await rest(`center_onboarding_invitations?id=eq.${invitation.id}&status=eq.accepted&select=id,status,accepted_at,review_required_at,failure_code`, {
  method: "PATCH",
  prefer: true,
  body: {
    status: "pending",
    accepted_at: null,
    review_required_at: null,
    failure_code: null,
  },
}), "reopen review invitation with complete cleanup");

if (
  reopened.status !== "pending" ||
  reopened.accepted_at !== null ||
  reopened.review_required_at !== null ||
  reopened.failure_code !== null
) {
  throw new Error(`Review invitation did not reopen cleanly: ${JSON.stringify(reopened)}`);
}

const secondAccepted = one(await rest(`center_onboarding_invitations?id=eq.${invitation.id}&status=eq.pending&select=id,status,accepted_at,review_required_at,failure_code`, {
  method: "PATCH",
  prefer: true,
  body: {
    status: "accepted",
    accepted_at: new Date().toISOString(),
    review_required_at: new Date().toISOString(),
    failure_code: "profile-read-uncertain",
  },
}), "mark second review-required state");

if (secondAccepted.failure_code !== "profile-read-uncertain") {
  throw new Error(`Second review failure code was not stored: ${JSON.stringify(secondAccepted)}`);
}

const superseded = one(await rest(`center_onboarding_invitations?id=eq.${invitation.id}&status=eq.accepted&select=id,status,accepted_at,superseded_at,review_required_at,failure_code`, {
  method: "PATCH",
  prefer: true,
  body: {
    status: "superseded",
    accepted_at: null,
    superseded_at: new Date().toISOString(),
    review_required_at: null,
    failure_code: null,
  },
}), "supersede reviewed invitation with complete cleanup");

if (
  superseded.status !== "superseded" ||
  superseded.accepted_at !== null ||
  !superseded.superseded_at ||
  superseded.review_required_at !== null ||
  superseded.failure_code !== null
) {
  throw new Error(`Reviewed invitation did not supersede cleanly: ${JSON.stringify(superseded)}`);
}

console.log("Center onboarding review-required state contracts passed.");
