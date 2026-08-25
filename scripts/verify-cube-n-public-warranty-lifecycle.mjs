import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const apiUrl = process.env.API_URL;
const anonKey = process.env.ANON_KEY;

if (!apiUrl || !anonKey) {
  throw new Error("Local Supabase API_URL and ANON_KEY are required for Cube N lifecycle verification.");
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

async function rpc(name, body, token = anonKey) {
  return request(`/rest/v1/rpc/${name}`, { method: "POST", token, body });
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
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
  const name = names.find((value) => value.startsWith("supabase_db_"));
  assert(name, "Supabase database container was not found for Cube N lifecycle verification.");
  return name;
}

function querySql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", dbContainerName(), "psql", "-At", "-F", "|", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-c", sql],
    { encoding: "utf8" },
  ).trim();
}

function sqlUuid(value) {
  assert(/^[0-9a-f-]{36}$/i.test(value), `Unsafe UUID fixture value: ${value}`);
  return `'${value}'::uuid`;
}

async function resolve(publicCode) {
  const result = await rpc("resolve_public_warranty", { p_public_code: publicCode });
  assert(result.response.ok, `Public Warranty resolver failed: ${result.response.status} ${JSON.stringify(result.body)}`);
  assert(Array.isArray(result.body) && result.body.length === 1,
    `Public Warranty resolver expected one row: ${JSON.stringify(result.body)}`);
  return result.body[0];
}

const adminToken = await signIn("cube-j-admin@example.test");
const centerToken = await signIn("cube-j-center-a@example.test");

const target = querySql(`
  select concat_ws('|',
    warranty.id,
    warranty.warranty_number,
    roll.id,
    roll.serial_number,
    identity.public_code
  )
  from public.warranties warranty
  join public.rolls roll on roll.id = warranty.roll_id
  join private.roll_public_identities identity on identity.roll_id = roll.id
  where warranty.customer_name = 'Cube M Customer'
    and warranty.vehicle_vin = 'ABC123XYZ789'
    and warranty.record_state = 'issued'
  order by warranty.activated_at desc, warranty.id desc
  limit 1;
`).split("|");

assert(target.length === 5 && target.every(Boolean), `Cube M active lifecycle fixture is missing: ${target}`);
const [originalWarrantyId, originalWarrantyNumber, rollId, rollSerial, publicCode] = target;
assert(/^[0-9a-f]{64}$/.test(publicCode), "Lifecycle fixture does not have a valid permanent Public Code.");

const identityCountBefore = querySql(`
  select count(*)
  from private.roll_public_identities
  where roll_id = ${sqlUuid(rollId)}
    and public_code = '${publicCode}';
`);
assert(identityCountBefore === "1", "Lifecycle Roll must begin with exactly one permanent Public Code.");

const initialPublic = await resolve(publicCode);
assert(initialPublic.public_state === "active",
  `Initial public state must be active: ${JSON.stringify(initialPublic)}`);
assert(initialPublic.warranty_number === originalWarrantyNumber,
  "Initial public Warranty Number does not match the effective Cube M Warranty.");

const correctionPayload = {
  p_action_request_id: randomUUID(),
  p_warranty_id: originalWarrantyId,
  p_customer_name: "Cube N Lifecycle Customer",
  p_customer_phone: "+201111222333",
  p_customer_email: "cube-n-lifecycle@example.test",
  p_vehicle_make: "Nissan",
  p_vehicle_model: "Qashqai",
  p_vehicle_year: 2026,
  p_vehicle_plate: "CUBE-N-001",
  p_vehicle_color: "Gray",
  p_vehicle_vin: "CUBENLIFECYCLE001",
  p_reason: "Cube N public lifecycle correction verification.",
};

const correction = await rpc("correct_warranty_details", correctionPayload, adminToken);
assert(correction.response.ok && typeof correction.body === "string" && /^[0-9a-f-]{36}$/i.test(correction.body),
  `Warranty correction failed: ${correction.response.status} ${JSON.stringify(correction.body)}`);

const afterCorrection = await resolve(publicCode);
assert(afterCorrection.public_state === "active",
  `Correction changed the effective public state unexpectedly: ${JSON.stringify(afterCorrection)}`);
