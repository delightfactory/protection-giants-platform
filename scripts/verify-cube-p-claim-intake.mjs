import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";

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

async function request(path, { method = "GET", token = serviceRoleKey, key = serviceRoleKey, body, rawBody, contentType } = {}) {
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

function dbContainerName() {
  const names = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" })
    .split("\n").map((value) => value.trim()).filter(Boolean);
  const name = names.find((value) => value.startsWith("supabase_db_"));
  assert(name, "Supabase database container was not found for Cube P verification.");
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

function expectSqlFailure(sql, expected, label) {
  let failed = false;
  let output = "";
  try { runSql(sql); } catch (error) {
    failed = true;
    output = `${error?.stdout ?? ""}\n${error?.stderr ?? ""}\n${error?.message ?? ""}`;
  }
  assert(failed, `${label} unexpectedly succeeded.`);
  assert(output.includes(expected), `${label} failed for wrong reason: ${output}`);
}

function sqlUuid(value) {
  assert(/^[0-9a-f-]{36}$/i.test(value), `Unsafe UUID: ${value}`);
  return `'${value}'::uuid`;
}

async function expectRpcError(name, body, expected, token = serviceRoleKey, key = serviceRoleKey) {
  const result = await rpc(name, body, token, key);
  assert(!result.response.ok, `${name} unexpectedly succeeded; expected ${expected}.`);
  assert(result.body?.message === expected,
    `${name} expected ${expected}, got ${result.response.status} ${JSON.stringify(result.body)}`);
  return result;
}

function one(result, label) {
  assert(result.response.ok && Array.isArray(result.body) && result.body.length === 1,
    `${label}: ${result.response.status} ${JSON.stringify(result.body)}`);
  return result.body[0];
}

for (const table of ["warranty_claims", "warranty_claim_events", "warranty_claim_evidence"]) {
  assert(querySql(`select relrowsecurity from pg_class where oid = 'public.${table}'::regclass`) === "t",
    `${table} must have RLS enabled.`);
  for (const role of ["anon", "authenticated", "service_role"]) {
    for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
      assert(querySql(`select has_table_privilege('${role}', 'public.${table}', '${privilege}')`) === "f",
        `${role} unexpectedly has ${privilege} on ${table}.`);
    }
  }
}

for (const table of ["private.warranty_claim_drafts", "private.warranty_claim_draft_evidence"]) {
  for (const role of ["anon", "authenticated", "service_role"]) {
    for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
      assert(querySql(`select has_table_privilege('${role}', '${table}', '${privilege}')`) === "f",
        `${role} unexpectedly has ${privilege} on ${table}.`);
    }
  }
}

const customerServiceFunctions = [
  "public.verify_customer_warranty_claim_phone(text,text)",
  "public.get_customer_warranty_claim_context(text,uuid)",
  "public.get_customer_warranty_claim_by_request(uuid,uuid)",
  "public.create_customer_warranty_claim(uuid,uuid,text,text,uuid,text,text,text,jsonb)",
  "public.open_customer_warranty_claim_draft(uuid,uuid,text,timestamp with time zone)",
  "public.register_customer_warranty_claim_draft_evidence(uuid,uuid,text,text,text,bigint)",
  "public.unregister_customer_warranty_claim_draft_evidence(uuid,uuid,text,text)",
  "public.finalize_customer_warranty_claim_draft_evidence_removal(uuid,uuid,text)",
  "public.claim_expired_warranty_claim_draft_cleanup_candidates(integer)",
  "public.finalize_expired_warranty_claim_draft_cleanup(uuid)",
];

for (const role of ["anon", "authenticated"]) {
  for (const signature of customerServiceFunctions) {
    assert(querySql(`select has_function_privilege('${role}', '${signature}', 'EXECUTE')`) === "f",
      `${role} unexpectedly can execute ${signature}.`);
  }
}
for (const signature of customerServiceFunctions) {
  assert(querySql(`select has_function_privilege('service_role', '${signature}', 'EXECUTE')`) === "t",
    `service_role must have explicit execute privilege on ${signature}.`);
}

