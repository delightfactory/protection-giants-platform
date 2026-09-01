import fs from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const queuePath = "app/operations/claim-resolution-tasks/page.tsx";
const detailPath = "app/operations/claim-resolution-tasks/[id]/page.tsx";
const formPath = "components/claims/center-claim-resolution-completion-form.tsx";
const homePath = "app/operations/page.tsx";
const navPath = "components/operations-nav-links.tsx";
const navigationRegistryPath = "lib/navigation/operations-navigation.ts";

const queue = fs.readFileSync(queuePath, "utf8");
const detail = fs.readFileSync(detailPath, "utf8");
const form = fs.readFileSync(formPath, "utf8");
const home = fs.readFileSync(homePath, "utf8");
const nav = fs.readFileSync(navPath, "utf8");
const navigationRegistry = fs.readFileSync(navigationRegistryPath, "utf8");

for (const [label, source] of [["queue", queue], ["detail", detail]]) {
  assert(source.includes("requireOperationalProfile()"), `${label} must require an operational Profile.`);
  assert(source.includes('profile.role !== "center"'), `${label} must be Center-only.`);
  assert(source.includes("createSupabaseServerClient"), `${label} must use the authenticated server client.`);
  assert(!/\.insert\(|\.update\(|\.delete\(/.test(source), `${label} must remain read-only outside qualified server actions.`);
}

assert(queue.includes('rpc("list_center_assigned_warranty_claim_resolution_tasks"'),
  "Center fulfillment queue must use the bounded assigned-task RPC.");
assert(queue.includes('href={`/operations/claim-resolution-tasks/${task.resolution_id}`}'),
  "Center queue must route only to the exact Resolution task.");

assert(detail.includes('rpc("get_center_warranty_claim_resolution_task"'),
  "Center task detail must use the exact qualified task RPC.");
assert(detail.includes('rpc("list_center_warranty_claim_resolution_evidence"'),
  "Center task detail must use the exact-task evidence metadata RPC.");
assert(detail.includes("createSupabaseAdminClient")
  && detail.includes('.from("warranty-claim-evidence")')
  && detail.includes(".createSignedUrl("),
  "Private Claim/inspection images must be exposed only through short-lived server-generated signed URLs.");
assert(detail.includes("EVIDENCE_URL_TTL_SECONDS = 10 * 60"),
  "Center evidence links must remain short-lived.");
assert(!detail.includes("customer_phone") && !detail.includes("customer_email") && !detail.includes("customer_name"),
  "Center fulfillment UI must not expose customer contact PII.");
assert(!detail.includes("product_eligibility_basis") && !detail.includes("allocation_id"),
  "Center fulfillment UI must not expose Admin allocation/policy internals.");
assert(!detail.includes('.from("rolls")') && !detail.includes("list_admin_claim_resolution_replacement_roll_candidates"),
  "Center fulfillment UI must not gain global inventory or Admin candidate authority.");
assert(detail.includes("replacementTaskContext")
  && detail.includes("roll=${encodeURIComponent(task.replacement_roll_serial)}&task=${encodeURIComponent(task.resolution_id)}")
  && detail.includes("/operations/rolls/open?${replacementTaskContext}")
  && detail.includes("/operations/rolls/issues/new?${replacementTaskContext}")
  && detail.includes('href="/operations/rolls/issues"'),
  "Replacement execution must preserve the exact assigned Roll and Resolution task through opening and issue detours.");
assert(!detail.includes("Cube J") && !detail.includes("Cube K"),
  "Center-facing replacement guidance must use physical workflow language instead of internal Cube names.");
assert(detail.includes("replacement_quality_state === \"pending\"")
  && detail.includes("replacement_quality_state === \"return_required\"")
  && detail.includes("replacement_roll_opened_at"),
  "Replacement UI must fail closed around Opening and pre-install quality state.");
assert(detail.includes("لا تستخدم الرول ولا تغلق المهمة قبل حسم بلاغ الجودة الحالي"),
  "Pending replacement quality state must explicitly block physical use and completion.");
assert(detail.includes("لا تستخدم هذا الرول. صدر له قرار إرجاع"),
  "Return-required replacement state must explicitly block physical use.");
assert(detail.includes("<CenterClaimResolutionCompletionForm"),
  "Qualified Center task must delegate final mutation UX to the bounded completion component.");

for (const actionName of [
  "uploadClaimResolutionCompletionEvidence",
  "removeClaimResolutionCompletionEvidence",
  "completeAssignedWarrantyClaimResolution",
]) {
  assert(form.includes(actionName), `Center completion UI must call qualified server boundary ${actionName}.`);
}
assert(!form.includes("createSupabaseServerClient") && !form.includes("createSupabaseAdminClient"),
  "Client completion component must not instantiate Supabase clients.");
assert(!form.includes("@supabase/supabase-js") && !form.includes("@/lib/supabase/"),
  "Client completion component must not import a Supabase client surface.");
assert(!/\.(?:from|rpc)\(\s*["']|\.insert\(|\.update\(|\.delete\(/.test(form),
  "Client completion component must not bypass server actions with direct data operations.");
assert(!form.includes("SUPABASE_SERVICE_ROLE_KEY") && !form.includes("storage.from("),
  "Client completion UI must not gain service-role or direct Storage authority.");
assert(form.includes("crypto.randomUUID()") && form.includes("requestIdRef"),
  "Completion UI must preserve one explicit idempotency request ID across ambiguous retries.");

assert(form.includes('from "@/components/ui/local-evidence-review"') && form.includes("<LocalEvidenceReview"),
  "Center completion UI must review selected evidence through the shared local evidence surface.");
assert(form.includes("onAdd={addFiles}"),
  "Center completion evidence selection must delegate only to the local selection handler.");
const addFilesStart = form.indexOf("function addFiles(");
const removeUploadStart = form.indexOf("async function removeUpload", addFilesStart);
assert(addFilesStart >= 0 && removeUploadStart > addFilesStart,
  "Center completion UI must keep an explicit bounded local add-files handler.");
const addFilesSource = form.slice(addFilesStart, removeUploadStart);
assert(!addFilesSource.includes("uploadClaimResolutionCompletionEvidence"),
  "Selecting Center completion evidence must remain local-only and must not start Storage upload.");

const prepareEvidenceStart = form.indexOf("async function prepareEvidence");
const submitStart = form.indexOf("function submit(", prepareEvidenceStart);
assert(prepareEvidenceStart >= 0 && submitStart > prepareEvidenceStart,
  "Center completion UI must keep a deferred evidence preparation phase before final submit.");
const prepareEvidenceSource = form.slice(prepareEvidenceStart, submitStart);
assert(prepareEvidenceSource.includes("await uploadClaimResolutionCompletionEvidence"),
  "Qualified evidence upload must occur only inside the deferred preparation phase.");
assert(form.includes("const evidence = await prepareEvidence();"),
  "Final confirmed submission must prepare qualified evidence before calling the business completion action.");
assert(form.includes("evidence.map((item) => item.storagePath)"),
  "Completion must submit only evidence paths returned or retained by the qualified server upload boundary.");
assert(form.includes("uploads.length.toLocaleString") && form.includes("صورة إكمال"),
  "Final completion confirmation must summarize the selected evidence count before upload begins.");

assert(form.includes("scan !== expectedRollSerial"),
  "Replacement UI must reject an obvious wrong Roll before authoritative server revalidation.");
assert(form.includes('router.push("/operations/claim-resolution-tasks?notice=completed")'),
  "Successful completion must return the Center to its bounded task queue.");

const fulfillmentDestinationStart = navigationRegistry.indexOf('id: "claim-resolution-tasks"');
const fulfillmentDestinationEnd = navigationRegistry.indexOf("\n  },", fulfillmentDestinationStart);
assert(fulfillmentDestinationStart >= 0 && fulfillmentDestinationEnd > fulfillmentDestinationStart,
  "Center fulfillment destination must remain registered in the shared navigation registry.");
const fulfillmentDestination = navigationRegistry.slice(fulfillmentDestinationStart, fulfillmentDestinationEnd);
assert(fulfillmentDestination.includes('href: "/operations/claim-resolution-tasks"')
  && fulfillmentDestination.includes('label: "التنفيذ"'),
  "Center navigation must expose the fulfillment queue.");
assert(/roles:\s*\[\s*"center"\s*\]/.test(fulfillmentDestination),
  "Center fulfillment navigation must remain Center-only.");
assert(/mobilePrimaryRoles:\s*\[\s*"center"\s*\]/.test(fulfillmentDestination),
  "Center mobile navigation must keep fulfillment work in the primary set.");
assert(nav.includes("isOperationsTaskRoute(pathname)"),
  "Mobile navigation must use explicit task classification for focused fulfillment detail.");
assert(navigationRegistry.includes('/^\\/operations\\/claim-resolution-tasks\\/[^/]+$/'),
  "Center fulfillment detail must remain explicitly classified as a mobile task route.");
assert(home.includes("getHomeDestinations(profile.role)"),
  "Center home must expose fulfillment work through the shared navigation registry.");

console.log("Cube R Center Fulfillment UI contract PASS: Center-only bounded queue/detail, private signed evidence reads, exact Roll/task continuity through physical detours, local review before qualified deferred upload, server-only evidence/completion mutations, idempotent retry, and no PII/Admin/global-inventory authority.");
