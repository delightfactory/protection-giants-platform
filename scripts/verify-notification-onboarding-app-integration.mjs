import fs from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const actions = fs.readFileSync("app/onboarding/center/actions.ts", "utf8");
const exactProfileIndex = actions.indexOf("const exactProfile =");
const mismatchExitIndex = actions.indexOf('redirect(onboardingPath("error=profile"));', exactProfileIndex);
const materializerName = '"materialize_center_onboarding_success"';
const materializerIndices = [...actions.matchAll(new RegExp(materializerName, "g"))].map((match) => match.index ?? -1);
const reconciliationIndex = actions.indexOf("const { data: reconciliationInvitation");
const materializerIndex = materializerIndices[1] ?? -1;
const finalRevalidateIndex = actions.indexOf('revalidatePath("/operations");', materializerIndex);

assert(
  exactProfileIndex >= 0 && mismatchExitIndex > exactProfileIndex,
  "Center onboarding must retain exact final Profile verification and its fail-closed mismatch path.",
);
assert(
  materializerIndex > mismatchExitIndex && finalRevalidateIndex > materializerIndex,
  "Normal onboarding notification must materialize only after exact Profile verification and before final success redirect.",
);
assert(
  materializerIndices.length === 2 &&
    reconciliationIndex >= 0 &&
    materializerIndices[0] > reconciliationIndex &&
    materializerIndices[0] < exactProfileIndex,
  "Existing-Profile reconciliation/retry must idempotently repair the mandatory onboarding success notification.",
);
assert(
  actions.includes('.in("status", ["pending", "accepted"])') &&
    actions.includes("reconciliationInvitation.review_required_at === null") &&
    actions.includes("reconciliationInvitation.failure_code === null") &&
    actions.includes("{ p_invitation_id: reconciliationInvitation.id }") &&
    actions.includes("if (reconciliationNotificationError) throw reconciliationNotificationError;"),
  "Onboarding reconciliation must cover pending/accepted normal invitations without emitting the review-required path.",
);
assert(
  actions.includes('{ p_invitation_id: invitation.id }'),
  "Onboarding action must materialize the exact invitation that completed provisioning.",
);
assert(
  actions.includes("if (onboardingNotificationError) throw onboardingNotificationError;"),
  "Onboarding notification materialization failure must not be silently ignored.",
);

console.log("Cube L Center onboarding app integration contract verified.");