const bucket = querySql(`
  select concat_ws('|', public, file_size_limit, array_to_string(allowed_mime_types, ','))
  from storage.buckets where id = 'warranty-claim-evidence';
`).split("|");
assert(bucket[0] === "f" && Number(bucket[1]) === 8388608,
  `Claim evidence bucket privacy/size mismatch: ${bucket}`);
assert(bucket[2] === "image/jpeg,image/png,image/webp", `Unexpected Claim MIME bucket contract: ${bucket[2]}`);

const fixture = querySql(`
  select concat_ws('|',
    warranty.id,
    warranty.customer_phone,
    identity.public_code,
    warranty.coverage_expires_at
  )
  from public.warranties warranty
  join private.roll_public_identities identity on identity.roll_id = warranty.roll_id
  where warranty.record_state = 'issued'
    and warranty.coverage_expires_at > now()
  order by warranty.activated_at desc, warranty.id desc
  limit 1;
`).split("|");
assert(fixture.length === 4 && fixture[0] && fixture[2], `Active Warranty fixture missing: ${fixture}`);
const [warrantyId, storedPhone, publicCode] = fixture;

const formattedPhone = storedPhone
  .replace(/(\d{3})(\d{3})(\d+)/, "$1 ($2)-$3")
  .replaceAll("0", "٠").replaceAll("1", "١").replaceAll("2", "٢").replaceAll("3", "٣")
  .replaceAll("4", "٤").replaceAll("5", "٥").replaceAll("6", "٦").replaceAll("7", "٧")
  .replaceAll("8", "٨").replaceAll("9", "٩");
const verified = one(await rpc("verify_customer_warranty_claim_phone", {
  p_public_code: publicCode,
  p_phone: formattedPhone,
}), "Format-only phone verification");
assert(verified.warranty_id === warrantyId, "Phone verification must resolve the exact effective Warranty.");
assert(verified.public_state === "active", "Active Warranty must verify as active.");

const guessedLocalPhone = storedPhone.startsWith("+20") ? `0${storedPhone.slice(3)}` : `+20${storedPhone.replace(/^0/, "")}`;
const noGuess = await rpc("verify_customer_warranty_claim_phone", {
  p_public_code: publicCode,
  p_phone: guessedLocalPhone,
});
assert(noGuess.response.ok && Array.isArray(noGuess.body) && noGuess.body.length === 0,
  "Cube P must not infer country-code equivalence (+20 vs 0). ");

const contextBefore = one(await rpc("get_customer_warranty_claim_context", {
  p_public_code: publicCode,
  p_warranty_id: warrantyId,
}), "Read pre-Claim customer context");
assert(contextBefore.can_submit_new_claim === true && contextBefore.current_open_claim === null,
  `Pre-Claim context must allow intake: ${JSON.stringify(contextBefore)}`);
assert(Array.isArray(contextBefore.recent_closed_claims), "Context closed-Claim history must be an array.");

const draftId = randomUUID();
const draftExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
const openedDraft = await rpc("open_customer_warranty_claim_draft", {
  p_draft_id: draftId,
  p_warranty_id: warrantyId,
  p_verified_phone_normalized: verified.normalized_phone,
  p_expires_at: draftExpiresAt,
});
assert(openedDraft.response.ok && openedDraft.body === draftId,
  `Could not open Cube P Claim draft: ${openedDraft.response.status} ${JSON.stringify(openedDraft.body)}`);

const requestId = randomUUID();
const imageBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Buffer.from("cube-p-private-evidence")]);
const digest = createHash("sha256").update(imageBytes).digest("hex");
const storagePath = `${draftId}/${digest}.jpg`;
const upload = await request(`/storage/v1/object/warranty-claim-evidence/${storagePath}`, {
  method: "POST",
  rawBody: imageBytes,
  contentType: "image/jpeg",
});
assert(upload.response.ok, `Could not upload Cube P private evidence fixture: ${upload.response.status} ${JSON.stringify(upload.body)}`);

const registered = await rpc("register_customer_warranty_claim_draft_evidence", {
  p_draft_id: draftId,
  p_warranty_id: warrantyId,
  p_verified_phone_normalized: verified.normalized_phone,
  p_storage_path: storagePath,
  p_mime_type: "image/jpeg",
  p_size_bytes: imageBytes.length,
});
assert(registered.response.ok && registered.body === true,
  `Could not register Cube P staged evidence: ${registered.response.status} ${JSON.stringify(registered.body)}`);
