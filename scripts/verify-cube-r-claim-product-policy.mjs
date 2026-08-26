import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const apiUrl = process.env.API_URL;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
const anonKey = process.env.ANON_KEY;
if (!apiUrl || !serviceRoleKey || !anonKey) {
  throw new Error("Local Supabase API_URL, SERVICE_ROLE_KEY and ANON_KEY are required.");
}

const password = "Cube-J-Roll-Opening-2026!";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

async function request(path, { method = "GET", token = anonKey, key = anonKey, body, prefer = false } = {}) {
  const headers = { apikey: key, Authorization: `Bearer ${token}` };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    if (prefer) headers.Prefer = "return=representation";
  }
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { response, body: await readJson(response) };
}

async function signIn(email) {
  const result = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email, password },
  });
  assert(result.response.ok && result.body?.access_token,
    `Could not sign in ${email}: ${result.response.status} ${JSON.stringify(result.body)}`);
  return result.body.access_token;
}

async function rest(path, token, options = {}) {
  return request(`/rest/v1/${path}`, { ...options, token });
}

async function rpc(name, body, token) {
  return rest(`rpc/${name}`, token, { method: "POST", body });
}

function one(result, label) {
  assert(result.response.ok && Array.isArray(result.body) && result.body.length === 1,
    `${label}: ${result.response.status} ${JSON.stringify(result.body)}`);
  return result.body[0];
}

function dbContainerName() {
  const names = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" })
    .split("\n").map((value) => value.trim()).filter(Boolean);
  const name = names.find((value) => value.startsWith("supabase_db_"));
  assert(name, "Supabase database container was not found for Cube R verification.");
  return name;
}

function runSql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", dbContainerName(), "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
    { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  );
}

function querySql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", dbContainerName(), "psql", "-At", "-F", "|", "-v", "ON_ERROR_STOP=1",
      "-U", "postgres", "-d", "postgres", "-c", sql],
    { encoding: "utf8" },
  ).trim();
}

function expectSqlFailure(sql, expectedMessage) {
  let failed = false;
  try {
    runSql(sql);
  } catch (error) {
    failed = true;
    const stderr = String(error.stderr ?? "");
    assert(stderr.includes(expectedMessage),
      `Expected SQL failure ${expectedMessage}, received: ${stderr}`);
  }
  assert(failed, `SQL unexpectedly succeeded; expected ${expectedMessage}.`);
}

function sqlUuid(value) {
  assert(/^[0-9a-f-]{36}$/i.test(value), `Unsafe UUID fixture value: ${value}`);
  return `'${value}'::uuid`;
}

const signature = "private.resolve_claim_replacement_roll_eligibility(uuid,uuid)";
assert(querySql(`
  select concat_ws('|', p.prosecdef, p.provolatile)
  from pg_catalog.pg_proc p
  where p.oid = '${signature}'::regprocedure;
`) === "t|s", "Cube R replacement Product policy must be SECURITY DEFINER and STABLE.");

for (const role of ["anon", "authenticated", "service_role"]) {
  assert(querySql(`select has_function_privilege('${role}', '${signature}', 'EXECUTE');`) === "f",
    `${role} must not execute the private Cube R Product policy directly.`);
}
assert(querySql(`select to_regprocedure('public.resolve_claim_replacement_roll_eligibility(uuid,uuid)') is null;`) === "t",
  "Cube R Product policy must not be exposed as a public RPC.");

const warrantyFixture = querySql(`
  select concat_ws('|', warranty.id, warranty.product_id, warranty.roll_id)
  from public.warranties warranty
  where warranty.record_state = 'issued'
  order by warranty.activated_at desc, warranty.id desc
  limit 1;
`).split("|");
assert(warrantyFixture.length === 3 && warrantyFixture.every(Boolean),
  `Cube R requires an issued Warranty fixture from Cube M/Q: ${warrantyFixture}`);
const [warrantyId, warrantyProductId, warrantyRollId] = warrantyFixture;

const sameProductRollId = querySql(`
  select roll.id
  from public.rolls roll
  where roll.product_id = ${sqlUuid(warrantyProductId)}
    and roll.id <> ${sqlUuid(warrantyRollId)}
  order by roll.created_at, roll.id
  limit 1;
`);
assert(sameProductRollId, "Cube R requires a second Roll of the Warranty Product for policy verification.");

