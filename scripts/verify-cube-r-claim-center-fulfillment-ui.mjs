import fs from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const queuePath = "app/operations/claim-resolution-tasks/page.tsx";
const detailPath = "app/operations/claim-resolution-tasks/[id]/page.tsx";
const formPath = "components/claims/center-claim-resolution-completion-form.tsx";
const homePath = "app/operations/page.tsx";
const navPath = "components/operations-nav-links.tsx";

const queue = fs.readFileSync(queuePath, "utf8");
const detail = fs.readFileSync(detailPath, "utf8");
const form = fs.readFileSync(formPath, "utf8");
const home = fs.readFileSync(homePath, "utf8");
const nav = fs.readFileSync(navPath, "utf8");

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
assert(detail.includes('href="/operations/rolls/open"')
  && detail.includes('href="/operations/rolls/issues/new"')
  && detail.includes('href="/operations/rolls/issues"'),
  "Replacement execution must reuse existing Cube J Opening and Cube K issue routes.");
assert(detail.includes("replacement_quality_state === \"pending\"")
  && detail.includes("replacement_quality_state === \"return_required\"")
  && detail.includes("replacement_roll_opened_at"),
  "Replacement UI must fail closed around Opening and Cube K quality state.");
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
assert(form.includes("readyEvidence.map((item) => item.storagePath)"),
  "Completion must submit only evidence paths returned by qualified server upload.");
assert(form.includes("scan !== expectedRollSerial"),
  "Replacement UI must reject an obvious wrong Roll before authoritative server revalidation.");
assert(form.includes('router.push("/operations/claim-resolution-tasks?notice=completed")'),
  "Successful completion must return the Center to its bounded task queue.");

assert(home.includes('href: "/operations/claim-resolution-tasks"')
  && home.includes('title: "تنفيذ مطالبات الضمان"')
  && home.includes("centerResolutionModule"),
  "Center home must expose a discoverable fulfillment module.");
assert(nav.includes('{ href: "/operations/claim-resolution-tasks", label: "التنفيذ"'),
  "Center navigation must expose the fulfillment queue.");
assert(nav.includes('pathname.startsWith("/operations/claim-resolution-tasks/")'),
  "Mobile navigation must stay out of the focused fulfillment detail task.");

console.log("Cube R Center Fulfillment UI contract PASS: Center-only bounded queue/detail, private signed evidence reads, exact allocated-Roll guidance through J/K, server-only evidence/completion mutations, idempotent retry, and no PII/Admin/global-inventory authority.");
