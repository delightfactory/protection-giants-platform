import fs from "node:fs";

const path = "app/operations/claim-resolutions/admin-actions.ts";
const source = fs.readFileSync(path, "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(source.includes('"use server";'), "Resolution Admin mutation actions must remain server-only.");
assert(source.includes('createSupabaseServerClient'), "Resolution Admin mutations must use the authenticated server client.");
assert(!source.includes('createSupabaseAdminClient'), "Resolution Admin mutations must not bypass RPC authorization with the Admin Storage/DB client.");
assert(!source.includes('service_role') && !source.includes('SERVICE_ROLE'), "Resolution Admin mutation actions must not expose or use service-role credentials.");

for (const actionName of [
  "assignWarrantyClaimResolution",
  "reassignWarrantyClaimResolution",
  "changeWarrantyClaimResolutionRemedy",
  "reserveWarrantyClaimResolutionRoll",
  "releaseWarrantyClaimResolutionRoll",
]) {
  assert(source.includes(`export async function ${actionName}`), `Missing bounded Admin action ${actionName}.`);
}

for (const rpcName of [
  "assign_warranty_claim_resolution",
  "reassign_warranty_claim_resolution",
  "change_warranty_claim_resolution_remedy",
  "reserve_claim_resolution_roll",
  "release_claim_resolution_roll",
]) {
  assert(source.includes(`supabase.rpc("${rpcName}", args)`), `Admin action boundary must call authoritative RPC ${rpcName}.`);
  assert(
    source.includes(`Database["public"]["Functions"]["${rpcName}"]["Args"]`),
    `${rpcName} arguments must remain bound to generated DB types.`,
  );
}

assert(source.includes('"service_reinstall"') && source.includes('"replacement_roll_reinstall"'),
  "Admin actions must expose only the two frozen Cube R remedy kinds.");
assert(source.includes("normalized.length >= 5 && normalized.length <= 500"),
  "Reassignment/remedy/release reasons must retain the 5-500 server boundary.");
assert(source.includes("UUID_PATTERN.test"), "Admin action identifiers must be server-validated UUIDs.");
assert(source.includes("typeof data !== \"string\" || !UUID_PATTERN.test(data)"),
  "Admin action results must be validated as UUIDs before returning success.");
assert(source.includes('EXPOSED_ADMIN_ERRORS.has(message)'),
  "Admin actions must expose only a bounded known DB error allowlist.");
assert(source.includes('"PG_CLAIM_RESOLUTION_ADMIN_ACTION_FAILED"'),
  "Unknown DB failures must collapse to one non-leaky Admin action error.");
assert(source.includes('revalidatePath("/operations/claim-resolutions")'),
  "Successful Admin mutations must invalidate the Resolution queue.");
assert(source.includes('revalidatePath("/operations/claims")'),
  "Successful Admin mutations must invalidate related operational Claim reads.");

assert(!source.includes("cancel_assigned_claim_resolution_for_customer_withdrawal"),
  "12A4 must not absorb the separate post-assignment customer-withdrawal cancellation path.");
assert(!source.includes("complete_warranty_claim_resolution_by_admin_recovery"),
  "12A4 must not absorb the separate Admin recovery completion path.");
assert(!source.includes("warranty-claim-evidence"),
  "12A4 Admin coordination actions must not touch completion evidence Storage.");

console.log("Cube R Admin mutation server actions PASS: typed authoritative assignment/correction/reserve/release boundary, bounded validation/errors, no service-role bypass, cancellation, recovery or Storage scope.");
