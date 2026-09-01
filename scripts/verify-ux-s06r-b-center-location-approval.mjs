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

const locationPage = read("app/operations/centers/[id]/location/page.tsx");
const approvalPage = read("app/operations/centers/[id]/approval/page.tsx");
const css = read("app/operations/centers/[id]/center-detail.module.css");
const locationActions = read("app/operations/centers/[id]/location/actions.ts");
const approvalActions = read("app/operations/centers/[id]/approval/actions.ts");
const aVerifier = read("scripts/verify-ux-s06r-a-center-admin-density.mjs");

for (const [source, label] of [[locationPage, "Location"], [approvalPage, "Approval"]]) {
  includes(source, 'styles from "../center-detail.module.css"', `${label} page must own Center-route presentation`);
  includes(source, "className={styles.pageStack}", `${label} page must use the scoped Center detail stack`);
  excludes(source, 'className="user-settings-stack"', `${label} page must not depend on Users-route stack CSS`);
  excludes(source, 'className="user-role-note"', `${label} page must not depend on Users-route note CSS`);
  includes(source, 'href={`/operations/centers/${center.id}/edit`}', `${label} page must return to the exact Center management workspace`);
  includes(source, 'label="العودة لإدارة المركز"', `${label} return path must describe the user task rather than the module list`);
  includes(source, "<LocalDateTime", `${label} timestamps must use the shared viewer-local presentation`);
  excludes(source, "formatDate", `${label} page must not keep a redundant date wrapper`);
  excludes(source, 'href="/operations/centers" label="العودة للمراكز"', `${label} page must not lose exact Center context on back navigation`);
}

includes(locationPage, "await requireAdminProfile();", "Center location administration must remain Admin-only at the route boundary");
includes(locationPage, '<form action={correctCenterLocation}', "Location correction must preserve the existing server action");
includes(locationPage, 'name="latitude"', "Latitude control must remain available");
includes(locationPage, 'name="longitude"', "Longitude control must remain available");
includes(locationPage, 'min="-90"', "Latitude validation must remain bounded");
includes(locationPage, 'max="90"', "Latitude validation must remain bounded");
includes(locationPage, 'min="-180"', "Longitude validation must remain bounded");
includes(locationPage, 'max="180"', "Longitude validation must remain bounded");
includes(locationPage, 'from("center_location_events")', "Location history must remain present");
includes(locationPage, 'title="تصحيح إداري"', "Location correction must remain visually separate from current state");
includes(locationPage, 'title="سجل الموقع"', "Location history must remain a secondary support layer");

includes(approvalPage, 'if (profile.role !== "admin" && profile.role !== "agent") redirect("/access-denied")', "Network approval must remain bounded to Admin/Agent roles");
includes(approvalPage, 'const canApprove = !isApproved && isActive && hasLocation;', "Approval eligibility must remain active + located + unapproved");
includes(approvalPage, '<form action={approveCenterNetwork}', "Approval action must remain available only through the existing server action");
includes(approvalPage, '<form action={revokeCenterNetworkApproval}', "Revocation action must remain available only through the existing server action");
includes(approvalPage, 'name="location_captured_at" value={center.location_captured_at!}', "Approval action must remain pinned to the reviewed location timestamp");
includes(approvalPage, 'title="الحالة الحالية"', "Approval must summarize current state before change controls");
includes(approvalPage, 'title="الموقع المطلوب للاعتماد"', "Approval must keep location prerequisite visible before change controls");
includes(approvalPage, 'title="إجراء الاعتماد"', "Approval must keep its primary action explicit");
includes(approvalPage, 'title="سجل الاعتماد"', "Approval history must remain available as a secondary support layer");
includes(approvalPage, 'from("center_network_approval_events")', "Approval event history must remain present");

includes(css, ".pageStack", "Center detail pages must share a bounded presentation stack");
includes(css, ".stateNote", "Center detail pages must share a readable state treatment");
includes(css, ".coordinate", "Coordinates must preserve explicit LTR/readability handling");
includes(css, "overflow-wrap: anywhere", "Long Center state values must remain readable");
includes(css, "@media (max-width: 600px)", "Center detail presentation must retain phone-specific behavior");

for (const forbidden of [".insert(", ".update(", ".delete(", "auth.admin.updateUser", "auth.admin.deleteUser"]) {
  excludes(locationPage, forbidden, "Location page must remain read/presentation-only outside its existing server action");
  excludes(approvalPage, forbidden, "Approval page must remain read/presentation-only outside its existing server actions");
}
includes(locationActions, "correctCenterLocation", "Location mutation implementation must remain isolated in the existing action module");
includes(approvalActions, "approveCenterNetwork", "Approval mutation implementation must remain isolated in the existing action module");
includes(approvalActions, "revokeCenterNetworkApproval", "Revocation mutation implementation must remain isolated in the existing action module");
includes(aVerifier, "UX-S06R-A Center administration density contracts verified.", "S06R-A Center edit hierarchy regression contract must remain present");

console.log("UX-S06R-B Center location and approval presentation contracts verified.");
