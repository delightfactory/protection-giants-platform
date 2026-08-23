import { execFileSync } from "node:child_process";

const apiUrl = process.env.API_URL;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
const anonKey = process.env.ANON_KEY;

if (!apiUrl || !serviceRoleKey || !anonKey) {
  throw new Error("Local Supabase API_URL, SERVICE_ROLE_KEY and ANON_KEY are required.");
}

const password = "Cube-L-Onboarding-Notifications-2026!";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

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

async function rest(path, token, options = {}) {
  return request(`/rest/v1/${path}`, { ...options, token });
}

async function rpc(name, body, token, key = anonKey) {
  return request(`/rest/v1/rpc/${name}`, { method: "POST", token, key, body });
}

function one(result, label) {
  assert(result.response.ok && Array.isArray(result.body) && result.body.length === 1,
    `${label}: ${result.response.status} ${JSON.stringify(result.body)}`);
  return result.body[0];
}

async function createUser({ email, role = null, countryAgentId = null, dealerId = null, centerId = null }) {
  const appMetadata = role
    ? {
        pg_provisioning: {
          version: "operational-v1",
          role,
          country_agent_id: countryAgentId,
          dealer_id: dealerId,
          installation_center_id: centerId,
        },
      }
    : {};

  const result = await request("/auth/v1/admin/users", {
    method: "POST",
    key: serviceRoleKey,
    token: serviceRoleKey,
    body: {
      email,
      password,
      email_confirm: true,
      app_metadata: appMetadata,
      user_metadata: { display_name: `Cube L Onboarding ${role ?? "invitee"}` },
    },
  });
  assert(result.response.ok && result.body?.id,
    `Could not create ${role ?? "invitee"} user: ${result.response.status} ${JSON.stringify(result.body)}`);
  return result.body;
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

function dbContainerName() {
  const names = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" })
    .split("\n").map((value) => value.trim()).filter(Boolean);
  const name = names.find((value) => value.startsWith("supabase_db_"));
  assert(name, "Supabase database container was not found for Cube L onboarding fixtures.");
  return name;
}

function querySql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", dbContainerName(), "psql", "-At", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-c", sql],
    { encoding: "utf8" },
  ).trim();
}