assert(querySql(`
  select count(*) from private.warranty_claim_draft_evidence
  where draft_id = ${sqlUuid(draftId)} and state = 'staged';
`) === "1", "One physical staged image must have one private staged registry row.");

const claimPayload = {
  p_request_id: requestId,
  p_warranty_id: warrantyId,
  p_public_code: publicCode,
  p_verified_phone_normalized: verified.normalized_phone,
  p_draft_id: draftId,
  p_category: "bubbling",
  p_affected_area: "غطاء المحرك",
  p_description: "ظهرت فقاعات واضحة في الجزء الأمامي من غطاء المحرك.",
  p_evidence: [{ storage_path: storagePath, mime_type: "image/jpeg", size_bytes: imageBytes.length }],
};
const created = one(await rpc("create_customer_warranty_claim", claimPayload), "Create customer Claim");
assert(/^PG-C-[0-9]{8,}$/.test(created.claim_number), `Unexpected Claim Number: ${created.claim_number}`);

const persisted = querySql(`
  select concat_ws('|', status, closed_at is null, category, affected_area)
  from public.warranty_claims where id = ${sqlUuid(created.claim_id)};
`).split("|");
assert(persisted[0] === "submitted" && persisted[1] === "t" && persisted[2] === "bubbling",
  `Claim persistence mismatch: ${persisted}`);
assert(querySql(`select count(*) from public.warranty_claim_evidence where claim_id = ${sqlUuid(created.claim_id)}`) === "1",
  "Successful Claim must persist required evidence metadata.");
assert(querySql(`select count(*) from public.warranty_claim_events where claim_id = ${sqlUuid(created.claim_id)} and event_kind = 'submitted'`) === "1",
  "Successful Claim must append one submitted event.");
assert(querySql(`
  select concat_ws('|', state, submitted_claim_id)
  from private.warranty_claim_drafts
  where id = ${sqlUuid(draftId)};
`) === `submitted|${created.claim_id}`,
  "Successful Claim must atomically close its draft as a submitted tombstone.");
assert(querySql(`select count(*) from private.warranty_claim_draft_evidence where draft_id = ${sqlUuid(draftId)}`) === "0",
  "Transient per-object draft registry rows must be removed after immutable Claim evidence is committed.");

await expectRpcError("unregister_customer_warranty_claim_draft_evidence", {
  p_draft_id: draftId,
  p_warranty_id: warrantyId,
  p_verified_phone_normalized: verified.normalized_phone,
  p_storage_path: storagePath,
}, "PG_CLAIM_DRAFT_CLOSED");

assert(querySql(`
  select count(*)
  from public.warranty_claim_events event
  where event.claim_id = ${sqlUuid(created.claim_id)}
    and event.actor_profile_id is null
    and event.actor_kind = 'customer_verified_phone'
    and event.event_data ? 'evidence_count'
    and event.event_data::text not like '%${publicCode}%';
`) === "1", "Submitted event must use anonymous verified-phone actor and contain no raw Public Code.");

const adminNotificationCount = Number(querySql(`
  select count(*)
  from public.notifications notification
  join public.profiles profile on profile.id = notification.recipient_profile_id
  where profile.role = 'admin'
    and profile.status = 'active'
    and notification.source_domain = 'warranty_claim'
    and notification.event_type = 'warranty.claim_submitted'
    and notification.source_event_key like 'warranty_claim_events:%'
    and notification.action_path is null
    and notification.push_eligible;
`));
assert(adminNotificationCount > 0, "Claim submitted event must materialize durable Admin Inbox notification(s).");

const retry = one(await rpc("create_customer_warranty_claim", claimPayload), "Retry committed customer Claim");
assert(retry.claim_id === created.claim_id && retry.claim_number === created.claim_number,
  "Matching request retry must return same Claim identity.");
