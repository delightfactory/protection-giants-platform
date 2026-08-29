import fs from "node:fs";

const path = "app/operations/claim-resolutions/actions.ts";
const source = fs.readFileSync(path, "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(source.includes('"use server";'), "Center Resolution completion actions must remain server-only.");
assert(source.includes('createSupabaseAdminClient'), "Completion evidence upload must use the server Admin client.");
assert(source.includes('createSupabaseServerClient'), "Completion authorization/mutation must use the authenticated server client.");
assert(source.includes('const EVIDENCE_BUCKET = "warranty-claim-evidence"'), "Completion evidence must reuse the private Claim evidence bucket.");
assert(source.includes("const MAX_IMAGE_BYTES = 8 * 1024 * 1024"), "Completion evidence must retain the 8 MiB/image limit.");
assert(source.includes("const MAX_IMAGES = 5"), "Completion evidence must retain the five-image maximum.");

for (const mime of ["image/jpeg", "image/png", "image/webp"]) {
  assert(source.includes(`"${mime}"`), `Completion actions must retain ${mime} support.`);
}
assert(source.includes('bytes[0] === 0xff') && source.includes('bytes[1] === 0xd8'),
  "JPEG validation must inspect file bytes, not trust browser MIME alone.");
assert(source.includes('bytes[0] === 0x89') && source.includes('bytes[1] === 0x50'),
  "PNG validation must inspect file bytes, not trust browser MIME alone.");
assert(source.includes('bytes.toString("ascii", 0, 4) === "RIFF"')
  && source.includes('bytes.toString("ascii", 8, 12) === "WEBP"'),
  "WebP validation must inspect file bytes, not trust browser MIME alone.");

assert(source.includes('supabase.rpc("get_center_warranty_claim_resolution_task"'),
  "Staged completion evidence must authorize through the exact assigned-task read boundary.");
assert(source.includes('data[0]?.resolution_id === resolutionId'),
  "Task authorization must bind the RPC result to the requested Resolution id.");

const uploadStart = source.indexOf("export async function uploadClaimResolutionCompletionEvidence");
const removeStart = source.indexOf("export async function removeClaimResolutionCompletionEvidence");
const completeStart = source.indexOf("export async function completeAssignedWarrantyClaimResolution");
assert(uploadStart >= 0 && removeStart > uploadStart && completeStart > removeStart,
  "Expected upload/remove/complete Center actions are incomplete.");
const uploadSection = source.slice(uploadStart, removeStart);
const removeSection = source.slice(removeStart, completeStart);
const completeSection = source.slice(completeStart);

assert(uploadSection.includes("await authorizeAssignedResolution(resolutionId)"),
  "Upload must authorize the exact currently assigned unresolved Resolution before touching Storage.");
assert(uploadSection.match(/await authorizeAssignedResolution\(resolutionId\)/g)?.length >= 3,
  "Upload must re-authorize after existing/probed/new object paths so reassignment/completion revokes staged access promptly.");
assert(uploadSection.includes('const storagePath = `resolutions/${resolutionId}/completion/${slot}-${digest}.${extension}`'),
  "Completion evidence path must remain Resolution-scoped, slot-bounded and content-addressed.");
assert(uploadSection.includes("createHash(\"sha256\")") || source.includes('createHash("sha256")'),
  "Completion evidence objects must be content-addressed with SHA-256.");
assert(uploadSection.includes(".upload(storagePath, bytes"),
  "Evidence bytes must be uploaded only by the server-controlled Storage client.");
assert(uploadSection.includes("upsert: false"), "Completion evidence upload must not overwrite existing objects.");
assert(uploadSection.includes("await admin.storage.from(EVIDENCE_BUCKET).remove([storagePath])"),
  "If assignment is lost after upload, the server must compensate by removing the staged object.");
assert(!uploadSection.includes("createSignedUploadUrl") && !uploadSection.includes("getPublicUrl"),
  "Center completion must not grant direct/public Storage upload access.");

assert(removeSection.includes("completionPathPattern(resolutionId).test(storagePath)"),
  "Removal must accept only exact Resolution completion paths.");
assert(removeSection.includes("await authorizeAssignedResolution(resolutionId)"),
  "Removal must require the currently assigned unresolved Center task.");
assert(removeSection.includes(".remove([storagePath])"),
  "Removal must be server-controlled.");

assert(completeSection.includes('Database["public"]["Functions"]["complete_warranty_claim_resolution"]["Args"]'),
  "Completion RPC arguments must stay bound to generated DB types.");
assert(completeSection.includes('supabase.rpc("complete_warranty_claim_resolution", args)'),
  "Normal Center completion must call the already-qualified authoritative Cube R RPC.");
assert(completeSection.includes("completionNote.length < 10") && completeSection.includes("completionNote.length > 2000"),
  "Server action must preserve completion-note bounds before authoritative DB validation.");
assert(completeSection.includes("input.evidencePaths.length < 1") && completeSection.includes("input.evidencePaths.length > MAX_IMAGES"),
  "Server action must preserve 1-5 completion evidence bounds.");
assert(completeSection.includes("new Set(input.evidencePaths).size !== input.evidencePaths.length"),
  "Server action must reject duplicate completion paths.");
assert(completeSection.includes("const slots = new Set<number>()") && completeSection.includes("if (slots.has(slot))"),
  "Server action must reject duplicate completion evidence slots.");
assert(completeSection.includes("p_replacement_roll_serial: replacementRollSerial"),
  "Exact replacement Roll scan must flow to the authoritative completion RPC when supplied.");
assert(!completeSection.includes("service_role") && !source.includes("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE"),
  "Completion actions must never expose service-role credentials.");

console.log("Cube R Center completion server actions PASS: exact-task authorization, private content-addressed evidence, reassignment compensation, typed authoritative completion, and no direct Storage authority.");
