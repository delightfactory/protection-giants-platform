import fs from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(path) {
  return fs.readFileSync(path, "utf8");
}

const publicPage = read("app/(public)/w/[publicCode]/page.tsx");
const claimPage = read("app/(public)/w/[publicCode]/claim/page.tsx");
const claimClient = read("app/(public)/w/[publicCode]/claim/claim-client.tsx");
const actions = read("app/(public)/w/[publicCode]/claim/actions.ts");
const access = read("lib/warranty/claim-access.server.ts");
const domain = read("lib/warranty/claim-intake.ts");

assert(publicPage.includes('view.kind === "active" || view.kind === "expired"'),
  "Public Warranty Claims affordance must be bounded to effective active/expired Warranty states.");
assert(publicPage.includes("/claim") && publicPage.includes("طلب خدمة الضمان") && publicPage.includes("متابعة المطالبات"),
  "Public Warranty page must expose active Claim entry and expired history-follow affordance.");
assert(claimPage.includes('dynamic = "force-dynamic"') && claimPage.includes('referrer: "no-referrer"'),
  "Claim surface must remain non-stale and no-referrer.");
assert(claimPage.includes("getFreshClaimAccess") && claimPage.includes("resolvePublicWarranty"),
  "Claim route must combine private verified context with only the existing safe public projection.");

assert(access.includes("httpOnly: true") && access.includes('sameSite: "lax"'),
  "Customer Claim access context must be HttpOnly and same-site protected.");
assert(access.includes("phoneFingerprint") && access.includes("createHmac") && access.includes("timingSafeEqual"),
  "Claim phone freshness must use keyed fingerprints and timing-safe comparison.");
assert(!access.includes("phone: normalizedPhone") && !access.includes("customerPhone:"),
  "Signed customer Claim context must not carry raw phone data.");
assert(access.includes("get_customer_warranty_claim_context"),
  "Every sensitive customer context read must re-read authoritative Warranty state/phone.");
assert(access.includes("draftId") && access.includes("publicCodeHash"),
  "Short-lived Claim context must bind both staged evidence namespace and permanent Warranty identity without storing raw Public Code.");

assert(actions.includes("uploadWarrantyClaimEvidence") && actions.includes("removeWarrantyClaimEvidence"),
  "Claim intake must provide server-controlled staged image upload/removal.");
assert(actions.includes("getFreshClaimAccess(publicCode)") && actions.includes("getFreshClaimAccess(input.publicCode)"),
  "Upload and final submit must both revalidate the current verified customer context.");
assert(actions.includes("WARRANTY_CLAIM_MAX_IMAGES") && domain.includes("8 * 1024 * 1024"),
  "Claim intake must enforce the frozen 1..5 / 8 MiB image bounds.");
assert(
  actions.includes("createSupabaseAdminClient")
    && actions.includes("WARRANTY_CLAIM_EVIDENCE_BUCKET")
    && domain.includes('WARRANTY_CLAIM_EVIDENCE_BUCKET = "warranty-claim-evidence"'),
  "Private evidence writes must remain server-controlled and use the canonical private Claim evidence bucket constant.",
);
assert(actions.includes("get_customer_warranty_claim_by_request") && actions.includes("cleanupEvidence"),
  "Ambiguous final submit must resolve committed idempotency before evidence compensation.");
assert(actions.includes("p_warranty_id: access.payload.warrantyId"),
  "Final Claim submit must take Warranty ownership only from the signed server context, not customer input.");

for (const category of [
  "cracking", "yellowing", "discoloration", "peeling",
  "delamination", "adhesive_issue", "bubbling", "other",
]) {
  assert(domain.includes(`"${category}"`), `Frozen Claim category ${category} is missing.`);
}

assert(claimClient.includes("جارٍ الرفع") && claimClient.includes("تم الرفع") && claimClient.includes("uploadList"),
  "Mobile Claim UI must expose per-image upload/error state rather than a blind bulk submit.");
assert(claimClient.includes("currentOpenClaim") && claimClient.includes("recentClosedClaims"),
  "Customer surface must use the Warranty-scoped open/history management envelope.");
assert(claimClient.includes("لا يمكن إنشاء مطالبة أخرى قبل إغلاق المطالبة الحالية"),
  "Open Claim UX must prevent a dead duplicate submission path.");
assert(!claimClient.includes("اعتماد المطالبة") && !claimClient.includes("رفض المطالبة") && !claimClient.includes("رول بديل"),
  "Cube P must not pull Q adjudication or R replacement controls into customer intake.");

console.log("Cube P customer Claim client/security contracts verified.");
