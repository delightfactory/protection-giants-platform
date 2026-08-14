import { execFileSync } from "node:child_process";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const names = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" })
  .split("\n").map((value) => value.trim()).filter(Boolean);
const dbContainer = names.find((value) => value.startsWith("supabase_db_"));
assert(dbContainer, "Supabase database container was not found.");

function query(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", dbContainer, "psql", "-At", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-c", sql],
    { encoding: "utf8" },
  ).trim();
}

const safe = ["transfer_id", "roll_id", "status", "acted_at"];
const privateColumns = [
  "action_request_id",
  "acted_by_profile_id",
  "acted_by_party_id",
  "resolution_reason",
  "created_at",
];

for (const column of safe) {
  assert(
    query(`select has_column_privilege('authenticated', 'public.roll_transfer_item_states', '${column}', 'SELECT');`) === "t",
    `authenticated lost approved safe item-state column ${column}.`,
  );
}

for (const column of privateColumns) {
  assert(
    query(`select has_column_privilege('authenticated', 'public.roll_transfer_item_states', '${column}', 'SELECT');`) === "f",
    `authenticated can read private item-state column ${column}.`,
  );
  assert(
    query(`select has_column_privilege('service_role', 'public.roll_transfer_item_states', '${column}', 'SELECT');`) === "f",
    `service_role Data API can read private item-state column ${column}.`,
  );
}

assert(
  query("select has_table_privilege('authenticated', 'public.roll_transfer_item_states', 'INSERT,UPDATE,DELETE');") === "f",
  "authenticated unexpectedly gained direct item-state mutation privileges.",
);

console.log("Cube H item-state safe-column grants verified.");
