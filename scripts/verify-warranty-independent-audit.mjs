import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const apiUrl = process.env.API_URL;
const anonKey = process.env.ANON_KEY;

if (!apiUrl || !anonKey) {
  throw new Error("Local Supabase API_URL and ANON_KEY are required.");
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

async function request(path, { method = "GET", token = anonKey, body, prefer = false } = {}) {
  const headers = { apikey: anonKey, Authorization: `Bearer ${token}` };
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

async function rest(path, token, options = {}) {
  return request(`/rest/v1/${path}`, { ...options, token });
}

async function rpc(name, body, token) {
  return rest(`rpc/${name}`, token, { method: "POST", body });
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

async function expectRpcError(name, body, token, expectedMessage) {
  const result = await rpc(name, body, token);
  assert(!result.response.ok, `${name} unexpectedly succeeded; expected ${expectedMessage}.`);
  assert(result.body?.message === expectedMessage,
    `${name} expected ${expectedMessage}, received ${result.response.status} ${JSON.stringify(result.body)}`);
  return result;
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
  assert(name, "Supabase database container was not found for Cube M independent audit.");
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
    ["exec", "-i", dbContainerName(), "psql", "-At", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-c", sql],
    { encoding: "utf8" },
  ).trim();
}

function sqlUuid(value) {
  assert(/^[0-9a-f-]{36}$/i.test(value), `Unsafe UUID fixture value: ${value}`);
  return `'${value}'::uuid`;
}

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function startSqlTransaction(sql, applicationName) {
  const child = spawn("docker", [
    "exec", "-e", `PGAPPNAME=${applicationName}`, "-i", dbContainerName(),
    "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres",
  ], { stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const done = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`Concurrent SQL failed (${code}): ${stderr || stdout}`));
    });
  });
  child.stdin.end(sql);
  return done;
}

