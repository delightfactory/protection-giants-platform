import fs from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function assertOrder(source, labels, path) {
  let previous = -1;
  for (const [label, needle] of labels) {
    const index = source.indexOf(needle);
    assert(index >= 0, `${path} is missing ${label}: ${needle}`);
    assert(index > previous, `${path} must keep ${label} after the previous lifecycle step.`);
    previous = index;
  }
}

const flows = [
  {
    path: "app/operations/claim-inspections/actions.ts",
    register: 'supabase.rpc("register_warranty_claim_inspection_evidence_stage"',
    upload: ".storage.from(EVIDENCE_BUCKET).upload(storagePath, bytes",
    reserve: 'supabase.rpc("reserve_operational_evidence_stage_delete"',
    remove: ".storage.from(EVIDENCE_BUCKET).remove([storagePath])",
    finalize: 'supabase.rpc("finalize_operational_evidence_stage_delete"',
  },
  {
    path: "app/operations/claim-resolutions/actions.ts",
    register: 'supabase.rpc("register_warranty_claim_resolution_completion_evidence_stage"',
    upload: ".storage.from(EVIDENCE_BUCKET).upload(storagePath, bytes",
    reserve: 'supabase.rpc("reserve_operational_evidence_stage_delete"',
    remove: ".storage.from(EVIDENCE_BUCKET).remove([storagePath])",
    finalize: 'supabase.rpc("finalize_operational_evidence_stage_delete"',
  },
  {
    path: "app/operations/claim-resolutions/recovery-actions.ts",
    register: 'supabase.rpc("register_warranty_claim_admin_recovery_evidence_stage"',
    upload: ".storage.from(EVIDENCE_BUCKET).upload(storagePath, bytes",
    reserve: 'supabase.rpc("reserve_operational_evidence_stage_delete"',
    remove: ".storage.from(EVIDENCE_BUCKET).remove([storagePath])",
    finalize: 'supabase.rpc("finalize_operational_evidence_stage_delete"',
  },
];

for (const flow of flows) {
  const source = read(flow.path);
  assert(source.includes('const EVIDENCE_BUCKET = "warranty-claim-evidence"'), `${flow.path} must keep the existing private evidence bucket.`);
  assert(source.includes("detectImageMime(bytes)"), `${flow.path} must detect MIME from bytes before registration.`);
  assert(source.includes("createHash(\"sha256\").update(bytes).digest(\"hex\")"), `${flow.path} must derive the immutable content-hash path.`);
  assertOrder(source, [
    ["stage registration", flow.register],
    ["Storage upload", flow.upload],
  ], flow.path);

  const removeFunctionIndex = source.indexOf("export async function remove");
  assert(removeFunctionIndex >= 0, `${flow.path} must expose its bounded evidence removal server action.`);
  const removal = source.slice(removeFunctionIndex);
  assertOrder(removal, [
    ["DB delete reservation", flow.reserve],
    ["Storage deletion", flow.remove],
    ["DB delete finalization", flow.finalize],
  ], `${flow.path} removal`);

  assert(!source.includes("upsert: true"), `${flow.path} must not overwrite evidence objects.`);
  assert(source.includes("upsert: false"), `${flow.path} must keep immutable Storage upload semantics.`);
}

const migration = read("supabase/migrations/20260831103000_ux_data_01_operational_evidence_lifecycle.sql");
const authorityFix = read("supabase/migrations/20260831111500_ux_data_01_delete_pending_authority_recheck.sql");
const cleanup = read("scripts/cleanup-operational-evidence.mjs");

for (const needle of [
  "private.operational_evidence_stages",
  "warranty_claim_inspection_evidence_require_stage",
  "warranty_claim_resolution_evidence_require_stage",
  "claim_stale_operational_evidence_cleanup_candidates",
  "finalize_operational_evidence_cleanup",
  "for update of stage skip locked",
]) {
  assert(migration.includes(needle), `UX-DATA-01 migration is missing ${needle}.`);
}

assert(authorityFix.indexOf("perform private.require_operational_evidence_stage_actor_authority(v_stage.id)")
  < authorityFix.indexOf("if v_stage.state = 'delete_pending' then"),
  "Delete-pending retries must revalidate current flow authority before returning the reservation.");

const cleanupClaimName = "claim_stale_operational_evidence_cleanup_candidates";
const cleanupFinalizeName = "finalize_operational_evidence_cleanup";
assert(cleanup.includes(cleanupClaimName),
  "Cleanup command must obtain bounded candidates from the DB cleanup claim RPC.");
assert(cleanup.includes(".storage.from(bucket).remove([storagePath])"),
  "Cleanup command must delete only the candidate Storage path returned by DB authority.");
assert(cleanup.includes(cleanupFinalizeName),
  "Cleanup command must finalize only after Storage deletion.");
assertOrder(cleanup, [
  ["cleanup candidate claim", cleanupClaimName],
  ["candidate Storage deletion", ".storage.from(bucket).remove([storagePath])"],
  ["cleanup finalization", cleanupFinalizeName],
], "scripts/cleanup-operational-evidence.mjs");

console.log("UX-DATA-01 operational evidence application contract passed.");
