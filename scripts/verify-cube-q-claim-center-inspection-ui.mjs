import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const queue = read("app/operations/claim-inspections/page.tsx");
const detail = read("app/operations/claim-inspections/[id]/page.tsx");
const actions = read("app/operations/claim-inspections/actions.ts");
const form = read("components/claims/center-claim-inspection-form.tsx");
const nav = read("components/operations-nav-links.tsx");
const operations = read("app/operations/page.tsx");

assert(queue.includes('profile.role !== "center"'), "Inspection queue must be Center-only at the route boundary.");
assert(queue.includes('list_center_pending_claim_inspections'), "Inspection queue must use the bounded Center task RPC.");
assert(detail.includes('profile.role !== "center"'), "Inspection detail must be Center-only at the route boundary.");
assert(detail.includes('get_center_claim_inspection_detail'), "Inspection detail must use the bounded assigned-Center detail RPC.");
assert(detail.includes('list_warranty_claim_evidence_for_role'), "Inspection detail must use role-bounded Claim evidence metadata.");
assert(!detail.includes('customer_phone') && !detail.includes('customer_email') && !detail.includes('customer_name'),
  "Center inspection detail must not expose customer contact/name PII.");
assert(detail.includes('createSignedUrl'), "Authorized customer evidence must be exposed only through short-lived signed URLs.");

assert(actions.includes('createSupabaseAdminClient'), "Physical evidence upload must stay server-side through the private Storage admin client.");
assert(actions.includes('get_center_claim_inspection_detail'), "Every evidence mutation must preflight the currently assigned Center task.");
assert(actions.includes('submit_warranty_claim_inspection'), "Final inspection submit must use the authoritative Cube Q RPC.");
assert(actions.includes('MAX_IMAGE_BYTES = 8 * 1024 * 1024'), "Center evidence must retain the 8 MiB per-image limit.");
assert(actions.includes('const MAX_IMAGES = 5'), "Center evidence must retain the five-image limit.");
assert(actions.includes('detectImageMime'), "Center upload must validate actual image bytes, not browser MIME alone.");
assert(actions.includes('createHash("sha256")'), "Center upload path must remain content-addressed by SHA-256.");
assert(actions.includes('inspections/${inspectionId}/${slot}-${digest}.${extension}'), "Center evidence path must use the frozen inspection path contract.");
assert(actions.includes('slot < 1 || slot > MAX_IMAGES'), "Center evidence upload slots must be bounded to 1..5.");
assert(!actions.includes('.from("warranty_claims")') && !actions.includes('.from("warranty_claim_inspections")'),
  "Center UI server actions must not write Claim/inspection tables directly.");

for (const forbidden of [
  "approve_warranty_claim",
  "reject_warranty_claim",
  "cancel_warranty_claim",
  "reopen_warranty_claim_decision_for_correction",
]) {
  assert(!actions.includes(forbidden) && !form.includes(forbidden),
    `Center inspection UI must not expose Admin adjudication RPC ${forbidden}.`);
}

assert(form.includes('requestIdRef'), "Final inspection submission must preserve one request ID across ambiguous retries.");
assert(form.includes('راجعت الملاحظة والصور'), "Immutable inspection submission must require explicit operator acknowledgement.");
assert(form.includes('المركز يقدم الدليل والملاحظة ولا يقرر قبول أو رفض المطالبة'),
  "Center UI must clearly preserve Admin-only adjudication authority.");

const centerMobileStart = nav.indexOf("const centerMobileItems");
const centerMobileEnd = nav.indexOf("];", centerMobileStart);
const centerMobile = nav.slice(centerMobileStart, centerMobileEnd + 2);
assert(centerMobile.includes('/operations/claim-inspections'), "Center mobile navigation must expose assigned Claim inspections.");
assert(nav.includes('pathname.startsWith("/operations/claim-inspections/")'),
  "Mobile task view must hide the fixed navigation while an inspection is being performed.");

const centerModulesStart = operations.indexOf("const centerModules");
const centerModulesEnd = operations.indexOf("];", centerModulesStart);
const centerModules = operations.slice(centerModulesStart, centerModulesEnd + 2);
assert(centerModules.includes("inspectionModule"), "Center operations landing page must expose the inspection module.");

console.log("Cube Q Center inspection UI/security contracts verified.");
