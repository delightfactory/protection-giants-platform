import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";

const apiUrl = process.env.API_URL;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
const anonKey = process.env.ANON_KEY;

if (!apiUrl || !serviceRoleKey || !anonKey) {
  throw new Error("UX-DATA-01 verifier requires API_URL, SERVICE_ROLE_KEY and ANON_KEY.");
}

const password = "Cube-J-Roll-Opening-2026!";
const bucket = "warranty-claim-evidence";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

async function request(path, {
  method = "GET",
  token = serviceRoleKey,
  key = serviceRoleKey,
  body,
  rawBody,
  contentType,
} = {}) {
  const headers = { apikey: key, Authorization: `Bearer ${token}` };
  let payload;
  if (rawBody !== undefined) {
    headers["Content-Type"] = contentType ?? "application/octet-stream";
    payload = rawBody;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const response = await fetch(`${apiUrl}${path}`, { method, headers, body: payload });
  return { response, body: await readJson(response) };
}

async function rpc(name, body, token = serviceRoleKey, key = serviceRoleKey) {
  return request(`/rest/v1/rpc/${name}`, { method: "POST", body, token, key });
}

async function userRpc(name, body, token) {
  return rpc(name, body, token, anonKey);
}

async function signIn(email) {
  const result = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    token: anonKey,
    key: anonKey,
    body: { email, password },
  });
  assert(result.response.ok && result.body?.access_token,
    `Could not sign in ${email}: ${result.response.status} ${JSON.stringify(result.body)}`);
  return result.body.access_token;
}

async function expectRpcError(name, body, token, expectedMessage) {
  const result = await userRpc(name, body, token);
  assert(!result.response.ok, `${name} unexpectedly succeeded; expected ${expectedMessage}.`);
  assert(result.body?.message === expectedMessage,
    `${name} expected ${expectedMessage}, got ${result.response.status} ${JSON.stringify(result.body)}`);
  return result;
}

function dbContainerName() {
  const names = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" })
    .split("\n").map((value) => value.trim()).filter(Boolean);
  const name = names.find((value) => value.startsWith("supabase_db_"));
  assert(name, "Supabase DB container not found for UX-DATA-01 verifier.");
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
  assert(/^[0-9a-f-]{36}$/i.test(value), `Unsafe UUID ${value}`);
  return `'${value}'::uuid`;
}

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function jpeg(label) {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Buffer.from(label)]);
}

function evidencePath(inspectionId, slot, bytes) {
  const digest = createHash("sha256").update(bytes).digest("hex");
  return `inspections/${inspectionId}/${slot}-${digest}.jpg`;
}

async function upload(path, bytes) {
  const result = await request(`/storage/v1/object/${bucket}/${path}`, {
    method: "POST",
    rawBody: bytes,
    contentType: "image/jpeg",
  });
  assert(result.response.ok, `Storage upload failed for ${path}: ${result.response.status} ${JSON.stringify(result.body)}`);
}

async function removeStorage(path) {
  const result = await request(`/storage/v1/object/${bucket}/${path}`, { method: "DELETE" });
  assert(result.response.ok || result.response.status === 404,
    `Storage delete failed for ${path}: ${result.response.status} ${JSON.stringify(result.body)}`);
}

function storageObjectCount(path) {
  return Number(querySql(`
    select count(*)
    from storage.objects
    where bucket_id = ${sqlText(bucket)} and name = ${sqlText(path)};
  `));
}

function stageState(path) {
  return querySql(`
    select concat_ws('|', state, actor_profile_id, slot, mime_type, size_bytes)
    from private.operational_evidence_stages
    where storage_path = ${sqlText(path)};
  `);
}

for (const role of ["public", "anon", "authenticated", "service_role"]) {
  if (role === "public") continue;
  assert(querySql(`select has_table_privilege('${role}', 'private.operational_evidence_stages', 'SELECT');`) === "f",
    `${role} unexpectedly reads private operational evidence stages.`);
  assert(querySql(`select has_table_privilege('${role}', 'private.operational_evidence_stages', 'INSERT');`) === "f",
    `${role} unexpectedly inserts private operational evidence stages.`);
  assert(querySql(`select has_table_privilege('${role}', 'private.operational_evidence_stages', 'DELETE');`) === "f",
    `${role} unexpectedly deletes private operational evidence stages.`);
}

const authenticatedFunctions = [
  "public.register_warranty_claim_inspection_evidence_stage(uuid,integer,text,text,bigint)",
  "public.register_warranty_claim_resolution_completion_evidence_stage(uuid,integer,text,text,bigint)",
  "public.register_warranty_claim_admin_recovery_evidence_stage(uuid,integer,text,text,bigint)",
  "public.reserve_operational_evidence_stage_delete(text)",
  "public.finalize_operational_evidence_stage_delete(text)",
];
for (const signature of authenticatedFunctions) {
  assert(querySql(`select has_function_privilege('authenticated', '${signature}', 'EXECUTE');`) === "t",
    `authenticated must execute ${signature}.`);
  for (const role of ["anon", "service_role"]) {
    assert(querySql(`select has_function_privilege('${role}', '${signature}', 'EXECUTE');`) === "f",
      `${role} unexpectedly executes ${signature}.`);
  }
}

