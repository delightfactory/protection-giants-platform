import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const actions = read("app/operations/rolls/issues/actions.ts");
const newPage = read("app/operations/rolls/issues/new/page.tsx");
const detailPage = read("app/operations/rolls/issues/[id]/page.tsx");
const operationsPage = read("app/operations/page.tsx");
const recoveryActions = read("app/operations/rolls/recovery/actions.ts");
const recoveryFlow = read("components/rolls/opened-roll-recovery-flow.tsx");
const openingFlow = read("components/rolls/roll-opening-flow.tsx");
const decisionPanel = read("components/rolls/roll-preinstall-issue-decision-panel.tsx");
const issueLibrary = read("lib/rolls/preinstall-issues.ts");

for (const rpcName of [
  "resolve_roll_preinstall_issue_candidate",
  "create_roll_preinstall_issue",
  "resolve_roll_preinstall_issue",
  "mark_roll_preinstall_issue_reported_in_error",
]) {
  assert(actions.includes(`.rpc(\"${rpcName}\"`), `Cube K action must call typed RPC ${rpcName} directly.`);
}
assert(!actions.includes("rpc.bind"), "Cube K actions must not bypass typed RPC calls with bind().");
assert(!actions.includes("as unknown as"), "Cube K actions must not bypass generated database types with unknown casts.");
assert(actions.includes("cleanupEvidence(uploadedPaths)"), "Evidence compensation must delete only objects uploaded by the current attempt.");
assert(!actions.includes("cleanupEvidence(evidencePaths)"), "Evidence compensation must never delete all deterministic paths after an RPC failure.");
assert(actions.includes('type MatchingIssueCheck = "exists" | "missing" | "unknown"'), "Ambiguous post-RPC reads must remain tri-state, not collapse unknown into missing.");
assert(actions.includes('if (matching === "exists") return { ok: true, issueId }'), "Transport recovery must recognize an already committed matching issue.");
assert(actions.includes('if (matching === "unknown")'), "Unknown commit state must preserve deterministic evidence for a safe retry.");
assert(actions.includes("const domainCode ="), "Database domain errors must be separated from transport/unknown failures.");

const submitStart = actions.indexOf("export async function submitRollPreinstallIssue");
const activeCenterAuth = actions.indexOf("await requireOperationalProfile()", submitStart);
const exactPreflight = actions.indexOf("await resolveRollPreinstallIssueCandidate(serial)", submitStart);
const privilegedUpload = actions.indexOf("await ensureEvidenceUploaded(issueId, parsed.value.images)", submitStart);
assert(submitStart >= 0 && activeCenterAuth > submitStart && exactPreflight > activeCenterAuth && privilegedUpload > exactPreflight,
  "Privileged issue evidence upload must occur only after active-Center auth and exact Roll preflight.");
assert(actions.includes('if (preflight.candidate.eligibility === "eligible")'),
  "Only an eligible exact Roll may stage new evidence objects.");
assert(actions.includes("const evidencePaths = parsed.value.images.map"),
  "Non-eligible candidate retries must still carry deterministic evidence paths to the idempotent DB RPC without re-uploading them.");

assert(newPage.includes("getPublicSiteOrigin()"), "Center issue QR flow must use the canonical public-site origin.");
assert(newPage.includes('profile.role !== "center"'), "Issue submission route must remain Center-only.");

const detailAuthIndex = detailPage.indexOf("get_roll_preinstall_issue_detail");
const adminStorageIndex = detailPage.indexOf("createSupabaseAdminClient()");
const signedUrlIndex = detailPage.indexOf("createSignedUrl(item.storage_path, 600)");
assert(detailAuthIndex >= 0 && adminStorageIndex > detailAuthIndex && signedUrlIndex > adminStorageIndex,
  "Evidence signed URLs must only be created after authorized issue-detail resolution.");
assert(detailPage.includes('profile.role !== "admin" && profile.role !== "center"'), "Issue detail route must exclude Agent and Dealer roles.");

const moduleUsages = operationsPage.match(/^  issueModule,$/gm) ?? [];
assert(moduleUsages.length === 2, "Issue module must be exposed exactly to Admin and Center module lists.");
assert(operationsPage.includes("const agentModules") && operationsPage.includes("const dealerModules"), "Role module boundaries must remain explicit.");

assert(recoveryActions.includes('"PG_ROLL_RECOVERY_ISSUE_PENDING"'), "Recovery action must expose the pending-issue domain error.");
assert(recoveryActions.includes('"issue_pending"'), "Recovery candidate type must include issue_pending.");
assert(recoveryFlow.includes('candidate.eligibility === "issue_pending"'), "Recovery UI must explain the pending-issue hold before confirmation.");
assert(recoveryFlow.includes('"PG_ROLL_RECOVERY_ISSUE_PENDING"'), "Recovery retry path must re-resolve when a pending issue wins the race.");

assert(openingFlow.includes('href="/operations/rolls/issues/new"'), "Opening success must connect the Center to the live pre-install issue path.");
assert(openingFlow.includes("إرسال البلاغ يوقف التفعيل"), "Opening success must explain the activation hold caused by issue submission.");

assert(decisionPanel.includes('"cleared_for_use"'), "Admin decision UI must expose cleared_for_use.");
assert(decisionPanel.includes('"return_required"'), "Admin decision UI must expose return_required.");
assert(decisionPanel.includes('"reported_in_error"'), "Admin decision UI must expose the audited reported_in_error correction.");
assert(decisionPanel.includes("prepareDecision"), "Terminal decisions must enter an explicit confirmation step before mutation.");
assert(decisionPanel.includes("runConfirmedDecision"), "Terminal mutations must run only from the explicit confirmation step.");
assert(decisionPanel.includes("إلغاء والعودة للمراجعة"), "Admin confirmation must provide a safe cancel path.");
assert(decisionPanel.includes("لن تنتقل العهدة تلقائيًا"), "Return confirmation must explain that custody is not moved by the quality decision.");
assert(decisionPanel.includes("سيتوقف هذا البلاغ وحده عن منع تفعيل الضمان"), "Clearance confirmation must explain its Activation consequence.");

assert(issueLibrary.includes('ROLL_PREINSTALL_ISSUE_EVIDENCE_BUCKET = "roll-preinstall-issue-evidence"'), "Cube K must retain a dedicated issue-evidence bucket.");
assert(issueLibrary.includes("ROLL_PREINSTALL_ISSUE_MAX_IMAGES = 5"), "Cube K evidence count must remain bounded to five images.");
assert(issueLibrary.includes("8 * 1024 * 1024"), "Cube K evidence size must remain bounded to 8 MiB per image.");
assert(!actions.includes('from("product_assets")'), "Issue evidence must not reuse the Product asset data model.");

console.log("Cube K Pre-install Issue client and integration contracts verified.");