async function waitForSqlSleep(applicationName) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const count = querySql(`
      select count(*)
      from pg_stat_activity
      where application_name = ${sqlText(applicationName)}
        and state = 'active'
        and query ilike '%pg_sleep%';
    `);
    if (count === "1") return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${applicationName} to hold the Product row lock.`);
}

const adminToken = await signIn("cube-j-admin@example.test");
const centerToken = await signIn("cube-j-center-a@example.test");

const center = one(await rest(
  "installation_centers?code=eq.CUBE-J-CENTER-A&select=id,name,status,approval_status",
  adminToken,
), "Read independent-audit Center");
const centerParty = one(await rest(
  `operational_parties?installation_center_id=eq.${center.id}&select=id`,
  adminToken,
), "Read independent-audit Center party");
const centerProfile = one(await rest(
  `profiles?installation_center_id=eq.${center.id}&role=eq.center&select=id,status`,
  adminToken,
), "Read independent-audit Center profile");

const product = one(await rest("products?select=id,code", adminToken, {
  method: "POST",
  prefer: true,
  body: {
    code: "PG-CUBE-M-AUDIT",
    name: "Cube M Independent Audit PPF",
    slug: "cube-m-independent-audit-ppf",
    product_type: "PPF",
    category: "Paint Protection Film",
    version_name: "Audit V1",
    width_mm: 1524,
    length_m: 15,
    thickness_mil: 7.5,
    weight_kg: 12.5,
    origin_country: "USA",
    default_warranty_months: 24,
    marketing_description: "Cube M independent audit fixture.",
    technical_description: "Cube M independent audit fixture.",
    features: ["Independent audit fixture"],
    warranty_coverage: "Audit coverage A.",
    care_instructions: "Audit care A.",
    publication_status: "draft",
  },
}), "Create independent-audit Product");

const order = await rpc("create_production_order", {
  p_request_id: randomUUID(),
  p_product_id: product.id,
  p_production_date: "2026-08-25",
  p_lots: [{ quantity: 7, source_reference: "CUBE-M-INDEPENDENT-AUDIT" }],
  p_source_reference: "CUBE-M-INDEPENDENT-AUDIT",
  p_notes: "Independent second audit fixtures",
}, adminToken);
assert(order.response.ok && typeof order.body === "string",
  `Could not create independent-audit Production Order: ${order.response.status} ${JSON.stringify(order.body)}`);

const rollsResult = await rest(
  `rolls?production_order_id=eq.${encodeURIComponent(order.body)}&select=id,serial_number&order=serial_number.asc`,
  adminToken,
);
assert(rollsResult.response.ok && rollsResult.body.length === 7,
  `Expected seven independent-audit Rolls: ${JSON.stringify(rollsResult.body)}`);
const rolls = rollsResult.body;

for (const roll of rolls) {
  runSql(`
    begin;
    update public.roll_custody_current
    set custodian_party_id = ${sqlUuid(centerParty.id)}, confirmed_at = now()
    where roll_id = ${sqlUuid(roll.id)};
    insert into public.roll_custody_events (roll_id, custody_sequence, custodian_party_id, confirmed_at)
    values (${sqlUuid(roll.id)}, 2, ${sqlUuid(centerParty.id)}, now());
    commit;
  `);
  const opened = await rpc("open_roll", {
    p_request_id: randomUUID(),
    p_roll_serial: roll.serial_number,
  }, centerToken);
  assert(opened.response.ok && opened.body === roll.id,
    `Could not open audit Roll ${roll.serial_number}: ${opened.response.status} ${JSON.stringify(opened.body)}`);
}

function activationPayload(roll, overrides = {}) {
  return {
    p_request_id: randomUUID(),
    p_roll_serial: roll.serial_number,
    p_customer_name: "Independent Audit Customer",
    p_customer_phone: "+201000000001",
    p_customer_email: "audit@example.test",
    p_vehicle_make: "Audit Make",
    p_vehicle_model: "Audit Model",
    p_vehicle_year: 2026,
    p_vehicle_plate: "AUD-100",
    p_vehicle_color: "Black",
    p_vehicle_vin: "AUDITVIN123456",
    ...overrides,
  };
}

// Suspended profiles and Centers must fail closed even with an already-issued auth token.
runSql(`update public.profiles set status = 'suspended' where id = ${sqlUuid(centerProfile.id)};`);
await expectRpcError("resolve_warranty_activation_candidate", {
  p_roll_serial: rolls[6].serial_number,
}, centerToken, "PG_WARRANTY_CENTER_INACTIVE");
runSql(`update public.profiles set status = 'active' where id = ${sqlUuid(centerProfile.id)};`);

runSql(`update public.installation_centers set status = 'suspended' where id = ${sqlUuid(center.id)};`);
await expectRpcError("resolve_warranty_activation_candidate", {
  p_roll_serial: rolls[6].serial_number,
}, centerToken, "PG_WARRANTY_CENTER_INACTIVE");
runSql(`update public.installation_centers set status = 'active' where id = ${sqlUuid(center.id)};`);
const restoredCandidate = one(await rpc("resolve_warranty_activation_candidate", {
  p_roll_serial: rolls[6].serial_number,
}, centerToken), "Restored Center candidate");
assert(restoredCandidate.eligibility === "eligible", "Restored active Center should regain normal eligibility.");

async function createIssue(roll, description) {
  const issueId = randomUUID();
  const created = await rpc("create_roll_preinstall_issue", {
    p_request_id: randomUUID(),
    p_issue_id: issueId,
    p_roll_serial: roll.serial_number,
    p_category: "other",
    p_description: description,
    p_evidence_paths: [],
  }, centerToken);
  assert(created.response.ok && created.body === issueId,
    `Could not create issue for ${roll.serial_number}: ${created.response.status} ${JSON.stringify(created.body)}`);
  return issueId;
}

// Cleared and reported-in-error historical issues do not block Activation; VIN is not globally unique.
const clearedIssue = await createIssue(rolls[0], "بلاغ مستقل للاختبار ثم السماح بالاستخدام بعد المراجعة.");
const cleared = await rpc("resolve_roll_preinstall_issue", {
  p_request_id: randomUUID(),
  p_issue_id: clearedIssue,
  p_outcome: "cleared_for_use",
  p_reason: "تمت المراجعة وثبت أن الرول صالح للاستخدام والتفعيل.",
}, adminToken);
assert(cleared.response.ok, `Could not clear audit issue: ${JSON.stringify(cleared.body)}`);
const firstVinWarranty = one(await rpc("activate_roll_warranty", activationPayload(rolls[0], {
  p_vehicle_vin: "SHAREDVIN12345",
}), centerToken), "Activate after cleared_for_use");

const reportedIssue = await createIssue(rolls[1], "بلاغ تم إدخاله على الرول بالخطأ لاختبار reported_in_error.");
const reported = await rpc("mark_roll_preinstall_issue_reported_in_error", {
  p_request_id: randomUUID(),
  p_issue_id: reportedIssue,
  p_reason: "تم التأكد أن البلاغ سُجل بالخطأ ولا يمثل حالة فعلية للرول.",
}, adminToken);
assert(reported.response.ok, `Could not mark audit issue reported_in_error: ${JSON.stringify(reported.body)}`);
const secondVinWarranty = one(await rpc("activate_roll_warranty", activationPayload(rolls[1], {
  p_vehicle_vin: "SHAREDVIN12345",
  p_customer_phone: "+201000000002",
}), centerToken), "Activate after reported_in_error");
assert(firstVinWarranty.warranty_id !== secondVinWarranty.warranty_id,
  "Two different Rolls must be able to carry the same VIN/chassis value; VIN is not a global identity key.");

// Any historical return_required remains terminal for Activation.
const returnIssue = await createIssue(rolls[2], "تلف مؤثر يستلزم إرجاع الرول ويجب أن يمنع التفعيل نهائيًا.");
const returned = await rpc("resolve_roll_preinstall_issue", {
  p_request_id: randomUUID(),
  p_issue_id: returnIssue,
  p_outcome: "return_required",
  p_reason: "التلف مؤثر ويجب إرجاع الرول وعدم تفعيل ضمان عميل عليه.",
}, adminToken);
assert(returned.response.ok, `Could not resolve return_required: ${JSON.stringify(returned.body)}`);
await expectRpcError("activate_roll_warranty", activationPayload(rolls[2]), centerToken, "PG_WARRANTY_RETURN_REQUIRED");

// Product policy update racing Activation must yield one coherent policy snapshot.
const policyApp = "cube-m-policy-lock";
const policyUpdate = startSqlTransaction(`
  begin;
  update public.products
  set default_warranty_months = 37,
      warranty_coverage = 'Audit coverage B.',
      care_instructions = 'Audit care B.'
  where id = ${sqlUuid(product.id)};
  select pg_sleep(2);
  commit;
