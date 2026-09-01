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

const home = read("app/operations/page.tsx");
const navigation = read("lib/navigation/operations-navigation.ts");
const claimsPage = read("app/operations/claims/page.tsx");
const resolutionsPage = read("app/operations/claim-resolutions/page.tsx");
const qDecisionVerifier = read("scripts/verify-cube-q-claim-admin-decision-ui.mjs");
const rAssignmentVerifier = read("scripts/verify-cube-r-claim-initial-assignment.mjs");

includes(home, 'if (profile.role === "admin")', "Admin workbench reads must be role-bounded");
includes(home, 'rpc("list_admin_warranty_claims"', "Admin Home must reuse the bounded Claim list RPC");
includes(home, 'p_status: "submitted"', "New submitted Claims must be treated as Company attention");
includes(home, 'p_status: "under_review"', "Claims back under Company review must be treated as Company attention");
includes(home, 'rpc("list_admin_warranty_claim_resolutions"', "Admin Home must reuse the bounded Resolution list RPC");
includes(home, 'p_status: "authorized"', "Authorized unassigned Resolutions must be treated as Company attention");
includes(home, 'p_scope: "open"', "Admin attention reads must stay on the open operational scope");
includes(home, "p_limit: 4", "Admin attention reads must remain intentionally bounded");
includes(home, "submittedClaims.slice(0, 3)", "Submitted Claim rendering must remain a small sample");
includes(home, "reviewClaims.slice(0, 3)", "Under-review Claim rendering must remain a small sample");
includes(home, "unassignedResolutions.slice(0, 3)", "Unassigned Resolution rendering must remain a small sample");

excludes(home, 'p_status: "awaiting_inspection"', "Claims waiting for Center inspection must not be promoted as Admin attention");
excludes(home, 'p_status: "assigned"', "Assigned Resolution work must not be promoted as Admin attention");
includes(home, "لا نعرض هنا ما ينتظر المركز", "Admin Home must explain the responsibility boundary");
includes(home, "المطالبات التي تنتظر فحص مركز أو مهام التنفيذ التي تم إسنادها لا تظهر هنا كعمل على الإدارة", "Admin zero state must preserve responsibility handoff semantics");

includes(home, 'href={`/operations/claims/${claim.claim_id}/review`}', "Admin Claim attention must deep-link to the existing review workspace");
includes(home, 'href={`/operations/claim-resolutions/${resolution.resolution_id}`}', "Admin Resolution attention must deep-link to the exact Resolution workspace");
includes(home, "<LocalDateTime value={claim.submitted_at}", "Admin Claim timestamps must keep viewer-local instant presentation");
includes(home, "<LocalDateTime value={resolution.authorized_at}", "Admin Resolution timestamps must keep viewer-local instant presentation");
includes(home, "أدوات الإدارة والمراجع", "Admin lower-frequency destinations must remain discoverable below attention work");
includes(home, "modules.map((module)", "Admin Home must continue rendering the S03R role-valid destination registry");

includes(claimsPage, 'profile.role !== "admin"', "Admin Claim queue must remain Admin-only");
includes(claimsPage, 'rpc("list_admin_warranty_claims"', "Admin Claim queue must remain backed by the bounded Claim list RPC");
includes(resolutionsPage, 'profile.role !== "admin"', "Admin Resolution queue must remain Admin-only");
includes(resolutionsPage, 'rpc("list_admin_warranty_claim_resolutions"', "Admin Resolution queue must remain backed by the bounded Resolution list RPC");

includes(qDecisionVerifier, 'claimStatus === "under_review" && inspectionStatus !== "requested"', "Q final-decision contract must keep inspection-pending work away from Company adjudication");
includes(qDecisionVerifier, '(claimStatus === "approved" && resolutionStatus === "authorized")', "Q/R boundary must retain untouched authorized Resolution semantics");
includes(rAssignmentVerifier, "status = 'authorized'", "R assignment regression must retain authorized pre-assignment state");
includes(rAssignmentVerifier, 'assert(!deniedCenter.response.ok, "Center Profile must not perform Admin-only initial assignment.")', "R assignment must remain Admin-only");
includes(rAssignmentVerifier, "assigned|service_reinstall", "R assignment regression must retain assigned post-handoff state");
includes(rAssignmentVerifier, "action_path === `/operations/claim-resolution-tasks/${resolutionId}`", "Assigned Resolution must hand off to the Center task route");

for (const forbidden of [
  "createSupabaseAdminClient",
  ".insert(",
  ".update(",
  ".delete(",
  "approve_warranty_claim(",
  "assign_warranty_claim_resolution(",
  "customer_phone",
  "customer_email",
  "customer_name",
  "returnTo",
  "return_url",
  "redirectTo",
]) {
  excludes(home, forbidden, "Admin Home must remain read-only, PII-safe, and free of arbitrary routing");
}

for (const destination of ["claims", "claim-resolutions", "issues", "transfers", "production-orders", "centers", "users", "products"]) {
  includes(navigation, `id: "${destination}"`, `S03R must retain ${destination} as a registered Admin destination`);
}

console.log("UX-S05R-C Admin decision attention workbench contracts verified.");
