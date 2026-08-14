import { execFileSync } from "node:child_process";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const dbContainer = execFileSync(
  "bash",
  ["-lc", "docker ps --format '{{.Names}}' | grep '^supabase_db_' | head -n 1"],
  { encoding: "utf8" },
).trim();

assert(dbContainer, "Supabase database container was not found.");

const query = String.raw`
select json_agg(row_to_json(trigger_contract) order by trigger_name)
from (
  select
    trigger.tgname as trigger_name,
    function_namespace.nspname as function_schema,
    function.proname as function_name,
    pg_get_triggerdef(trigger.oid, true) as trigger_definition
  from pg_trigger as trigger
  join pg_class as relation on relation.oid = trigger.tgrelid
  join pg_namespace as relation_namespace on relation_namespace.oid = relation.relnamespace
  join pg_proc as function on function.oid = trigger.tgfoid
  join pg_namespace as function_namespace on function_namespace.oid = function.pronamespace
  where relation_namespace.nspname = 'auth'
    and relation.relname = 'users'
    and not trigger.tgisinternal
) as trigger_contract;
`;

const output = execFileSync(
  "docker",
  ["exec", "-i", dbContainer, "psql", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-c", query],
  { encoding: "utf8" },
).trim();

const triggers = JSON.parse(output || "[]") ?? [];
console.log("Current non-internal auth.users triggers:");
console.log(JSON.stringify(triggers, null, 2));

const expected = new Map([
  ["on_auth_user_inserted_provision_operational_profile", "public.handle_operational_user_provisioning"],
  ["on_auth_user_app_metadata_updated_provision_operational_profile", "public.handle_operational_user_provisioning"],
]);

for (const [triggerName, functionIdentity] of expected) {
  const trigger = triggers.find((item) => item.trigger_name === triggerName);
  assert(trigger, `Expected Auth provisioning trigger ${triggerName} is missing.`);
  assert(
    `${trigger.function_schema}.${trigger.function_name}` === functionIdentity,
    `Auth trigger ${triggerName} points to ${trigger.function_schema}.${trigger.function_name}, expected ${functionIdentity}.`,
  );
}

const obsolete = triggers.filter(
  (item) =>
    item.trigger_name === "on_auth_user_created"
    || item.function_name === "provision_profile_from_auth_user",
);

assert(
  obsolete.length === 0,
  `Obsolete Auth provisioning trigger/function detected: ${JSON.stringify(obsolete)}`,
);

console.log("Auth trigger integrity contract verification passed.");