for (const signature of [
  "public.claim_stale_operational_evidence_cleanup_candidates(timestamp with time zone,integer)",
  "public.finalize_operational_evidence_cleanup(uuid)",
]) {
  assert(querySql(`select has_function_privilege('service_role', '${signature}', 'EXECUTE');`) === "t",
    `service_role must execute ${signature}.`);
  for (const role of ["anon", "authenticated"]) {
    assert(querySql(`select has_function_privilege('${role}', '${signature}', 'EXECUTE');`) === "f",
      `${role} unexpectedly executes cleanup ${signature}.`);
  }
}

const adminToken = await signIn("cube-j-admin@example.test");
const centerAToken = await signIn("cube-j-center-a@example.test");
const centerBToken = await signIn("cube-j-center-b@example.test");

const centerAProfileId = querySql(`
  select profile.id from public.profiles profile
  join auth.users u on u.id = profile.id
  where u.email = 'cube-j-center-a@example.test';
`);
const centerBProfileId = querySql(`
  select profile.id from public.profiles profile
  join auth.users u on u.id = profile.id
  where u.email = 'cube-j-center-b@example.test';
`);
const centerAPartyId = querySql(`
  select party.id from public.operational_parties party
  join public.installation_centers center on center.id = party.installation_center_id
  where party.party_type = 'center' and center.code = 'CUBE-J-CENTER-A';
`);
const centerBPartyId = querySql(`
  select party.id from public.operational_parties party
  join public.installation_centers center on center.id = party.installation_center_id
  where party.party_type = 'center' and center.code = 'CUBE-J-CENTER-B';
`);
assert(centerAProfileId && centerBProfileId && centerAPartyId && centerBPartyId,
  "UX-DATA-01 requires two Center fixtures.");

const claimId = querySql(`
  select id from public.warranty_claims
  where status = 'submitted' and closed_at is null
  order by submitted_at desc, id desc
  limit 1;
`);
assert(claimId, "UX-DATA-01 requires Cube P submitted Claim fixture.");

let result = await userRpc("start_warranty_claim_review", {
  p_action_request_id: randomUUID(),
  p_claim_id: claimId,
}, adminToken);
assert(result.response.ok, `Could not start review: ${result.response.status} ${JSON.stringify(result.body)}`);

result = await userRpc("request_warranty_claim_inspection", {
  p_action_request_id: randomUUID(),
  p_claim_id: claimId,
  p_center_party_id: centerAPartyId,
}, adminToken);
assert(result.response.ok, `Could not request inspection: ${result.response.status} ${JSON.stringify(result.body)}`);

const inspectionId = querySql(`select id from public.warranty_claim_inspections where claim_id = ${sqlUuid(claimId)};`);
assert(inspectionId, "Inspection fixture missing after request.");

const firstBytes = jpeg(`ux-data-01-first-${inspectionId}`);
const firstPath = evidencePath(inspectionId, 1, firstBytes);
assert(storageObjectCount(firstPath) === 0, "Stage registration test requires object to be absent first.");

const firstRegistration = await userRpc("register_warranty_claim_inspection_evidence_stage", {
  p_inspection_id: inspectionId,
  p_slot: 1,
  p_storage_path: firstPath,
  p_mime_type: "image/jpeg",
  p_size_bytes: firstBytes.length,
}, centerAToken);
assert(firstRegistration.response.ok && /^[0-9a-f-]{36}$/i.test(String(firstRegistration.body)),
  `Initial stage registration failed: ${firstRegistration.response.status} ${JSON.stringify(firstRegistration.body)}`);
assert(storageObjectCount(firstPath) === 0, "Registration must precede and must not itself create a Storage object.");
assert(stageState(firstPath) === `staged|${centerAProfileId}|1|image/jpeg|${firstBytes.length}`,
  `Initial stage projection drifted: ${stageState(firstPath)}`);

const retryRegistration = await userRpc("register_warranty_claim_inspection_evidence_stage", {
  p_inspection_id: inspectionId,
  p_slot: 1,
  p_storage_path: firstPath,
  p_mime_type: "image/jpeg",
  p_size_bytes: firstBytes.length,
}, centerAToken);
assert(retryRegistration.response.ok && retryRegistration.body === firstRegistration.body,
  "Exact registration retry must be idempotent.");

