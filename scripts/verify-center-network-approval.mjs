const apiUrl = process.env.API_URL;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
const anonKey = process.env.ANON_KEY;

if (!apiUrl || !serviceRoleKey || !anonKey) {
  throw new Error("Local Supabase API_URL, SERVICE_ROLE_KEY and ANON_KEY are required.");
}

const password = "Center-Network-Approval-2026!";

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

function one(result, label) {
  if (!result.response.ok || !Array.isArray(result.body) || result.body.length !== 1) {
    throw new Error(`${label}: ${result.response.status} ${JSON.stringify(result.body)}`);
  }
  return result.body[0];
}

function rows(result, label) {
  if (!result.response.ok || !Array.isArray(result.body)) {
    throw new Error(`${label}: ${result.response.status} ${JSON.stringify(result.body)}`);
  }
  return result.body;
}

function none(result, label) {
  const data = rows(result, label);
  if (data.length !== 0) throw new Error(`${label} unexpectedly returned data: ${JSON.stringify(data)}`);
}

function mustFail(result, label) {
  if (result.response.ok) throw new Error(`${label} unexpectedly succeeded: ${JSON.stringify(result.body)}`);
}

async function createUser({ email, role, countryAgentId = null, dealerId = null, centerId = null }) {
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
          installation_center_id: centerId,
        },
      },
      user_metadata: { display_name: `Approval ${role}` },
    },
  });
  if (!result.response.ok || !result.body?.id) {
    throw new Error(`Could not create ${role} user: ${result.response.status} ${JSON.stringify(result.body)}`);
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

async function createCenter(adminToken, body, label) {
  return one(await rest("installation_centers?select=*", adminToken, {
    method: "POST",
    prefer: true,
    body,
  }), label);
}

async function adminSetLocation(adminToken, centerId, latitude, longitude) {
  return one(await rest("rpc/admin_update_center_location", adminToken, {
    method: "POST",
    body: { p_center_id: centerId, p_latitude: latitude, p_longitude: longitude },
  }), `Admin sets location for ${centerId}`);
}

async function currentLocationCapturedAt(token, centerId) {
  const center = one(await rest(
    `installation_centers?id=eq.${centerId}&select=id,location_captured_at`,
    token,
  ), `Read current location timestamp for ${centerId}`);
  if (!center.location_captured_at) throw new Error(`Center ${centerId} has no location timestamp.`);
  return center.location_captured_at;
}

async function approve(token, centerId, expectedLocationCapturedAt = undefined) {
  const expected = expectedLocationCapturedAt ?? await currentLocationCapturedAt(token, centerId);
  return rest("rpc/approve_center_network", token, {
    method: "POST",
    body: {
      p_center_id: centerId,
      p_expected_location_captured_at: expected,
    },
  });
}

async function approvalEvents(token, centerId) {
  return rows(await rest(
    `center_network_approval_events?installation_center_id=eq.${centerId}&select=id,installation_center_id,action,actor_profile_id,occurred_at&order=occurred_at.asc,id.asc`,
    token,
  ), `Read approval events for ${centerId}`);
}

const adminUser = await createUser({ email: "approval-admin@example.test", role: "admin" });
const adminToken = await signIn("approval-admin@example.test");

const agentA = one(await rest("country_agents?select=id,code,country_code,status", adminToken, {
  method: "POST", prefer: true,
  body: { code: "APP-A-EG", name: "Approval Agent A", country_code: "EG" },
}), "Admin creates Agent A");
const agentB = one(await rest("country_agents?select=id,code,country_code,status", adminToken, {
  method: "POST", prefer: true,
  body: { code: "APP-B-EG", name: "Approval Agent B", country_code: "EG" },
}), "Admin creates Agent B");

const dealerA = one(await rest("dealers?select=id,code,country_agent_id,status", adminToken, {
  method: "POST", prefer: true,
  body: { code: "APP-D-A", name: "Approval Dealer A", country_code: "EG", country_agent_id: agentA.id },
}), "Admin creates Dealer A");
const dealerB = one(await rest("dealers?select=id,code,country_agent_id,status", adminToken, {
  method: "POST", prefer: true,
  body: { code: "APP-D-B", name: "Approval Dealer B", country_code: "EG", country_agent_id: agentB.id },
}), "Admin creates Dealer B");

mustFail(await rest("installation_centers?select=id", adminToken, {
  method: "POST", prefer: true,
  body: {
    code: "APP-C-BYPASS", name: "Approval Bypass Center", country_code: "EG", city: "Cairo",
    country_agent_id: agentA.id, approval_status: "approved",
    approved_at: new Date().toISOString(), approved_by_profile_id: adminUser.id,
  },
}), "Center entity INSERT pre-fills approval");

const noLocationA = await createCenter(adminToken, {
  code: "APP-C-NOLOC", name: "Approval No Location", country_code: "EG", city: "Cairo", country_agent_id: agentA.id,
}, "Create no-location Agent A Center");
const agentDirectA = await createCenter(adminToken, {
  code: "APP-C-ADIRA", name: "Approval Agent Direct A", country_code: "EG", city: "Cairo", country_agent_id: agentA.id,
}, "Create Agent-direct A Center");
const dealerChildA = await createCenter(adminToken, {
  code: "APP-C-DCHA", name: "Approval Dealer Child A", country_code: "EG", city: "Giza", dealer_id: dealerA.id,
}, "Create Dealer-child A Center");
const dealerChildB = await createCenter(adminToken, {
  code: "APP-C-DCHB", name: "Approval Dealer Child B", country_code: "EG", city: "Alexandria", dealer_id: dealerB.id,
}, "Create Dealer-child B Center");
const companyDirect = await createCenter(adminToken, {
  code: "APP-C-COMP", name: "Approval Company Direct", country_code: "EG", city: "Tanta",
}, "Create Company-direct Center");
const suspendedA = await createCenter(adminToken, {
  code: "APP-C-SUSP", name: "Approval Suspended A", country_code: "EG", city: "Mansoura", country_agent_id: agentA.id,
}, "Create suspend-test Center");
const staleA = await createCenter(adminToken, {
  code: "APP-C-STALE", name: "Approval Stale Review A", country_code: "EG", city: "Cairo", country_agent_id: agentA.id,
}, "Create stale-review Center");

for (const center of [noLocationA, agentDirectA, dealerChildA, dealerChildB, companyDirect, suspendedA, staleA]) {
  if (center.approval_status !== "unapproved" || center.approved_at !== null || center.approved_by_profile_id !== null) {
    throw new Error(`New Center did not start unapproved: ${JSON.stringify(center)}`);
  }
}

const agentAUser = await createUser({ email: "approval-agent-a@example.test", role: "agent", countryAgentId: agentA.id });
await createUser({ email: "approval-agent-b@example.test", role: "agent", countryAgentId: agentB.id });
await createUser({ email: "approval-dealer-a@example.test", role: "dealer", dealerId: dealerA.id });
const centerAUser = await createUser({ email: "approval-center-a@example.test", role: "center", centerId: dealerChildA.id });

const agentAToken = await signIn("approval-agent-a@example.test");
const agentBToken = await signIn("approval-agent-b@example.test");
const dealerAToken = await signIn("approval-dealer-a@example.test");
const centerAToken = await signIn("approval-center-a@example.test");

mustFail(await rest("rpc/approve_center_network", adminToken, {
  method: "POST",
  body: { p_center_id: noLocationA.id, p_expected_location_captured_at: new Date().toISOString() },
}), "Admin approves Center without location");

await adminSetLocation(adminToken, agentDirectA.id, 30.0444, 31.2357);
await adminSetLocation(adminToken, dealerChildA.id, 30.0131, 31.2089);
await adminSetLocation(adminToken, dealerChildB.id, 31.2001, 29.9187);
await adminSetLocation(adminToken, companyDirect.id, 30.7865, 31.0004);
await adminSetLocation(adminToken, suspendedA.id, 31.0409, 31.3785);
await adminSetLocation(adminToken, staleA.id, 30.0500, 31.2400);

one(await rest(`installation_centers?id=eq.${suspendedA.id}&select=id,status`, adminToken, {
  method: "PATCH", prefer: true, body: { status: "suspended" },
}), "Admin suspends Center before approval");
mustFail(await approve(adminToken, suspendedA.id), "Admin approves suspended Center");

const staleReviewedAt = await currentLocationCapturedAt(agentAToken, staleA.id);
await adminSetLocation(adminToken, staleA.id, 30.0510, 31.2410);
const staleEventsBefore = await approvalEvents(adminToken, staleA.id);
mustFail(await approve(agentAToken, staleA.id, staleReviewedAt), "Agent approves stale reviewed location");
const staleAfterFailure = one(await rest(`installation_centers?id=eq.${staleA.id}&select=id,approval_status`, adminToken), "Read stale Center after rejected approval");
if (staleAfterFailure.approval_status !== "unapproved") throw new Error("Stale approval changed current projection.");
if ((await approvalEvents(adminToken, staleA.id)).length !== staleEventsBefore.length) throw new Error("Stale approval appended history.");
const freshStaleApproval = one(await approve(agentAToken, staleA.id), "Agent approves refreshed location");
if (!freshStaleApproval.changed || freshStaleApproval.approval_status !== "approved") throw new Error("Fresh reviewed location did not approve.");

one(await rest(`installation_centers?id=eq.${staleA.id}&select=id,status`, adminToken, {
  method: "PATCH", prefer: true, body: { status: "suspended" },
}), "Admin suspends already approved Center");
const revokeSuspended = one(await rest("rpc/revoke_center_network_approval", agentAToken, {
  method: "POST", body: { p_center_id: staleA.id },
}), "Agent revokes suspended Center");
if (!revokeSuspended.changed || revokeSuspended.approval_status !== "unapproved") throw new Error("Approved suspended Center could not be revoked.");
const staleSuspendedState = one(await rest(`installation_centers?id=eq.${staleA.id}&select=id,status,approval_status`, adminToken), "Read suspended Center after revoke");
if (staleSuspendedState.status !== "suspended" || staleSuspendedState.approval_status !== "unapproved") throw new Error("Revoke changed suspended Center lifecycle.");
one(await rest(`installation_centers?id=eq.${staleA.id}&select=id,status`, adminToken, {
  method: "PATCH", prefer: true, body: { status: "active" },
}), "Admin reactivates stale-test Center");
one(await approve(agentAToken, staleA.id), "Agent re-approves stale-test Center");

const approveDirectA = one(await approve(agentAToken, agentDirectA.id), "Agent A approves direct Center");
if (!approveDirectA.changed || approveDirectA.approval_status !== "approved" || approveDirectA.approved_by_profile_id !== agentAUser.id || !approveDirectA.approved_at) {
  throw new Error(`Agent-direct approval contract mismatch: ${JSON.stringify(approveDirectA)}`);
}
const approveChildA = one(await approve(agentAToken, dealerChildA.id), "Agent A approves Dealer-child Center");
if (!approveChildA.changed || approveChildA.approval_status !== "approved") throw new Error(`Dealer-child approval contract mismatch: ${JSON.stringify(approveChildA)}`);

mustFail(await approve(agentAToken, dealerChildB.id, await currentLocationCapturedAt(adminToken, dealerChildB.id)), "Agent A approves Agent B Center");
mustFail(await approve(agentAToken, companyDirect.id, await currentLocationCapturedAt(adminToken, companyDirect.id)), "Agent A approves Company-direct Center");
const approveChildB = one(await approve(agentBToken, dealerChildB.id), "Agent B approves own Dealer-child Center");
if (!approveChildB.changed || approveChildB.approval_status !== "approved") throw new Error("Agent B approval failed contract.");

mustFail(await approve(dealerAToken, dealerChildA.id, await currentLocationCapturedAt(adminToken, dealerChildA.id)), "Dealer approves Center");
mustFail(await approve(centerAToken, dealerChildA.id, await currentLocationCapturedAt(adminToken, dealerChildA.id)), "Center approves itself");

const approveCompany = one(await approve(adminToken, companyDirect.id), "Admin approves Company-direct Center");
if (!approveCompany.changed || approveCompany.approval_status !== "approved" || approveCompany.approved_by_profile_id !== adminUser.id) {
  throw new Error(`Admin approval contract mismatch: ${JSON.stringify(approveCompany)}`);
}

const directAEventsBeforeRepeat = await approvalEvents(adminToken, agentDirectA.id);
const repeatApprove = one(await approve(agentAToken, agentDirectA.id, "2000-01-01T00:00:00.000Z"), "Repeat approve is idempotent");
if (repeatApprove.changed || repeatApprove.approval_status !== "approved") throw new Error("Repeat approve was not idempotent.");
if ((await approvalEvents(adminToken, agentDirectA.id)).length !== directAEventsBeforeRepeat.length) throw new Error("Repeat approve appended duplicate history.");

mustFail(await rest("rpc/revoke_center_network_approval", agentAToken, { method: "POST", body: { p_center_id: dealerChildB.id } }), "Agent A revokes Agent B Center");
mustFail(await rest("rpc/revoke_center_network_approval", agentAToken, { method: "POST", body: { p_center_id: companyDirect.id } }), "Agent A revokes Company-direct Center");
mustFail(await rest("rpc/revoke_center_network_approval", dealerAToken, { method: "POST", body: { p_center_id: dealerChildA.id } }), "Dealer revokes Center");
mustFail(await rest("rpc/revoke_center_network_approval", centerAToken, { method: "POST", body: { p_center_id: dealerChildA.id } }), "Center revokes itself");

const revokeDirectA = one(await rest("rpc/revoke_center_network_approval", agentAToken, {
  method: "POST", body: { p_center_id: agentDirectA.id },
}), "Agent A revokes direct Center");
if (!revokeDirectA.changed || revokeDirectA.approval_status !== "unapproved" || revokeDirectA.approved_at !== null || revokeDirectA.approved_by_profile_id !== null) {
  throw new Error(`Revoke contract mismatch: ${JSON.stringify(revokeDirectA)}`);
}
const directAfterRevoke = one(await rest(`installation_centers?id=eq.${agentDirectA.id}&select=id,status,approval_status`, adminToken), "Read revoked Center");
if (directAfterRevoke.status !== "active" || directAfterRevoke.approval_status !== "unapproved") throw new Error("Revocation changed operational status.");
const eventsBeforeRepeatRevoke = await approvalEvents(adminToken, agentDirectA.id);
const repeatRevoke = one(await rest("rpc/revoke_center_network_approval", agentAToken, {
  method: "POST", body: { p_center_id: agentDirectA.id },
}), "Repeat revoke is idempotent");
if (repeatRevoke.changed || repeatRevoke.approval_status !== "unapproved") throw new Error("Repeat revoke was not idempotent.");
if ((await approvalEvents(adminToken, agentDirectA.id)).length !== eventsBeforeRepeatRevoke.length) throw new Error("Repeat revoke appended duplicate history.");

const allEventsForAdmin = rows(await rest("center_network_approval_events?select=installation_center_id,action", adminToken), "Admin reads approval history");
if (allEventsForAdmin.length < 8) throw new Error(`Admin approval history unexpectedly sparse: ${JSON.stringify(allEventsForAdmin)}`);
const agentAVisibleEvents = rows(await rest("center_network_approval_events?select=installation_center_id,action", agentAToken), "Agent A reads scoped approval history");
if (!agentAVisibleEvents.some((event) => event.installation_center_id === dealerChildA.id) || !agentAVisibleEvents.some((event) => event.installation_center_id === staleA.id)) {
  throw new Error(`Agent A cannot see own network approval history: ${JSON.stringify(agentAVisibleEvents)}`);
}
if (agentAVisibleEvents.some((event) => event.installation_center_id === dealerChildB.id || event.installation_center_id === companyDirect.id)) {
  throw new Error(`Agent A can see history outside own network: ${JSON.stringify(agentAVisibleEvents)}`);
}
none(await rest("center_network_approval_events?select=id", dealerAToken), "Dealer enumerates approval history");
none(await rest("center_network_approval_events?select=id", centerAToken), "Center enumerates approval history");

mustFail(await rest(`installation_centers?id=eq.${dealerChildA.id}`, adminToken, {
  method: "PATCH", prefer: true,
  body: { approval_status: "unapproved", approved_at: null, approved_by_profile_id: null },
}), "Admin bypasses approval RPC through Data API");
mustFail(await rest(`installation_centers?id=eq.${dealerChildA.id}`, agentAToken, {
  method: "PATCH", prefer: true,
  body: { approval_status: "unapproved", approved_at: null, approved_by_profile_id: null },
}), "Agent bypasses approval RPC through Data API");
mustFail(await rest("center_network_approval_events", adminToken, {
  method: "POST", prefer: true,
  body: { installation_center_id: dealerChildA.id, action: "revoked", actor_profile_id: adminUser.id, occurred_at: new Date().toISOString() },
}), "Admin directly inserts approval history");

const childAEventsBeforeLocation = await approvalEvents(adminToken, dealerChildA.id);
const locationChange = one(await rest("rpc/update_own_center_location", centerAToken, {
  method: "POST", body: { p_latitude: 30.0133, p_longitude: 31.2091, p_accuracy_m: 12 },
}), "Center updates own approved location");
if (locationChange.installation_center_id !== dealerChildA.id) throw new Error("Center location update targeted wrong Center.");
const childAAfterLocation = one(await rest(`installation_centers?id=eq.${dealerChildA.id}&select=id,approval_status,approved_at,approved_by_profile_id`, adminToken), "Read Center after location change");
if (childAAfterLocation.approval_status !== "unapproved" || childAAfterLocation.approved_at !== null || childAAfterLocation.approved_by_profile_id !== null) {
  throw new Error(`Location change did not invalidate approval: ${JSON.stringify(childAAfterLocation)}`);
}
const childAEventsAfterLocation = await approvalEvents(adminToken, dealerChildA.id);
if (childAEventsAfterLocation.length !== childAEventsBeforeLocation.length + 1) throw new Error("Location change did not append exactly one approval event.");
const centerInvalidation = childAEventsAfterLocation.at(-1);
if (centerInvalidation.action !== "location_changed" || centerInvalidation.actor_profile_id !== centerAUser.id) {
  throw new Error(`Center location invalidation audit mismatch: ${JSON.stringify(centerInvalidation)}`);
}

one(await approve(adminToken, dealerChildA.id), "Admin re-approves after location review");
const eventsBeforeFailedLocation = await approvalEvents(adminToken, dealerChildA.id);
mustFail(await rest("rpc/update_own_center_location", centerAToken, {
  method: "POST", body: { p_latitude: 30.02, p_longitude: 31.21, p_accuracy_m: 50.01 },
}), "Rejected location update while approved");
const afterFailedLocation = one(await rest(`installation_centers?id=eq.${dealerChildA.id}&select=id,approval_status`, adminToken), "Read approval after failed location update");
if (afterFailedLocation.approval_status !== "approved") throw new Error("Failed location update invalidated approval.");
if ((await approvalEvents(adminToken, dealerChildA.id)).length !== eventsBeforeFailedLocation.length) throw new Error("Failed location update appended history.");

one(await rest("rpc/admin_update_center_location", adminToken, {
  method: "POST", body: { p_center_id: dealerChildA.id, p_latitude: 30.0135, p_longitude: 31.2093 },
}), "Admin corrects approved Center location");
const afterAdminCorrection = one(await rest(`installation_centers?id=eq.${dealerChildA.id}&select=id,approval_status`, adminToken), "Read approval after Admin correction");
if (afterAdminCorrection.approval_status !== "unapproved") throw new Error("Admin correction did not invalidate approval.");
const finalChildAEvents = await approvalEvents(adminToken, dealerChildA.id);
const adminInvalidation = finalChildAEvents.at(-1);
if (adminInvalidation.action !== "location_changed" || adminInvalidation.actor_profile_id !== adminUser.id) {
  throw new Error(`Admin location invalidation audit mismatch: ${JSON.stringify(adminInvalidation)}`);
}

mustFail(await rest(`center_network_approval_events?id=eq.${finalChildAEvents[0].id}`, adminToken, {
  method: "PATCH", prefer: true, body: { action: "revoked" },
}), "Admin mutates immutable approval event");

one(await rest(`profiles?id=eq.${agentAUser.id}&select=id,status`, serviceRoleKey, {
  method: "PATCH", key: serviceRoleKey, prefer: true, body: { status: "suspended" },
}), "Service role suspends Agent A profile");
mustFail(await approve(agentAToken, agentDirectA.id, await currentLocationCapturedAt(adminToken, agentDirectA.id)), "Suspended Agent profile approves Center");
mustFail(await rest("rpc/revoke_center_network_approval", agentAToken, { method: "POST", body: { p_center_id: staleA.id } }), "Suspended Agent profile revokes Center");
one(await rest(`profiles?id=eq.${agentAUser.id}&select=id,status`, serviceRoleKey, {
  method: "PATCH", key: serviceRoleKey, prefer: true, body: { status: "active" },
}), "Service role reactivates Agent A profile");

one(await rest(`country_agents?id=eq.${agentA.id}&select=id,status`, adminToken, {
  method: "PATCH", prefer: true, body: { status: "suspended" },
}), "Admin suspends Agent A entity");
mustFail(await approve(agentAToken, agentDirectA.id, await currentLocationCapturedAt(adminToken, agentDirectA.id)), "Suspended Country Agent approves Center");
mustFail(await rest("rpc/revoke_center_network_approval", agentAToken, { method: "POST", body: { p_center_id: staleA.id } }), "Suspended Country Agent revokes Center");

mustFail(await rest("rpc/approve_center_network", serviceRoleKey, {
  method: "POST", key: serviceRoleKey,
  body: { p_center_id: companyDirect.id, p_expected_location_captured_at: await currentLocationCapturedAt(adminToken, companyDirect.id) },
}), "service_role executes approval RPC");
mustFail(await rest("rpc/revoke_center_network_approval", serviceRoleKey, {
  method: "POST", key: serviceRoleKey, body: { p_center_id: companyDirect.id },
}), "service_role executes revoke RPC");

console.log("Center Network Approval database/RLS/audit/stale-location verification passed.");
