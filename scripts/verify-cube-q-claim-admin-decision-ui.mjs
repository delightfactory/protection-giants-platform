import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const page = read("app/operations/claims/[id]/decision/page.tsx");
const actions = read("app/operations/claims/decision-actions.ts");
const form = read("components/claims/admin-claim-decision-actions.tsx");
const layout = read("app/operations/claims/[id]/layout.tsx");
const centerActions = read("app/operations/claim-inspections/actions.ts");
const centerForm = read("components/claims/center-claim-inspection-form.tsx");

assert(page.includes('profile.role !== "admin"'), "Final decision route must be Admin-only at the route boundary.");
assert(page.includes('get_admin_warranty_claim_detail'), "Final decision route must use the bounded Admin Claim detail RPC.");
assert(page.includes('resolutionId={claim.resolution_id}'), "Final decision UI must receive Resolution identity for bounded correction eligibility.");
assert(page.includes('resolutionStatus={claim.resolution_status}'), "Final decision UI must receive Resolution status for pre-execution approval cancellation.");

for (const rpc of [
  "approve_warranty_claim",
  "reject_warranty_claim",
  "cancel_warranty_claim",
  "reopen_warranty_claim_decision_for_correction",
]) {
  assert(actions.includes(rpc), `Admin final decision server actions must call authoritative RPC ${rpc}.`);
  assert(!centerActions.includes(rpc) && !centerForm.includes(rpc),
    `Center inspection UI must not expose Admin adjudication RPC ${rpc}.`);
}

assert(actions.includes('satisfies Database["public"]["Functions"]["approve_warranty_claim"]["Args"]'),
  "Approval action must stay pinned to generated DB argument types.");
assert(actions.includes('satisfies Database["public"]["Functions"]["reject_warranty_claim"]["Args"]'),
  "Rejection action must stay pinned to generated DB argument types.");
assert(actions.includes('satisfies Database["public"]["Functions"]["cancel_warranty_claim"]["Args"]'),
  "Cancellation action must stay pinned to generated DB argument types.");
assert(actions.includes('satisfies Database["public"]["Functions"]["reopen_warranty_claim_decision_for_correction"]["Args"]'),
  "Correction action must stay pinned to generated DB argument types.");
assert(actions.includes('revalidatePath("/operations/claim-inspections")'),
  "Cancel/reopen decisions must revalidate the Center pending-inspection queue.");
assert(!actions.includes('.from("warranty_claims")') && !actions.includes('.from("warranty_claim_resolutions")'),
  "Admin decision server actions must not bypass authoritative RPCs with direct table writes.");

assert(form.includes('approveRequestIdRef') && form.includes('rejectRequestIdRef')
  && form.includes('cancelRequestIdRef') && form.includes('reopenRequestIdRef'),
  "Every final decision path must preserve its request ID across ambiguous retries.");
assert(form.includes('claimStatus === "under_review" && inspectionStatus !== "requested"'),
  "Approval/rejection UI must not offer adjudication while a formal inspection is pending.");
assert(form.includes('(claimStatus === "approved" && resolutionStatus === "authorized")'),
  "Approval cancellation UI must be bounded to untouched authorized Resolution state.");
assert(form.includes('(claimStatus === "rejected" || claimStatus === "cancelled") && resolutionId === null'),
  "PD-078 UI must be hidden when any historical Resolution exists.");
assert(form.includes('minLength={5}') && form.includes('maxLength={1000}') && form.includes('maxLength={500}'),
  "Decision and correction text bounds must be enforced in the UI before RPC submission.");
assert(form.includes('حفظ رسالة العميل هنا لا يرسل إشعارًا'),
  "Final decision UI must not imply notification delivery before the notifications increment.");
assert(form.includes('هذا ليس Undo عامًا'), "PD-078 UI must explicitly remain a bounded correction, not a generic undo.");

assert(layout.includes('href={`${pathname}/review`}'), "Claim detail shortcut must keep the review workspace available.");
assert(layout.includes('href={`${pathname}/decision`}'), "Claim detail shortcut must expose the separate final decision workspace.");

console.log("Cube Q Admin final decision UI/security contracts verified.");
