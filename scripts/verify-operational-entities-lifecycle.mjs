const apiUrl = process.env.API_URL;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
const anonKey = process.env.ANON_KEY;

if (!apiUrl || !serviceRoleKey || !anonKey) {
  throw new Error("Local Supabase API_URL, SERVICE_ROLE_KEY and ANON_KEY are required.");
}

const password = "Operational-Entities-Test-2026!";

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function createOperationalUser({ email, role, displayName, dealerId = null, centerId = null }) {
  const response = await fetch(`${apiUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      app_metadata: {
        pg_provisioning: {
          version: "operational-v1",
          role,
          dealer_id: dealerId,
          installation_center_id: centerId,
        },
      },
      user_metadata: { display_name: displayName },
    }),
  });
  const body = await readJson(response);
  if (!response.ok || !body?.id) {
    throw new Error(`Could not create ${role} fixture (${response.status}): ${JSON.stringify(body)}`);
  }
  return body;
}

async function signIn(email) {
  const response = await fetch(`${apiUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  const body = await readJson(response);
  if (!response.ok || !body?.access_token) {
    throw new Error(`Could not sign in ${email} (${response.status}): ${JSON.stringify(body)}`);
  }
  return body.access_token;
}

async function rest(path, token, { method = "GET", body = undefined } = {}) {
  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${token}`,
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    headers.Prefer = "return=representation";
  }

  const response = await fetch(`${apiUrl}/rest/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { response, body: await readJson(response) };
}

function single(result, label) {
  if (!result.response.ok || !Array.isArray(result.body) || result.body.length !== 1) {
    throw new Error(`${label} failed (${result.response.status}): ${JSON.stringify(result.body)}`);
  }
  return result.body[0];
}

await createOperationalUser({
  email: "entities-admin@example.test",
  role: "admin",
  displayName: "مسؤول اختبار الوكلاء والمراكز",
});
const adminToken = await signIn("entities-admin@example.test");

const dealerOne = single(
  await rest("dealers?select=id,code,name,country_code,status", adminToken, {
    method: "POST",
    body: { code: "ENTITY-D1", name: "الوكيل الأول", country_code: "EG" },
  }),
  "Admin dealer create",
);

const dealerTwo = single(
  await rest("dealers?select=id,code,name,country_code,status", adminToken, {
    method: "POST",
    body: { code: "ENTITY-D2", name: "الوكيل الثاني", country_code: "EG" },
  }),
  "Admin second dealer create",
);

const updatedDealer = single(
  await rest(`dealers?id=eq.${dealerOne.id}&select=id,name,country_code,status`, adminToken, {
    method: "PATCH",
    body: { name: "الوكيل الأول بعد التعديل", country_code: "SA" },
  }),
  "Admin dealer edit",
);
if (updatedDealer.name !== "الوكيل الأول بعد التعديل" || updatedDealer.country_code !== "SA") {
  throw new Error(`Dealer edit did not persist expected values: ${JSON.stringify(updatedDealer)}`);
}

const suspendedDealer = single(
  await rest(`dealers?id=eq.${dealerOne.id}&select=id,status`, adminToken, {
    method: "PATCH",
    body: { status: "suspended" },
  }),
  "Admin dealer suspend",
);
if (suspendedDealer.status !== "suspended") throw new Error("Dealer suspension did not persist.");

const reactivatedDealer = single(
  await rest(`dealers?id=eq.${dealerOne.id}&select=id,status`, adminToken, {
    method: "PATCH",
    body: { status: "active" },
  }),
  "Admin dealer reactivate",
);
if (reactivatedDealer.status !== "active") throw new Error("Dealer reactivation did not persist.");

const centerOne = single(
  await rest("installation_centers?select=id,code,name,country_code,city,dealer_id,status", adminToken, {
    method: "POST",
    body: {
      code: "ENTITY-C1",
      name: "المركز الأول",
      country_code: "EG",
      city: "Tanta",
      dealer_id: dealerOne.id,
    },
  }),
  "Admin center create",
);

const centerTwo = single(
  await rest("installation_centers?select=id,code,name,country_code,city,dealer_id,status", adminToken, {
    method: "POST",
    body: {
      code: "ENTITY-C2",
      name: "المركز الثاني",
      country_code: "EG",
      city: "Cairo",
      dealer_id: dealerTwo.id,
    },
  }),
  "Admin second center create",
);

const updatedCenter = single(
  await rest(`installation_centers?id=eq.${centerOne.id}&select=id,name,city,dealer_id,status`, adminToken, {
    method: "PATCH",
    body: { name: "المركز الأول بعد التعديل", city: "Alexandria" },
  }),
  "Admin center edit",
);
if (updatedCenter.name !== "المركز الأول بعد التعديل" || updatedCenter.city !== "Alexandria") {
  throw new Error(`Center edit did not persist expected values: ${JSON.stringify(updatedCenter)}`);
}

const suspendedCenter = single(
  await rest(`installation_centers?id=eq.${centerOne.id}&select=id,status`, adminToken, {
    method: "PATCH",
    body: { status: "suspended" },
  }),
  "Admin center suspend",
);
if (suspendedCenter.status !== "suspended") throw new Error("Center suspension did not persist.");

const reactivatedCenter = single(
  await rest(`installation_centers?id=eq.${centerOne.id}&select=id,status`, adminToken, {
    method: "PATCH",
    body: { status: "active" },
  }),
  "Admin center reactivate",
);
if (reactivatedCenter.status !== "active") throw new Error("Center reactivation did not persist.");

await createOperationalUser({
  email: "entities-dealer@example.test",
  role: "dealer",
  displayName: "مستخدم الوكيل الأول",
  dealerId: dealerOne.id,
});
await createOperationalUser({
  email: "entities-center@example.test",
  role: "center",
  displayName: "مستخدم المركز الأول",
  centerId: centerOne.id,
});

const dealerToken = await signIn("entities-dealer@example.test");
const centerToken = await signIn("entities-center@example.test");

const dealerOwnRow = single(
  await rest(`dealers?id=eq.${dealerOne.id}&select=id,code,name,status`, dealerToken),
  "Dealer own entity read",
);
if (dealerOwnRow.id !== dealerOne.id) throw new Error("Dealer did not receive its own entity.");

const dealerOtherRow = await rest(`dealers?id=eq.${dealerTwo.id}&select=id,code,name,status`, dealerToken);
if (!dealerOtherRow.response.ok || !Array.isArray(dealerOtherRow.body) || dealerOtherRow.body.length !== 0) {
  throw new Error(`Dealer unexpectedly read another dealer: ${JSON.stringify(dealerOtherRow.body)}`);
}

const dealerCenters = await rest("installation_centers?select=id,dealer_id&order=code.asc", dealerToken);
if (!dealerCenters.response.ok || !Array.isArray(dealerCenters.body)) {
  throw new Error(`Dealer center read failed: ${JSON.stringify(dealerCenters.body)}`);
}
if (dealerCenters.body.length !== 1 || dealerCenters.body[0]?.id !== centerOne.id || dealerCenters.body[0]?.dealer_id !== dealerOne.id) {
  throw new Error(`Dealer center scope is incorrect: ${JSON.stringify(dealerCenters.body)}`);
}

const centerOwnRow = single(
  await rest(`installation_centers?id=eq.${centerOne.id}&select=id,dealer_id,name,status`, centerToken),
  "Center own entity read",
);
if (centerOwnRow.id !== centerOne.id) throw new Error("Center did not receive its own center record.");

const centerOtherRow = await rest(`installation_centers?id=eq.${centerTwo.id}&select=id,dealer_id,name,status`, centerToken);
if (!centerOtherRow.response.ok || !Array.isArray(centerOtherRow.body) || centerOtherRow.body.length !== 0) {
  throw new Error(`Center unexpectedly read another center: ${JSON.stringify(centerOtherRow.body)}`);
}

console.log("Operational dealer/center lifecycle regression smoke test passed.");