await expectRpcError("create_customer_warranty_claim", {
  ...claimPayload,
  p_description: "تغيير متعارض في نفس request id يجب رفضه بشكل حتمي.",
}, "PG_CLAIM_REQUEST_CONFLICT");
await expectRpcError("create_customer_warranty_claim", {
  ...claimPayload,
  p_request_id: randomUUID(),
}, "PG_CLAIM_OPEN_EXISTS");

const contextAfter = one(await rpc("get_customer_warranty_claim_context", {
  p_public_code: publicCode,
  p_warranty_id: warrantyId,
}), "Read post-Claim customer context");
assert(contextAfter.can_submit_new_claim === false,
  "Open Claim must disable new Claim submission in customer context.");
assert(contextAfter.current_open_claim?.claim_number === created.claim_number,
  `Context must expose current open Claim summary: ${JSON.stringify(contextAfter.current_open_claim)}`);
assert(!JSON.stringify(contextAfter).includes(storagePath), "Customer context must never expose raw evidence Storage paths.");

expectSqlFailure(
  `update public.warranty_claims set description = 'Direct mutation should fail hard.' where id = ${sqlUuid(created.claim_id)};`,
  "PG_CLAIM_IDENTITY_IMMUTABLE",
  "Direct Claim update",
);
expectSqlFailure(
  `delete from public.warranty_claim_evidence where claim_id = ${sqlUuid(created.claim_id)};`,
  "PG_CLAIM_HISTORY_IMMUTABLE",
  "Direct evidence metadata delete",
);

const adminToken = await signIn("cube-j-admin@example.test");
await expectRpcError("void_warranty_in_error", {
  p_action_request_id: randomUUID(),
  p_warranty_id: warrantyId,
  p_reason: "Open Claim must block Warranty void in error.",
}, "PG_WARRANTY_OPEN_CLAIM_EXISTS", adminToken, anonKey);

// Phone correction vs a previously verified context: the authoritative create
// mutation must reject the old normalized phone after Cube M commits a change.
const secondFixture = querySql(`
  select concat_ws('|', warranty.id, warranty.customer_phone, identity.public_code,
    warranty.customer_name, coalesce(warranty.customer_email, ''), warranty.vehicle_make,
    warranty.vehicle_model, coalesce(warranty.vehicle_year::text, ''), coalesce(warranty.vehicle_plate, ''),
    coalesce(warranty.vehicle_color, ''), warranty.vehicle_vin)
  from public.warranties warranty
  join private.roll_public_identities identity on identity.roll_id = warranty.roll_id
  where warranty.record_state = 'issued'
    and warranty.coverage_expires_at > now()
    and warranty.id <> ${sqlUuid(warrantyId)}
  order by warranty.activated_at desc, warranty.id desc
  limit 1;
`).split("|");
assert(secondFixture.length === 11 && secondFixture[0], "Second active Warranty fixture is required for stale-phone verification.");
const [w2, phone2, code2, name2, email2, make2, model2, year2, plate2, color2, vin2] = secondFixture;
const verified2 = one(await rpc("verify_customer_warranty_claim_phone", { p_public_code: code2, p_phone: phone2 }), "Verify second Warranty");
const staleEvidenceDraft = randomUUID();
const staleEvidencePath = `${staleEvidenceDraft}/${"c".repeat(64)}.jpg`;
const staleDraftOpened = await rpc("open_customer_warranty_claim_draft", {
  p_draft_id: staleEvidenceDraft,
  p_warranty_id: w2,
  p_verified_phone_normalized: verified2.normalized_phone,
  p_expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
});
assert(staleDraftOpened.response.ok && staleDraftOpened.body === staleEvidenceDraft,
  `Could not open stale-phone evidence draft: ${staleDraftOpened.response.status} ${JSON.stringify(staleDraftOpened.body)}`);
const staleEvidenceRegistered = await rpc("register_customer_warranty_claim_draft_evidence", {
  p_draft_id: staleEvidenceDraft,
  p_warranty_id: w2,
  p_verified_phone_normalized: verified2.normalized_phone,
  p_storage_path: staleEvidencePath,
  p_mime_type: "image/jpeg",
  p_size_bytes: 128,
});
assert(staleEvidenceRegistered.response.ok && staleEvidenceRegistered.body === true,
  `Could not seed stale-phone evidence registry: ${staleEvidenceRegistered.response.status} ${JSON.stringify(staleEvidenceRegistered.body)}`);
