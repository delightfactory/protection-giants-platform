import fs from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const labelsPath = "lib/claims/ui-labels.ts";
const queuePath = "app/operations/claim-resolutions/page.tsx";
const errorPath = "app/operations/error.tsx";
const loadingPath = "app/operations/loading.tsx";
const notFoundPath = "app/operations/not-found.tsx";

const labels = fs.readFileSync(labelsPath, "utf8");
const queue = fs.readFileSync(queuePath, "utf8");
const error = fs.readFileSync(errorPath, "utf8");
const loading = fs.readFileSync(loadingPath, "utf8");
const notFound = fs.readFileSync(notFoundPath, "utf8");

for (const exportName of [
  "claimStatusLabel",
  "resolutionStatusLabel",
  "inspectionStatusLabel",
  "warrantyRecordStateLabel",
  "allocationStatusLabel",
  "qualityStateLabel",
  "centerOperationalStatusLabel",
  "actorKindLabel",
]) {
  assert(labels.includes(`export function ${exportName}`), `Shared UI vocabulary must export ${exportName}.`);
}

assert(queue.includes('import { resolutionStatusLabel } from "@/lib/claims/ui-labels"'),
  "Resolution queue must consume the shared UI vocabulary.");
assert(queue.includes('rpc("list_admin_warranty_claim_resolutions"'),
  "Resolution queue must keep the qualified bounded list RPC.");
assert(queue.includes('profile.role !== "admin"'),
  "Resolution queue must remain Admin-only.");
assert(!/\.insert\(|\.update\(|\.delete\(/.test(queue),
  "S07R vocabulary work must not introduce mutation authority into the read queue.");

for (const forbidden of [
  "قائمة الـResolution",
  "ستظهر هنا الـResolution",
  "Cube Q",
]) {
  assert(!queue.includes(forbidden), `Resolution queue must not expose internal wording: ${forbidden}`);
}
assert(queue.includes("قائمة المعالجات المعتمدة بعد قرار المطالبة"),
  "Resolution queue must explain the user-facing processing concept.");
assert(queue.includes("ستظهر هنا المعالجات التي تنشأ بعد قبول المطالبة"),
  "Resolution zero-state must use product vocabulary instead of architecture names.");

for (const [label, source] of [
  ["operations error", error],
  ["operations loading", loading],
  ["operations not-found", notFound],
]) {
  assert(source.includes("EmptyState"), `${label} must keep the shared EmptyState presentation.`);
}
assert(error.includes("reset") && error.includes("راجع النتيجة الحالية قبل تكرار الإجراء"),
  "Operations error state must retain actionable retry plus duplicate-action safety guidance.");
assert(loading.includes('aria-live="polite"') && loading.includes('aria-busy="true"'),
  "Operations loading state must remain announced accessibly.");
assert(notFound.includes('href="/operations"'),
  "Operations not-found state must preserve a safe route back to the workbench.");

console.log("UX-S07R-A shared vocabulary PASS: canonical Arabic status labels, user-facing Resolution queue language, qualified read authority, and shared operations states are preserved.");
