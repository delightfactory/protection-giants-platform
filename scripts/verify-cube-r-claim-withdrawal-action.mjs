import fs from "node:fs";

const path = "app/operations/claim-resolutions/withdrawal-actions.ts";
const source = fs.readFileSync(path, "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(source.includes('"use server";'), "Customer-withdrawal cancellation action must remain server-only.");
assert(source.includes("createSupabaseServerClient"), "Withdrawal action must use the authenticated server client.");
assert(!source.includes("createSupabaseAdminClient"), "Withdrawal action must not bypass DB authorization with an Admin client.");
assert(!source.includes("service_role") && !source.includes("SERVICE_ROLE"), "Withdrawal action must not use/expose service-role credentials.");

assert(source.includes("export async function cancelAssignedResolutionForCustomerWithdrawal"),
  "The bounded PD-079 server action is missing.");
assert(source.includes('Database["public"]["Functions"]["cancel_assigned_claim_resolution_for_customer_withdrawal"]["Args"]'),
  "Withdrawal RPC arguments must stay bound to generated DB types.");
assert(source.includes('"cancel_assigned_claim_resolution_for_customer_withdrawal"'),
  "Withdrawal action must call the existing authoritative Cube R RPC.");
assert(source.includes("reason.length < 5 || reason.length > 500"),
  "Internal withdrawal reason must preserve 5-500 bounds.");
assert(source.includes("customerMessage.length < 5 || customerMessage.length > 1000"),
  "Customer-facing withdrawal message must preserve 5-1000 bounds.");
assert(source.includes("data !== input.resolutionId"),
  "Successful withdrawal must bind the returned Resolution identity to the request.");
assert(source.includes("EXPOSED_WITHDRAWAL_ERRORS.has(message)"),
  "Withdrawal action must expose only a bounded known DB error allowlist.");
assert(source.includes('"PG_CLAIM_RESOLUTION_WITHDRAWAL_RELEASE_REQUIRED"'),
  "Withdrawal boundary must preserve explicit release-first material guidance.");
assert(source.includes('"PG_CLAIM_RESOLUTION_WITHDRAWAL_MATERIAL_CONSUMED"'),
  "Withdrawal boundary must preserve consumed-material terminal denial.");
assert(source.includes('revalidatePath("/operations/claim-resolutions")')
  && source.includes('revalidatePath("/operations/claims")'),
  "Successful withdrawal must invalidate Resolution and Claim operational reads.");

for (const forbidden of [
  "complete_warranty_claim_resolution_by_admin_recovery",
  "complete_warranty_claim_resolution",
  "reserve_claim_resolution_roll",
  "release_claim_resolution_roll",
  "warranty-claim-evidence",
]) {
  assert(!source.includes(forbidden), `12A5 withdrawal action must not absorb unrelated scope: ${forbidden}.`);
}

console.log("Cube R customer-withdrawal server action PASS: typed authoritative PD-079 closure, bounded internal/customer text, explicit material-state errors, no service-role/recovery/evidence scope.");
