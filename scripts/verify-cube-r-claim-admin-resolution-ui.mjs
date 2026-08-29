import fs from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const queuePath = "app/operations/claim-resolutions/page.tsx";
const detailPath = "app/operations/claim-resolutions/[id]/page.tsx";
const actionsPath = "components/claims/admin-claim-resolution-actions.tsx";
const homePath = "app/operations/page.tsx";

const queue = fs.readFileSync(queuePath, "utf8");
const detail = fs.readFileSync(detailPath, "utf8");
const actions = fs.readFileSync(actionsPath, "utf8");
const home = fs.readFileSync(homePath, "utf8");

for (const [label, source] of [["queue", queue], ["detail", detail]]) {
  assert(source.includes("requireOperationalProfile()"), `${label} must require an operational Profile.`);
  assert(source.includes('profile.role !== "admin"'), `${label} must be Admin-only.`);
  assert(source.includes("createSupabaseServerClient"), `${label} must use the authenticated server client.`);
  assert(!source.includes("createSupabaseAdminClient"), `${label} must not use the Admin/service-role client.`);
  assert(!/\.insert\(|\.update\(|\.delete\(/.test(source), `${label} UI must remain read-only outside qualified server actions.`);
}

assert(queue.includes('rpc("list_admin_warranty_claim_resolutions"'),
  "Admin Resolution queue must use the bounded qualified list RPC.");
assert(queue.includes('href={`/operations/claim-resolutions/${resolution.resolution_id}`}'),
  "Queue must route to exact Resolution detail.");
assert(queue.includes('href="/operations/claims"'),
  "Resolution queue must preserve a path back to Claim review.");

assert(detail.includes('rpc("get_admin_warranty_claim_resolution_detail"'),
  "Resolution detail must use the qualified Admin detail RPC.");
assert(detail.includes('"list_admin_claim_resolution_replacement_roll_candidates"'),
  "Replacement candidates must come only from the bounded Cube R resolver.");
assert(!detail.includes('.from("rolls")'),
  "Admin Resolution UI must not browse global Roll inventory directly.");
assert(detail.includes('.from("installation_centers")')
  && detail.includes('.from("profiles")')
  && detail.includes('.eq("role", "center")')
  && detail.includes('.eq("status", "active")'),
  "Assignment UI must surface active Centers with active bound Center Profiles only.");
assert(detail.includes("<AdminClaimResolutionActions"),
  "Resolution detail must delegate mutation UX to the bounded action component.");
assert(detail.includes('href={`/operations/claims/${resolution.claim_id}`}'),
  "Resolution detail must preserve exact Claim navigation.");

for (const actionName of [
  "assignWarrantyClaimResolution",
  "reassignWarrantyClaimResolution",
  "changeWarrantyClaimResolutionRemedy",
  "reserveWarrantyClaimResolutionRoll",
  "releaseWarrantyClaimResolutionRoll",
  "cancelAssignedResolutionForCustomerWithdrawal",
  "uploadAdminRecoveryCompletionEvidence",
  "removeAdminRecoveryCompletionEvidence",
  "completeWarrantyClaimResolutionByAdminRecovery",
]) {
  assert(actions.includes(actionName), `Admin UI must call qualified server boundary ${actionName}.`);
}

assert(!actions.includes("createSupabaseServerClient") && !actions.includes("createSupabaseAdminClient"),
  "Client action component must not instantiate Supabase clients.");
assert(!/\.from\(|\.rpc\(|\.insert\(|\.update\(|\.delete\(/.test(actions),
  "Client action component must not bypass server actions with direct data operations.");
assert(!actions.includes("SUPABASE_SERVICE_ROLE_KEY") && !actions.includes("storage.from("),
  "Client UI must not gain service-role or direct Storage authority.");
assert(actions.includes("crypto.randomUUID()") && actions.includes("requestIds") && actions.includes("requestIdRef"),
  "Mutation UI must keep explicit idempotency request IDs, including Admin recovery.");
assert(actions.includes('allocationStatus === "reserved"')
  && actions.includes('allocationStatus === "consumed"')
  && actions.includes("cancelAssignedResolutionForCustomerWithdrawal"),
  "PD-079 UX must distinguish reserved/consumed material before customer-withdrawal closure.");
assert(actions.includes('performingCenterStatus === "suspended" || activeOperatorCount === 0'),
  "Admin recovery UI must only render after assigned-Center capability loss.");
assert(actions.includes("evidence.map((item) => item.storagePath)"),
  "Admin recovery completion must submit only paths returned by the qualified upload boundary.");
assert(actions.includes("expectedRollSerial && scan !== expectedRollSerial"),
  "Replacement recovery UI must fail obvious wrong-Roll scans before authoritative server revalidation.");

assert(home.includes('href: "/operations/claim-resolutions"')
  && home.includes('title: "تنفيذ مطالبات الضمان"')
  && home.includes("resolutionModule"),
  "Admin home must expose a discoverable Resolution execution module.");

console.log("Cube R Admin Resolution UI contract PASS: Admin-only bounded reads, authoritative server mutations, candidate-only material selection, idempotent retries, PD-079 and recovery guards, and discoverable queue/detail navigation.");
