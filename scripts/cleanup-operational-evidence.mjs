import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? process.env.API_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SERVICE_ROLE_KEY;
const bucket = "warranty-claim-evidence";

if (!url || !serviceRoleKey) {
  throw new Error("SUPABASE_URL/API_URL and SUPABASE_SERVICE_ROLE_KEY/SERVICE_ROLE_KEY are required.");
}

const options = new Map(
  process.argv.slice(2).map((argument) => {
    const separator = argument.indexOf("=");
    if (!argument.startsWith("--") || separator < 3) {
      throw new Error(`Unsupported argument: ${argument}`);
    }
    return [argument.slice(2, separator), argument.slice(separator + 1)];
  }),
);

const staleBeforeRaw = options.get("stale-before");
if (!staleBeforeRaw) throw new Error("--stale-before=<ISO-8601 timestamp> is required.");

const staleBefore = new Date(staleBeforeRaw);
if (Number.isNaN(staleBefore.getTime())) throw new Error("--stale-before must be a valid ISO-8601 timestamp.");
if (staleBefore.getTime() > Date.now()) throw new Error("--stale-before must not be in the future.");

const limitRaw = options.get("limit") ?? "10";
const limit = Number(limitRaw);
if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error("--limit must be an integer between 1 and 50.");

for (const key of options.keys()) {
  if (key !== "stale-before" && key !== "limit") throw new Error(`Unsupported option: --${key}`);
}

function isAlreadyMissing(error) {
  if (!error) return false;
  const statusCode = String(error.statusCode ?? error.status ?? "");
  const errorCode = String(error.error ?? error.name ?? "").toLowerCase();
  const message = String(error.message ?? "").toLowerCase();
  return statusCode === "404"
    || (statusCode === "400" && errorCode === "not_found")
    || (statusCode === "400" && message === "object not found");
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: candidates, error: claimError } = await supabase.rpc(
  "claim_stale_operational_evidence_cleanup_candidates",
  { p_stale_before: staleBefore.toISOString(), p_limit: limit },
);
if (claimError) throw new Error(`Could not claim operational evidence cleanup candidates: ${claimError.message}`);

let removed = 0;
let failed = 0;
for (const candidate of candidates ?? []) {
  const stageId = candidate.stage_id;
  const storagePath = candidate.storage_path;
  if (typeof stageId !== "string" || typeof storagePath !== "string") {
    failed += 1;
    console.error("Invalid cleanup candidate returned by database; leaving it reserved for inspection.");
    continue;
  }

  const { error: storageError } = await supabase.storage.from(bucket).remove([storagePath]);
  if (storageError && !isAlreadyMissing(storageError)) {
    failed += 1;
    console.error(`Storage cleanup failed for stage ${stageId}; stage remains delete_pending: ${storageError.message}`);
    continue;
  }

  const { data: finalized, error: finalizeError } = await supabase.rpc(
    "finalize_operational_evidence_cleanup",
    { p_stage_id: stageId },
  );
  if (finalizeError || finalized !== true) {
    failed += 1;
    console.error(`Database cleanup finalization failed for stage ${stageId}; investigate before retrying.`);
    continue;
  }

  removed += 1;
}

console.log(JSON.stringify({ claimed: (candidates ?? []).length, removed, failed }));
if (failed > 0) process.exitCode = 1;