`, policyApp);
await waitForSqlSleep(policyApp);
const concurrentWarranty = one(await rpc("activate_roll_warranty", activationPayload(rolls[3], {
  p_customer_phone: "+201000000003",
  p_vehicle_vin: "POLICYVIN12345",
}), centerToken), "Activate during Product policy edit");
await policyUpdate;
const concurrentDetail = one(await rpc("get_internal_warranty_detail", {
  p_warranty_id: concurrentWarranty.warranty_id,
}, adminToken), "Read coherent policy snapshot");
assert(concurrentDetail.warranty_months === 37
  && concurrentDetail.warranty_coverage === "Audit coverage B."
  && concurrentDetail.care_instructions === "Audit care B.",
  `Concurrent Product edit produced an incoherent Warranty policy snapshot: ${JSON.stringify(concurrentDetail)}`);

// Later Product edits and Center rename cannot rewrite already-issued snapshots.
runSql(`
  update public.products
  set default_warranty_months = 99,
      warranty_coverage = 'Audit coverage C.',
      care_instructions = 'Audit care C.'
  where id = ${sqlUuid(product.id)};
  update public.installation_centers
  set name = 'Cube M Audit Center Renamed'
  where id = ${sqlUuid(center.id)};
`);
const stableSnapshot = one(await rpc("get_internal_warranty_detail", {
  p_warranty_id: concurrentWarranty.warranty_id,
}, adminToken), "Read stable immutable snapshots");
assert(stableSnapshot.warranty_months === 37
  && stableSnapshot.warranty_coverage === "Audit coverage B."
  && stableSnapshot.care_instructions === "Audit care B."
  && stableSnapshot.activating_center_name === center.name,
  `Later Product/Center edits must not drift issued Warranty snapshots: ${JSON.stringify(stableSnapshot)}`);
runSql(`
  update public.products
  set default_warranty_months = 24,
      warranty_coverage = 'Audit coverage A.',
      care_instructions = 'Audit care A.'
  where id = ${sqlUuid(product.id)};
  update public.installation_centers set name = ${sqlText(center.name)} where id = ${sqlUuid(center.id)};
