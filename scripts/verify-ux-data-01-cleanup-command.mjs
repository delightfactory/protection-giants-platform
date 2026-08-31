import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const apiUrl = process.env.API_URL;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
if (!apiUrl || !serviceRoleKey) {
  throw new Error("UX-DATA-01 cleanup-command verifier requires API_URL and SERVICE_ROLE_KEY.");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function dbContainerName() {
  const names = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" })
    .split("\n").map((value) => value.trim()).filter(Boolean);
  const name = names.find((value) => value.startsWith("supabase_db_"));
  assert(name, "Supabase DB container not found for UX-DATA-01 cleanup verifier.");
  return name;
}

function querySql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", dbContainerName(), "psql", "-At", "-F", "|", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-c", sql],
    { encoding: "utf8" },
  ).trim();
}

function runSql(sql) {
  execFileSync(
    "docker",
    ["exec", "-i", dbContainerName(), "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
    { input: sql, encoding: "utf8" },
  );
}

function sqlUuid(value) {
  assert(/^[0-9a-f-]{36}$/i.test(value), `Unsafe UUID: ${value}`);
  return `'${value}'::uuid`;
}

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

const [inspectionId, actorProfileId] = querySql(`
  select concat_ws('|', inspection.id, inspection.submitted_by_profile_id)
  from public.warranty_claim_inspections inspection
  where inspection.status = 'submitted'
    and inspection.submitted_by_profile_id is not null
  order by inspection.submitted_at desc, inspection.id desc
  limit 1;
`).split("|");
assert(inspectionId && actorProfileId, "Cleanup-command verifier requires the submitted UX-DATA-01 inspection fixture.");

const digest = createHash("sha256").update(`ux-data-01-absent-${inspectionId}`).digest("hex");
const storagePath = `inspections/${inspectionId}/5-${digest}.jpg`;

runSql(`
  insert into private.operational_evidence_stages (
    flow_kind,
    inspection_id,
    resolution_id,
    actor_profile_id,
    slot,
    storage_path,
    mime_type,
    size_bytes,
    state,
    created_at
  ) values (
    'inspection',
    ${sqlUuid(inspectionId)},
    null,
    ${sqlUuid(actorProfileId)},
    5,
    ${sqlText(storagePath)},
    'image/jpeg',
    128,
    'staged',
    clock_timestamp() - interval '2 hours'
  );
`);

assert(querySql(`
  select count(*) from storage.objects
  where bucket_id = 'warranty-claim-evidence' and name = ${sqlText(storagePath)};
`) === "0", "Cleanup-command fixture must represent registration-before-upload crash state with no Storage object.");

const staleBefore = new Date(Date.now() - 60_000).toISOString();
const output = execFileSync(
  process.execPath,
  ["scripts/cleanup-operational-evidence.mjs", `--stale-before=${staleBefore}`, "--limit=50"],
  {
    encoding: "utf8",
    env: {
      ...process.env,
      API_URL: apiUrl,
      SERVICE_ROLE_KEY: serviceRoleKey,
    },
  },
).trim();

const lines = output.split("\n").filter(Boolean);
const summary = JSON.parse(lines.at(-1) ?? "{}");
assert(summary.failed === 0, `Cleanup command reported failures: ${output}`);
assert(summary.removed >= 1, `Cleanup command did not finalize the absent-object stage: ${output}`);
assert(querySql(`select count(*) from private.operational_evidence_stages where storage_path = ${sqlText(storagePath)};`) === "0",
  "Cleanup command must finalize a stale stage whose Storage object never existed.");

console.log("UX-DATA-01 real cleanup command absent-object contract passed.");
