import fs from "node:fs";

const path = "app/operations/claim-resolutions/recovery-actions.ts";
const source = fs.readFileSync(path, "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(source.includes('"use server";'), "Admin recovery actions must remain server-only.");
assert(source.includes("createSupabaseServerClient"), "Admin recovery authorization/completion must use the authenticated server client.");
assert(source.includes("createSupabaseAdminClient"), "Recovery evidence bytes must use the server-only Storage Admin client.");
assert(!source.includes("service_role") && !source.includes("SERVICE_ROLE"), "Recovery actions must never expose service-role credentials.");
assert(!source.includes("admin.from("), "Recovery actions must not use the Admin client to bypass database authorization.");
assert(source.includes('const EVIDENCE_BUCKET = "warranty-claim-evidence"'), "Recovery evidence must reuse the private Claim evidence bucket.");
assert(source.includes("const MAX_IMAGE_BYTES = 8 * 1024 * 1024"), "Recovery evidence must retain the 8 MiB/image limit.");
assert(source.includes("const MAX_IMAGES = 5"), "Recovery evidence must retain the five-image maximum.");

for (const mime of ["image/jpeg", "image/png", "image/webp"]) {
  assert(source.includes(`"${mime}"`), `Admin recovery evidence must retain ${mime} support.`);
}
assert(source.includes("bytes[0] === 0xff") && source.includes("bytes[1] === 0xd8"),
  "Recovery JPEG validation must inspect file bytes.");
assert(source.includes("bytes[0] === 0x89") && source.includes("bytes[1] === 0x50"),
  "Recovery PNG validation must inspect file bytes.");
assert(source.includes('bytes.toString("ascii", 0, 4) === "RIFF"')
  && source.includes('bytes.toString("ascii", 8, 12) === "WEBP"'),
  "Recovery WebP validation must inspect file bytes.");

assert(source.includes('supabase.rpc("get_admin_warranty_claim_resolution_detail"'),
  "Recovery evidence staging must authorize through the bounded Admin Resolution detail read.");
assert(source.includes('detail.resolution_status !== "assigned"'),
  "Recovery evidence must stay bound to an assigned Resolution.");
assert(source.includes('detail.claim_status !== "approved"') && source.includes("detail.claim_closed_at !== null"),
  "Recovery evidence must stay bound to an approved open Claim.");
assert(source.includes("!detail.performing_center_party_id"),
  "Recovery evidence must require an exact performing Center assignment.");
assert(source.includes('detail.performing_center_status === "suspended"'),
  "A suspended assigned Center must qualify for the narrow recovery evidence path.");
assert(source.includes('detail.performing_center_status === "active" && activeOperatorCount === 0'),
  "An active Center may qualify only when it has no active bound operator.");

const uploadStart = source.indexOf("export async function uploadAdminRecoveryCompletionEvidence");
const removeStart = source.indexOf("export async function removeAdminRecoveryCompletionEvidence");
const completeStart = source.indexOf("export async function completeWarrantyClaimResolutionByAdminRecovery");
assert(uploadStart >= 0 && removeStart > uploadStart && completeStart > removeStart,
  "Expected recovery upload/remove/complete actions are incomplete.");
const uploadSection = source.slice(uploadStart, removeStart);
const removeSection = source.slice(removeStart, completeStart);
const completeSection = source.slice(completeStart);

assert(uploadSection.includes("await authorizeAdminRecoveryEvidence(resolutionId)"),
  "Recovery upload must authorize before touching Storage.");
assert(uploadSection.match(/await authorizeAdminRecoveryEvidence\(resolutionId\)/g)?.length >= 3,
  "Recovery upload must re-authorize existing/new/probed objects to react to Center capability restoration.");
assert(uploadSection.includes('const storagePath = `resolutions/${resolutionId}/completion/${slot}-${digest}.${extension}`'),
  "Recovery evidence path must retain the canonical Resolution completion namespace.");
assert(source.includes('createHash("sha256")'), "Recovery evidence must be content-addressed with SHA-256.");
assert(uploadSection.includes(".upload(storagePath, bytes") && uploadSection.includes("upsert: false"),
  "Recovery evidence upload must be server-controlled and non-overwriting.");
assert(uploadSection.includes("await admin.storage.from(EVIDENCE_BUCKET).remove([storagePath])"),
  "Newly staged recovery evidence must be compensated if recovery eligibility disappears after upload.");
assert(!uploadSection.includes("createSignedUploadUrl") && !uploadSection.includes("getPublicUrl"),
  "Recovery must not grant direct/public Storage authority.");

assert(removeSection.includes("completionPathPattern(resolutionId).test(storagePath)"),
  "Recovery evidence removal must accept only exact Resolution completion paths.");
assert(removeSection.includes("await authorizeAdminRecoveryEvidence(resolutionId)"),
  "Recovery evidence removal must remain bound to a currently eligible Admin recovery case.");
assert(removeSection.includes(".remove([storagePath])"), "Recovery evidence removal must remain server-controlled.");

assert(!completeSection.includes("authorizeAdminRecoveryEvidence"),
  "Authoritative recovery completion must not use the advisory precheck; exact retries must reach the idempotent DB RPC.");
assert(completeSection.includes('Database["public"]["Functions"]["complete_warranty_claim_resolution_by_admin_recovery"]["Args"]'),
  "Admin recovery RPC arguments must remain bound to generated DB types.");
assert(completeSection.includes('"complete_warranty_claim_resolution_by_admin_recovery"'),
  "Admin recovery completion must call the already-qualified authoritative RPC.");
assert(completeSection.includes("completionNote.length < 10") && completeSection.includes("completionNote.length > 2000"),
  "Recovery completion note must preserve 10-2000 bounds.");
assert(completeSection.includes("recoveryReason.length < 5") && completeSection.includes("recoveryReason.length > 500"),
  "Admin recovery reason must preserve 5-500 bounds.");
assert(completeSection.includes("input.evidencePaths.length < 1") && completeSection.includes("input.evidencePaths.length > MAX_IMAGES"),
  "Recovery completion must preserve 1-5 evidence bounds.");
assert(completeSection.includes("new Set(input.evidencePaths).size !== input.evidencePaths.length"),
  "Recovery completion must reject duplicate evidence paths.");
assert(completeSection.includes("const slots = new Set<number>()") && completeSection.includes("if (slots.has(slot))"),
  "Recovery completion must reject duplicate evidence slots.");
assert(completeSection.includes("p_recovery_reason: recoveryReason"),
  "Recovery reason must flow to the authoritative audit event RPC.");
assert(completeSection.includes("p_replacement_roll_serial: replacementRollSerial"),
  "Exact replacement Roll scan must flow to recovery completion when applicable.");
assert(source.includes('EXPOSED_RECOVERY_ERRORS.has(error.message)'),
  "Recovery completion must expose only a bounded known DB error allowlist.");
assert(source.includes('"PG_CLAIM_RESOLUTION_ADMIN_RECOVERY_NOT_ALLOWED"'),
  "Recovery boundary must preserve the actionable-Center denial explicitly.");
assert(source.includes('"PG_CLAIM_RESOLUTION_ADMIN_RECOVERY_FAILED"'),
  "Unknown recovery failures must collapse to one non-leaky error.");
assert(source.includes('revalidatePath("/operations/claim-resolutions")')
  && source.includes('revalidatePath("/operations/claims")'),
  "Successful recovery completion must invalidate Resolution and Claim operational reads.");

for (const forbidden of [
  "cancel_assigned_claim_resolution_for_customer_withdrawal",
  "assign_warranty_claim_resolution",
  "reassign_warranty_claim_resolution",
  "change_warranty_claim_resolution_remedy",
  "reserve_claim_resolution_roll",
  "release_claim_resolution_roll",
]) {
  assert(!source.includes(forbidden), `12A6 Admin recovery must not absorb unrelated coordination scope: ${forbidden}.`);
}

console.log("Cube R Admin recovery server actions PASS: recovery-only Admin evidence staging, capability-loss rechecks/compensation, typed idempotent authoritative completion, and no DB/service-role bypass.");