assert(afterCorrection.warranty_number === originalWarrantyNumber,
  "Correction must not create or change the Warranty Number.");
assert(afterCorrection.vehicle_make === "Nissan"
  && afterCorrection.vehicle_model === "Qashqai"
  && afterCorrection.vehicle_year === 2026,
  `Allowed public vehicle corrections were not reflected: ${JSON.stringify(afterCorrection)}`);
assert(querySql(`select public_code from private.roll_public_identities where roll_id = ${sqlUuid(rollId)};`) === publicCode,
  "Public Code changed after Warranty detail correction.");

const voidResult = await rpc("void_warranty_in_error", {
  p_action_request_id: randomUUID(),
  p_warranty_id: originalWarrantyId,
  p_reason: "Cube N lifecycle mistaken activation verification.",
}, adminToken);
assert(voidResult.response.ok && typeof voidResult.body === "string" && /^[0-9a-f-]{36}$/i.test(voidResult.body),
  `Warranty void-in-error failed: ${voidResult.response.status} ${JSON.stringify(voidResult.body)}`);

const afterVoid = await resolve(publicCode);
assert(afterVoid.public_state === "no_current_warranty_after_void",
  `Public Code did not resolve the post-void state: ${JSON.stringify(afterVoid)}`);
assert(afterVoid.warranty_number === null,
  "Post-void public state leaked the historical Warranty Number.");
assert(querySql(`select public_code from private.roll_public_identities where roll_id = ${sqlUuid(rollId)};`) === publicCode,
  "Public Code changed or disappeared when the mistaken Warranty was voided.");

const reactivation = await rpc("activate_roll_warranty", {
  p_request_id: randomUUID(),
  p_roll_serial: rollSerial,
  p_customer_name: "Cube N Lifecycle Customer",
  p_customer_phone: "+201111222333",
  p_customer_email: "cube-n-lifecycle@example.test",
  p_vehicle_make: "Nissan",
  p_vehicle_model: "Qashqai",
  p_vehicle_year: 2026,
  p_vehicle_plate: "CUBE-N-001",
  p_vehicle_color: "Gray",
  p_vehicle_vin: "CUBENLIFECYCLE001",
}, centerToken);
assert(reactivation.response.ok && Array.isArray(reactivation.body) && reactivation.body.length === 1,
  `Legitimate reactivation failed: ${reactivation.response.status} ${JSON.stringify(reactivation.body)}`);
const newWarranty = reactivation.body[0];
assert(newWarranty.record_state === "issued"
  && newWarranty.warranty_id !== originalWarrantyId
  && newWarranty.warranty_number !== originalWarrantyNumber,
  `Reactivation must create one new effective Warranty identity: ${JSON.stringify(newWarranty)}`);

const afterReactivation = await resolve(publicCode);
assert(afterReactivation.public_state === "active",
  `Same Public Code did not resolve the new effective Warranty: ${JSON.stringify(afterReactivation)}`);
assert(afterReactivation.warranty_number === newWarranty.warranty_number,
  "Same Public Code did not move to the newly issued Warranty Number.");
assert(afterReactivation.vehicle_make === "Nissan"
  && afterReactivation.vehicle_model === "Qashqai"
  && afterReactivation.vehicle_year === 2026,
  "Reactivated Warranty public vehicle projection is inconsistent.");

assert(querySql(`select public_code from private.roll_public_identities where roll_id = ${sqlUuid(rollId)};`) === publicCode,
  "Public Code changed across void and legitimate reactivation.");
assert(querySql(`select count(*) from private.roll_public_identities where roll_id = ${sqlUuid(rollId)};`) === "1",
  "Lifecycle Roll no longer has exactly one permanent public identity.");
assert(querySql(`
  select count(*)
  from public.warranties
  where roll_id = ${sqlUuid(rollId)} and record_state = 'issued';
`) === "1", "Lifecycle must retain exactly one effective issued Warranty per Roll.");
assert(querySql(`
  select count(*)
  from public.warranties
  where roll_id = ${sqlUuid(rollId)} and record_state = 'voided_in_error';
`) === "1", "Mistaken Warranty history must remain preserved after reactivation.");

console.log("Cube N N4 permanent Public Code lifecycle verification PASS");
