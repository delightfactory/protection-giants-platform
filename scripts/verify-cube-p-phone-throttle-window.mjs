import { execFileSync } from "node:child_process";

const apiUrl = process.env.API_URL;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
if (!apiUrl || !serviceRoleKey) {
  throw new Error("Local Supabase API_URL and SERVICE_ROLE_KEY are required.");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

async function rpc(name, body) {
  const response = await fetch(`${apiUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return { response, body: await readJson(response) };
}

function dbContainerName() {
  const names = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" })
    .split("\n").map((value) => value.trim()).filter(Boolean);
  const name = names.find((value) => value.startsWith("supabase_db_"));
  assert(name, "Supabase database container was not found for Cube P throttle-window verification.");
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
  return execFileSync(
    "docker",
    ["exec", "-i", dbContainerName(), "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
    { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  );
}

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

const fixture = querySql(`
  select concat_ws('|', warranty.id, warranty.customer_phone, identity.public_code)
  from public.warranties warranty
  join private.roll_public_identities identity on identity.roll_id = warranty.roll_id
  where warranty.record_state = 'issued'
    and warranty.coverage_expires_at > now()
  order by warranty.activated_at desc, warranty.id desc
  limit 1;
`).split("|");
assert(fixture.length === 3 && fixture[0] && fixture[1] && fixture[2],
  `Active Warranty fixture missing for throttle-window verification: ${fixture}`);
const [warrantyId, phone, publicCode] = fixture;
const limiterHash = querySql(`select md5(${sqlText(publicCode)});`);

// Reproduce the final-review edge case deterministically: the original rolling
// window is already older than 15 minutes, but the threshold-triggered block is
// still live for another 14 minutes. The live block must take precedence.
runSql(`
  delete from private.warranty_claim_phone_verification_limits
  where public_code_hash = ${sqlText(limiterHash)};

  insert into private.warranty_claim_phone_verification_limits (
    public_code_hash,
    window_started_at,
    failed_attempts,
    blocked_until,
    updated_at
  ) values (
    ${sqlText(limiterHash)},
    now() - interval '16 minutes',
    8,
    now() + interval '14 minutes',
    now()
  );
`);

const blockedCorrect = await rpc("verify_customer_warranty_claim_phone", {
  p_public_code: publicCode,
  p_phone: phone,
});
assert(blockedCorrect.response.ok && Array.isArray(blockedCorrect.body) && blockedCorrect.body.length === 0,
  "A correct phone must remain generically blocked while blocked_until is still live, even after the rolling window ages out.");

const activeBlockShape = querySql(`
  select concat_ws('|', failed_attempts, blocked_until > now(), window_started_at < now() - interval '15 minutes')
  from private.warranty_claim_phone_verification_limits
  where public_code_hash = ${sqlText(limiterHash)};
`);
assert(activeBlockShape === "8|t|t",
  `Live block was cleared or mutated when rolling window expired: ${activeBlockShape}`);

const blockedWrong = await rpc("verify_customer_warranty_claim_phone", {
  p_public_code: publicCode,
  p_phone: "+209111111111",
});
assert(blockedWrong.response.ok && Array.isArray(blockedWrong.body) && blockedWrong.body.length === 0,
  "Wrong phone during an active block must keep the same generic failure shape.");
assert(querySql(`
  select failed_attempts::text
  from private.warranty_claim_phone_verification_limits
  where public_code_hash = ${sqlText(limiterHash)};
`) === "8", "Active blocked requests must not extend or mutate the failure counter.");

// Once the full block itself expires, the old rolling window may be discarded and
// a legitimate customer must recover normally.
runSql(`
  update private.warranty_claim_phone_verification_limits
  set blocked_until = now() - interval '1 minute',
      updated_at = now()
  where public_code_hash = ${sqlText(limiterHash)};
`);
const recovered = await rpc("verify_customer_warranty_claim_phone", {
  p_public_code: publicCode,
  p_phone: phone,
});
assert(recovered.response.ok && Array.isArray(recovered.body) && recovered.body.length === 1,
  `Correct phone did not recover after the actual block expired: ${recovered.response.status} ${JSON.stringify(recovered.body)}`);
assert(recovered.body[0].warranty_id === warrantyId,
  "Recovered verification must resolve the same Warranty.");
assert(querySql(`
  select count(*)::text
  from private.warranty_claim_phone_verification_limits
  where public_code_hash = ${sqlText(limiterHash)};
`) === "0", "Successful recovery must clear the stale limiter row.");

console.log("Cube P phone throttle active-block precedence verified.");
