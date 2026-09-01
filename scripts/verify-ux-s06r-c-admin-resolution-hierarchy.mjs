import fs from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const detail = fs.readFileSync("app/operations/claim-resolutions/[id]/page.tsx", "utf8");
const css = fs.readFileSync("app/operations/claim-resolutions/[id]/resolution-detail.module.css", "utf8");
const actions = fs.readFileSync("components/claims/admin-claim-resolution-actions.tsx", "utf8");

assert(detail.includes("requireOperationalProfile()") && detail.includes('profile.role !== "admin"'),
  "Resolution detail must remain Admin-only.");
assert(detail.includes('rpc("get_admin_warranty_claim_resolution_detail"'),
  "Resolution detail must keep the bounded qualified detail RPC.");
assert(detail.includes('"list_admin_claim_resolution_replacement_roll_candidates"'),
  "Replacement material candidates must keep the bounded Cube R resolver.");
assert(!detail.includes("createSupabaseAdminClient") && !detail.includes('.from("rolls")'),
  "Progressive hierarchy must not introduce service-role or global Roll browsing authority.");
assert(!/\.insert\(|\.update\(|\.delete\(/.test(detail),
  "Resolution detail must remain read-only outside qualified server actions.");

for (const marker of [
  "إسناد التنفيذ إلى مركز",
  "تدخل إدارة مطلوب لاستكمال التنفيذ",
  "حجز لفة الاستبدال",
  "توفير مادة مؤهلة لمركز التنفيذ",
  "المادة محجوزة — التنفيذ عند المركز",
  "المادة استُهلكت — بانتظار تسجيل الإكمال",
  "التنفيذ الآن عند المركز",
  "التنفيذ مكتمل",
  "التنفيذ مغلق دون إكمال",
]) {
  assert(detail.includes(marker), `Current-step guidance must preserve state-specific branch: ${marker}`);
}

assert(detail.includes('const recoveryAllowed = resolution.resolution_status === "assigned"')
  && detail.includes('resolution.performing_center_status === "suspended" || activeOperatorCount === 0'),
  "Admin recovery guidance must use the same assigned-Center capability-loss condition as Cube R.");
assert(detail.includes('const replacementNeedsAllocation = resolution.resolution_status === "assigned"')
  && detail.includes('resolution.remedy_kind === "replacement_roll_reinstall"')
  && detail.includes("!hasActiveAllocation"),
  "Replacement-material guidance must follow existing assigned/remedy/allocation truth.");
assert(detail.includes("rollCandidates.length > 0"),
  "Material guidance must distinguish an actionable candidate from a no-candidate waiting state.");

const summaryIndex = detail.indexOf('aria-label="ملخص التنفيذ"');
const focusIndex = detail.indexOf('aria-label="الخطوة الحالية"');
const actionWorkspaceIndex = detail.indexOf('id="resolution-actions"');
const referenceHeadingIndex = detail.indexOf("تفاصيل مرجعية");
const claimContextIndex = detail.indexOf('aria-label="سياق المطالبة والضمان"');
assert(summaryIndex >= 0
  && focusIndex > summaryIndex
  && actionWorkspaceIndex > focusIndex
  && referenceHeadingIndex > actionWorkspaceIndex
  && claimContextIndex > referenceHeadingIndex,
"Resolution hierarchy must be state summary → current step → actions → reference context.");

assert(detail.includes('href="#resolution-actions"')
  && detail.includes("currentStepActionPrimary ? \"button button-primary\" : \"button button-ghost\""),
  "Current-step guidance must provide a clear action jump without making waiting states look mandatory.");
assert(detail.includes("openForAdminAction ? (") && detail.includes("<AdminClaimResolutionActions"),
  "Authorized/assigned states must keep the action workspace reachable while terminal states retain the bounded component result.");

for (const prop of [
  "resolutionId={resolution.resolution_id}",
  "resolutionStatus={resolution.resolution_status}",
  "remedyKind={resolution.remedy_kind}",
  "performingCenterPartyId={resolution.performing_center_party_id}",
  "performingCenterStatus={resolution.performing_center_status}",
  "activeOperatorCount={activeOperatorCount}",
  "allocationId={resolution.allocation_id}",
  "allocationStatus={resolution.allocation_status}",
  "replacementRollSerial={resolution.replacement_roll_serial}",
  "centers={centers}",
  "rollCandidates={rollCandidates}",
]) {
  assert(detail.includes(prop), `Admin Resolution action boundary must retain prop ${prop}.`);
}

for (const actionName of [
  "assignWarrantyClaimResolution",
  "reassignWarrantyClaimResolution",
  "changeWarrantyClaimResolutionRemedy",
  "reserveWarrantyClaimResolutionRoll",
  "releaseWarrantyClaimResolutionRoll",
  "cancelAssignedResolutionForCustomerWithdrawal",
  "completeWarrantyClaimResolutionByAdminRecovery",
]) {
  assert(actions.includes(actionName), `Existing Cube R action must remain available: ${actionName}.`);
}
assert(actions.includes('performingCenterStatus === "suspended" || activeOperatorCount === 0'),
  "Action component recovery authority must remain unchanged.");

assert(css.includes(".focusCard") && css.includes(".actionWorkspace") && css.includes(".referenceHeading"),
  "Resolution detail must own explicit focus/action/reference presentation layers.");
assert(css.includes("scroll-margin-top: 1rem"),
  "Action jump must land with usable viewport spacing.");
assert(/@media \(max-width: 560px\)[\s\S]*\.focusActions \.button[\s\S]*min-height: 48px/.test(css),
  "Mobile current-step action must preserve a 48px touch target.");

console.log("UX-S06R-C Admin Resolution hierarchy contract PASS: primary state/action is first-scan visible, reference detail stays reachable, and Cube R authority/actions remain unchanged.");