const correctedPhone = "+201099988877";
const correction = await rpc("correct_warranty_details", {
  p_action_request_id: randomUUID(),
  p_warranty_id: w2,
  p_customer_name: name2,
  p_customer_phone: correctedPhone,
  p_customer_email: email2 || null,
  p_vehicle_make: make2,
  p_vehicle_model: model2,
  p_vehicle_year: year2 ? Number(year2) : null,
  p_vehicle_plate: plate2 || null,
  p_vehicle_color: color2 || null,
  p_vehicle_vin: vin2,
  p_reason: "Cube P stale verification freshness test.",
}, adminToken, anonKey);
assert(correction.response.ok, `Could not correct Warranty phone fixture: ${correction.response.status} ${JSON.stringify(correction.body)}`);

await expectRpcError("register_customer_warranty_claim_draft_evidence", {
  p_draft_id: staleEvidenceDraft,
  p_warranty_id: w2,
  p_verified_phone_normalized: verified2.normalized_phone,
  p_storage_path: `${staleEvidenceDraft}/${"d".repeat(64)}.jpg`,
  p_mime_type: "image/jpeg",
  p_size_bytes: 128,
}, "PG_CLAIM_VERIFICATION_STALE");
await expectRpcError("unregister_customer_warranty_claim_draft_evidence", {
  p_draft_id: staleEvidenceDraft,
  p_warranty_id: w2,
  p_verified_phone_normalized: verified2.normalized_phone,
  p_storage_path: staleEvidencePath,
}, "PG_CLAIM_VERIFICATION_STALE");

const staleDraft = randomUUID();
await expectRpcError("create_customer_warranty_claim", {
  p_request_id: randomUUID(),
  p_warranty_id: w2,
  p_public_code: code2,
  p_verified_phone_normalized: verified2.normalized_phone,
  p_draft_id: staleDraft,
  p_category: "other",
  p_affected_area: "الباب الأمامي",
  p_description: "يجب رفض سياق التحقق القديم بعد تصحيح رقم الهاتف.",
  p_evidence: [{ storage_path: `${staleDraft}/${"a".repeat(64)}.jpg`, mime_type: "image/jpeg", size_bytes: 100 }],
}, "PG_CLAIM_VERIFICATION_STALE");
const oldPhoneAfterCorrection = await rpc("verify_customer_warranty_claim_phone", { p_public_code: code2, p_phone: phone2 });
assert(oldPhoneAfterCorrection.response.ok && oldPhoneAfterCorrection.body.length === 0,
  "Old phone must stop verifying immediately after correction.");
const newPhoneAfterCorrection = one(await rpc("verify_customer_warranty_claim_phone", { p_public_code: code2, p_phone: correctedPhone }), "Verify corrected phone");
assert(newPhoneAfterCorrection.warranty_id === w2, "Corrected Warranty phone must become authoritative immediately.");

// Expired Warranty can still verify for historical management, but a new Claim
// is rejected at authoritative submit time.
const expiredWarrantyId = randomUUID();
const expiredNumber = `PG-W-${String(Math.floor(Math.random() * 90000000) + 10000000)}`;
const expiredRoll = querySql(`
  select r.id::text
  from public.rolls r
  where not exists (
    select 1 from public.warranties w where w.roll_id = r.id and w.record_state = 'issued'
  )
  order by r.created_at, r.id limit 1;
`);
assert(expiredRoll, "Expired Warranty test requires a Roll without an issued Warranty.");
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
    ${sqlUuid(expiredWarrantyId)}, gen_random_uuid(), ${sqlUuid(expiredRoll)}, '${expiredNumber}', 'issued',
    source.activated_by_profile_id, source.activating_center_party_id, source.activating_center_name_snapshot,
    now() - interval '2 years', now() - interval '1 year',
    source.product_id, source.product_code_snapshot, source.product_name_snapshot, source.product_version_snapshot,
    source.warranty_months_snapshot, source.warranty_coverage_snapshot, source.care_instructions_snapshot,
    'Expired Claim Customer', '+201011122233', null,
    'Test Make', 'Expired Model', 2024, null, null, 'EXPIREDVIN123'
  from public.warranties source
  where source.id = ${sqlUuid(warrantyId)};
