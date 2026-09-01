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
const navigationRegistry = read("lib/navigation/operations-navigation.ts");

assert(queue.includes('profile.role !== "center"'), "Inspection queue must be Center-only at the route boundary.");
assert(queue.includes('list_center_pending_claim_inspections'), "Inspection queue must use the bounded Center task RPC.");
assert(queue.includes("لا توجد خطوة أخرى على هذا الفحص من المركز الآن"),
  "Submitted inspection must leave the Center in an explicit wait-for-company state.");
assert(queue.includes("إذا تم قبول المطالبة وإسناد تنفيذ لمركزك فستظهر كمهمة مستقلة ضمن مهام التنفيذ"),
  "Inspection completion guidance must explain how any later Center responsibility re-enters the workflow.");
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

const inspectionDestinationStart = navigationRegistry.indexOf('id: "claim-inspections"');
const inspectionDestinationEnd = navigationRegistry.indexOf("\n  },", inspectionDestinationStart);
assert(inspectionDestinationStart >= 0 && inspectionDestinationEnd > inspectionDestinationStart,
  "Center Claim inspection destination must remain registered in the shared navigation registry.");
const inspectionDestination = navigationRegistry.slice(inspectionDestinationStart, inspectionDestinationEnd);
assert(inspectionDestination.includes('href: "/operations/claim-inspections"'),
  "Center navigation must expose assigned Claim inspections.");
assert(/roles:\s*\[\s*"center"\s*\]/.test(inspectionDestination),
  "Claim inspection navigation must remain Center-only.");
assert(/mobilePrimaryRoles:\s*\[\s*"center"\s*\]/.test(inspectionDestination),
  "Center mobile navigation must keep assigned Claim inspections in the primary set.");
assert(nav.includes("isOperationsTaskRoute(pathname)"),
  "Mobile task view must use explicit route classification while an inspection is being performed.");
assert(navigationRegistry.includes('/^\\/operations\\/claim-inspections\\/[^/]+$/'),
  "Inspection detail must remain explicitly classified as a mobile task route.");
assert(operations.includes("getHomeDestinations(profile.role)"),
  "Center operations landing page must expose inspection work through the shared registry.");

console.log("Cube Q Center inspection UI/security contracts verified.");
