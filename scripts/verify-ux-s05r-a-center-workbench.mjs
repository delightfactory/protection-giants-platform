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
const homeCss = read("app/operations/page.module.css");
const navigation = read("lib/navigation/operations-navigation.ts");
const transferReads = read("lib/transfers/receipt.server.ts");

includes(home, "getHomeDestinations(profile.role)", "Home must keep S03R role navigation as the discoverability source");
includes(home, 'if (profile.role === "center")', "Center attention reads must remain role-bounded");
includes(home, "getTransferAttentionCounts()", "Center Home must reuse the authoritative Transfer attention contract");
includes(home, 'rpc("list_center_pending_claim_inspections"', "Center Home must reuse the bounded inspection queue RPC");
includes(home, 'rpc("list_center_assigned_warranty_claim_resolution_tasks"', "Center Home must reuse the bounded fulfillment queue RPC");
includes(home, "p_limit: 4", "Center Home attention reads must remain intentionally bounded");
includes(home, "slice(0, 3)", "Center Home must render only a small attention sample before full queues");

includes(home, "يحتاج انتباهك الآن", "Center Home must lead with actionable work");
includes(home, "هذه إشارات من قوائم العمل المعتمدة نفسها، وليست أرقامًا تحليلية", "Center Home must explain authoritative queue truth instead of analytics");
includes(home, "لا توجد مهام تحتاج تدخلك الآن", "Center Home must have a useful zero state");
includes(home, "فتح رول عند بدء تركيب", "Center zero state must preserve the physical-work entry point");
includes(home, "أدوات ومراجع المركز", "Center lower-frequency destinations must remain discoverable after attention work");
includes(home, "modules.map((module)", "Home must continue rendering role-valid registry destinations");

includes(home, '/operations/transfers?direction=incoming&scope=active', "Incoming Transfer attention must open the existing bounded queue");
includes(home, '/operations/claim-inspections/${inspection.inspection_id}', "Inspection attention must deep-link to the exact assigned task");
includes(home, '/operations/claim-resolution-tasks/${task.resolution_id}', "Fulfillment attention must deep-link to the exact assigned task");
includes(home, "LocalDateTime", "Attention timestamps must keep the viewer-local time contract");

for (const forbidden of [
  '.from("warranty_claims")',
  '.from("warranty_claim_inspections")',
  '.from("warranty_claim_resolutions")',
  'customer_phone',
  'customer_email',
  'customer_name',
  'returnTo',
  'return_url',
  'redirectTo',
]) {
  excludes(home, forbidden, "Center Home must not bypass bounded reads, expose customer PII, or introduce arbitrary routing");
}

includes(transferReads, 'rpc("get_roll_transfer_attention_counts"', "Transfer attention helper must remain backed by the authoritative RPC");
includes(navigation, 'id: "claim-inspections"', "Center inspection destination must remain in the shared registry");
includes(navigation, 'id: "claim-resolution-tasks"', "Center fulfillment destination must remain in the shared registry");
includes(navigation, 'id: "transfers"', "Center Transfer destination must remain in the shared registry");

includes(homeCss, "@media", "Center Home layout must retain an explicit small-screen rule");

console.log("UX-S05R-A Center attention-first workbench contracts verified.");