function runSql(sql) {
  execFileSync(
    "docker",
    ["exec", "-i", dbContainerName(), "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
    { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  );
}

function sqlUuid(value) {
  assert(/^[0-9a-f-]{36}$/i.test(value), `Unsafe UUID fixture value: ${value}`);
  return `'${value}'::uuid`;
}

function notificationsFor(sourceEventKey) {
  const safeKey = String(sourceEventKey).replaceAll("'", "''");
  const raw = querySql(`
    select coalesce(json_agg(json_build_object(
      'profile_id', n.recipient_profile_id,
      'event_type', n.event_type,
      'attention', n.attention_level,
      'title', n.title,
      'body', n.body,
      'action_path', n.action_path,
      'push_eligible', n.push_eligible
    ) order by n.recipient_profile_id)::text, '[]')
    from public.notifications n
    where n.source_domain = 'center_onboarding'
      and n.source_event_key = '${safeKey}';
  `);
  return JSON.parse(raw || "[]");
}

function expectRecipients(rows, expectedProfileIds, label) {
  const actual = rows.map((row) => row.profile_id).sort();
  const expected = [...expectedProfileIds].sort();
  assert(JSON.stringify(actual) === JSON.stringify(expected),
    `${label} recipients mismatch. expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)} rows=${JSON.stringify(rows)}`);
  assert(rows.every((row) => row.push_eligible === true), `${label} must remain Push eligible.`);
}

async function createAcceptedInvitation({ centerId, authUserId, invitedByProfileId, email }) {
  return one(await rest("center_onboarding_invitations?select=id,installation_center_id,status,accepted_at", serviceRoleKey, {
    method: "POST",
    key: serviceRoleKey,
    prefer: true,
    body: {
      installation_center_id: centerId,
      invited_email: email,
      auth_user_id: authUserId,
      invited_by_profile_id: invitedByProfileId,
      status: "accepted",
      accepted_at: new Date().toISOString(),
    },
  }), `Create accepted invitation for ${email}`);
}

const adminActor = await createUser({ email: "cube-l-on-admin-one@example.test", role: "admin" });
const adminOther = await createUser({ email: "cube-l-on-admin-two@example.test", role: "admin" });
const adminSuspended = await createUser({ email: "cube-l-on-admin-suspended@example.test", role: "admin" });
runSql(`update public.profiles set status = 'suspended' where id = ${sqlUuid(adminSuspended.id)};`);
const adminToken = await signIn("cube-l-on-admin-one@example.test");

const agent = one(await rest("country_agents?select=id", adminToken, {
  method: "POST", prefer: true,
  body: { code: "CUBE-L-ON-AGENT", name: "Cube L Onboarding Agent", country_code: "EG" },
}), "Create onboarding Agent");
const dealer = one(await rest("dealers?select=id", adminToken, {
  method: "POST", prefer: true,
  body: {
    code: "CUBE-L-ON-DEALER", name: "Cube L Onboarding Dealer", country_code: "EG", country_agent_id: agent.id,
  },
}), "Create onboarding Dealer");

const dealerCenter = one(await rest("installation_centers?select=id,name", adminToken, {
  method: "POST", prefer: true,
  body: {
    code: "CUBE-L-ON-DCH", name: "Cube L Dealer Onboard Center", country_code: "EG", city: "Cairo", dealer_id: dealer.id,
  },
}), "Create Dealer-child onboarding Center");
const agentCenter = one(await rest("installation_centers?select=id,name", adminToken, {
  method: "POST", prefer: true,
  body: {
    code: "CUBE-L-ON-ACH", name: "Cube L Agent Onboard Center", country_code: "EG", city: "Giza", country_agent_id: agent.id,
  },
}), "Create Agent-direct onboarding Center");
const companyCenter = one(await rest("installation_centers?select=id,name", adminToken, {
  method: "POST", prefer: true,
  body: {
    code: "CUBE-L-ON-CMP", name: "Cube L Company Onboard Center", country_code: "EG", city: "Tanta",
  },
}), "Create Company-direct onboarding Center");
const reviewCenter = one(await rest("installation_centers?select=id,name", adminToken, {
  method: "POST", prefer: true,
  body: {
    code: "CUBE-L-ON-REV", name: "Cube L Review Onboard Center", country_code: "EG", city: "Mansoura", dealer_id: dealer.id,
  },
}), "Create review onboarding Center");
const pendingCenter = one(await rest("installation_centers?select=id,name", adminToken, {
  method: "POST", prefer: true,
  body: {
    code: "CUBE-L-ON-PND", name: "Cube L Pending Onboard Center", country_code: "EG", city: "Alexandria", dealer_id: dealer.id,
  },
}), "Create pending onboarding Center");

const dealerManager = await createUser({ email: "cube-l-on-dealer@example.test", role: "dealer", dealerId: dealer.id });
const dealerManagerSuspended = await createUser({ email: "cube-l-on-dealer-suspended@example.test", role: "dealer", dealerId: dealer.id });
runSql(`update public.profiles set status = 'suspended' where id = ${sqlUuid(dealerManagerSuspended.id)};`);
const agentManager = await createUser({ email: "cube-l-on-agent@example.test", role: "agent", countryAgentId: agent.id });

const dealerCenterUser = await createUser({ email: "cube-l-on-center-dealer@example.test", role: "center", centerId: dealerCenter.id });
const agentCenterUser = await createUser({ email: "cube-l-on-center-agent@example.test", role: "center", centerId: agentCenter.id });
const companyCenterUser = await createUser({ email: "cube-l-on-center-company@example.test", role: "center", centerId: companyCenter.id });

const dealerInvitation = await createAcceptedInvitation({
  centerId: dealerCenter.id,
  authUserId: dealerCenterUser.id,
  invitedByProfileId: adminActor.id,
  email: "cube-l-on-center-dealer@example.test",
});
let materialized = await rpc("materialize_center_onboarding_success", { p_invitation_id: dealerInvitation.id }, serviceRoleKey, serviceRoleKey);
assert(materialized.response.ok && materialized.body === 1,
  `Dealer onboarding materializer failed: ${materialized.response.status} ${JSON.stringify(materialized.body)}`);
let rows = notificationsFor(`center_onboarding:${dealerInvitation.id}:accepted`);
expectRecipients(rows, [dealerManager.id], "Dealer-managed onboarding success");
assert(rows[0].event_type === "center.onboarding_completed" && rows[0].attention === "info", "Normal onboarding mapping mismatch.");
assert(rows[0].action_path === `/operations/centers/${dealerCenter.id}/edit`, "Normal onboarding manager deep link mismatch.");
assert(rows[0].body.includes(dealerCenter.name), "Normal onboarding copy must identify the Center.");
assert(!/اعتماد|عهدة|ضمان/.test(rows[0].body), "Normal onboarding copy must not imply approval, custody or Warranty authority.");
assert(!rows.some((row) => row.profile_id === dealerManagerSuspended.id), "Suspended Dealer manager received onboarding success.");

materialized = await rpc("materialize_center_onboarding_success", { p_invitation_id: dealerInvitation.id }, serviceRoleKey, serviceRoleKey);
assert(materialized.response.ok && materialized.body === 0, "Normal onboarding materialization must be idempotent.");
rows = notificationsFor(`center_onboarding:${dealerInvitation.id}:accepted`);
expectRecipients(rows, [dealerManager.id], "Idempotent Dealer onboarding success");

const agentInvitation = await createAcceptedInvitation({
  centerId: agentCenter.id,
  authUserId: agentCenterUser.id,
  invitedByProfileId: adminActor.id,
  email: "cube-l-on-center-agent@example.test",
});
materialized = await rpc("materialize_center_onboarding_success", { p_invitation_id: agentInvitation.id }, serviceRoleKey, serviceRoleKey);
assert(materialized.response.ok, `Agent onboarding materializer failed: ${JSON.stringify(materialized.body)}`);
rows = notificationsFor(`center_onboarding:${agentInvitation.id}:accepted`);
expectRecipients(rows, [agentManager.id], "Agent-managed onboarding success");

const companyInvitation = await createAcceptedInvitation({
  centerId: companyCenter.id,
  authUserId: companyCenterUser.id,
  invitedByProfileId: adminActor.id,
  email: "cube-l-on-center-company@example.test",
});
materialized = await rpc("materialize_center_onboarding_success", { p_invitation_id: companyInvitation.id }, serviceRoleKey, serviceRoleKey);
assert(materialized.response.ok, `Company onboarding materializer failed: ${JSON.stringify(materialized.body)}`);
rows = notificationsFor(`center_onboarding:${companyInvitation.id}:accepted`);
expectRecipients(rows, [adminActor.id, adminOther.id], "Company-managed onboarding success");
assert(!rows.some((row) => row.profile_id === adminSuspended.id), "Suspended Admin received onboarding success.");

const managerToken = await signIn("cube-l-on-dealer@example.test");
const forbidden = await rpc("materialize_center_onboarding_success", { p_invitation_id: dealerInvitation.id }, managerToken);
assert(!forbidden.response.ok, "Authenticated operational user must not execute the server-only onboarding materializer.");

const pendingInvitee = await createUser({ email: "cube-l-on-pending@example.test" });
const pendingInvitation = one(await rest("center_onboarding_invitations?select=id", serviceRoleKey, {
  method: "POST", key: serviceRoleKey, prefer: true,
  body: {
    installation_center_id: pendingCenter.id,
    invited_email: "cube-l-on-pending@example.test",
    auth_user_id: pendingInvitee.id,
    invited_by_profile_id: adminActor.id,
    status: "pending",
  },
}), "Create pending onboarding invitation");
const notFinal = await rpc("materialize_center_onboarding_success", { p_invitation_id: pendingInvitation.id }, serviceRoleKey, serviceRoleKey);
assert(!notFinal.response.ok && notFinal.body?.message === "PG_NOTIFICATION_ONBOARDING_NOT_FINAL",
  `Pending invitation must not materialize normal success: ${JSON.stringify(notFinal.body)}`);
assert(notificationsFor(`center_onboarding:${pendingInvitation.id}:accepted`).length === 0, "Pending invitation created a notification.");

const reviewInvitee = await createUser({ email: "cube-l-on-review@example.test" });
const reviewInvitation = one(await rest("center_onboarding_invitations?select=id", serviceRoleKey, {
  method: "POST", key: serviceRoleKey, prefer: true,
  body: {
    installation_center_id: reviewCenter.id,
    invited_email: "cube-l-on-review@example.test",
    auth_user_id: reviewInvitee.id,
    invited_by_profile_id: adminActor.id,
    status: "pending",
  },
}), "Create review onboarding invitation");

const reviewTime = new Date().toISOString();
const reviewUpdate = await rest(`center_onboarding_invitations?id=eq.${reviewInvitation.id}&select=id,status,review_required_at,failure_code`, serviceRoleKey, {
  method: "PATCH", key: serviceRoleKey, prefer: true,
  body: {
    status: "accepted",
    accepted_at: reviewTime,
    review_required_at: reviewTime,
    failure_code: "profile-mismatch",
  },
});
one(reviewUpdate, "Mark onboarding review required");
rows = notificationsFor(`center_onboarding:${reviewInvitation.id}:review_required`);
expectRecipients(rows, [adminActor.id, adminOther.id], "Onboarding review required");
assert(rows.every((row) => row.event_type === "center.onboarding_review_required" && row.attention === "action_required"), "Review notification mapping mismatch.");
assert(rows.every((row) => row.action_path === `/operations/centers/${reviewCenter.id}/edit`), "Review notification Admin deep link mismatch.");
assert(rows.every((row) => row.body.includes(reviewCenter.name)), "Review notification must identify the Center.");
assert(rows.every((row) => !row.body.includes("profile-mismatch") && !row.body.includes(reviewInvitee.id)), "Review notification leaked failure/auth internals.");
assert(!rows.some((row) => [dealerManager.id, dealerManagerSuspended.id, agentManager.id, adminSuspended.id].includes(row.profile_id)), "Non-Admin or suspended profile received onboarding review alert.");
assert(notificationsFor(`center_onboarding:${reviewInvitation.id}:accepted`).length === 0, "Review-required invitation also emitted normal success.");

const reviewAsSuccess = await rpc("materialize_center_onboarding_success", { p_invitation_id: reviewInvitation.id }, serviceRoleKey, serviceRoleKey);
assert(!reviewAsSuccess.response.ok && reviewAsSuccess.body?.message === "PG_NOTIFICATION_ONBOARDING_NOT_FINAL",
  `Review-required invitation must reject normal materialization: ${JSON.stringify(reviewAsSuccess.body)}`);

const secondReviewUpdate = await rest(`center_onboarding_invitations?id=eq.${reviewInvitation.id}&select=id`, serviceRoleKey, {
  method: "PATCH", key: serviceRoleKey, prefer: true,
  body: { failure_code: "profile-read-uncertain" },
});
one(secondReviewUpdate, "Change review failure code without creating another logical event");
rows = notificationsFor(`center_onboarding:${reviewInvitation.id}:review_required`);
expectRecipients(rows, [adminActor.id, adminOther.id], "Idempotent onboarding review notification");

console.log("Cube L onboarding notification materialization verification passed.");
