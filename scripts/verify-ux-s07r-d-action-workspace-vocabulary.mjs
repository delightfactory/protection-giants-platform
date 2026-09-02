import fs from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const actionsPath = "components/claims/admin-claim-resolution-actions.tsx";
const actions = fs.readFileSync(actionsPath, "utf8");

for (const authorityMarker of [
  "assignWarrantyClaimResolution",
  "reassignWarrantyClaimResolution",
  "changeWarrantyClaimResolutionRemedy",
  "reserveWarrantyClaimResolutionRoll",
  "releaseWarrantyClaimResolutionRoll",
  "completeWarrantyClaimResolutionByAdminRecovery",
  "removeAdminRecoveryCompletionEvidence",
  "uploadAdminRecoveryCompletionEvidence",
  "cancelAssignedResolutionForCustomerWithdrawal",
]) {
  assert(actions.includes(authorityMarker), `Action authority/lifecycle marker must remain unchanged: ${authorityMarker}.`);
}

for (const safetyMarker of [
  'const stateRaceCodes = new Set([',
  'const requestIds = useRef<Partial<Record<ActionKind, string>>>({});',
  'if (!requestIds.current[kind]) requestIds.current[kind] = crypto.randomUUID();',
  'if (result.code === "PG_CLAIM_RESOLUTION_ACTION_REQUEST_CONFLICT") resetRequest(kind);',
  'if (stateRaceCodes.has(result.code)) router.refresh();',
  'const materialActive = allocationStatus === "reserved" || allocationStatus === "consumed";',
  'const recoveryAllowed = resolutionStatus === "assigned"',
  '&& (performingCenterStatus === "suspended" || activeOperatorCount === 0);',
  'if (resolutionStatus === "completed" || resolutionStatus === "cancelled")',
  'resolutionStatus === "authorized"',
  'resolutionStatus === "assigned"',
  'allocationStatus === "reserved" && allocationId',
  'allocationStatus === "consumed"',
  'remedyKind === "replacement_roll_reinstall"',
  'RECOVERY_MAX_IMAGES = 5',
  'RECOVERY_MAX_IMAGE_BYTES = 8 * 1024 * 1024',
  'RECOVERY_EVIDENCE_ACCEPT = "image/jpeg,image/png,image/webp"',
]) {
  assert(actions.includes(safetyMarker), `Action safety/state contract must remain unchanged: ${safetyMarker}.`);
}

assert((actions.match(/<ConfirmSubmitButton/g) ?? []).length >= 3,
  "Sensitive release, withdrawal, and exceptional-completion actions must retain explicit confirmation UI.");
assert(actions.includes("رقم المحاولة نفسه بأمان"),
  "Ordinary action retry guidance must preserve idempotent same-request safety.");
assert(actions.includes("رقم المحاولة نفسه والأدلة المرفوعة نفسها بأمان"),
  "Exceptional completion retry guidance must preserve idempotent request/evidence reuse safety.");
assert(actions.includes("أزل أو استبدل أي صورة تعذر تأكيد حالتها"),
  "Ambiguous evidence must remain blocked before exceptional completion.");

for (const forbiddenVisible of [
  "Resolution terminal state",
  "لم تعد الـResolution تسمح",
  "قرار جودة Return Required",
  "قرار Return Required",
  "مستخدم Center نشط",
  "PD-079",
  "Admin recovery",
  "أي Opening/Quality fact",
  "مسار Transfer العادي",
  "تحت locks",
  "الـResolution والمطالبة",
  "actor_kind=admin_recovery",
  "Scan / serial",
]) {
  assert(!actions.includes(forbiddenVisible), `Action workspace must not expose internal/architecture wording: ${forbiddenVisible}.`);
}

for (const productCopy of [
  "حالة نهائية",
  "مستخدم مركز نشط",
  "إغلاق التنفيذ بناءً على رغبة العميل",
  "الإكمال الاستثنائي بواسطة الإدارة",
  "قرار جودة بإرجاعها وعدم استخدامها",
  "مسار التحويل المعتاد",
  "تعيد السلطة النهائية التحقق من كل الشروط والسياسة",
  "جهة الإكمال هي الإدارة عبر المسار الاستثنائي",
  "الرقم التسلسلي",
]) {
  assert(actions.includes(productCopy), `Action workspace must retain product-facing wording: ${productCopy}.`);
}

console.log("UX-S07R-D action workspace vocabulary PASS: user-facing operational Arabic is clean while server-action authority, state predicates, confirmations, evidence lifecycle, and idempotent retry safety remain unchanged.");
