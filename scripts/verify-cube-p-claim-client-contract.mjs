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
const customerContextType = domain.slice(
  domain.indexOf("export type CustomerWarrantyClaimContext"),
  domain.indexOf("export type WarrantyClaimVerificationResult"),
);
const customerContextMapper = access.slice(
  access.indexOf("function toCustomerContext"),
  access.indexOf("async function cleanupExpiredClaimDrafts"),
);
assert(!customerContextType.includes("warrantyId") && !customerContextMapper.includes("warrantyId:"),
  "Customer-facing verified Claim context must not serialize the internal Warranty UUID; server authorization keeps it only in the signed payload/server RPC boundary.");
assert(!claimClient.includes("warrantyId"),
  "Customer Claim client must not depend on or expose the internal Warranty UUID.");
assert(access.includes("ensureFreshClaimDraft") && access.includes("open_customer_warranty_claim_draft"),
  "The first sensitive evidence upload must open/revalidate one server-owned draft under the current Warranty phone.");
assert(
  access.includes("claim_expired_warranty_claim_draft_cleanup_candidates")
    && access.includes("finalize_expired_warranty_claim_draft_cleanup")
    && access.includes(".list(candidate.draft_id")
    && access.includes(".remove(actualPaths)")
    && access.includes("objects ?? []).length >= CLEANUP_STORAGE_LIST_LIMIT"),
  "Successful verification must run bounded batch-draining stale draft cleanup against the actual private Storage folder, including unregistered upload orphans.",
);

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
assert(
  actions.includes("detectWarrantyClaimImageMime")
    && actions.includes('bytes.toString("ascii", 0, 4) === "RIFF"')
    && actions.includes('bytes.toString("ascii", 8, 12) === "WEBP"')
    && actions.includes("detectedMime !== file.type")
    && actions.includes(".upload(storagePath, bytes"),
  "Server upload must validate JPEG/PNG/WebP file signatures and upload the inspected bytes rather than trusting browser MIME alone.",
);
assert(
  actions.includes("register_customer_warranty_claim_draft_evidence")
    && actions.includes("registerDraftEvidence(access, evidence)"),
  "Both fresh and pre-existing content-addressed Storage objects must be registered in the locked private draft before they are accepted by the client.",
);
assert(
  actions.includes("p_verified_phone_normalized: access.currentPhoneNormalized")
    && actions.slice(actions.indexOf("async function registerDraftEvidence"), actions.indexOf("async function reserveDraftEvidenceRemoval")).includes("p_verified_phone_normalized: access.currentPhoneNormalized")
    && actions.slice(actions.indexOf("async function reserveDraftEvidenceRemoval"), actions.indexOf("async function finalizeDraftEvidenceRemoval")).includes("p_verified_phone_normalized: access.currentPhoneNormalized"),
  "Evidence register/remove must pass the current normalized Warranty phone into the transactional DB freshness boundary, not rely only on an earlier server read.",
);
assert(
  actions.includes('"unregister_customer_warranty_claim_draft_evidence"')
    && actions.includes('"finalize_customer_warranty_claim_draft_evidence_removal"'),
  "Evidence removal helpers must be wired to the private draft reserve/finalize RPCs.",
);

const removeFunctionIndex = actions.indexOf("export async function removeWarrantyClaimEvidence");
const reserveCallIndex = actions.indexOf("reserveDraftEvidenceRemoval(access, storagePath)", removeFunctionIndex);
const storageRemoveIndex = actions.indexOf(".remove([storagePath])", removeFunctionIndex);
const finalizeCallIndex = actions.indexOf("finalizeDraftEvidenceRemoval(access, storagePath)", removeFunctionIndex);
assert(
  removeFunctionIndex >= 0
    && reserveCallIndex > removeFunctionIndex
    && storageRemoveIndex > reserveCallIndex
    && finalizeCallIndex > storageRemoveIndex,
  "Evidence removal must reserve delete_pending in DB before Storage deletion and finalize registry removal only after physical deletion succeeds.",
);
assert(actions.includes("delete_pending metadata") && actions.includes("stale-draft cleanup"),
  "Failed physical deletion must remain cleanup-visible instead of becoming an untracked orphan.");

const domainErrorIndex = actions.indexOf("const domainError = authoritativeSubmitError");
const lockedCompensationIndex = actions.indexOf("safelyDiscardUncommittedEvidence", domainErrorIndex);
const committedLookupIndex = actions.indexOf('"get_customer_warranty_claim_by_request"');
const ambiguousReturnIndex = actions.indexOf('code: "PG_CLAIM_SUBMIT_AMBIGUOUS"');
assert(
  domainErrorIndex >= 0
    && lockedCompensationIndex > domainErrorIndex
    && committedLookupIndex > lockedCompensationIndex
    && ambiguousReturnIndex > committedLookupIndex,
  "Authoritative submit rejection may compensate only through the locked draft lifecycle; unknown/transport ambiguity must resolve idempotency and otherwise preserve evidence for same-request retry.",
);
assert(actions.includes("p_warranty_id: access.payload.warrantyId"),
  "Final Claim submit must take Warranty ownership only from the signed server context, not customer input.");

const finalSubmitSource = actions.slice(actions.indexOf("export async function submitWarrantyClaim"));
assert(!finalSubmitSource.includes("if (!access.context.canSubmitNewClaim)"),
  "Final submit must not trust the read projection as an eligibility gate; same-request lost-response retries must always reach the authoritative DB idempotency boundary.");
assert(finalSubmitSource.includes('admin.rpc("create_customer_warranty_claim"'),
  "Final submit must continue through the authoritative idempotent Claim mutation after fresh phone-context validation.");

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

for (const forbiddenOperation of [
  "approveWarrantyClaim",
  "rejectWarrantyClaim",
  "cancelWarrantyClaimDecision",
  "requestClaimInspection",
  "assignClaimResolution",
  "reserveClaimReplacementRoll",
  "completeClaimResolution",
]) {
  assert(!actions.includes(forbiddenOperation) && !claimClient.includes(forbiddenOperation),
    `Cube P must not implement future Q/R operation ${forbiddenOperation}.`);
}
assert(claimClient.includes("لا يعني قبول أو رفض المطالبة تلقائيًا"),
  "Customer intake should explicitly explain that category selection is not an adjudication decision.");

console.log("Cube P customer Claim client/security/Storage orchestration contracts verified.");
