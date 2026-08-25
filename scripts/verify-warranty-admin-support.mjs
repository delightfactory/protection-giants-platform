import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const apiUrl = process.env.API_URL;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
const anonKey = process.env.ANON_KEY;

if (!apiUrl || !serviceRoleKey || !anonKey) {
  throw new Error("Local Supabase API_URL, SERVICE_ROLE_KEY and ANON_KEY are required.");
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

async function request(path, { method = "GET", token = anonKey, key = anonKey, body } = {}) {
  const headers = { apikey: key, Authorization: `Bearer ${token}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
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

async function rpc(name, body, token) {
  return rest(`rpc/${name}`, token, { method: "POST", body });
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

async function expectRpcError(name, body, token, expectedMessage) {
  const result = await rpc(name, body, token);
  assert(!result.response.ok, `${name} unexpectedly succeeded; expected ${expectedMessage}.`);
  assert(result.body?.message === expectedMessage,
    `${name} expected ${expectedMessage}, received ${result.response.status} ${JSON.stringify(result.body)}`);
  return result;
}

function dbContainerName() {
  const names = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" })
    .split("\n").map((value) => value.trim()).filter(Boolean);
  const name = names.find((value) => value.startsWith("supabase_db_"));
  assert(name, "Supabase database container was not found for Cube M Admin support verification.");
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

const adminToken = await signIn("cube-j-admin@example.test");
const centerToken = await signIn("cube-j-center-a@example.test");
const agentToken = await signIn("cube-m-read-agent@example.test");
const dealerToken = await signIn("cube-m-read-dealer@example.test");

const correctionSignature = "public.correct_warranty_details(uuid,uuid,text,text,text,text,text,smallint,text,text,text,text)";
const voidSignature = "public.void_warranty_in_error(uuid,uuid,text)";
for (const signature of [correctionSignature, voidSignature]) {
  assert(querySql(`select has_function_privilege('authenticated', '${signature}', 'EXECUTE');`) === "t",
    `authenticated must receive explicit EXECUTE on ${signature}.`);
  for (const role of ["anon", "service_role"]) {
    assert(querySql(`select has_function_privilege('${role}', '${signature}', 'EXECUTE');`) === "f",
      `${role} must not execute ${signature}.`);
  }
}
for (const role of ["anon", "authenticated", "service_role"]) {
  assert(querySql(`select has_table_privilege('${role}', 'public.warranties', 'UPDATE');`) === "f",
    `${role} must not receive direct Warranty UPDATE privilege.`);
  assert(querySql(`select has_table_privilege('${role}', 'public.warranty_events', 'INSERT');`) === "f",
    `${role} must not receive direct Warranty event INSERT privilege.`);
}

const target = querySql(`
  select concat_ws('|', warranty.id, warranty.warranty_number, roll.serial_number)
  from public.warranties warranty
  join public.rolls roll on roll.id = warranty.roll_id
  where warranty.customer_name = 'Cube M Customer'
    and warranty.vehicle_vin = 'ABC123XYZ789'
    and warranty.record_state = 'issued'
  order by warranty.activated_at desc, warranty.id desc
  limit 1;
`).split("|");
assert(target.length === 3 && target.every(Boolean), `Issued support fixture missing: ${target}`);
const [warrantyId, warrantyNumber, rollSerial] = target;

const beforeResult = await rpc("get_internal_warranty_detail", { p_warranty_id: warrantyId }, adminToken);
assert(beforeResult.response.ok && Array.isArray(beforeResult.body) && beforeResult.body.length === 1,
  `Could not read Admin support fixture: ${beforeResult.response.status} ${JSON.stringify(beforeResult.body)}`);
const before = beforeResult.body[0];

const correctionRequestId = randomUUID();
const correctionPayload = {
  p_action_request_id: correctionRequestId,
  p_warranty_id: warrantyId,
  p_customer_name: "  Cube M Corrected Customer  ",
  p_customer_phone: "  +201222333444  ",
  p_customer_email: "  CORRECTED@EXAMPLE.TEST  ",
  p_vehicle_make: "  Corrected Make  ",
  p_vehicle_model: "  Corrected Model  ",
  p_vehicle_year: 2025,
  p_vehicle_plate: "  XYZ 987  ",
  p_vehicle_color: "  Silver  ",
  p_vehicle_vin: "  correctedvin123  ",
  p_reason: "  Customer supplied corrected registration details.  ",
};

await expectRpcError("correct_warranty_details", correctionPayload, centerToken, "PG_WARRANTY_ADMIN_REQUIRED");
await expectRpcError("correct_warranty_details", correctionPayload, agentToken, "PG_WARRANTY_ADMIN_REQUIRED");
await expectRpcError("correct_warranty_details", correctionPayload, dealerToken, "PG_WARRANTY_ADMIN_REQUIRED");
await expectRpcError("correct_warranty_details", {
  ...correctionPayload,
  p_action_request_id: randomUUID(),
  p_reason: "bad",
}, adminToken, "PG_WARRANTY_CORRECTION_REASON_INVALID");
await expectRpcError("correct_warranty_details", {
  ...correctionPayload,
  p_action_request_id: randomUUID(),
  p_vehicle_vin: "bad vin",
}, adminToken, "PG_WARRANTY_DETAILS_INVALID");

const correction = await rpc("correct_warranty_details", correctionPayload, adminToken);
assert(correction.response.ok && typeof correction.body === "string" && /^[0-9a-f-]{36}$/i.test(correction.body),
  `Admin correction failed: ${correction.response.status} ${JSON.stringify(correction.body)}`);
const correctionEventId = correction.body;

const correctedResult = await rpc("get_internal_warranty_detail", { p_warranty_id: warrantyId }, adminToken);
assert(correctedResult.response.ok && correctedResult.body.length === 1,
  `Could not read corrected Warranty: ${correctedResult.response.status} ${JSON.stringify(correctedResult.body)}`);
const corrected = correctedResult.body[0];
assert(corrected.warranty_number === warrantyNumber
  && corrected.roll_serial === rollSerial
  && corrected.customer_name === "Cube M Corrected Customer"
  && corrected.customer_phone === "+201222333444"
  && corrected.customer_email === "corrected@example.test"
  && corrected.vehicle_make === "Corrected Make"
  && corrected.vehicle_model === "Corrected Model"
  && corrected.vehicle_year === 2025
  && corrected.vehicle_plate === "XYZ 987"
  && corrected.vehicle_color === "Silver"
  && corrected.vehicle_vin === "CORRECTEDVIN123",
  `Corrected Warranty detail is inconsistent: ${JSON.stringify(corrected)}`);
assert(corrected.product_code === before.product_code
  && corrected.product_name === before.product_name
  && corrected.product_version === before.product_version
  && corrected.activating_center_party_id === before.activating_center_party_id
  && corrected.activating_center_name === before.activating_center_name
  && corrected.activated_at === before.activated_at
  && corrected.coverage_expires_at === before.coverage_expires_at
  && corrected.warranty_months === before.warranty_months
  && corrected.warranty_coverage === before.warranty_coverage
  && corrected.care_instructions === before.care_instructions,
  "Admin detail correction must not mutate immutable Warranty core/policy/coverage snapshots.");

const audit = querySql(`
  select concat_ws('|',
    event.id,
    event.event_kind,
    event.reason,
    event.change_snapshot->'before'->>'customer_name',
    event.change_snapshot->'after'->>'customer_name',
    event.change_snapshot->'after'->>'vehicle_vin'
  )
  from public.warranty_events event
  where event.action_request_id = ${sqlUuid(correctionRequestId)};
`).split("|");
assert(audit[0] === correctionEventId
  && audit[1] === "details_corrected"
  && audit[2] === "Customer supplied corrected registration details."
  && audit[3] === before.customer_name
  && audit[4] === "Cube M Corrected Customer"
  && audit[5] === "CORRECTEDVIN123",
  `Correction audit snapshot is incomplete: ${audit}`);

const correctionRetry = await rpc("correct_warranty_details", correctionPayload, adminToken);
assert(correctionRetry.response.ok && correctionRetry.body === correctionEventId,
  "Matching correction retry must return the original audit event ID.");
assert(querySql(`select count(*) from public.warranty_events where action_request_id = ${sqlUuid(correctionRequestId)};`) === "1",
  "Correction retry must not duplicate audit events.");
await expectRpcError("correct_warranty_details", {
  ...correctionPayload,
  p_customer_phone: "+201999999999",
}, adminToken, "PG_WARRANTY_REQUEST_CONFLICT");
await expectRpcError("correct_warranty_details", {
  ...correctionPayload,
  p_action_request_id: randomUUID(),
}, adminToken, "PG_WARRANTY_DETAILS_INVALID");

const voidRequestId = randomUUID();
const voidPayload = {
  p_action_request_id: voidRequestId,
  p_warranty_id: warrantyId,
  p_reason: "  Activation was recorded against the wrong physical Roll.  ",
};
await expectRpcError("void_warranty_in_error", voidPayload, centerToken, "PG_WARRANTY_ADMIN_REQUIRED");
await expectRpcError("void_warranty_in_error", {
  ...voidPayload,
  p_action_request_id: randomUUID(),
  p_reason: "bad",
}, adminToken, "PG_WARRANTY_CORRECTION_REASON_INVALID");

const voided = await rpc("void_warranty_in_error", voidPayload, adminToken);
assert(voided.response.ok && typeof voided.body === "string" && /^[0-9a-f-]{36}$/i.test(voided.body),
  `Admin void-in-error failed: ${voided.response.status} ${JSON.stringify(voided.body)}`);
const voidEventId = voided.body;

const voidedResult = await rpc("get_internal_warranty_detail", { p_warranty_id: warrantyId }, adminToken);
assert(voidedResult.response.ok && voidedResult.body.length === 1,
  `Could not read voided Warranty: ${voidedResult.response.status} ${JSON.stringify(voidedResult.body)}`);
const voidedDetail = voidedResult.body[0];
assert(voidedDetail.record_state === "voided_in_error"
  && voidedDetail.derived_state === "voided"
  && voidedDetail.admin_void_reason === "Activation was recorded against the wrong physical Roll."
  && voidedDetail.warranty_number === warrantyNumber,
  `Voided Warranty detail is inconsistent: ${JSON.stringify(voidedDetail)}`);
assert(querySql(`
  select count(*) from public.warranty_events
  where id = ${sqlUuid(voidEventId)}
    and warranty_id = ${sqlUuid(warrantyId)}
    and action_request_id = ${sqlUuid(voidRequestId)}
    and event_kind = 'voided_in_error'
    and change_snapshot is null;
`) === "1", "Void-in-error must append exactly one immutable audit event.");

const voidRetry = await rpc("void_warranty_in_error", voidPayload, adminToken);
assert(voidRetry.response.ok && voidRetry.body === voidEventId,
  "Matching void retry must return the original audit event ID.");
await expectRpcError("void_warranty_in_error", {
  ...voidPayload,
  p_reason: "A different reason using the same request ID.",
}, adminToken, "PG_WARRANTY_REQUEST_CONFLICT");
await expectRpcError("void_warranty_in_error", {
  ...voidPayload,
  p_action_request_id: randomUUID(),
}, adminToken, "PG_WARRANTY_ALREADY_VOIDED");
await expectRpcError("correct_warranty_details", {
  ...correctionPayload,
  p_action_request_id: randomUUID(),
  p_customer_phone: "+201555666777",
}, adminToken, "PG_WARRANTY_ALREADY_VOIDED");

const historicalCorrectionRetry = await rpc("correct_warranty_details", correctionPayload, adminToken);
assert(historicalCorrectionRetry.response.ok && historicalCorrectionRetry.body === correctionEventId,
  "A valid old correction retry must remain idempotent after a later void transition.");

const candidateAfterVoid = await rpc("resolve_warranty_activation_candidate", {
  p_roll_serial: rollSerial,
}, centerToken);
assert(candidateAfterVoid.response.ok && candidateAfterVoid.body?.[0]?.eligibility === "eligible",
  `Void-in-error must remove only the Warranty-specific Activation block: ${candidateAfterVoid.response.status} ${JSON.stringify(candidateAfterVoid.body)}`);

const reactivation = await rpc("activate_roll_warranty", {
  p_request_id: randomUUID(),
  p_roll_serial: rollSerial,
  p_customer_name: corrected.customer_name,
  p_customer_phone: corrected.customer_phone,
  p_customer_email: corrected.customer_email,
  p_vehicle_make: corrected.vehicle_make,
  p_vehicle_model: corrected.vehicle_model,
  p_vehicle_year: corrected.vehicle_year,
  p_vehicle_plate: corrected.vehicle_plate,
  p_vehicle_color: corrected.vehicle_color,
  p_vehicle_vin: corrected.vehicle_vin,
}, centerToken);
assert(reactivation.response.ok && Array.isArray(reactivation.body) && reactivation.body.length === 1,
  `Roll must remain reactivatable after Admin void-in-error: ${reactivation.response.status} ${JSON.stringify(reactivation.body)}`);
assert(reactivation.body[0].warranty_id !== warrantyId
  && reactivation.body[0].warranty_number !== warrantyNumber
  && reactivation.body[0].record_state === "issued",
  "Reactivation after support void must create a new effective Warranty identity.");
assert(querySql(`
  select count(*) from public.warranties warranty
  join public.rolls roll on roll.id = warranty.roll_id
  where roll.serial_number = '${rollSerial}' and warranty.record_state = 'issued';
`) === "1", "Support void/reactivation must preserve one effective Warranty per Roll.");

console.log("Cube M Admin Warranty support RPCs verified.");
