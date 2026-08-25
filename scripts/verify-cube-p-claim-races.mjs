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

async function request(path, { method = "GET", token = serviceRoleKey, key = serviceRoleKey, body } = {}) {
  const headers = { apikey: key, Authorization: `Bearer ${token}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { response, body: await readJson(response) };
}

async function rest(path, token, key = anonKey) {
  return request(`/rest/v1/${path}`, { token, key });
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

function one(result, label) {
  assert(result.response.ok && Array.isArray(result.body) && result.body.length === 1,
    `${label}: ${result.response.status} ${JSON.stringify(result.body)}`);
  return result.body[0];
}

function dbContainerName() {
  const names = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" })
    .split("\n").map((value) => value.trim()).filter(Boolean);
  const name = names.find((value) => value.startsWith("supabase_db_"));
  assert(name, "Supabase database container was not found for Cube P race verification.");
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

async function prepareClaimPayload(
  fixture,
  { requestId = randomUUID(), draftId = randomUUID(), suffix },
) {
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const opened = await rpc("open_customer_warranty_claim_draft", {
    p_draft_id: draftId,
    p_warranty_id: fixture.warrantyId,
    p_verified_phone_normalized: fixture.normalizedPhone,
    p_expires_at: expiresAt,
  });
  assert(opened.response.ok && opened.body === draftId,
    `Could not open ${suffix} Claim draft: ${opened.response.status} ${JSON.stringify(opened.body)}`);

  const digest = createHash("sha256").update(`${draftId}|${suffix}`, "utf8").digest("hex");
  const storagePath = `${draftId}/${digest}.jpg`;
  const registered = await rpc("register_customer_warranty_claim_draft_evidence", {
    p_draft_id: draftId,
    p_warranty_id: fixture.warrantyId,
    p_storage_path: storagePath,
    p_mime_type: "image/jpeg",
    p_size_bytes: 128,
  });
  assert(registered.response.ok && registered.body === true,
    `Could not register ${suffix} staged evidence: ${registered.response.status} ${JSON.stringify(registered.body)}`);

  return {
    p_request_id: requestId,
    p_warranty_id: fixture.warrantyId,
    p_public_code: fixture.publicCode,
    p_verified_phone_normalized: fixture.normalizedPhone,
    p_draft_id: draftId,
    p_category: "other",
    p_affected_area: "غطاء المحرك",
    p_description: `اختبار تزامن Cube P — ${suffix} مع وصف كافٍ للمطالبة.`,
    p_evidence: [{
      storage_path: storagePath,
      mime_type: "image/jpeg",
      size_bytes: 128,
    }],
  };
}

const adminToken = await signIn("cube-j-admin@example.test");
const centerToken = await signIn("cube-j-center-a@example.test");

const center = one(await rest(
  "installation_centers?code=eq.CUBE-J-CENTER-A&select=id,name,status",
  adminToken,
), "Read Cube P race Center");
assert(center.status === "active", "Cube P race Center must be active.");

const centerParty = one(await rest(
  `operational_parties?installation_center_id=eq.${center.id}&select=id`,
  adminToken,
), "Read Cube P race Center party");

const product = one(await rest(
  "products?code=eq.PG-CUBE-J-TEST&select=id,code,name,default_warranty_months,warranty_coverage,care_instructions,status",
  adminToken,
), "Read Cube P race Product");
assert(product.status === "active" && product.default_warranty_months > 0
  && product.warranty_coverage && product.care_instructions,
"Cube P race Product must retain a complete active Warranty policy.");

const order = await rpc("create_production_order", {
  p_request_id: randomUUID(),
  p_product_id: product.id,
  p_production_date: "2026-08-25",
  p_lots: [{ quantity: 5, source_reference: "CUBE-P-RACES" }],
  p_source_reference: "CUBE-P-RACES",
  p_notes: "Cube P concurrency fixtures",
}, adminToken, anonKey);
assert(order.response.ok && typeof order.body === "string",
  `Could not create Cube P race Production Order: ${order.response.status} ${JSON.stringify(order.body)}`);

const rollsResult = await rest(
  `rolls?production_order_id=eq.${encodeURIComponent(order.body)}&select=id,serial_number&order=serial_number.asc`,
  adminToken,
);
assert(rollsResult.response.ok && Array.isArray(rollsResult.body) && rollsResult.body.length === 5,
  `Cube P races require five fresh Rolls: ${rollsResult.response.status} ${JSON.stringify(rollsResult.body)}`);

for (const roll of rollsResult.body) {
  runSql(`
    begin;
    update public.roll_custody_current
    set custodian_party_id = ${sqlUuid(centerParty.id)}, confirmed_at = now()
    where roll_id = ${sqlUuid(roll.id)};

    insert into public.roll_custody_events (
      roll_id, custody_sequence, custodian_party_id, confirmed_at
    ) values (
      ${sqlUuid(roll.id)}, 2, ${sqlUuid(centerParty.id)}, now()
    );
    commit;
  `);

  const opened = await rpc("open_roll", {
    p_request_id: randomUUID(),
    p_roll_serial: roll.serial_number,
  }, centerToken, anonKey);
  assert(opened.response.ok && opened.body === roll.id,
    `Could not open Cube P race Roll ${roll.serial_number}: ${opened.response.status} ${JSON.stringify(opened.body)}`);
}

const fixtures = [];
for (let index = 0; index < rollsResult.body.length; index += 1) {
  const roll = rollsResult.body[index];
  const phone = `+2010555000${String(index + 1).padStart(2, "0")}`;
  const customerName = `Cube P Race Customer ${index + 1}`;
  const vehicleVin = `CUBEPV${String(index + 1).padStart(10, "0")}`;
  const activation = one(await rpc("activate_roll_warranty", {
    p_request_id: randomUUID(),
    p_roll_serial: roll.serial_number,
    p_customer_name: customerName,
    p_customer_phone: phone,
    p_customer_email: `cube-p-race-${index + 1}@example.test`,
    p_vehicle_make: "Race Make",
    p_vehicle_model: `Race Model ${index + 1}`,
    p_vehicle_year: 2026,
    p_vehicle_plate: `RACE-${index + 1}`,
    p_vehicle_color: "Black",
    p_vehicle_vin: vehicleVin,
  }, centerToken, anonKey), `Activate Cube P race Warranty ${index + 1}`);

  const publicCode = querySql(`
    select identity.public_code
    from private.roll_public_identities identity
    where identity.roll_id = ${sqlUuid(roll.id)};
  `);
  assert(/^[0-9a-f]{64}$/.test(publicCode), "Cube P race Warranty Public Code is missing.");

  const verified = one(await rpc("verify_customer_warranty_claim_phone", {
    p_public_code: publicCode,
    p_phone: phone,
  }), `Verify Cube P race Warranty ${index + 1}`);

  fixtures.push({
    warrantyId: activation.warranty_id,
    warrantyNumber: activation.warranty_number,
    publicCode,
    phone,
    normalizedPhone: verified.normalized_phone,
    customerName,
    customerEmail: `cube-p-race-${index + 1}@example.test`,
    vehicleMake: "Race Make",
    vehicleModel: `Race Model ${index + 1}`,
    vehicleYear: 2026,
    vehiclePlate: `RACE-${index + 1}`,
    vehicleColor: "Black",
    vehicleVin,
  });
}

// Race 1A — same request/payload twice: both callers resolve one committed Claim.
{
  const fixture = fixtures[0];
  const requestId = randomUUID();
  const draftId = randomUUID();
  const payload = await prepareClaimPayload(fixture, {
    requestId,
    draftId,
    suffix: "same-request",
  });
  const [left, right] = await Promise.all([
    rpc("create_customer_warranty_claim", payload),
    rpc("create_customer_warranty_claim", payload),
  ]);
  const leftRow = one(left, "Same-request race left");
  const rightRow = one(right, "Same-request race right");
  assert(leftRow.claim_id === rightRow.claim_id && leftRow.claim_number === rightRow.claim_number,
    "Concurrent same-request retries must converge on one Claim identity.");
  assert(querySql(`select count(*) from public.warranty_claims where warranty_id = ${sqlUuid(fixture.warrantyId)}`) === "1",
    "Same-request race must persist exactly one Claim row.");
  assert(querySql(`select count(*) from public.warranty_claim_events where claim_id = ${sqlUuid(leftRow.claim_id)} and event_kind = 'submitted'`) === "1",
    "Same-request race must append exactly one submitted event.");
}

// Race 1B — different requests on one Warranty: Warranty row serialization makes
// exactly one open Claim win, with a deterministic PG_CLAIM_OPEN_EXISTS loser.
{
  const fixture = fixtures[1];
  const payloadA = await prepareClaimPayload(fixture, { suffix: "different-request-a" });
  const payloadB = await prepareClaimPayload(fixture, { suffix: "different-request-b" });
  const [left, right] = await Promise.all([
    rpc("create_customer_warranty_claim", payloadA),
    rpc("create_customer_warranty_claim", payloadB),
  ]);
  const successes = [left, right].filter((result) => result.response.ok);
  const failures = [left, right].filter((result) => !result.response.ok);
  assert(successes.length === 1 && failures.length === 1,
    `Different-request race must have one winner: ${JSON.stringify([left.body, right.body])}`);
  assert(failures[0].body?.message === "PG_CLAIM_OPEN_EXISTS",
    `Different-request race loser must observe the open Claim: ${JSON.stringify(failures[0].body)}`);
  assert(querySql(`select count(*) from public.warranty_claims where warranty_id = ${sqlUuid(fixture.warrantyId)} and closed_at is null`) === "1",
    "Different-request race must leave exactly one open Claim.");
}

// Race 2 — Claim submit versus Cube M void-in-error: exactly one truth may win.
// The forbidden state is a voided Warranty with a newly open Claim.
{
  const fixture = fixtures[2];
  const claim = await prepareClaimPayload(fixture, { suffix: "claim-versus-void" });
  const [claimResult, voidResult] = await Promise.all([
    rpc("create_customer_warranty_claim", claim),
    rpc("void_warranty_in_error", {
      p_action_request_id: randomUUID(),
      p_warranty_id: fixture.warrantyId,
      p_reason: "Cube P concurrent Claim versus Warranty void verification.",
    }, adminToken, anonKey),
  ]);

  assert([claimResult.response.ok, voidResult.response.ok].filter(Boolean).length === 1,
    `Claim/void race must have exactly one winner: claim=${claimResult.response.status} ${JSON.stringify(claimResult.body)} void=${voidResult.response.status} ${JSON.stringify(voidResult.body)}`);

  if (claimResult.response.ok) {
    assert(voidResult.body?.message === "PG_WARRANTY_OPEN_CLAIM_EXISTS",
      `Void loser must observe the committed open Claim: ${JSON.stringify(voidResult.body)}`);
  } else {
    assert(voidResult.response.ok && claimResult.body?.message === "PG_CLAIM_WARRANTY_UNAVAILABLE",
      `Claim loser must observe the committed Warranty void: ${JSON.stringify(claimResult.body)}`);
  }

  const state = querySql(`
    select concat_ws('|', warranty.record_state,
      (select count(*) from public.warranty_claims claim where claim.warranty_id = warranty.id and claim.closed_at is null))
    from public.warranties warranty
    where warranty.id = ${sqlUuid(fixture.warrantyId)};
  `).split("|");
  assert(!((state[0] === "voided_in_error") && Number(state[1]) > 0),
    `Forbidden voided-Warranty + open-Claim state committed: ${state}`);
  assert(
    (state[0] === "issued" && state[1] === "1")
      || (state[0] === "voided_in_error" && state[1] === "0"),
    `Unexpected Claim/void terminal truth: ${state}`,
  );
}

// Race 3 — Claim submit versus legitimate phone correction. Correction remains
// valid in either ordering. The Claim may commit only if its old-phone context
// wins the Warranty row first; otherwise it must fail stale. After correction,
// only the corrected phone verifies.
{
  const fixture = fixtures[3];
  const correctedPhone = "+201066699977";
  const claim = await prepareClaimPayload(fixture, { suffix: "claim-versus-phone-correction" });
  const [claimResult, correctionResult] = await Promise.all([
    rpc("create_customer_warranty_claim", claim),
    rpc("correct_warranty_details", {
      p_action_request_id: randomUUID(),
      p_warranty_id: fixture.warrantyId,
      p_customer_name: fixture.customerName,
      p_customer_phone: correctedPhone,
      p_customer_email: fixture.customerEmail,
      p_vehicle_make: fixture.vehicleMake,
      p_vehicle_model: fixture.vehicleModel,
      p_vehicle_year: fixture.vehicleYear,
      p_vehicle_plate: fixture.vehiclePlate,
      p_vehicle_color: fixture.vehicleColor,
      p_vehicle_vin: fixture.vehicleVin,
      p_reason: "Cube P concurrent Claim versus phone correction verification.",
    }, adminToken, anonKey),
  ]);

  assert(correctionResult.response.ok,
    `Phone correction must commit in the bounded race: ${correctionResult.response.status} ${JSON.stringify(correctionResult.body)}`);
  if (!claimResult.response.ok) {
    assert(claimResult.body?.message === "PG_CLAIM_VERIFICATION_STALE",
      `Claim loser must fail specifically as stale verification: ${JSON.stringify(claimResult.body)}`);
  }

  const storedPhone = querySql(`select customer_phone from public.warranties where id = ${sqlUuid(fixture.warrantyId)}`);
  assert(storedPhone === correctedPhone, `Corrected phone must be authoritative after race: ${storedPhone}`);

  const oldPhone = await rpc("verify_customer_warranty_claim_phone", {
    p_public_code: fixture.publicCode,
    p_phone: fixture.phone,
  });
  assert(oldPhone.response.ok && Array.isArray(oldPhone.body) && oldPhone.body.length === 0,
    "Old phone must not verify after the correction commits.");
  const newPhone = one(await rpc("verify_customer_warranty_claim_phone", {
    p_public_code: fixture.publicCode,
    p_phone: correctedPhone,
  }), "Verify corrected phone after race");
  assert(newPhone.warranty_id === fixture.warrantyId,
    "Corrected phone must immediately authorize the same Warranty Claim boundary.");

  const openCount = Number(querySql(`
    select count(*) from public.warranty_claims
    where warranty_id = ${sqlUuid(fixture.warrantyId)} and closed_at is null;
  `));
  assert(openCount === (claimResult.response.ok ? 1 : 0),
    `Phone-correction race left an inconsistent Claim count: claimOk=${claimResult.response.ok} open=${openCount}`);
}

// Race 4 — final submit versus a second-tab evidence removal. The draft row is
// the physical-evidence serialization anchor. Exactly one operation may reserve
// the staged image: Claim success closes the draft and removal fails closed, or
// removal marks delete_pending and Claim submit rejects the now-missing staged set.
{
  const fixture = fixtures[4];
  const claim = await prepareClaimPayload(fixture, { suffix: "claim-versus-remove" });
  const storagePath = claim.p_evidence[0].storage_path;

  const [claimResult, removeReservation] = await Promise.all([
    rpc("create_customer_warranty_claim", claim),
    rpc("unregister_customer_warranty_claim_draft_evidence", {
      p_draft_id: claim.p_draft_id,
      p_warranty_id: fixture.warrantyId,
      p_storage_path: storagePath,
    }),
  ]);

  assert([claimResult.response.ok, removeReservation.response.ok].filter(Boolean).length === 1,
    `Claim/remove race must have exactly one winner: claim=${claimResult.response.status} ${JSON.stringify(claimResult.body)} remove=${removeReservation.response.status} ${JSON.stringify(removeReservation.body)}`);

  if (claimResult.response.ok) {
    assert(removeReservation.body?.message === "PG_CLAIM_DRAFT_CLOSED",
      `Removal loser must observe submitted draft tombstone: ${JSON.stringify(removeReservation.body)}`);
    const row = one(claimResult, "Claim/remove submit winner");
    assert(querySql(`select count(*) from public.warranty_claim_evidence where claim_id = ${sqlUuid(row.claim_id)}`) === "1",
      "Submit winner must preserve exactly one immutable Claim evidence row.");
    assert(querySql(`select state from private.warranty_claim_drafts where id = ${sqlUuid(claim.p_draft_id)}`) === "submitted",
      "Submit winner must leave submitted draft tombstone.");
  } else {
    assert(removeReservation.response.ok && removeReservation.body === true,
      `Removal winner must reserve the path successfully: ${JSON.stringify(removeReservation.body)}`);
    assert(claimResult.body?.message === "PG_CLAIM_EVIDENCE_INVALID",
      `Submit loser must reject a delete_pending evidence set: ${JSON.stringify(claimResult.body)}`);
    assert(querySql(`select count(*) from public.warranty_claims where warranty_id = ${sqlUuid(fixture.warrantyId)}`) === "0",
      "Removal winner must leave no Claim row.");
    assert(querySql(`
      select state from private.warranty_claim_draft_evidence
      where draft_id = ${sqlUuid(claim.p_draft_id)} and storage_path = '${storagePath}';
    `) === "delete_pending", "Removal winner must retain cleanup-visible delete_pending metadata.");
  }
}

console.log("Cube P Claim concurrency/idempotency/draft-removal races verified.");
