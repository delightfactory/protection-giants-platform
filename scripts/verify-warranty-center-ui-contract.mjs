import { readFileSync } from "node:fs";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function includes(source, fragment, message) {
  assert(source.includes(fragment), message);
}

const operations = read("app/operations/page.tsx");
const activatePage = read("app/operations/warranties/activate/page.tsx");
const registry = read("app/operations/warranties/page.tsx");
const detail = read("app/operations/warranties/[id]/page.tsx");
const actions = read("app/operations/warranties/actions.ts");
const flow = read("components/warranties/warranty-activation-flow.tsx");
const flowCss = read("components/warranties/warranty-activation-flow.module.css");

includes(operations, 'href: "/operations/warranties"', "Center operations landing must expose the Warranty module.");
const centerModuleBlock = operations.slice(operations.indexOf("const centerModules"), operations.indexOf("function modulesForRole"));
includes(centerModuleBlock, "warrantyModule", "Warranty module must be reachable from Center operations.");

includes(activatePage, 'profile.role !== "center"', "Warranty activation route must remain Center-only.");
includes(activatePage, 'redirect("/access-denied")', "Warranty activation route must fail closed for non-Center roles.");
for (const [label, source] of [["registry", registry], ["detail", detail]]) {
  includes(source, 'profile.role !== "center" && profile.role !== "admin"', `${label} route must allow only Center/Admin internal Warranty readers.`);
  includes(source, 'redirect("/access-denied")', `${label} route must fail closed for Agent/Dealer roles.`);
}

includes(actions, 'rpc("resolve_warranty_activation_candidate"', "Activation preflight must call the authoritative Candidate RPC.");
includes(actions, 'rpc("activate_roll_warranty"', "Activation submit must call the authoritative atomic RPC.");
includes(actions, "normalizeRollSerial", "Warranty actions must reuse canonical Roll serial normalization.");

includes(flow, "QrScannerSheet", "Warranty activation must reuse the existing QR scanner sheet.");
includes(flow, "parseRollQrPayload", "Warranty activation must reuse the contextual Roll QR parser.");
includes(flow, "crypto.randomUUID()", "Activation UI must allocate a stable idempotency request ID.");
includes(flow, "requestIdRef", "Activation UI must retain the request ID across lost-response retries.");
includes(flow, "تأكيد تفعيل ضمان العميل", "Irreversible activation confirmation copy is missing.");
includes(flow, "PG_WARRANTY_REQUEST_CONFLICT", "Request-conflict behavior must be surfaced to the UI.");
includes(flow, 'result.warranty.recordState !== "issued"', "Any historical non-issued retry must not be presented as successful issuance.");
includes(flow, "هذه المحاولة تشير إلى تفعيل تاريخي تم إلغاؤه كخطأ", "Historical voided retry must surface an explicit safe next step.");
includes(flow, "LocalDateTime", "Warranty timestamps must use the shared local-time presentation component.");

for (const field of [
  "customerName",
  "customerPhone",
  "customerEmail",
  "vehicleMake",
  "vehicleModel",
  "vehicleYear",
  "vehiclePlate",
  "vehicleColor",
  "vehicleVin",
]) {
  includes(flow, field, `Approved Warranty field ${field} is missing from the Center flow.`);
}

includes(flow, '.toUpperCase().replace(/\\s+/g, "")', "VIN/chassis input must normalize uppercase and remove whitespace before review.");

for (const forbiddenField of [
  "customerAccountId",
  "otpCode",
  "invoiceUpload",
  "invoiceFile",
  "evidencePaths",
  "photoUpload",
]) {
  assert(!flow.includes(forbiddenField), `Center Activation must not add deferred field ${forbiddenField}.`);
}

for (const state of [
  "not_opened",
  "transfer_reserved",
  "issue_pending",
  "return_required",
  "already_activated",
  "policy_incomplete",
  "production_invalid",
]) {
  includes(flow, `case "${state}"`, `Blocked Warranty state ${state} must have an explicit Center next action.`);
}

includes(registry, 'rpc("list_internal_warranties"', "Warranty registry must use the bounded read RPC.");
includes(detail, 'rpc("get_internal_warranty_detail"', "Warranty detail must use the bounded detail RPC.");
includes(registry, "LocalDateTime", "Warranty registry timestamps must use LocalDateTime.");
includes(detail, "LocalDateTime", "Warranty detail timestamps must use LocalDateTime.");
includes(detail, "المركز لا يستطيع تعديل بيانات هذا الضمان أو إلغاءه", "Center detail must retain its explicit read-only support boundary.");

const warrantyAppSources = [activatePage, registry, detail, actions].join("\n");
assert(!/\.from\(["']warranties["']\)/.test(warrantyAppSources), "Center Warranty UI must never read the warranties table directly.");
assert(!/\.from\(["']warranty_events["']\)/.test(warrantyAppSources), "Center Warranty UI must never read warranty_events directly.");

for (const forbiddenSurface of [
  "correct_warranty_details",
  "void_warranty_in_error",
  "public_warranty_token",
  "WarrantyQr",
  "PrintWarranty",
]) {
  assert(!actions.includes(forbiddenSurface) && !flow.includes(forbiddenSurface) && !activatePage.includes(forbiddenSurface),
    `Center Activation surface must not leak ${forbiddenSurface}.`);
}

includes(flowCss, "min-height: 48px", "Primary Warranty flow controls must preserve field/mobile touch target sizing.");
includes(flowCss, "overflow-wrap: anywhere", "Warranty identities must not create horizontal mobile overflow.");

console.log("Cube M Center Warranty Activation UI contract verified.");
