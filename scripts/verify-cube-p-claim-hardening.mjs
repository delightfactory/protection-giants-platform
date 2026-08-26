import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";

const apiUrl = process.env.API_URL;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
if (!apiUrl || !serviceRoleKey) {
  throw new Error("Local Supabase API_URL and SERVICE_ROLE_KEY are required.");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

async function request(path, { method = "GET", body, rawBody, contentType } = {}) {
  const headers = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` };
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

async function rpc(name, body) {
  return request(`/rest/v1/rpc/${name}`, { method: "POST", body });
}

function dbContainerName() {
  const names = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" })
    .split("\n").map((value) => value.trim()).filter(Boolean);
  const name = names.find((value) => value.startsWith("supabase_db_"));
  assert(name, "Supabase database container was not found for Cube P hardening verification.");
  return name;
}

function querySql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", dbContainerName(), "psql", "-At", "-F", "|", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-c", sql],
    { encoding: "utf8" },
  ).trim();
}

function runSql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", dbContainerName(), "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
    { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  );
}

function sqlUuid(value) {
  assert(/^[0-9a-f-]{36}$/i.test(value), `Unsafe UUID: ${value}`);
  return `'${value}'::uuid`;
}

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function one(result, label) {
  assert(result.response.ok && Array.isArray(result.body) && result.body.length === 1,
    `${label}: ${result.response.status} ${JSON.stringify(result.body)}`);
  return result.body[0];
}

// Static orchestration regression: registry reservation must happen before the
// physical upload, and final submission must reconcile the exact Storage folder.
const actions = fs.readFileSync("app/(public)/w/[publicCode]/claim/actions.ts", "utf8");
const registerIndex = actions.indexOf("const registered = await registerDraftEvidence(access, evidence);");
const uploadIndex = actions.indexOf(".upload(storagePath, bytes");
assert(registerIndex >= 0 && uploadIndex >= 0 && registerIndex < uploadIndex,
  "Claim evidence registry must be reserved before physical Storage upload.");
assert(actions.includes("safelyDiscardUncommittedEvidence(access, extraPaths)"),
  "Claim submit must reconcile physical Storage extras through the locked removal path.");
assert(actions.includes("if (objects.length !== paths.length) return null;"),
  "Claim submit must fail closed unless the physical draft folder exactly matches submitted evidence.");
assert(actions.includes("PG_CLAIM_EVIDENCE_UPLOAD_AMBIGUOUS"),
  "Ambiguous upload state must remain explicit and retryable.");

const hardeningMigration = fs.readFileSync("supabase/migrations/20260826031000_cube_p_premerge_hardening.sql", "utf8");
assert(hardeningMigration.includes("v_body := btrim(left("),
  "Claim notification projector must trim after bounding so Cube L body-shape constraints cannot reject a valid max-length Claim.");
assert(hardeningMigration.includes("clock_timestamp() - interval '1 hour'"),
  "Stale Claim cleanup must preserve a conservative grace for staged external Storage uploads.");

assert(querySql(`
  select count(*)
  from information_schema.columns
  where table_schema = 'private'
    and table_name = 'warranty_claim_phone_verification_limits'
    and column_name in ('phone', 'customer_phone', 'attempted_phone');
`) === "0", "Phone verification limiter must never persist attempted phone values.");

for (const role of ["anon", "authenticated", "service_role"]) {
  for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
    assert(querySql(`select has_table_privilege('${role}', 'private.warranty_claim_phone_verification_limits', '${privilege}')`) === "f",
      `${role} unexpectedly has ${privilege} on the private Claim phone limiter.`);
  }
}

const fixture = querySql(`
  select concat_ws('|', warranty.id, warranty.customer_phone, identity.public_code)
  from public.warranties warranty
  join private.roll_public_identities identity on identity.roll_id = warranty.roll_id
  where warranty.record_state = 'issued'
    and warranty.coverage_expires_at > now()
  order by warranty.activated_at desc, warranty.id desc
  limit 1;
`).split("|");
assert(fixture.length === 3 && fixture[0] && fixture[1] && fixture[2], `Active Warranty fixture missing: ${fixture}`);
const [fixtureWarrantyId, fixturePhone, fixtureCode] = fixture;
const limiterHash = querySql(`select md5(${sqlText(fixtureCode)});`);
runSql(`delete from private.warranty_claim_phone_verification_limits where public_code_hash = ${sqlText(limiterHash)};`);

// Seven mistakes remain below the threshold.
for (let attempt = 1; attempt <= 7; attempt += 1) {
  const wrong = await rpc("verify_customer_warranty_claim_phone", {
    p_public_code: fixtureCode,
    p_phone: `+20999999${String(attempt).padStart(3, "0")}`,
  });
  assert(wrong.response.ok && Array.isArray(wrong.body) && wrong.body.length === 0,
    `Wrong-phone attempt ${attempt} must fail generically.`);
}
assert(querySql(`
  select concat_ws('|', failed_attempts, blocked_until is null)
  from private.warranty_claim_phone_verification_limits
  where public_code_hash = ${sqlText(limiterHash)};
`) === "7|t", "Seven failed phone attempts must not yet block the QR identity.");

const eighth = await rpc("verify_customer_warranty_claim_phone", {
  p_public_code: fixtureCode,
  p_phone: "+209999999999",
});
assert(eighth.response.ok && Array.isArray(eighth.body) && eighth.body.length === 0,
  "Eighth wrong-phone attempt must still return the same generic failure shape.");
assert(querySql(`
  select concat_ws('|', failed_attempts, blocked_until > now())
  from private.warranty_claim_phone_verification_limits
  where public_code_hash = ${sqlText(limiterHash)};
`) === "8|t", "Eighth failed phone attempt must start the temporary block.");

const blockedCorrect = await rpc("verify_customer_warranty_claim_phone", {
  p_public_code: fixtureCode,
  p_phone: fixturePhone,
});
assert(blockedCorrect.response.ok && Array.isArray(blockedCorrect.body) && blockedCorrect.body.length === 0,
  "Blocked QR verification must fail closed without revealing that the supplied phone is correct.");

// Expire the bounded window deterministically, then prove a legitimate success
// works again and clears limiter state.
runSql(`
  update private.warranty_claim_phone_verification_limits
  set window_started_at = now() - interval '16 minutes',
      blocked_until = now() - interval '1 minute',
      updated_at = now()
  where public_code_hash = ${sqlText(limiterHash)};
`);
const recovered = one(await rpc("verify_customer_warranty_claim_phone", {
  p_public_code: fixtureCode,
  p_phone: fixturePhone,
}), "Correct phone after throttle window");
assert(recovered.warranty_id === fixtureWarrantyId, "Correct phone must recover after the bounded throttle window.");
assert(querySql(`select count(*) from private.warranty_claim_phone_verification_limits where public_code_hash = ${sqlText(limiterHash)}`) === "0",
  "Successful verification must clear limiter state for that QR identity.");

const limiterCountBeforeUnknown = querySql("select count(*) from private.warranty_claim_phone_verification_limits;");
const unknownCode = "f".repeat(64);
const unknown = await rpc("verify_customer_warranty_claim_phone", {
  p_public_code: unknownCode,
  p_phone: "+201000000000",
});
assert(unknown.response.ok && Array.isArray(unknown.body) && unknown.body.length === 0,
  "Unknown Public Code must retain the generic verification failure shape.");
assert(querySql("select count(*) from private.warranty_claim_phone_verification_limits;") === limiterCountBeforeUnknown,
  "Unknown random Public Codes must not create limiter rows.");

// An external upload may have reserved staged metadata just before the verified
// context expires. A one-minute-old staged draft must not be reclaimed, while the
// same draft becomes eligible once the conservative one-hour grace has elapsed.
const graceDraftId = randomUUID();
const gracePath = `${graceDraftId}/${"f".repeat(64)}.jpg`;
runSql(`
  insert into private.warranty_claim_drafts (
    id, warranty_id, state, expires_at, created_at
  ) values (
    ${sqlUuid(graceDraftId)}, ${sqlUuid(fixtureWarrantyId)}, 'open',
    now() - interval '1 minute', now() - interval '2 minutes'
  );
  insert into private.warranty_claim_draft_evidence (
    draft_id, storage_path, mime_type, size_bytes, state
  ) values (
    ${sqlUuid(graceDraftId)}, ${sqlText(gracePath)}, 'image/jpeg', 128, 'staged'
  );
`);
const earlyGrace = await rpc("claim_expired_warranty_claim_draft_cleanup_candidates", { p_limit: 50 });
assert(earlyGrace.response.ok && Array.isArray(earlyGrace.body)
  && !earlyGrace.body.some((candidate) => candidate.draft_id === graceDraftId),
"Recently expired staged draft must stay outside cleanup during the external-Storage grace window.");
assert(querySql(`select state from private.warranty_claim_drafts where id = ${sqlUuid(graceDraftId)}`) === "open",
  "Grace-protected staged draft must remain open.");
runSql(`
  update private.warranty_claim_drafts
  set expires_at = now() - interval '2 hours',
      created_at = now() - interval '3 hours'
  where id = ${sqlUuid(graceDraftId)};
`);
const agedGrace = await rpc("claim_expired_warranty_claim_draft_cleanup_candidates", { p_limit: 50 });
assert(agedGrace.response.ok && Array.isArray(agedGrace.body)
  && agedGrace.body.some((candidate) => candidate.draft_id === graceDraftId),
"Staged draft must become cleanup-eligible after the conservative grace window.");
assert(querySql(`select state from private.warranty_claim_drafts where id = ${sqlUuid(graceDraftId)}`) === "cleanup_pending",
  "Aged staged draft must enter cleanup_pending when claimed for stale cleanup.");

// Build a dedicated active Warranty whose valid metadata pushes the natural
// notification body over 300 characters. The model value is constructed so the
// 300th natural character is whitespace; correct projector hardening must trim
// that boundary and still let the Claim commit.
const sourceWarrantyId = fixtureWarrantyId;
const candidateRoll = querySql(`
  select roll.id::text
  from public.rolls roll
  where not exists (
    select 1 from public.warranties warranty
    where warranty.roll_id = roll.id and warranty.record_state = 'issued'
  )
    and exists (
      select 1 from private.roll_public_identities identity where identity.roll_id = roll.id
    )
  order by roll.created_at, roll.id
  limit 1;
`);
assert(candidateRoll, "Notification boundary test requires a Roll without an issued Warranty.");

const longWarrantyId = randomUUID();
const longWarrantyNumber = `PG-W-${String(Math.floor(Math.random() * 90000000) + 10000000)}`;
const longPhone = `+2010${String(Math.floor(Math.random() * 90000000) + 10000000)}`;
const longProduct = "P".repeat(120);
const longMake = "M".repeat(120);
const longModel = `${"D".repeat(18)} ${"D".repeat(101)}`;
assert(longModel.length === 120, "Boundary vehicle model fixture must remain schema-valid at exactly 120 characters.");
runSql(`
  insert into public.warranties (
    id, request_id, roll_id, warranty_number, record_state,
    activated_by_profile_id, activating_center_party_id, activating_center_name_snapshot,
    activated_at, coverage_expires_at,
    product_id, product_code_snapshot, product_name_snapshot, product_version_snapshot,
    warranty_months_snapshot, warranty_coverage_snapshot, care_instructions_snapshot,
    customer_name, customer_phone, customer_email,
    vehicle_make, vehicle_model, vehicle_year, vehicle_plate, vehicle_color, vehicle_vin
  )
  select
    ${sqlUuid(longWarrantyId)}, gen_random_uuid(), ${sqlUuid(candidateRoll)}, ${sqlText(longWarrantyNumber)}, 'issued',
    source.activated_by_profile_id, source.activating_center_party_id, source.activating_center_name_snapshot,
    now() - interval '1 day', now() + interval '1 year',
    source.product_id, source.product_code_snapshot, ${sqlText(longProduct)}, source.product_version_snapshot,
    source.warranty_months_snapshot, source.warranty_coverage_snapshot, source.care_instructions_snapshot,
    'Boundary Notification Customer', ${sqlText(longPhone)}, null,
    ${sqlText(longMake)}, ${sqlText(longModel)}, 2026, null, null, 'BOUNDARYVIN123'
  from public.warranties source
  where source.id = ${sqlUuid(sourceWarrantyId)};
`);
const longPublicCode = querySql(`select public_code from private.roll_public_identities where roll_id = ${sqlUuid(candidateRoll)};`);
assert(longPublicCode, "Boundary Warranty Roll must have a permanent Public Code.");
const longVerified = one(await rpc("verify_customer_warranty_claim_phone", {
  p_public_code: longPublicCode,
  p_phone: longPhone,
}), "Verify boundary Warranty phone");

const draftId = randomUUID();
const draftOpened = await rpc("open_customer_warranty_claim_draft", {
  p_draft_id: draftId,
  p_warranty_id: longWarrantyId,
  p_verified_phone_normalized: longVerified.normalized_phone,
  p_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
});
assert(draftOpened.response.ok && draftOpened.body === draftId,
  `Could not open boundary Claim draft: ${draftOpened.response.status} ${JSON.stringify(draftOpened.body)}`);

const evidencePath = `${draftId}/${"e".repeat(64)}.jpg`;
const imageBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Buffer.from("cube-p-boundary-notification")]);
const registered = await rpc("register_customer_warranty_claim_draft_evidence", {
  p_draft_id: draftId,
  p_warranty_id: longWarrantyId,
  p_verified_phone_normalized: longVerified.normalized_phone,
  p_storage_path: evidencePath,
  p_mime_type: "image/jpeg",
  p_size_bytes: imageBytes.length,
});
assert(registered.response.ok && registered.body === true,
  `Could not register boundary evidence: ${registered.response.status} ${JSON.stringify(registered.body)}`);
const upload = await request(`/storage/v1/object/warranty-claim-evidence/${evidencePath}`, {
  method: "POST",
  rawBody: imageBytes,
  contentType: "image/jpeg",
});
assert(upload.response.ok, `Could not upload boundary evidence: ${upload.response.status} ${JSON.stringify(upload.body)}`);

const created = one(await rpc("create_customer_warranty_claim", {
  p_request_id: randomUUID(),
  p_warranty_id: longWarrantyId,
  p_public_code: longPublicCode,
  p_verified_phone_normalized: longVerified.normalized_phone,
  p_draft_id: draftId,
  p_category: "other",
  p_affected_area: "غطاء المحرك",
  p_description: "اختبار حدود نص إشعار مطالبة صحيحة ببيانات وصفية طويلة.",
  p_evidence: [{ storage_path: evidencePath, mime_type: "image/jpeg", size_bytes: imageBytes.length }],
}), "Create max-metadata Claim");

const notificationShape = querySql(`
  select concat_ws('|',
    char_length(notification.body),
    notification.body = btrim(notification.body),
    notification.action_path is null,
    notification.push_eligible
  )
  from public.notifications notification
  where notification.source_domain = 'warranty_claim'
    and notification.event_type = 'warranty.claim_submitted'
    and notification.body like '%' || ${sqlText(created.claim_number)} || '%'
  order by notification.created_at desc, notification.id desc
  limit 1;
`).split("|");
assert(Number(notificationShape[0]) > 0 && Number(notificationShape[0]) <= 300,
  `Claim notification body exceeded Cube L bound: ${notificationShape}`);
assert(notificationShape[1] === "t",
  `Claim notification body must remain btrim-normalized after boundary truncation: ${notificationShape}`);
assert(notificationShape[2] === "t" && notificationShape[3] === "t",
  `Claim notification routing/push contract changed unexpectedly: ${notificationShape}`);

console.log("Cube P pre-merge hardening contracts verified.");
