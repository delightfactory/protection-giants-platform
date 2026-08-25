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
const registry = read("app/operations/warranties/page.tsx");
const detail = read("app/operations/warranties/[id]/page.tsx");
const supportActions = read("app/operations/warranties/support-actions.ts");
const support = read("components/warranties/admin-warranty-support.tsx");
const supportCss = read("components/warranties/admin-warranty-support.module.css");
const auditTimeline = read("components/warranties/warranty-audit-timeline.tsx");

const adminModuleBlock = operations.slice(operations.indexOf("const adminModules"), operations.indexOf("const agentModules"));
includes(adminModuleBlock, "warrantyModule", "Admin operations landing must expose the Warranty module.");

for (const [label, source] of [["registry", registry], ["detail", detail]]) {
  includes(source, 'profile.role !== "center" && profile.role !== "admin"', `${label} must remain limited to Admin/Center internal readers.`);
  includes(source, 'redirect("/access-denied")', `${label} must reject Agent/Dealer roles.`);
}

includes(registry, 'const isAdmin = profile.role === "admin"', "Warranty registry must distinguish Admin scope.");
includes(registry, 'title={isAdmin ? "سجل ضمانات العملاء" : "ضمانات المركز"}', "Admin registry needs explicit all-Warranty context.");
includes(registry, 'label: "مركز التفعيل"', "Admin registry must surface activating Center context.");
includes(detail, "AdminWarrantySupport", "Admin Warranty detail must mount the bounded support component.");
includes(detail, 'isAdmin && warranty.record_state === "issued"', "Support controls must render only for Admin on issued Warranty rows.");
includes(detail, 'if (isAdmin)', "Warranty audit RPC must only execute inside the Admin branch.");
includes(detail, 'rpc("get_internal_warranty_audit"', "Admin Warranty detail must read the immutable audit timeline through its bounded RPC.");
includes(detail, "WarrantyAuditTimeline", "Admin Warranty detail must render the audit timeline.");
includes(detail, "admin_void_reason", "Admin voided Warranty detail must expose the internal recorded reason.");
includes(detail, "لا توجد عملية Restore إلى issued", "Voided Admin detail must explain permanent no-restore semantics.");
includes(detail, "المركز لا يستطيع تعديل بيانات هذا الضمان أو إلغاءه", "Center detail must remain explicitly read-only.");

includes(auditTimeline, "LocalDateTime", "Audit events must render device-local timestamps consistently.");
includes(auditTimeline, "details_corrected", "Audit timeline must distinguish correction events.");
includes(auditTimeline, "voided_in_error", "Audit timeline must distinguish void-in-error events.");
includes(auditTimeline, "change_snapshot", "Admin audit timeline must inspect recorded Before/After correction snapshots.");
includes(auditTimeline, "actor_profile_id", "Admin audit timeline must retain the acting profile marker.");

includes(supportActions, 'rpc("correct_warranty_details"', "Admin correction must use the typed authoritative support RPC.");
includes(supportActions, 'rpc("void_warranty_in_error"', "Admin void must use the typed authoritative support RPC.");
includes(supportActions, 'Database["public"]["Functions"]["correct_warranty_details"]["Args"]', "Correction action must bind to generated database RPC types.");
includes(supportActions, 'Database["public"]["Functions"]["void_warranty_in_error"]["Args"]', "Void action must bind to generated database RPC types.");
assert(!/\.from\(["']warranties["']\)/.test(supportActions), "Admin support actions must never update warranties directly.");
assert(!/\.from\(["']warranty_events["']\)/.test(supportActions), "Admin support actions must never insert warranty_events directly.");

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
  includes(support, field, `Approved Admin-correctable Warranty field ${field} is missing.`);
}

includes(support, "correctionReason", "Admin correction requires an explicit reason field.");
includes(support, "voidReason", "Admin void requires an explicit reason field.");
includes(support, "correctionRequestIdRef", "Correction must retain a stable idempotency request ID across lost-response retries.");
includes(support, "voidRequestIdRef", "Void must retain a stable idempotency request ID across lost-response retries.");
includes(support, 'title="تأكيد حفظ التصحيح؟"', "Admin correction must require an explicit confirmation dialog before submission.");
includes(support, 'confirmLabel="نعم، حفظ التصحيح"', "Correction confirmation needs an unambiguous affirmative action.");
includes(support, 'tone="primary"', "Correction confirmation must remain visually distinct from destructive void confirmation.");
includes(support, "لا توجد له عملية Restore", "Admin support copy must explain that void has no restore path.");
includes(support, "لا يوجد Restore إلى issued", "Void confirmation must explicitly state there is no restore to issued.");
includes(support, "Before/After", "Correction UI must explain immutable before/after audit capture.");
includes(support, '.toUpperCase().replace(/\\s+/g, "")', "Corrected VIN/chassis must normalize uppercase and remove whitespace.");

for (const forbiddenSurface of [
  "public_warranty_token",
  "WarrantyQr",
  "PrintWarranty",
  "customerAccountId",
  "otpCode",
  "invoiceUpload",
  "evidencePaths",
]) {
  assert(!support.includes(forbiddenSurface) && !supportActions.includes(forbiddenSurface),
    `Admin support increment must not leak deferred surface ${forbiddenSurface}.`);
}

for (const forbiddenEditableCore of [
  'updateDetail("roll',
  'updateDetail("product',
  'updateDetail("warrantyNumber',
  'updateDetail("activatedAt',
  'updateDetail("coverage',
  'updateDetail("warrantyMonths',
  'updateDetail("activatingCenter',
]) {
  assert(!support.includes(forbiddenEditableCore), `Immutable Warranty core must not become editable: ${forbiddenEditableCore}`);
}

includes(supportCss, "min-height: 44px", "Admin support controls must preserve mobile touch target sizing.");

console.log("Cube M Admin Warranty Support UI contract verified.");
