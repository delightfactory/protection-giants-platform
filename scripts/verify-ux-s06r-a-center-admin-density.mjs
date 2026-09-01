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

const page = read("app/operations/centers/[id]/edit/page.tsx");
const css = read("app/operations/centers/[id]/edit/center-edit.module.css");
const coreFields = read("components/center-core-fields.tsx");
const confirmButton = read("components/ui/confirm-submit-button.tsx");
const actions = read("app/operations/centers/[id]/edit/actions.ts");
const recoveryActions = read("app/operations/centers/[id]/edit/recovery-actions.ts");

includes(page, 'styles from "./center-edit.module.css"', "Center edit must own its presentation instead of borrowing Users route CSS");
excludes(page, 'className="user-settings-stack"', "Center edit must not depend on Users-only stack styling");
excludes(page, 'className="user-role-note"', "Center edit must not depend on Users-only state-note styling");
includes(page, "className={styles.pageStack}", "Center edit must use the local responsive stack");
includes(page, "className={styles.summary}", "Center edit must start with a current-state summary");
includes(page, 'id="center-core-settings"', "Primary Center settings must have an explicit task anchor");
includes(page, 'id="center-onboarding"', "Onboarding/access must have a separate task anchor");

const summaryIndex = page.indexOf('className={styles.summary}');
const coreIndex = page.indexOf('id="center-core-settings"');
const onboardingIndex = page.indexOf('id="center-onboarding"');
assert.ok(summaryIndex >= 0 && coreIndex > summaryIndex && onboardingIndex > coreIndex,
  "Center edit hierarchy must remain summary -> primary Center settings -> account/onboarding.");

for (const label of ["الحالة التشغيلية", "التبعية الحالية", "الحساب الأول", "Transfer ID"]) {
  includes(page, label, `Current-state summary must retain ${label}`);
}
includes(page, "currentParentLabel", "Center edit must summarize the current operational parent before change controls");
includes(page, "onboardingStateDescription", "Center edit must summarize onboarding state before exposing its controls");
includes(page, 'href="#center-core-settings"', "Summary must deep-link to the primary Center settings task");
includes(page, 'href="#center-onboarding"', "Summary must deep-link to the account/onboarding task");
includes(page, 'profile.role === "admin" ? (', "Admin-only related Center management links must stay role-bounded");
includes(page, 'href={`/operations/centers/${center.id}/location`}', "Admin must retain an obvious path to the dedicated location workspace");
includes(page, 'profile.role === "admin" || profile.role === "agent"', "Approval discovery must remain bounded to Admin/Agent roles");
includes(page, 'href={`/operations/centers/${center.id}/approval`}', "Authorized roles must retain an obvious path to the dedicated approval workspace");

includes(page, "<CenterCoreFields", "Existing Center core fields must remain the authoritative edit surface");
includes(page, 'name="current_parent_ref"', "Existing parent-transition proof must remain submitted");
includes(page, 'confirmWhenChanged={[{ name: "parent_ref", initialValue: currentParentRef }]}', "Operational parent changes must receive review without adding confirmation to ordinary edits");
includes(confirmButton, "if (!sensitiveChange)", "Conditional confirmation must still submit ordinary unchanged-sensitive-field edits directly");
includes(coreFields, 'name="parent_ref"', "Center parent field name must remain compatible with the conditional confirmation and action contract");

for (const action of [
  "updateCenter",
  "sendCenterInvitation",
  "reissueCenterInvitation",
  "cancelCenterInvitation",
  "recoverCenterOnboardingInvitation",
]) {
  includes(page, action, `Center edit must preserve ${action}`);
}
for (const stateContract of [
  'const reviewInvitation = invitation?.status === "accepted" && invitation.review_required_at',
  'const pendingInvitation = invitation?.status === "pending"',
  'const finalizingInvitation = invitation?.status === "accepted" && !reviewInvitation && !centerHasAccount',
  'reviewInvitation ? (',
  ') : centerHasAccount ? (',
  ') : finalizingInvitation ? (',
  ') : pendingInvitation ? (',
  ') : centerActive ? (',
]) {
  includes(page, stateContract, `Onboarding state branch must remain intact: ${stateContract}`);
}
includes(page, 'profile.role === "admin" ? (', "Exceptional onboarding recovery must remain Admin-gated in the UI");
includes(page, '<form action={recoverCenterOnboardingInvitation}>', "Exceptional recovery action must remain reachable for Admin");
includes(page, 'disabled={!centerActive}', "Pending invitation reissue must remain disabled while the Center is inactive");
includes(page, "المركز موقوف؛ يمكن إلغاء الدعوة الحالية لكن لا يمكن إعادة إصدارها", "Inactive pending-invitation guidance must remain explicit");
includes(page, "المستلم ممنوع من إعادة المحاولة", "Review-required security lock must remain explicit");

includes(page, "<LocalDateTime value={reviewInvitation.review_required_at}", "Review-required instant must use shared viewer-local presentation");
includes(page, "<LocalDateTime value={pendingInvitation.created_at}", "Invitation creation instant must use shared viewer-local presentation");
includes(page, "<LocalDateTime value={finalizingInvitation.accepted_at ?? finalizingInvitation.created_at}", "Finalizing instant must use shared viewer-local presentation");
excludes(page, "Intl.DateTimeFormat", "Center edit must not reintroduce a one-off timestamp formatter");
excludes(page, "formatInviteDate", "Center edit must use the shared LocalDateTime contract");

includes(css, "grid-template-columns: repeat(2, minmax(0, 1fr))", "Desktop Center summary must remain scannable without an over-wide single row");
includes(css, "@media (max-width: 600px)", "Center density styles must contain a phone-specific layout");
includes(css, "grid-template-columns: 1fr", "Center summary/actions must collapse cleanly on phones");
includes(css, "min-height: 50px", "Mobile summary actions must preserve touch-friendly targets");
includes(css, "overflow-wrap: anywhere", "Long Center identifiers/relationship text must remain readable");

for (const forbidden of [".insert(", ".update(", ".delete(", "auth.admin.updateUser", "auth.admin.deleteUser"]) {
  excludes(page, forbidden, "S06R-A page must remain read/presentation-only outside existing server actions");
}
includes(actions, "updateCenter", "Existing Center mutation action module must remain present and separate from the page");
includes(recoveryActions, "recoverCenterOnboardingInvitation", "Existing recovery action module must remain present and separate from the page");

console.log("UX-S06R-A Center administration density contracts verified.");
