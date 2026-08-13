const apiUrl = process.env.API_URL;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
const anonKey = process.env.ANON_KEY;

if (!apiUrl || !serviceRoleKey || !anonKey) throw new Error("Local Supabase env is required.");

const password = "Public-Center-Directory-2026!";

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

async function rest(path, token = anonKey, options = {}) {
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

function mustFail(result, label) {
  if (result.response.ok) throw new Error(`${label} unexpectedly succeeded: ${JSON.stringify(result.body)}`);
}

async function createUser(email, role) {
  const result = await request("/auth/v1/admin/users", {
    method: "POST",
    key: serviceRoleKey,
    token: serviceRoleKey,
    body: {
      email,
      password,
      email_confirm: true,
      app_metadata: { pg_provisioning: { version: "operational-v1", role } },
      user_metadata: { display_name: "Public Directory Admin" },
    },
  });
  if (!result.response.ok || !result.body?.id) throw new Error(`Create user failed: ${JSON.stringify(result.body)}`);
}

async function signIn(email) {
  const result = await request("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } });
  if (!result.response.ok || !result.body?.access_token) throw new Error(`Sign in failed: ${JSON.stringify(result.body)}`);
  return result.body.access_token;
}

async function createCenter(adminToken, body, label) {
  return one(await rest("installation_centers?select=*", adminToken, {
    method: "POST",
    prefer: true,
    body,
  }), label);
}

async function setLocation(adminToken, centerId, latitude, longitude) {
  return one(await rest("rpc/admin_update_center_location", adminToken, {
    method: "POST",
    body: { p_center_id: centerId, p_latitude: latitude, p_longitude: longitude },
  }), `Set location ${centerId}`);
}

async function approve(adminToken, centerId, capturedAt) {
  return one(await rest("rpc/approve_center_network", adminToken, {
    method: "POST",
    body: { p_center_id: centerId, p_expected_location_captured_at: capturedAt },
  }), `Approve ${centerId}`);
}

await createUser("public-directory-admin@example.test", "admin");
const adminToken = await signIn("public-directory-admin@example.test");

const approvedCenter = await createCenter(adminToken, {
  code: "PUB-C-APP",
  name: "Public Approved Center",
  country_code: "EG",
  city: "Cairo",
}, "Create approved Center");
const registeredCenter = await createCenter(adminToken, {
  code: "PUB-C-REG",
  name: "Public Registered Center",
  country_code: "EG",
  city: "Giza",
}, "Create registered Center");
const suspendedCenter = await createCenter(adminToken, {
  code: "PUB-C-SUSP",
  name: "Public Suspended Center",
  country_code: "EG",
  city: "Alexandria",
}, "Create suspended Center");
await createCenter(adminToken, {
  code: "PUB-C-NOLOC",
  name: "Public No Location Center",
  country_code: "EG",
  city: "Tanta",
}, "Create no-location Center");

const approvedLocation = await setLocation(adminToken, approvedCenter.id, 30.0444, 31.2357);
await setLocation(adminToken, registeredCenter.id, 30.0131, 31.2089);
await setLocation(adminToken, suspendedCenter.id, 31.2001, 29.9187);
await approve(adminToken, approvedCenter.id, approvedLocation.captured_at);

one(await rest(`installation_centers?id=eq.${suspendedCenter.id}&select=id,status`, adminToken, {
  method: "PATCH",
  prefer: true,
  body: { status: "suspended" },
}), "Suspend public exclusion Center");

const fixtureCenterNames = new Set([
  "Public Approved Center",
  "Public Registered Center",
  "Public Suspended Center",
  "Public No Location Center",
]);
const anonDirectoryRows = rows(await rest("public_center_directory?select=*&order=center_name.asc"), "Anon reads public Center directory");
const publicRows = anonDirectoryRows.filter((row) => fixtureCenterNames.has(row.center_name));
if (publicRows.length !== 2) throw new Error(`Expected 2 public Centers, got ${JSON.stringify(publicRows)}`);

const approvedPublic = publicRows.find((row) => row.center_name === "Public Approved Center");
const registeredPublic = publicRows.find((row) => row.center_name === "Public Registered Center");
if (!approvedPublic || approvedPublic.classification !== "approved") throw new Error(`Approved classification mismatch: ${JSON.stringify(approvedPublic)}`);
if (!registeredPublic || registeredPublic.classification !== "registered") throw new Error(`Registered classification mismatch: ${JSON.stringify(registeredPublic)}`);
if (publicRows.some((row) => row.center_name.includes("Suspended") || row.center_name.includes("No Location"))) {
  throw new Error(`Excluded Center leaked publicly: ${JSON.stringify(publicRows)}`);
}

const expectedKeys = ["center_name", "city", "classification", "country_code", "latitude", "longitude"];
for (const row of anonDirectoryRows) {
  const keys = Object.keys(row).sort();
  if (JSON.stringify(keys) !== JSON.stringify(expectedKeys)) throw new Error(`Public projection columns changed: ${JSON.stringify(keys)}`);
}

mustFail(await rest("installation_centers?select=id,name,approval_status"), "Anon reads operational Centers directly");
mustFail(await rest("public_center_directory?select=center_name,dealer_id"), "Anon requests private hierarchy field from public projection");

const authenticatedRows = rows(await rest("public_center_directory?select=*&order=center_name.asc", adminToken), "Authenticated reads public directory")
  .filter((row) => fixtureCenterNames.has(row.center_name));
if (JSON.stringify(authenticatedRows) !== JSON.stringify(publicRows)) {
  throw new Error("Authenticated public projection differs from anonymous projection.");
}

const changedLocation = await setLocation(adminToken, approvedCenter.id, 30.0501, 31.2402);
const afterMove = one(await rest("public_center_directory?center_name=eq.Public%20Approved%20Center&select=*"), "Public projection after approved Center moves");
if (afterMove.classification !== "registered") throw new Error(`Location change did not invalidate public approval: ${JSON.stringify(afterMove)}`);

await approve(adminToken, approvedCenter.id, changedLocation.captured_at);
const afterReapproval = one(await rest("public_center_directory?center_name=eq.Public%20Approved%20Center&select=*"), "Public projection after reapproval");
if (afterReapproval.classification !== "approved") throw new Error(`Reapproval not reflected publicly: ${JSON.stringify(afterReapproval)}`);

console.log("Public Center Directory contract passed.");
