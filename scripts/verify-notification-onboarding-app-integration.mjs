import fs from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const actions = fs.readFileSync("app/onboarding/center/actions.ts", "utf8");
const exactProfileIndex = actions.indexOf("const exactProfile =");
const mismatchExitIndex = actions.indexOf('redirect(onboardingPath("error=profile"));', exactProfileIndex);
const materializerName = '"materialize_center_onboarding_success"';
const materializerIndex = actions.indexOf(materializerName);
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
  materializerIndex === actions.lastIndexOf(materializerName),
  "Normal onboarding success materializer must be called exactly once; provisional invitation acceptance must not emit success.",
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
