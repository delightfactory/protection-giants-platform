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
const transferReads = read("lib/transfers/receipt.server.ts");
const approvalPage = read("app/operations/centers/[id]/approval/page.tsx");
const approvalMigration = read("supabase/migrations/20260813143040_center_network_approval.sql");

includes(home, 'else if (profile.role === "agent")', "Agent workbench reads must be role-bounded");
includes(home, 'else if (profile.role === "dealer")', "Dealer workbench reads must be role-bounded");
includes(home, 'const isPartner = profile.role === "agent" || profile.role === "dealer"', "Partner presentation must remain limited to Agent and Dealer roles");
includes(home, "getTransferAttentionCounts()", "Partner Home must reuse the authoritative Transfer attention contract");
includes(transferReads, 'rpc("get_roll_transfer_attention_counts"', "Transfer attention helper must remain backed by the authoritative RPC");
includes(home, '/operations/transfers?direction=incoming&scope=active', "Partner incoming attention must open the bounded incoming Transfer queue");

includes(home, '.from("installation_centers")', "Agent approval/setup attention must reuse the existing scoped Center read surface");
includes(home, '.eq("status", "active")', "Agent Center attention must only consider active Centers");
includes(home, '.eq("approval_status", "unapproved")', "Agent Center attention must only consider unapproved Centers");
includes(home, '.not("latitude", "is", null)', "Approval-ready Centers must have latitude");
includes(home, '.not("longitude", "is", null)', "Approval-ready Centers must have longitude");
includes(home, '.not("location_captured_at", "is", null)', "Approval-ready Centers must have a captured location timestamp");
includes(home, '.not("location_source", "is", null)', "Approval-ready Centers must retain location provenance");
includes(home, '.not("location_updated_by_profile_id", "is", null)', "Approval-ready Centers must retain the location actor boundary");
includes(home, '.is("location_captured_at", null)', "Agent setup attention must distinguish Centers still waiting for location capture");
includes(home, ".limit(4)", "Partner Center attention reads must remain intentionally bounded");
includes(home, "approvalReadyCenters.slice(0, 3)", "Agent Home must render only a small approval-ready sample");
includes(home, "locationPendingCenters.slice(0, 3)", "Agent Home must render only a small setup-pending sample");
includes(home, '/operations/centers/${center.id}/approval', "Agent Center attention must deep-link to the existing scoped approval surface");
includes(home, 'profile.role === "agent" ? partnerAttention.approvalReadyCenters', "Approval-ready Center cards must remain Agent-only");
includes(home, 'profile.role === "agent" ? partnerAttention.locationPendingCenters', "Center setup attention cards must remain Agent-only");

includes(home, "مراجعة اعتماد", "Approval-ready Centers must be described as review work, not auto-approved state");
includes(home, "إعداد غير مكتمل", "Location-pending Centers must be distinguished from approval-ready work");
includes(home, "الاعتماد متوقف حتى يسجل المركز موقعه الجغرافي الحالي", "Agent setup attention must explain the real blocking condition");
includes(home, "لا توجد أعمال تحتاج تدخلك الآن", "Partner Home must have a useful zero state");
includes(home, "أدوات ومراجع شبكة الوكيل", "Agent lower-frequency destinations must remain discoverable");
includes(home, "أدوات ومراجع الموزع", "Dealer lower-frequency destinations must remain discoverable");
includes(home, "modules.map((module)", "Partner Home must keep rendering S03R role-valid destinations");

includes(approvalMigration, "add column approval_status text not null default 'unapproved'", "Home must align with the persisted approval default");
includes(approvalMigration, "check (approval_status in ('unapproved', 'approved'))", "Home must align with the persisted approval state domain");
includes(approvalMigration, "if target.status <> 'active'", "Approval authority must continue requiring an active Center");
includes(approvalMigration, "or target.location_captured_at is null", "Approval authority must continue requiring a current captured location");
includes(approvalMigration, "or target.location_source is null", "Approval authority must continue requiring location provenance");
includes(approvalMigration, "or target.location_updated_by_profile_id is null", "Approval authority must continue requiring a location actor");
includes(approvalPage, 'profile.role !== "admin" && profile.role !== "agent"', "Approval page authority must remain Admin/Agent-only");
includes(approvalPage, 'const isActive = center.status === "active"', "Approval UI must explicitly derive active Center state");
includes(approvalPage, 'const hasLocation = center.latitude !== null && center.longitude !== null && center.location_captured_at !== null', "Approval UI must explicitly derive current location readiness");
includes(approvalPage, 'const canApprove = !isApproved && isActive && hasLocation', "Approval UI must retain its unapproved/active/location readiness boundary");

for (const forbidden of [
  "approve_center_network(",
  "revoke_center_network_approval(",
  "createSupabaseAdminClient",
  ".insert(",
  ".update(",
  ".delete(",
  "customer_phone",
  "customer_email",
  "customer_name",
  "returnTo",
  "return_url",
  "redirectTo",
]) {
  excludes(home, forbidden, "Partner Home must remain read-only, PII-safe, and free of arbitrary routing");
}

for (const destination of ["transfers", "rolls", "centers", "products"]) {
  includes(navigation, `id: "${destination}"`, `S03R must retain ${destination} as a registered Partner destination`);
}

console.log("UX-S05R-B Partner attention-first workbench contracts verified.");
