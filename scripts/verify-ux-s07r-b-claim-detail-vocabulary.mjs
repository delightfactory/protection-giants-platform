import fs from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const claimPath = "app/operations/claims/[id]/page.tsx";
const labelsPath = "lib/claims/ui-labels.ts";

const claim = fs.readFileSync(claimPath, "utf8");
const labels = fs.readFileSync(labelsPath, "utf8");

for (const helper of [
  "actorKindLabel",
  "claimStatusLabel",
  "inspectionStatusLabel",
  "resolutionStatusLabel",
  "warrantyRecordStateLabel",
]) {
  assert(labels.includes(`export function ${helper}`), `Shared vocabulary must retain ${helper}.`);
  assert(claim.includes(helper), `Claim detail must use shared vocabulary helper ${helper}.`);
}

for (const forbidden of [
  "Cube R",
  "Snapshot وقت التفعيل",
  "<h2>Resolution</h2>",
  "معرف Resolution",
  "لم يتم إنشاء Resolution",
  "<dt>SKU</dt>",
  "{claim.inspection_status ??",
  "الجهة: {event.actor_kind}",
]) {
  assert(!claim.includes(forbidden), `Claim detail must not expose internal wording: ${forbidden}`);
}

for (const replacement of [
  "بيانات مثبتة وقت التفعيل",
  "التنفيذ المرتبط",
  "معرف التنفيذ",
  "لم يتم إنشاء مهمة تنفيذ لهذه المطالبة",
  "كود المنتج",
  "actorKindLabel(event.actor_kind)",
  "inspectionStatusLabel(claim.inspection_status)",
  "warrantyRecordStateLabel(claim.warranty_record_state)",
]) {
  assert(claim.includes(replacement), `Claim detail must retain product-facing replacement: ${replacement}`);
}

for (const rpc of [
  "get_admin_warranty_claim_detail",
  "list_admin_warranty_claim_timeline",
  "list_admin_warranty_claim_history",
  "list_warranty_claim_evidence_for_role",
]) {
  assert(claim.includes(rpc), `Claim detail must preserve qualified read ${rpc}.`);
}

assert(claim.includes('profile.role !== "admin"'), "Claim detail must remain Admin-only.");
assert(claim.includes('createSupabaseAdminClient()') && claim.includes('.from("warranty-claim-evidence")'),
  "Claim evidence preview must preserve the existing bounded signed-URL path.");
assert(!/\.insert\(|\.update\(|\.delete\(/.test(claim),
  "Claim detail vocabulary changes must not introduce mutation authority.");

console.log("UX-S07R-B Claim detail vocabulary PASS: product-facing Arabic labels replace internal terms while qualified reads, evidence access, and Admin scope remain unchanged.");
