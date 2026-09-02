import fs from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const detailPath = "app/operations/claim-resolutions/[id]/page.tsx";
const labelsPath = "lib/claims/ui-labels.ts";
const actionsPath = "components/claims/admin-claim-resolution-actions.tsx";

const detail = fs.readFileSync(detailPath, "utf8");
const labels = fs.readFileSync(labelsPath, "utf8");
const actions = fs.readFileSync(actionsPath, "utf8");

for (const helper of [
  "actorKindLabel",
  "allocationStatusLabel",
  "centerOperationalStatusLabel",
  "claimStatusLabel",
  "qualityStateLabel",
  "resolutionStatusLabel",
]) {
  assert(labels.includes(`export function ${helper}`), `Shared vocabulary must retain ${helper}.`);
  assert(detail.includes(helper), `Resolution detail must use shared vocabulary helper ${helper}.`);
}

for (const forbidden of [
  "Cube R",
  ">Resolution<",
  "Return Required",
  "مستخدم Center نشط",
  "Admin recovery",
  "PD-079",
]) {
  assert(!detail.includes(forbidden), `Resolution detail must not expose internal wording: ${forbidden}`);
}

for (const replacement of [
  "السجل التشغيلي للمعالجة بعد قبول المطالبة",
  "قرارات الإسناد والمادة والإغلاق تمر عبر الإجراءات المؤهلة فقط",
  ">التنفيذ<",
  "مستخدم مركز نشط",
  "مادة الاستبدال",
  "الإكمال النهائي",
  "إغلاق التنفيذ بناءً على رغبة العميل",
]) {
  assert(detail.includes(replacement), `Resolution detail must retain product-facing wording: ${replacement}`);
}

for (const rpc of [
  "get_admin_warranty_claim_resolution_detail",
  "list_admin_claim_resolution_replacement_roll_candidates",
]) {
  assert(detail.includes(rpc), `Resolution detail must preserve qualified read ${rpc}.`);
}

for (const sourceRead of [
  '.from("installation_centers")',
  '.from("operational_parties")',
  '.from("profiles")',
]) {
  assert(detail.includes(sourceRead), `Resolution detail must preserve existing bounded Center/actionability read ${sourceRead}.`);
}

assert(detail.includes('profile.role !== "admin"'), "Resolution detail must remain Admin-only.");
assert(detail.includes("AdminClaimResolutionActions"),
  "Resolution detail must preserve the qualified action-workspace boundary.");
assert(detail.includes('resolution.resolution_status === "authorized" || resolution.resolution_status === "assigned"'),
  "Resolution detail must preserve the existing open-for-Admin-action state boundary.");
assert(detail.includes('p_limit: 50, p_offset: 0'),
  "Replacement candidate read must remain bounded.");
assert(detail.includes('.limit(200)'),
  "Center lookup must remain bounded.");
assert(!/\.insert\(|\.update\(|\.delete\(/.test(detail),
  "Resolution read detail must not gain direct mutation authority.");

for (const authorityMarker of [
  "assignAdminWarrantyClaimResolution",
  "reassignAdminWarrantyClaimResolution",
  "allocateAdminWarrantyClaimResolutionReplacementRoll",
  "releaseAdminWarrantyClaimResolutionReplacementRoll",
]) {
  assert(actions.includes(authorityMarker),
    `Qualified mutations must remain in AdminClaimResolutionActions/server-action boundary: ${authorityMarker}.`);
}

console.log("UX-S07R-C Resolution detail vocabulary PASS: product-facing Arabic wording and shared labels are applied while Admin scope, bounded reads, candidate resolution, and action authority remain unchanged.");
