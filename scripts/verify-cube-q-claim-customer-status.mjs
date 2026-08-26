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
  assert(name, "Supabase database container was not found for customer Claim status verification.");
  return name;
}

function querySql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", dbContainerName(), "psql", "-At", "-F", "|", "-v", "ON_ERROR_STOP=1",
      "-U", "postgres", "-d", "postgres", "-c", sql],
    { encoding: "utf8" },
  ).trim();
}

const fixture = querySql(`
  select concat_ws('|',
    claim.id,
    claim.warranty_id,
    claim.claim_number,
    identity.public_code,
    warranty.customer_phone,
    claim.customer_decision_message,
    claim.decided_at
  )
  from public.warranty_claims claim
  join public.warranties warranty on warranty.id = claim.warranty_id
  join private.roll_public_identities identity on identity.roll_id = warranty.roll_id
  where exists (
    select 1
    from public.warranty_claim_events event
    where event.claim_id = claim.id
      and event.event_kind = 'approval_cancelled_before_execution'
  )
  limit 1;
`).split("|");

assert(fixture.length === 7 && fixture.every(Boolean),
  `Customer-safe projection fixture missing: ${fixture}`);
const [claimId, warrantyId, claimNumber, publicCode, customerPhone, customerMessage, decidedAt] = fixture;

const contextResult = await rpc("get_customer_warranty_claim_context", {
  p_public_code: publicCode,
  p_warranty_id: warrantyId,
});
assert(contextResult.response.ok && Array.isArray(contextResult.body) && contextResult.body.length === 1,
  `Customer Claim context failed: ${contextResult.response.status} ${JSON.stringify(contextResult.body)}`);
const context = contextResult.body[0];
assert(Array.isArray(context.recent_closed_claims), "recent_closed_claims must remain an array.");

const projected = context.recent_closed_claims.find((claim) => claim.claim_number === claimNumber);
assert(projected, `Closed Claim ${claimNumber} missing from verified customer context.`);
assert(projected.status === "cancelled", `Expected cancelled customer status, got ${projected.status}.`);
assert(projected.customer_decision_message === customerMessage,
  "Verified customer projection must expose the explicit customer decision message exactly.");
assert(
  typeof projected.decided_at === "string"
    && Number.isFinite(new Date(projected.decided_at).getTime())
    && new Date(projected.decided_at).getTime() === new Date(decidedAt).getTime(),
  `Verified customer projection must expose the authoritative decision timestamp: ${projected.decided_at} vs ${decidedAt}.`,
);

const payloadText = JSON.stringify({
  current_open_claim: context.current_open_claim,
  recent_closed_claims: context.recent_closed_claims,
});
for (const forbidden of [
  "decision_reason",
  "decided_by_profile_id",
  "actor_profile_id",
  "action_request_id",
  "event_data",
]) {
  assert(!payloadText.includes(forbidden), `Customer Claim projection leaked internal field ${forbidden}.`);
}
assert(!payloadText.includes(publicCode), "Customer Claim projection must not echo the permanent Public Code.");
assert(!payloadText.includes(customerPhone), "Customer Claim projection must not copy the registered phone into Claim JSON.");

const functionDef = querySql(`
  select pg_get_functiondef('public.get_customer_warranty_claim_context(text,uuid)'::regprocedure);
`);
assert((functionDef.match(/customer_decision_message/g) ?? []).length >= 2,
  "Customer context must project customer_decision_message for open and closed Claim shapes.");
assert((functionDef.match(/decided_at/g) ?? []).length >= 2,
  "Customer context must project decided_at for open and closed Claim shapes.");
assert(!functionDef.includes("decision_reason") && !functionDef.includes("decided_by_profile_id"),
  "Customer context function must not project internal adjudication reason or actor identity.");

const intakeSource = readFileSync("lib/warranty/claim-intake.ts", "utf8");
const accessSource = readFileSync("lib/warranty/claim-access.server.ts", "utf8");
const clientSource = readFileSync("app/(public)/w/[publicCode]/claim/claim-client.tsx", "utf8");

for (const token of ["decidedAt: string | null", "customerDecisionMessage: string | null"]) {
  assert(intakeSource.includes(token), `Customer Claim summary type is missing ${token}.`);
}
for (const token of ["row.decided_at", "row.customer_decision_message"]) {
  assert(accessSource.includes(token), `Server Claim parser is missing ${token}.`);
}
for (const token of ["claim.decidedAt", "claim.customerDecisionMessage", "رسالة بخصوص القرار"]) {
  assert(clientSource.includes(token), `Verified customer UI is missing ${token}.`);
}
assert(!clientSource.includes("decisionReason") && !clientSource.includes("decision_reason"),
  "Verified customer UI must not consume the internal decision reason.");

console.log(`Cube Q customer-safe Claim status projection verified for ${claimNumber} (${claimId}).`);