`);

// Admin support audit must be readable only by Admin and remain complete through correction + void.
const supportWarranty = one(await rpc("activate_roll_warranty", activationPayload(rolls[4], {
  p_customer_phone: "+201000000004",
  p_vehicle_vin: "AUDITTRAIL12345",
}), centerToken), "Activate audit-timeline Warranty");
const correctionRequestId = randomUUID();
const corrected = await rpc("correct_warranty_details", {
  p_action_request_id: correctionRequestId,
  p_warranty_id: supportWarranty.warranty_id,
  p_customer_name: "Independent Audit Customer Corrected",
  p_customer_phone: "+201000000044",
  p_customer_email: "audit-corrected@example.test",
  p_vehicle_make: "Audit Make",
  p_vehicle_model: "Audit Model Corrected",
  p_vehicle_year: 2025,
  p_vehicle_plate: "AUD-444",
  p_vehicle_color: "Silver",
  p_vehicle_vin: "AUDITTRAIL12345",
  p_reason: "Independent audit correction to verify the permanent Admin timeline.",
}, adminToken);
assert(corrected.response.ok, `Admin correction failed in independent audit: ${JSON.stringify(corrected.body)}`);

await expectRpcError("get_internal_warranty_audit", {
  p_warranty_id: supportWarranty.warranty_id,
}, centerToken, "PG_WARRANTY_ADMIN_REQUIRED");
let audit = await rpc("get_internal_warranty_audit", { p_warranty_id: supportWarranty.warranty_id }, adminToken);
assert(audit.response.ok && audit.body.length === 2
  && audit.body[0].event_kind === "activated"
  && audit.body[1].event_kind === "details_corrected"
  && audit.body[1].change_snapshot?.before?.customer_phone === "+201000000004"
  && audit.body[1].change_snapshot?.after?.customer_phone === "+201000000044",
  `Admin audit read must expose ordered immutable Before/After history: ${JSON.stringify(audit.body)}`);

const voided = await rpc("void_warranty_in_error", {
  p_action_request_id: randomUUID(),
  p_warranty_id: supportWarranty.warranty_id,
  p_reason: "Independent audit void to verify post-void eligibility revalidation.",
}, adminToken);
assert(voided.response.ok, `Independent-audit void failed: ${JSON.stringify(voided.body)}`);
audit = await rpc("get_internal_warranty_audit", { p_warranty_id: supportWarranty.warranty_id }, adminToken);
assert(audit.response.ok && audit.body.length === 3
  && audit.body.map((event) => event.event_kind).join(",") === "activated,details_corrected,voided_in_error",
  `Admin audit timeline must retain activation, correction and void in order: ${JSON.stringify(audit.body)}`);

const postVoidIssue = await createIssue(rolls[4], "بلاغ جديد حقيقي بعد void لاختبار أن إعادة التفعيل تعيد فحص الأهلية كاملة.");
assert(postVoidIssue, "Post-void issue fixture missing.");
await expectRpcError("activate_roll_warranty", activationPayload(rolls[4], {
  p_customer_phone: "+201000000045",
  p_vehicle_vin: "AUDITTRAIL54321",
}), centerToken, "PG_WARRANTY_ISSUE_PENDING");
assert(querySql(`select count(*) from public.warranties where roll_id = ${sqlUuid(rolls[4].id)} and record_state = 'issued';`) === "0",
  "A new blocker after void must prevent reactivation from recreating an effective Warranty.");

console.log("Cube M independent second-audit high-risk regression contracts passed.");
