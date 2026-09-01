import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function includes(source, snippet, label) {
  assert.ok(source.includes(snippet), `${label}: expected ${JSON.stringify(snippet)}`);
}

function excludes(source, snippet, label) {
  assert.ok(!source.includes(snippet), `${label}: forbidden ${JSON.stringify(snippet)}`);
}

const receipt = read("components/transfers/transfer-receipt-flow.tsx");
const warranty = read("components/warranties/warranty-activation-flow.tsx");
const inspectionQueue = read("app/operations/claim-inspections/page.tsx");
const inspectionForm = read("components/claims/center-claim-inspection-form.tsx");
const resolutionQueue = read("app/operations/claim-resolution-tasks/page.tsx");
const resolutionForm = read("components/claims/center-claim-resolution-completion-form.tsx");

includes(receipt, "type ReceiptOutcome = {", "Receipt completion outcome snapshot");
includes(receipt, "setReceiptOutcome({", "Receipt success snapshot write");
assert.ok(
  receipt.indexOf("setReceiptOutcome({") < receipt.indexOf("router.refresh();"),
  "Receipt completion outcome must be captured before server refresh.",
);
includes(receipt, "completedTransfer: remainingCount === 0", "Receipt full/partial classification");
includes(receipt, "استكمال استلام الباقي", "Partial receipt next action");
includes(receipt, 'href="/operations/rolls/open"', "Completed receipt existing Roll Opening next action");
includes(receipt, "لا تفتح أي رول لمجرد الاستلام", "Receipt physical-state guidance");
includes(receipt, "اللفات المتبقية لا تدخل عهدتك قبل تأكيد استلامها فعليًا", "Partial receipt custody guidance");
includes(receipt, "function continueRemainingReceipt()", "Partial receipt same-journey continuation");
excludes(receipt, "window.location", "Receipt continuation must remain inside the existing app workflow");

includes(warranty, "اكتملت مهمة التركيب والتفعيل لهذا الرول", "Warranty activation terminal Center state");
includes(warranty, "لا توجد خطوة تشغيلية أخرى عليه من المركز الآن", "Warranty activation must not fabricate a follow-up task");
includes(warranty, "أي مطالبة مستقبلية تبدأ من الضمان نفسه لا من مسار ما قبل التركيب", "Warranty post-activation domain boundary");
includes(warranty, 'href={`/operations/warranties/${success.warrantyId}`}', "Warranty success detail reference");
includes(warranty, "تفعيل ضمان آخر", "Warranty success next independent job action");

includes(inspectionForm, 'router.push("/operations/claim-inspections?notice=submitted")', "Inspection completion bounded return route");
includes(inspectionQueue, "لا توجد خطوة أخرى على هذا الفحص من المركز الآن", "Inspection explicit waiting state");
includes(inspectionQueue, "انتظر قرار الشركة", "Inspection company-decision handoff");
includes(inspectionQueue, "إذا تم قبول المطالبة وإسناد تنفيذ لمركزك فستظهر كمهمة مستقلة ضمن مهام التنفيذ", "Inspection future responsibility re-entry guidance");

includes(resolutionForm, 'router.push("/operations/claim-resolution-tasks?notice=completed")', "Resolution completion bounded return route");
includes(resolutionQueue, "انتهت هذه المهمة ولا يوجد إجراء آخر على نفس المطالبة من المركز", "Resolution explicit terminal state");
includes(resolutionQueue, "أي تكليف جديد سيظهر كمهمة مستقلة هنا", "Resolution future responsibility re-entry guidance");

for (const source of [receipt, warranty, inspectionQueue, resolutionQueue]) {
  excludes(source, "returnTo", "S04R-B must not introduce arbitrary return URL routing");
  excludes(source, "return_url", "S04R-B must not introduce arbitrary return URL routing");
  excludes(source, "redirectTo", "S04R-B must not introduce arbitrary return URL routing");
}

console.log("UX-S04R-B Center next-action contracts verified.");