`);
const expiredCode = querySql(`select public_code from private.roll_public_identities where roll_id = ${sqlUuid(expiredRoll)}`);
const expiredVerify = one(await rpc("verify_customer_warranty_claim_phone", {
  p_public_code: expiredCode,
  p_phone: "+201011122233",
}), "Verify expired Warranty");
assert(expiredVerify.public_state === "expired", "Expired Warranty must still permit verified history access.");
const expiredContext = one(await rpc("get_customer_warranty_claim_context", {
  p_public_code: expiredCode,
  p_warranty_id: expiredWarrantyId,
}), "Read expired Claim context");
assert(expiredContext.can_submit_new_claim === false, "Expired Warranty must not offer new Claim submission.");
const expiredDraft = randomUUID();
await expectRpcError("create_customer_warranty_claim", {
  p_request_id: randomUUID(), p_warranty_id: expiredWarrantyId, p_public_code: expiredCode,
  p_verified_phone_normalized: expiredVerify.normalized_phone, p_draft_id: expiredDraft,
  p_category: "yellowing", p_affected_area: "غطاء المحرك",
  p_description: "هذه المطالبة الجديدة بعد انتهاء التغطية يجب رفضها.",
  p_evidence: [{ storage_path: `${expiredDraft}/${"b".repeat(64)}.jpg`, mime_type: "image/jpeg", size_bytes: 100 }],
}, "PG_CLAIM_WARRANTY_EXPIRED");

// Expired drafts become cleanup_pending in bounded batches and retain every
// known staged/delete-pending path until the server confirms Storage cleanup.
const cleanupDraftId = randomUUID();
const cleanupPath = `${cleanupDraftId}/${"c".repeat(64)}.jpg`;
runSql(`
  insert into private.warranty_claim_drafts (
    id, warranty_id, state, expires_at, created_at
  ) values (
    ${sqlUuid(cleanupDraftId)}, ${sqlUuid(w2)}, 'open',
    now() - interval '1 minute', now() - interval '2 minutes'
  );

  insert into private.warranty_claim_draft_evidence (
    draft_id, storage_path, mime_type, size_bytes, state
  ) values (
    ${sqlUuid(cleanupDraftId)}, '${cleanupPath}', 'image/jpeg', 100, 'delete_pending'
  );
`);
const cleanupCandidates = await rpc("claim_expired_warranty_claim_draft_cleanup_candidates", { p_limit: 10 });
assert(cleanupCandidates.response.ok && Array.isArray(cleanupCandidates.body),
  `Could not claim expired draft cleanup candidates: ${cleanupCandidates.response.status} ${JSON.stringify(cleanupCandidates.body)}`);
const cleanupCandidate = cleanupCandidates.body.find((candidate) => candidate.draft_id === cleanupDraftId);
assert(cleanupCandidate && Array.isArray(cleanupCandidate.storage_paths) && cleanupCandidate.storage_paths.includes(cleanupPath),
  `Expired cleanup candidate must retain the pending Storage path: ${JSON.stringify(cleanupCandidates.body)}`);
assert(querySql(`select state from private.warranty_claim_drafts where id = ${sqlUuid(cleanupDraftId)}`) === "cleanup_pending",
  "Claimed stale draft must become cleanup_pending before external Storage work.");
const cleanupFinalized = await rpc("finalize_expired_warranty_claim_draft_cleanup", { p_draft_id: cleanupDraftId });
assert(cleanupFinalized.response.ok && cleanupFinalized.body === true,
  `Could not finalize expired draft cleanup: ${cleanupFinalized.response.status} ${JSON.stringify(cleanupFinalized.body)}`);
assert(querySql(`select count(*) from private.warranty_claim_drafts where id = ${sqlUuid(cleanupDraftId)}`) === "0",
  "Finalized stale cleanup must remove the private draft and cascade its evidence registry.");

console.log("Cube P customer Warranty Claim intake database contracts verified.");
