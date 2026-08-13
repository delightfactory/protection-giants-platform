const apiUrl = process.env.API_URL;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
const anonKey = process.env.ANON_KEY;

if (!apiUrl || !serviceRoleKey || !anonKey) {
  throw new Error("Local Supabase API_URL, SERVICE_ROLE_KEY and ANON_KEY are required.");
}

const password = "Center-Location-Foundation-2026!";

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

function none(result, label) {
  if (!result.response.ok || !Array.isArray(result.body) || result.body.length !== 0) {
    throw new Error(`${label} unexpectedly returned data: ${result.response.status} ${JSON.stringify(result.body)}`);
  }
}

function mustFail(result, label) {
  if (result.response.ok) {
    throw new Error(`${label} unexpectedly succeeded: ${JSON.stringify(result.body)}`);
  }
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
      user_metadata: { display_name: `Location ${role}` },
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

const adminUser = await createUser({ email: "location-admin@example.test", role: "admin" });
const adminToken = await signIn("location-admin@example.test");

const agent = one(await rest("country_agents?select=id,code,country_code,status", adminToken, {
  method: "POST",
  prefer: true,
  body: { code: "LOC-A-EG", name: "Location Agent", country_code: "EG" },
}), "Admin creates location test Agent");

const dealer = one(await rest("dealers?select=id,code,country_code,country_agent_id,status", adminToken, {
  method: "POST",
  prefer: true,
  body: {
    code: "LOC-D-EG",
    name: "Location Dealer",
    country_code: "EG",
    country_agent_id: agent.id,
  },
}), "Admin creates location test Dealer");

mustFail(await rest("installation_centers?select=id", adminToken, {
  method: "POST",
  prefer: true,
  body: {
    code: "LOC-C-BYPASS",
    name: "Location Bypass Center",
    country_code: "EG",
    city: "Giza",
    dealer_id: dealer.id,
    latitude: 30.0131,
    longitude: 31.2089,
    location_accuracy_m: null,
    location_captured_at: new Date().toISOString(),
    location_source: "admin",
    location_updated_by_profile_id: adminUser.id,
  },
}), "Admin creates Center with prefilled location projection");

const centerOne = one(await rest("installation_centers?select=*", adminToken, {
  method: "POST",
  prefer: true,
  body: {
    code: "LOC-C-ONE",
    name: "Location Center One",
    country_code: "EG",
    city: "Cairo",
    dealer_id: dealer.id,
  },
}), "Admin creates Center One");

const centerTwo = one(await rest("installation_centers?select=*", adminToken, {
  method: "POST",
  prefer: true,
  body: {
    code: "LOC-C-TWO",
    name: "Location Center Two",
    country_code: "EG",
    city: "Tanta",
    dealer_id: dealer.id,
  },
}), "Admin creates Center Two");

for (const center of [centerOne, centerTwo]) {
  if (
    center.latitude !== null ||
    center.longitude !== null ||
    center.location_accuracy_m !== null ||
    center.location_captured_at !== null ||
    center.location_source !== null ||
    center.location_updated_by_profile_id !== null
  ) {
    throw new Error(`New Center did not start with an empty location projection: ${JSON.stringify(center)}`);
  }
}

const centerUser = await createUser({
  email: "location-center@example.test",
  role: "center",
  centerId: centerOne.id,
});
await createUser({
  email: "location-agent@example.test",
  role: "agent",
  countryAgentId: agent.id,
});
await createUser({
  email: "location-dealer@example.test",
  role: "dealer",
  dealerId: dealer.id,
});

const centerToken = await signIn("location-center@example.test");
const agentToken = await signIn("location-agent@example.test");
const dealerToken = await signIn("location-dealer@example.test");

const firstCapture = one(await rest("rpc/update_own_center_location", centerToken, {
  method: "POST",
  body: { p_latitude: 30.04442, p_longitude: 31.235712, p_accuracy_m: 18.5 },
}), "Center captures own location");

if (
  firstCapture.installation_center_id !== centerOne.id ||
  firstCapture.latitude !== 30.04442 ||
  firstCapture.longitude !== 31.235712 ||
  firstCapture.accuracy_m !== 18.5 ||
  firstCapture.source !== "center_device" ||
  !firstCapture.captured_at
) {
  throw new Error(`Center capture returned an unexpected contract: ${JSON.stringify(firstCapture)}`);
}

const storedAfterCapture = one(await rest(
  `installation_centers?id=eq.${centerOne.id}&select=id,latitude,longitude,location_accuracy_m,location_captured_at,location_source,location_updated_by_profile_id`,
  centerToken,
), "Center reads stored own location");

if (
  storedAfterCapture.latitude !== firstCapture.latitude ||
  storedAfterCapture.longitude !== firstCapture.longitude ||
  storedAfterCapture.location_accuracy_m !== firstCapture.accuracy_m ||
  storedAfterCapture.location_captured_at !== firstCapture.captured_at ||
  storedAfterCapture.location_source !== "center_device" ||
  storedAfterCapture.location_updated_by_profile_id !== centerUser.id
) {
  throw new Error(`Stored Center projection does not match capture: ${JSON.stringify(storedAfterCapture)}`);
}

const centerTwoStillEmpty = one(await rest(
  `installation_centers?id=eq.${centerTwo.id}&select=id,latitude,longitude,location_source`,
  adminToken,
), "Admin reads untouched Center Two");
if (centerTwoStillEmpty.latitude !== null || centerTwoStillEmpty.longitude !== null || centerTwoStillEmpty.location_source !== null) {
  throw new Error("Center self-capture affected a different Center.");
}

mustFail(await rest("rpc/update_own_center_location", centerToken, {
  method: "POST",
  body: { p_center_id: centerTwo.id, p_latitude: 30.1, p_longitude: 31.1, p_accuracy_m: 10 },
}), "Center attempts forged target parameter");

mustFail(await rest("rpc/update_own_center_location", centerToken, {
  method: "POST",
  body: { p_latitude: 30.1, p_longitude: 31.1, p_accuracy_m: 50.01 },
}), "Center submits accuracy worse than 50m");

for (const [label, payload] of [
  ["invalid latitude", { p_latitude: 90.01, p_longitude: 31.1, p_accuracy_m: 10 }],
  ["invalid longitude", { p_latitude: 30.1, p_longitude: -180.01, p_accuracy_m: 10 }],
  ["zero accuracy", { p_latitude: 30.1, p_longitude: 31.1, p_accuracy_m: 0 }],
]) {
  mustFail(await rest("rpc/update_own_center_location", centerToken, { method: "POST", body: payload }), label);
}

mustFail(await rest("rpc/admin_update_center_location", agentToken, {
  method: "POST",
  body: { p_center_id: centerOne.id, p_latitude: 30.05, p_longitude: 31.24 },
}), "Agent attempts Admin location correction");

mustFail(await rest("rpc/admin_update_center_location", dealerToken, {
  method: "POST",
  body: { p_center_id: centerOne.id, p_latitude: 30.05, p_longitude: 31.24 },
}), "Dealer attempts Admin location correction");

const adminCorrection = one(await rest("rpc/admin_update_center_location", adminToken, {
  method: "POST",
  body: { p_center_id: centerOne.id, p_latitude: 30.0522, p_longitude: 31.2413 },
}), "Admin corrects Center location");
if (
  adminCorrection.installation_center_id !== centerOne.id ||
  adminCorrection.source !== "admin" ||
  adminCorrection.accuracy_m !== null
) {
  throw new Error(`Admin correction returned an unexpected contract: ${JSON.stringify(adminCorrection)}`);
}

const adminHistory = await rest(
  `center_location_events?installation_center_id=eq.${centerOne.id}&select=id,installation_center_id,latitude,longitude,accuracy_m,source,actor_profile_id,captured_at&order=captured_at.asc`,
  adminToken,
);
if (!adminHistory.response.ok || !Array.isArray(adminHistory.body) || adminHistory.body.length !== 2) {
  throw new Error(`Admin did not receive both immutable location events: ${JSON.stringify(adminHistory.body)}`);
}
if (adminHistory.body[0].source !== "center_device" || adminHistory.body[1].source !== "admin") {
  throw new Error(`Location history sources are incorrect: ${JSON.stringify(adminHistory.body)}`);
}

none(await rest("center_location_events?select=id", centerToken), "Center enumerates location history");
none(await rest("center_location_events?select=id", dealerToken), "Dealer enumerates location history");
none(await rest("center_location_events?select=id", agentToken), "Agent enumerates location history");

mustFail(await rest(`installation_centers?id=eq.${centerOne.id}`, centerToken, {
  method: "PATCH",
  prefer: true,
  body: { latitude: 29.9, longitude: 31.0 },
}), "Center directly mutates current location projection");

mustFail(await rest(`installation_centers?id=eq.${centerOne.id}`, adminToken, {
  method: "PATCH",
  prefer: true,
  body: { latitude: 29.9, longitude: 31.0 },
}), "Admin bypasses audited location RPC through generic Data API update");

mustFail(await rest("center_location_events", adminToken, {
  method: "POST",
  prefer: true,
  body: {
    installation_center_id: centerOne.id,
    latitude: 30,
    longitude: 31,
    source: "admin",
    actor_profile_id: centerUser.id,
    captured_at: new Date().toISOString(),
  },
}), "Admin directly inserts location audit event");

mustFail(await rest(`center_location_events?id=eq.${adminHistory.body[0].id}`, adminToken, {
  method: "PATCH",
  prefer: true,
  body: { latitude: 29 },
}), "Admin mutates immutable location history");

const secondCapture = one(await rest("rpc/update_own_center_location", centerToken, {
  method: "POST",
  body: { p_latitude: 30.0445, p_longitude: 31.2358, p_accuracy_m: 12 },
}), "Center repeats location capture");
if (secondCapture.source !== "center_device") throw new Error("Repeated Center capture returned wrong source.");

const historyAfterRepeat = await rest(
  `center_location_events?installation_center_id=eq.${centerOne.id}&select=id,source&order=captured_at.asc`,
  adminToken,
);
if (!historyAfterRepeat.response.ok || historyAfterRepeat.body.length !== 3) {
  throw new Error(`Repeated save did not append a new event: ${JSON.stringify(historyAfterRepeat.body)}`);
}

one(await rest(`profiles?id=eq.${centerUser.id}&select=id,status`, serviceRoleKey, {
  method: "PATCH",
  key: serviceRoleKey,
  prefer: true,
  body: { status: "suspended" },
}), "Service role suspends Center profile through server-only profile contract");
mustFail(await rest("rpc/update_own_center_location", centerToken, {
  method: "POST",
  body: { p_latitude: 30.04, p_longitude: 31.23, p_accuracy_m: 10 },
}), "Suspended Center user captures location");

one(await rest(`profiles?id=eq.${centerUser.id}&select=id,status`, serviceRoleKey, {
  method: "PATCH",
  key: serviceRoleKey,
  prefer: true,
  body: { status: "active" },
}), "Service role reactivates Center profile through server-only profile contract");

one(await rest(`installation_centers?id=eq.${centerOne.id}&select=id,status`, adminToken, {
  method: "PATCH",
  prefer: true,
  body: { status: "suspended" },
}), "Admin suspends Center entity");
mustFail(await rest("rpc/update_own_center_location", centerToken, {
  method: "POST",
  body: { p_latitude: 30.04, p_longitude: 31.23, p_accuracy_m: 10 },
}), "User of suspended Center captures location");

const suspendedAdminCorrection = one(await rest("rpc/admin_update_center_location", adminToken, {
  method: "POST",
  body: { p_center_id: centerOne.id, p_latitude: 30.06, p_longitude: 31.25 },
}), "Admin corrects suspended Center location");
if (suspendedAdminCorrection.source !== "admin") {
  throw new Error("Admin could not correct a suspended Center.");
}

mustFail(await rest("rpc/update_own_center_location", serviceRoleKey, {
  method: "POST",
  key: serviceRoleKey,
  body: { p_latitude: 30, p_longitude: 31, p_accuracy_m: 10 },
}), "service_role executes Center location RPC");

console.log("Center Location Foundation database/RLS/audit verification passed.");