await expectRpcError("register_warranty_claim_inspection_evidence_stage", {
  p_inspection_id: inspectionId,
  p_slot: 1,
  p_storage_path: firstPath,
  p_mime_type: "image/jpeg",
  p_size_bytes: firstBytes.length,
}, centerBToken, "PG_CLAIM_INSPECTION_NOT_ASSIGNED_CENTER");

await expectRpcError("register_warranty_claim_inspection_evidence_stage", {
  p_inspection_id: randomUUID(),
  p_slot: 1,
  p_storage_path: `inspections/${randomUUID()}/1-${"a".repeat(64)}.jpg`,
  p_mime_type: "image/jpeg",
  p_size_bytes: firstBytes.length,
}, centerAToken, "PG_CLAIM_INSPECTION_EVIDENCE_INVALID");

await expectRpcError("register_warranty_claim_inspection_evidence_stage", {
  p_inspection_id: inspectionId,
  p_slot: 2,
  p_storage_path: firstPath,
  p_mime_type: "image/jpeg",
  p_size_bytes: firstBytes.length,
}, centerAToken, "PG_CLAIM_INSPECTION_EVIDENCE_INVALID");

await expectRpcError("register_warranty_claim_inspection_evidence_stage", {
  p_inspection_id: inspectionId,
  p_slot: 1,
  p_storage_path: firstPath,
  p_mime_type: "image/png",
  p_size_bytes: firstBytes.length,
}, centerAToken, "PG_CLAIM_INSPECTION_EVIDENCE_INVALID");

await expectRpcError("register_warranty_claim_inspection_evidence_stage", {
  p_inspection_id: inspectionId,
  p_slot: 1,
  p_storage_path: firstPath,
  p_mime_type: "image/jpeg",
  p_size_bytes: 0,
}, centerAToken, "PG_CLAIM_INSPECTION_EVIDENCE_INVALID");

await upload(firstPath, firstBytes);
assert(storageObjectCount(firstPath) === 1, "Storage object must exist only after explicit upload.");

const deleteBytes = jpeg(`ux-data-01-delete-${inspectionId}`);
const deletePath = evidencePath(inspectionId, 2, deleteBytes);
result = await userRpc("register_warranty_claim_inspection_evidence_stage", {
  p_inspection_id: inspectionId,
  p_slot: 2,
  p_storage_path: deletePath,
  p_mime_type: "image/jpeg",
  p_size_bytes: deleteBytes.length,
}, centerAToken);
assert(result.response.ok, `Delete fixture registration failed: ${result.response.status} ${JSON.stringify(result.body)}`);
await upload(deletePath, deleteBytes);

const reserveDelete = await userRpc("reserve_operational_evidence_stage_delete", { p_storage_path: deletePath }, centerAToken);
assert(reserveDelete.response.ok && stageState(deletePath).startsWith("delete_pending|"),
  `Explicit delete must reserve before Storage removal: ${reserveDelete.response.status} ${stageState(deletePath)}`);
await removeStorage(deletePath);
result = await userRpc("finalize_operational_evidence_stage_delete", { p_storage_path: deletePath }, centerAToken);
assert(result.response.ok && result.body === true && stageState(deletePath) === "",
  `Explicit delete finalization failed: ${result.response.status} ${JSON.stringify(result.body)}`);

const pendingBytes = jpeg(`ux-data-01-pending-${inspectionId}`);
const pendingPath = evidencePath(inspectionId, 3, pendingBytes);
result = await userRpc("register_warranty_claim_inspection_evidence_stage", {
  p_inspection_id: inspectionId,
  p_slot: 3,
  p_storage_path: pendingPath,
  p_mime_type: "image/jpeg",
  p_size_bytes: pendingBytes.length,
}, centerAToken);
assert(result.response.ok, "Could not register delete-pending authority-loss fixture.");
await upload(pendingPath, pendingBytes);
result = await userRpc("reserve_operational_evidence_stage_delete", { p_storage_path: pendingPath }, centerAToken);
assert(result.response.ok && stageState(pendingPath).startsWith("delete_pending|"), "Could not reserve authority-loss fixture.");

result = await userRpc("reassign_warranty_claim_inspection", {
  p_action_request_id: randomUUID(),
  p_claim_id: claimId,
  p_center_party_id: centerBPartyId,
  p_reason: "UX-DATA-01 authority-loss cleanup verification.",
}, adminToken);
assert(result.response.ok, `Could not reassign inspection: ${result.response.status} ${JSON.stringify(result.body)}`);

await expectRpcError("reserve_operational_evidence_stage_delete", { p_storage_path: pendingPath }, centerAToken,
  "PG_CLAIM_INSPECTION_NOT_ASSIGNED_CENTER");

const cleanupClaim = await rpc("claim_stale_operational_evidence_cleanup_candidates", {
  p_stale_before: new Date().toISOString(),
  p_limit: 10,
});
assert(cleanupClaim.response.ok && Array.isArray(cleanupClaim.body),
  `Cleanup claim failed: ${cleanupClaim.response.status} ${JSON.stringify(cleanupClaim.body)}`);
