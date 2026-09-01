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
const receiptServer = read("lib/transfers/receipt.server.ts");
const transfersPage = read("app/operations/transfers/page.tsx");
const transferHub = read("components/transfers/transfer-hub.tsx");
const cVerifier = read("scripts/verify-ux-s05r-c-admin-workbench.mjs");

includes(home, 'if (profile.role === "admin")', "Admin Transfer attention must remain inside the Admin workbench boundary");
includes(home, 'type AdminAttention = {\n  incomingActionCount: number;', "Admin attention model must include the authoritative incoming Transfer count");
includes(home, 'const [transferAttention, submittedResult, reviewResult, resolutionsResult] = await Promise.all([', "Admin Transfer attention must be read alongside the existing bounded Admin queues");
includes(home, "getTransferAttentionCounts(),", "Admin Home must reuse the established Transfer attention helper");
includes(home, "incomingActionCount: transferAttention.incomingActionCount", "Admin Home must consume only the helper's incoming actionable count");
includes(home, "adminAttention.incomingActionCount > 0", "Incoming Transfers must participate in the Admin Home attention zero-state decision");
includes(home, 'kicker="تحويلات واردة"', "Admin Home must identify the physical attention domain clearly");
includes(home, 'title="يوجد استلام أو حسم مطلوب على تحويلات واردة"', "Admin Transfer attention must describe the actionable physical task");
includes(home, 'href="/operations/transfers?direction=incoming&scope=active"', "Admin Transfer attention must deep-link to the bounded active incoming queue");
includes(home, "لا توجد تحويلات واردة تحتاج إجراء ولا قرارات أو إسنادات معلقة على الشركة", "Admin zero state must account for both physical and decision work");
includes(home, "أدوات الإدارة والمراجع", "Lower-frequency Admin destinations must remain discoverable below attention work");

includes(receiptServer, 'rpc("get_roll_transfer_attention_counts")', "Transfer attention must remain backed by the authoritative bounded RPC");
includes(receiptServer, "incomingActionCount: Number(row?.incoming_action_count ?? 0)", "Transfer helper must keep the incoming actionable projection");
includes(transfersPage, "getTransferAttentionCounts(),", "Transfers workspace must continue using the same attention helper as Home");
includes(transfersPage, 'const isAdmin = profile.role === "admin";', "Transfers workspace must preserve its explicit Admin mode");
includes(transferHub, "واردة تحتاج إجراء", "Transfers workspace must preserve the semantic label used by Admin Home");
includes(transferHub, "incomingActionCount", "Transfers workspace must preserve the same incoming actionable source");

excludes(home, "outgoingActionCount", "Outgoing Transfer follow-up must not be promoted as urgent Admin Home work in S05R-D");
excludes(home, '.from("roll_transfers")', "Admin Home must not bypass the bounded Transfer attention helper with direct Transfer table reads");
excludes(home, 'direction=outgoing', "Admin Home must not redirect the new action card to outgoing Transfer follow-up");

includes(cVerifier, 'p_status: "submitted"', "S05R-C Claim attention contract must remain present");
includes(cVerifier, 'p_status: "under_review"', "S05R-C Company-review attention contract must remain present");
includes(cVerifier, 'p_status: "authorized"', "S05R-C authorized Resolution attention contract must remain present");
includes(cVerifier, 'p_status: "awaiting_inspection"', "S05R-C must continue asserting the Center-inspection exclusion");
includes(cVerifier, 'p_status: "assigned"', "S05R-C must continue asserting the assigned-Resolution exclusion");

for (const forbidden of [
  "createSupabaseAdminClient",
  ".insert(",
  ".update(",
  ".delete(",
  "customer_phone",
  "customer_email",
  "customer_name",
]) {
  excludes(home, forbidden, "S05R-D Admin Home must remain read-only and PII-safe");
}

console.log("UX-S05R-D Admin incoming Transfer attention contracts verified.");
