const apiUrl = process.env.API_URL;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
const anonKey = process.env.ANON_KEY;

if (!apiUrl || !serviceRoleKey || !anonKey) {
  throw new Error("Local Supabase API_URL, SERVICE_ROLE_KEY and ANON_KEY are required.");
}

const password = "Agent-Network-Foundation-2026!";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

async function request(path, { method = "GET", token = serviceRoleKey, key = serviceRoleKey, body, prefer = false } = {}) {
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

async function createOperationalUser({ email, role, centerId = null }) {
  const result = await request("/auth/v1/admin/users", {
    method: "POST",
    body: {
      email,
      password,
      email_confirm: true,
      app_metadata: {
        pg_provisioning: {
          version: "operational-v1",
          role,
          country_agent_id: null,
          dealer_id: null,
          installation_center_id: centerId,
        },
      },
      user_metadata: { display_name: `ACC Role ${role}` },
    },
  });
  assert(result.response.ok && result.body?.id,
    `Could not create ${role} acceptance user: ${result.response.status} ${JSON.stringify(result.body)}`);
  return result.body;
}

const centerResult = await request(
  "/rest/v1/installation_centers?code=eq.NET-C-DSELF&select=id,code,status",
);
assert(centerResult.response.ok && Array.isArray(centerResult.body) && centerResult.body.length === 1,
  `Expected one NET-C-DSELF Center from the network fixture: ${centerResult.response.status} ${JSON.stringify(centerResult.body)}`);
const center = centerResult.body[0];
assert(center.status === "active", "ACC-01-B Center fixture must remain active.");

await createOperationalUser({
  email: "acc-role-center@example.test",
  role: "center",
  centerId: center.id,
});

const deniedUser = await createOperationalUser({
  email: "acc-role-denied@example.test",
  role: "admin",
});

const suspendResult = await request(
  `/rest/v1/profiles?id=eq.${encodeURIComponent(deniedUser.id)}`,
  {
    method: "PATCH",
    prefer: true,
    body: { status: "suspended" },
  },
);
assert(suspendResult.response.ok && Array.isArray(suspendResult.body) && suspendResult.body.length === 1,
  `Could not suspend the authenticated access-denied fixture: ${suspendResult.response.status} ${JSON.stringify(suspendResult.body)}`);
assert(suspendResult.body[0].status === "suspended",
  "Authenticated access-denied fixture did not persist suspended profile status.");

console.log("ACC-01-B Center and authenticated access-denied fixtures created.");
