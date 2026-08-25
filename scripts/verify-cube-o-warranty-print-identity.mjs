import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const apiUrl = process.env.API_URL;
const anonKey = process.env.ANON_KEY;

if (!apiUrl || !anonKey) {
  throw new Error("Local Supabase API_URL and ANON_KEY are required for Cube O verification.");
}

const password = "Cube-J-Roll-Opening-2026!";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

async function request(path, { method = "GET", token = anonKey, body } = {}) {
  const headers = { apikey: anonKey, Authorization: `Bearer ${token}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { response, body: await readJson(response) };
}

async function rpc(name, body, token) {
  return request(`/rest/v1/rpc/${name}`, { method: "POST", token, body });
}

async function signIn(email) {
  const result = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email, password },
  });
  assert(
    result.response.ok && result.body?.access_token,
    `Could not sign in ${email}: ${result.response.status} ${JSON.stringify(result.body)}`,
  );
  return result.body.access_token;
}

async function expectRpcError(body, token, expectedMessage) {
  const result = await rpc("list_roll_warranty_print_identities", body, token);
  assert(!result.response.ok, `Print identity RPC unexpectedly succeeded; expected ${expectedMessage}.`);
  assert(
    result.body?.message === expectedMessage,
    `Expected ${expectedMessage}, received ${result.response.status} ${JSON.stringify(result.body)}`,
  );
}

function dbContainerName() {
  const names = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" })
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
  const name = names.find((value) => value.startsWith("supabase_db_"));
  assert(name, "Supabase database container was not found for Cube O verification.");
  return name;
}

function querySql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", dbContainerName(), "psql", "-At", "-F", "|", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-c", sql],
    { encoding: "utf8" },
  ).trim();
}

const signature = "public.list_roll_warranty_print_identities(uuid)";
assert(
  querySql(`select has_function_privilege('authenticated', '${signature}', 'EXECUTE');`) === "t",
  "authenticated must receive explicit EXECUTE on the bounded Cube O print identity RPC.",
);
for (const role of ["anon", "service_role"]) {
  assert(
    querySql(`select has_function_privilege('${role}', '${signature}', 'EXECUTE');`) === "f",
    `${role} must not execute ${signature}.`,
  );
}

for (const role of ["anon", "authenticated", "service_role"]) {
  assert(
    querySql(`select has_table_privilege('${role}', 'private.roll_public_identities', 'SELECT');`) === "f",
    `${role} unexpectedly gained SELECT on private.roll_public_identities.`,
  );
  assert(
    querySql(`select has_function_privilege('${role}', 'private.lock_roll_print_admin_context()', 'EXECUTE');`) === "f",
    `${role} unexpectedly can execute the private Cube O Admin context helper.`,
  );
}

const target = querySql(`
  select production_order.id::text
  from public.production_orders production_order
  where exists (
    select 1
    from public.rolls roll
    where roll.production_order_id = production_order.id
  )
  order by production_order.created_at, production_order.id
  limit 1;
`);
assert(/^[0-9a-f-]{36}$/i.test(target), `Cube O verification could not find a Production Order with Rolls: ${target}`);

const expectedRows = querySql(`
  select concat_ws('|', roll.id::text, identity.public_code)
  from public.rolls roll
  join private.roll_public_identities identity on identity.roll_id = roll.id
  where roll.production_order_id = '${target}'::uuid
  order by roll.id;
`).split("\n").filter(Boolean);
assert(expectedRows.length > 0, "Cube O verification target has no private Roll identities.");

const adminToken = await signIn("cube-j-admin@example.test");
const centerToken = await signIn("cube-j-center-a@example.test");

await expectRpcError({ p_production_order_id: target }, centerToken, "PG_ROLL_PRINT_ADMIN_REQUIRED");
await expectRpcError({ p_production_order_id: null }, adminToken, "PG_ROLL_PRINT_ORDER_REQUIRED");
await expectRpcError({ p_production_order_id: randomUUID() }, adminToken, "PG_ROLL_PRINT_ORDER_NOT_FOUND");

const result = await rpc("list_roll_warranty_print_identities", { p_production_order_id: target }, adminToken);
assert(
  result.response.ok && Array.isArray(result.body),
  `Admin print identity RPC failed: ${result.response.status} ${JSON.stringify(result.body)}`,
);
assert(result.body.length === expectedRows.length,
  `Print identity RPC row count differs from the exact private source: expected=${expectedRows.length}, actual=${result.body.length}`);

const actualRows = result.body
  .map((row) => {
    assert(/^[0-9a-f-]{36}$/i.test(row.roll_id), `RPC returned an invalid Roll id: ${JSON.stringify(row)}`);
    assert(/^[0-9a-f]{64}$/.test(row.public_code), `RPC returned an invalid Public Code: ${JSON.stringify(row)}`);
    return `${row.roll_id}|${row.public_code}`;
  })
  .sort();
assert(new Set(actualRows).size === actualRows.length, "Print identity RPC returned duplicate Roll mappings.");
assert(
  JSON.stringify(actualRows) === JSON.stringify([...expectedRows].sort()),
  "Print identity RPC did not return the exact Roll/Public Code mapping for the requested order.",
);

const otherOrderCount = Number(querySql(`
  select count(*)
  from public.rolls roll
  where roll.production_order_id <> '${target}'::uuid;
`));
if (otherOrderCount > 0) {
  const targetIds = new Set(result.body.map((row) => row.roll_id));
  const foreignIds = querySql(`
    select roll.id::text
    from public.rolls roll
    where roll.production_order_id <> '${target}'::uuid;
  `).split("\n").filter(Boolean);
  assert(foreignIds.every((id) => !targetIds.has(id)), "Bounded print identity RPC leaked a Roll from another Production Order.");
}

console.log("Cube O O1 Warranty print identity boundary verification passed.");