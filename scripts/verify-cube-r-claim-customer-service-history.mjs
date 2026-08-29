import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

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

async function rpc(name, body) {
  const response = await fetch(`${apiUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return { response, body: await readJson(response) };
}

function dbContainerName() {
  const names = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" })
    .split("\n").map((value) => value.trim()).filter(Boolean);
  const name = names.find((value) => value.startsWith("supabase_db_"));
  assert(name, "Supabase database container was not found for customer fulfillment verification.");
  return name;
}

function querySql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", dbContainerName(), "psql", "-At", "-v", "ON_ERROR_STOP=1",
      "-U", "postgres", "-d", "postgres", "-c", sql],
    { encoding: "utf8" },
  ).trim();
}

function readCompletionFixture(remedyKind) {
  const raw = querySql(`
    select json_build_object(
      'claim_id', claim.id,
      'warranty_id', warranty.id,
      'claim_number', claim.claim_number,
      'public_code', identity.public_code,
      'warranty_number', warranty.warranty_number,
      'coverage_expires_at', warranty.coverage_expires_at,
      'remedy_kind', resolution.remedy_kind,
      'completed_at', resolution.completed_at,
      'performing_center_name', center.name,
      'completion_note', resolution.completion_note,
      'replacement_roll_serial', replacement_roll.serial_number,
      'product_eligibility_basis', allocation.product_eligibility_basis
    )::text
    from public.warranty_claim_resolutions resolution
    join public.warranty_claims claim on claim.id = resolution.claim_id
    join public.warranties warranty on warranty.id = claim.warranty_id
    join private.roll_public_identities identity on identity.roll_id = warranty.roll_id
    join public.operational_parties party
      on party.id = resolution.performing_center_party_id
     and party.party_type = 'center'
    join public.installation_centers center on center.id = party.installation_center_id
    left join public.warranty_claim_resolution_roll_allocations allocation
      on allocation.resolution_id = resolution.id
     and allocation.status = 'consumed'
    left join public.rolls replacement_roll on replacement_roll.id = allocation.roll_id
    where resolution.status = 'completed'
      and resolution.remedy_kind = '${remedyKind}'
      and claim.status = 'approved'
      and claim.closed_at is not null
    order by resolution.completed_at desc, resolution.id desc
    limit 1;
  `);
  assert(raw, `Missing completed ${remedyKind} fixture from the normal completion regression.`);
  return JSON.parse(raw);
}

async function verifiedContext(fixture) {
  const result = await rpc("get_customer_warranty_claim_context", {
    p_public_code: fixture.public_code,
    p_warranty_id: fixture.warranty_id,
  });
  assert(result.response.ok && Array.isArray(result.body) && result.body.length === 1,
    `Verified customer context failed for ${fixture.claim_number}: ${result.response.status} ${JSON.stringify(result.body)}`);
  return result.body[0];
}

for (const role of ["anon", "authenticated"]) {
  const privilege = querySql(`
    select has_function_privilege('${role}', 'public.get_customer_warranty_claim_context(text,uuid)', 'EXECUTE');
  `);
  assert(privilege === "f", `${role} must not execute the verified customer context RPC directly.`);
}
assert(querySql(`
  select has_function_privilege('service_role', 'public.get_customer_warranty_claim_context(text,uuid)', 'EXECUTE');
`) === "t", "Service role must retain the server-only verified customer projection grant.");

const serviceFixture = readCompletionFixture("service_reinstall");
const replacementFixture = readCompletionFixture("replacement_roll_reinstall");

for (const fixture of [serviceFixture, replacementFixture]) {
  const context = await verifiedContext(fixture);
  assert(context.warranty_number === fixture.warranty_number,
    "Customer fulfillment projection must remain anchored to the original Warranty number.");
  assert(new Date(context.coverage_expires_at).getTime() === new Date(fixture.coverage_expires_at).getTime(),
    "Customer fulfillment projection must preserve the original Warranty expiry exactly.");
  assert(Array.isArray(context.recent_closed_claims), "recent_closed_claims must remain an array.");

  const projected = context.recent_closed_claims.find((claim) => claim.claim_number === fixture.claim_number);
  assert(projected, `Completed Claim ${fixture.claim_number} missing from verified customer history.`);
  assert(projected.status === "approved", "R completion must not rewrite the original approved Claim decision.");
  assert(projected.resolution_status === "completed",
    `Completed service must project resolution_status=completed, got ${projected.resolution_status}.`);
  assert(projected.remedy_kind === fixture.remedy_kind,
    `Customer remedy mismatch for ${fixture.claim_number}: ${projected.remedy_kind} vs ${fixture.remedy_kind}.`);
  assert(projected.performing_center_name === fixture.performing_center_name,
    "Customer projection must expose only the performing Center display name for fulfillment context.");
  assert(
    typeof projected.resolution_completed_at === "string"
      && new Date(projected.resolution_completed_at).getTime() === new Date(fixture.completed_at).getTime(),
    "Customer projection must expose the authoritative Resolution completion timestamp.",
  );

  const payloadText = JSON.stringify(projected);
  for (const forbidden of [
    "replacement_roll_serial",
    "replacement_roll_id",
    "roll_id",
    "erp_serial",
    "allocation_id",
    "product_eligibility_basis",
    "completion_note",
    "completion_actor_kind",
    "technical_observation",
    "suspected_cause",
    "decision_reason",
    "actor_profile_id",
    "action_request_id",
    "event_data",
  ]) {
    assert(!payloadText.includes(forbidden), `Verified customer fulfillment projection leaked internal field ${forbidden}.`);
  }
  assert(!payloadText.includes(fixture.public_code), "Claim/service JSON must not echo the permanent Public Code.");
  assert(!payloadText.includes(fixture.completion_note), "Private Center/Admin completion note must remain internal.");
}

assert(replacementFixture.replacement_roll_serial,
  "Replacement completion fixture must include a consumed replacement Roll for leak verification.");
assert(replacementFixture.product_eligibility_basis,
  "Replacement completion fixture must include an eligibility basis for leak verification.");
const replacementContext = await verifiedContext(replacementFixture);
const replacementProjectionText = JSON.stringify(replacementContext.recent_closed_claims);
assert(!replacementProjectionText.includes(replacementFixture.replacement_roll_serial),
  "Verified customer history leaked the replacement Roll serial value.");
assert(!replacementProjectionText.includes(replacementFixture.product_eligibility_basis),
  "Verified customer history leaked the internal Product eligibility basis value.");

const functionDef = querySql(`
  select pg_get_functiondef('public.get_customer_warranty_claim_context(text,uuid)'::regprocedure);
`);
for (const token of [
  "'resolution_status'",
  "'remedy_kind'",
  "'performing_center_name'",
  "'resolution_completed_at'",
]) {
  const occurrences = functionDef.split(token).length - 1;
  assert(occurrences >= 2, `Customer context must project ${token} for both open and closed Claim shapes.`);
}
for (const forbidden of [
  "warranty_claim_resolution_roll_allocations",
  "replacement_roll",
  "product_eligibility_basis",
  "completion_note",
  "warranty_claim_inspections",
  "technical_observation",
  "suspected_cause",
  "cancellation_reason",
  "actor_profile_id",
]) {
  assert(!functionDef.includes(forbidden), `Customer context function crossed into internal domain ${forbidden}.`);
}

const migrationSource = readFileSync("supabase/migrations/20260829162000_cube_r_customer_resolution_service_history.sql", "utf8");
const intakeSource = readFileSync("lib/warranty/claim-intake.ts", "utf8");
const accessSource = readFileSync("lib/warranty/claim-access.server.ts", "utf8");
const pageSource = readFileSync("app/(public)/w/[publicCode]/claim/page.tsx", "utf8");
const clientSource = readFileSync("app/(public)/w/[publicCode]/claim/claim-client.tsx", "utf8");

assert(migrationSource.includes("from public, anon, authenticated, service_role")
  && migrationSource.includes("to service_role"),
  "12A10 migration must preserve the server-only verified customer projection grant boundary.");
for (const token of [
  "resolutionStatus: string | null",
  "remedyKind: WarrantyClaimRemedyKind | null",
  "performingCenterName: string | null",
  "resolutionCompletedAt: string | null",
  "serviceHistory: CustomerWarrantyServiceEntry[]",
]) {
  assert(intakeSource.includes(token), `Customer-safe Claim/service type is missing ${token}.`);
}
for (const token of [
  "row.resolution_status",
  "row.remedy_kind",
  "row.performing_center_name",
  "row.resolution_completed_at",
  'claim.status !== "approved"',
  'claim.resolutionStatus !== "completed"',
  "serviceHistory",
]) {
  assert(accessSource.includes(token), `Verified server projection/parser is missing ${token}.`);
}
assert(pageSource.includes("getFreshClaimAccess(publicCode)"),
  "Customer fulfillment history must remain behind the existing verified phone-access boundary.");
for (const token of [
  "customerClaimStatusLabel",
  'claim.resolutionStatus === "assigned"',
  'claim.resolutionStatus === "completed"',
  "سجل خدمات الضمان",
  "ServiceHistoryCard",
  "استبدال وإعادة تركيب",
  "إعادة تنفيذ الخدمة",
]) {
  assert(clientSource.includes(token), `Verified customer UI is missing ${token}.`);
}
for (const forbidden of [
  "replacementRollSerial",
  "productEligibilityBasis",
  "completionNote",
  "technicalObservation",
  "suspectedCause",
  "decisionReason",
  "actorProfileId",
]) {
  assert(!clientSource.includes(forbidden), `Verified customer UI must not consume internal field ${forbidden}.`);
}

console.log("Cube R customer Resolution progress + Warranty service history PASS for completed service/replacement remedies, original Warranty identity/expiry preservation, server-only verification and internal-material/diagnosis/audit non-disclosure.");
