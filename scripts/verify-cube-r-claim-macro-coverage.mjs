import { readFileSync } from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function source(path) {
  return readFileSync(path, "utf8");
}

function requireTokens(path, tokens) {
  const text = source(path);
  for (const token of tokens) {
    assert(text.includes(token), `${path} no longer proves Claims Macro contract token: ${token}`);
  }
}

const workflowPath = ".github/workflows/cube-r-claim-fulfillment-quality.yml";
const workflow = source(workflowPath);

const requiredCommands = [
  "node scripts/verify-cube-p-claim-races.mjs",
  "node scripts/verify-cube-q-claim-review.mjs",
  "node scripts/verify-cube-r-claim-assignment-corrections.mjs",
  "node scripts/verify-cube-r-claim-roll-reservation-lifecycle.mjs",
  "node scripts/verify-cube-r-claim-material-domain-compatibility.mjs",
  "node scripts/verify-cube-r-claim-consumption-readiness.mjs",
  "node scripts/verify-cube-r-claim-normal-center-completion.mjs",
  "node scripts/verify-cube-r-claim-customer-withdrawal.mjs",
  "node scripts/verify-cube-r-claim-admin-recovery-completion.mjs",
  "node scripts/verify-cube-r-claim-customer-service-history.mjs",
  "node scripts/verify-cube-r-claim-macro-concurrency-a.mjs",
  "node scripts/verify-cube-r-claim-macro-concurrency-b.mjs",
  "node scripts/verify-cube-r-claim-macro-coverage.mjs",
];
for (const command of requiredCommands) {
  assert(workflow.includes(command), `Cube R Macro gate is missing required executable coverage: ${command}`);
}

requireTokens("scripts/verify-cube-p-claim-races.mjs", [
  "Promise.all",
  "Different-request race",
  "Claim submit versus Cube M void-in-error",
  "Claim submit versus legitimate phone correction",
]);
requireTokens("scripts/verify-cube-q-claim-review.mjs", [
  "request_warranty_claim_inspection",
  "reassign_warranty_claim_inspection",
  "submit_warranty_claim_inspection",
  "approve_warranty_claim",
  "reject_warranty_claim",
  "reopen_warranty_claim_decision_for_correction",
  "Promise.all",
]);
requireTokens("scripts/verify-cube-r-claim-roll-reservation-lifecycle.mjs", [
  "reserve_claim_resolution_roll",
  "release_claim_resolution_roll",
  "PG_CLAIM_ROLL_ALREADY_ALLOCATED",
  "open_roll",
  "PG_WARRANTY_ROLL_CLAIM_ALLOCATED",
]);
requireTokens("scripts/verify-cube-r-claim-material-domain-compatibility.mjs", [
  "void_production_order",
  "recover_opened_roll",
  "create_roll_preinstall_issue",
  "PG_CLAIM_ROLL_PRODUCTION_VOID_BLOCKED",
]);
requireTokens("scripts/verify-cube-r-claim-consumption-readiness.mjs", [
  "return_required",
  "PG_CLAIM_CONSUMPTION_QUALITY_PENDING",
]);
requireTokens("scripts/verify-cube-r-claim-normal-center-completion.mjs", [
  "service_reinstall",
  "replacement_roll_reinstall",
  "PG_CLAIM_RESOLUTION_REPLACEMENT_SCAN_MISMATCH",
  "replacement_roll_consumed",
]);
requireTokens("scripts/verify-cube-r-claim-customer-withdrawal.mjs", [
  "cancel_assigned_claim_resolution_for_customer_withdrawal",
  "PG_CLAIM_RESOLUTION_WITHDRAWAL_RELEASE_REQUIRED",
]);
requireTokens("scripts/verify-cube-r-claim-admin-recovery-completion.mjs", [
  "complete_warranty_claim_resolution_by_admin_recovery",
]);
requireTokens("scripts/verify-cube-r-claim-customer-service-history.mjs", [
  "replacement_roll_serial",
  "product_eligibility_basis",
  "resolution_completed_at",
]);
requireTokens("scripts/verify-cube-r-claim-macro-concurrency-a.mjs", [
  "Promise.all",
  "Concurrent Resolution assignment",
  "Customer withdrawal versus service completion",
  "Warranty-void race",
  "Same Roll reservation by two Resolutions",
]);
requireTokens("scripts/verify-cube-r-claim-macro-concurrency-b.mjs", [
  "Promise.all",
  "Remedy/reservation race",
  "Cube K issue versus replacement completion",
  "Allocation release versus replacement completion",
  "40P01",
  "dead-end audit",
]);
requireTokens("scripts/verify-cube-r-claim-macro-fixture.mjs", [
  "oneWinner",
  "40P01",
  "create_production_order",
  "activate_roll_warranty",
  "assign_warranty_claim_resolution",
]);

const spec = source("docs/claims-pqr-final-spec-review-amendment.md");
const section = spec.split("# 13. Final permanent race/dead-end test matrix")[1]
  ?.split("# 14. Frozen Cube boundaries after audit")[0] ?? "";
const numberedItems = section.match(/^\d+\./gm) ?? [];
assert(numberedItems.length === 35,
  `Frozen Claims race/dead-end matrix drifted from 35 items to ${numberedItems.length}; update the Macro coverage deliberately.`);
for (let index = 1; index <= 35; index += 1) {
  assert(section.includes(`\n${index}. `), `Frozen Claims race/dead-end matrix is missing item ${index}.`);
}

console.log("Claims Macro 12A11 coverage contract PASS: frozen P/Q/R scenario, concurrency, recovery, material, privacy and all 35 dead-end matrix items remain wired into the exact-HEAD Cube R gate.");