const cleanupPaths = new Set(cleanupClaim.body.map((row) => row.storage_path));
assert(cleanupPaths.has(pendingPath), "delete_pending stage must remain service-role cleanup eligible after actor authority loss.");
assert(cleanupPaths.has(firstPath), "abandoned staged evidence must become a bounded stale cleanup candidate.");
assert(cleanupClaim.body.length <= 10, "Cleanup claim exceeded requested bound.");

for (const row of cleanupClaim.body) {
  await removeStorage(row.storage_path);
  const finalized = await rpc("finalize_operational_evidence_cleanup", { p_stage_id: row.stage_id });
  assert(finalized.response.ok && finalized.body === true,
    `Cleanup finalization failed for ${row.storage_path}: ${finalized.response.status} ${JSON.stringify(finalized.body)}`);
}
assert(stageState(firstPath) === "" && stageState(pendingPath) === "", "Cleanup must remove only reclaimed transient rows.");

const retained = [];
for (let slot = 1; slot <= 5; slot += 1) {
  const bytes = jpeg(`ux-data-01-final-${inspectionId}-${slot}`);
  const path = evidencePath(inspectionId, slot, bytes);
  const registeredStage = await userRpc("register_warranty_claim_inspection_evidence_stage", {
    p_inspection_id: inspectionId,
    p_slot: slot,
    p_storage_path: path,
    p_mime_type: "image/jpeg",
    p_size_bytes: bytes.length,
  }, centerBToken);
  assert(registeredStage.response.ok, `Could not register retained slot ${slot}: ${registeredStage.response.status} ${JSON.stringify(registeredStage.body)}`);
  retained.push({ slot, bytes, path });
}
assert(querySql(`
  select count(*) from private.operational_evidence_stages
  where flow_kind = 'inspection' and inspection_id = ${sqlUuid(inspectionId)}
    and actor_profile_id = ${sqlUuid(centerBProfileId)} and state = 'staged';
`) === "5", "Exactly five retained stages must be allowed for one actor/owner flow.");

await expectRpcError("register_warranty_claim_inspection_evidence_stage", {
  p_inspection_id: inspectionId,
  p_slot: 6,
  p_storage_path: `inspections/${inspectionId}/6-${"b".repeat(64)}.jpg`,
  p_mime_type: "image/jpeg",
  p_size_bytes: 16,
}, centerBToken, "PG_CLAIM_INSPECTION_EVIDENCE_INVALID");

await upload(retained[0].path, retained[0].bytes);
const submitRequestId = randomUUID();
const submitted = await userRpc("submit_warranty_claim_inspection", {
  p_action_request_id: submitRequestId,
  p_inspection_id: inspectionId,
  p_technical_observation: "UX-DATA-01 confirms atomic consumption of staged operational evidence.",
  p_suspected_cause: "Controlled lifecycle verifier",
  p_evidence_paths: [retained[0].path],
}, centerBToken);
assert(submitted.response.ok && submitted.body === inspectionId,
  `Inspection submission failed: ${submitted.response.status} ${JSON.stringify(submitted.body)}`);
assert(stageState(retained[0].path).startsWith(`consumed|${centerBProfileId}|1|image/jpeg|`),
  `Canonical evidence insert must atomically consume its stage: ${stageState(retained[0].path)}`);
assert(querySql(`select count(*) from public.warranty_claim_inspection_evidence where storage_path = ${sqlText(retained[0].path)};`) === "1",
  "Canonical Inspection evidence row missing after successful submission.");

await expectRpcError("reserve_operational_evidence_stage_delete", { p_storage_path: retained[0].path }, centerBToken,
  "PG_OPERATIONAL_EVIDENCE_STAGE_CONSUMED");

const postConsumeCleanup = await rpc("claim_stale_operational_evidence_cleanup_candidates", {
  p_stale_before: new Date().toISOString(),
  p_limit: 50,
});
assert(postConsumeCleanup.response.ok && Array.isArray(postConsumeCleanup.body), "Post-consume cleanup claim failed.");
assert(!postConsumeCleanup.body.some((row) => row.storage_path === retained[0].path),
  "Consumed/business-linked evidence must never be returned by cleanup.");

for (const row of postConsumeCleanup.body) {
  await removeStorage(row.storage_path);
  const finalized = await rpc("finalize_operational_evidence_cleanup", { p_stage_id: row.stage_id });
  assert(finalized.response.ok && finalized.body === true, `Could not clean abandoned retained stage ${row.storage_path}.`);
}
assert(storageObjectCount(retained[0].path) === 1, "Cleanup must not delete canonical consumed Storage evidence.");

console.log("UX-DATA-01 operational evidence lifecycle verifier passed.");