const sameResult = querySql(`
  select concat_ws('|', eligible, basis_code)
  from private.resolve_claim_replacement_roll_eligibility(
    ${sqlUuid(warrantyId)}, ${sqlUuid(sameProductRollId)}
  );
`);
assert(sameResult === "t|same_product_default",
  `V1 same-Product policy must accept the canonical Warranty Product: ${sameResult}`);

const adminToken = await signIn("cube-j-admin@example.test");
const suffix = randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase();
const differentProduct = one(await rest("products?select=id,code", adminToken, {
  method: "POST",
  prefer: true,
  body: {
    code: `PG-R-DIFF-${suffix}`,
    name: `Cube R Different Product ${suffix}`,
    slug: `cube-r-different-product-${suffix.toLowerCase()}`,
    product_type: "PPF",
    category: "Paint Protection Film",
    version_name: "Cube R V1",
    width_mm: 1524,
    length_m: 15,
    thickness_mil: 7.5,
    weight_kg: 12.5,
    origin_country: "USA",
    default_warranty_months: 120,
    marketing_description: "Cube R Product-policy negative fixture.",
    technical_description: "Cube R Product-policy negative fixture.",
    features: ["Replacement policy fixture"],
    warranty_coverage: "Test coverage.",
    care_instructions: "Test care.",
    publication_status: "draft",
  },
}), "Create Cube R different Product fixture");
assert(differentProduct.id !== warrantyProductId, "Different Product fixture must have a distinct canonical Product id.");

const orderResult = await rpc("create_production_order", {
  p_request_id: randomUUID(),
  p_product_id: differentProduct.id,
  p_production_date: "2026-08-26",
  p_lots: [{ quantity: 1, source_reference: "CUBE-R-POLICY" }],
  p_source_reference: "CUBE-R-POLICY",
  p_notes: "Cube R replacement Product policy verification",
}, adminToken);
assert(orderResult.response.ok && typeof orderResult.body === "string",
  `Could not create Cube R different-Product order: ${orderResult.response.status} ${JSON.stringify(orderResult.body)}`);

const differentRoll = one(await rest(
  `rolls?production_order_id=eq.${encodeURIComponent(orderResult.body)}&select=id,product_id`,
  adminToken,
), "Read Cube R different-Product Roll");
assert(differentRoll.product_id === differentProduct.id,
  "Different-Product Roll must retain its canonical Product identity.");

const differentResult = querySql(`
  select concat_ws('|', eligible, basis_code)
  from private.resolve_claim_replacement_roll_eligibility(
    ${sqlUuid(warrantyId)}, ${sqlUuid(differentRoll.id)}
  );
`);
assert(differentResult === "f|same_product_default",
  `V1 different-Product policy must reject without changing the policy seam: ${differentResult}`);

expectSqlFailure(
  `select * from private.resolve_claim_replacement_roll_eligibility(null, ${sqlUuid(sameProductRollId)});`,
  "PG_CLAIM_REPLACEMENT_WARRANTY_REQUIRED",
);
expectSqlFailure(
  `select * from private.resolve_claim_replacement_roll_eligibility(${sqlUuid(warrantyId)}, null);`,
  "PG_CLAIM_REPLACEMENT_ROLL_REQUIRED",
);
expectSqlFailure(
  `select * from private.resolve_claim_replacement_roll_eligibility(gen_random_uuid(), ${sqlUuid(sameProductRollId)});`,
  "PG_CLAIM_REPLACEMENT_WARRANTY_NOT_FOUND",
);
expectSqlFailure(
  `select * from private.resolve_claim_replacement_roll_eligibility(${sqlUuid(warrantyId)}, gen_random_uuid());`,
  "PG_CLAIM_REPLACEMENT_ROLL_NOT_FOUND",
);

const functionDef = querySql(`select pg_get_functiondef('${signature}'::regprocedure);`);
assert(functionDef.includes("v_candidate_product_id = v_warranty_product_id"),
  "V1 Product equality must live inside the authoritative Cube R policy seam.");
assert(!functionDef.includes("roll_custody_current")
  && !functionDef.includes("roll_openings")
  && !functionDef.includes("roll_transfer_reservations"),
  "Product compatibility policy must not absorb physical eligibility/custody lifecycle checks.");

console.log("Cube R centralized replacement Product eligibility policy verified.");
