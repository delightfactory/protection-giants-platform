import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";

const apiUrl = process.env.API_URL;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
const anonKey = process.env.ANON_KEY;

if (!apiUrl || !serviceRoleKey || !anonKey) {
  throw new Error("Local Supabase API_URL, SERVICE_ROLE_KEY and ANON_KEY are required.");
}

const password = "Cube-K-Preinstall-Issues-2026!";
const evidenceBucket = "roll-preinstall-issue-evidence";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function request(path, { method = "GET", token = anonKey, key = anonKey, body, prefer = false, headers = {} } = {}) {
  const requestHeaders = { apikey: key, Authorization: `Bearer ${token}`, ...headers };
  if (body !== undefined && !(body instanceof Uint8Array) && !Buffer.isBuffer(body)) {
    requestHeaders["Content-Type"] = "application/json";
    if (prefer) requestHeaders.Prefer = "return=representation";
  }
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: requestHeaders,
    body: body === undefined
      ? undefined
      : body instanceof Uint8Array || Buffer.isBuffer(body)
        ? body
        : JSON.stringify(body),
  });
  return { response, body: await readJson(response) };
}

async function rest(path, token, options = {}) {
  return request(`/rest/v1/${path}`, { ...options, token });
}

async function rpc(name, body, token) {
  return rest(`rpc/${name}`, token, { method: "POST", body });
}

async function expectRpcError(name, body, token, expectedMessage) {
  const result = await rpc(name, body, token);
  assert(!result.response.ok, `${name} unexpectedly succeeded; expected ${expectedMessage}.`);
  assert(result.body?.message === expectedMessage,
    `${name} expected ${expectedMessage}, got ${result.response.status} ${JSON.stringify(result.body)}`);
  return result;
}

function one(result, label) {
  assert(result.response.ok && Array.isArray(result.body) && result.body.length === 1,
    `${label}: ${result.response.status} ${JSON.stringify(result.body)}`);
  return result.body[0];
}

async function createUser({ email, role, centerId = null }) {
  const result = await request("/auth/v1/admin/users", {
    method: "POST",
    key: serviceRoleKey,
    token: serviceRoleKey,
    body: {
      email,
      password,
      email_confirm: true,
      app_metadata: {
        pg_provisioning: {
          version: "operational-v1",
          role,
          country_agent_id: null,
          dealer_id: null,
          installation_center_id: centerId,
        },
      },
      user_metadata: { display_name: `Cube K ${role}` },
    },
  });
  assert(result.response.ok && result.body?.id,
    `Could not create ${role} user: ${result.response.status} ${JSON.stringify(result.body)}`);
  return result.body;
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

function dbContainerName() {
  const names = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" })
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
  const name = names.find((value) => value.startsWith("supabase_db_"));
  assert(name, "Supabase database container was not found for Cube K fixtures.");
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
  assert(/^[0-9a-f-]{36}$/i.test(value), `Unsafe UUID fixture: ${value}`);
  return `'${value}'::uuid`;
}

function expectSqlFailure(sql, expectedMessage) {
  let failed = false;
  try {
    runSql(sql);
  } catch (error) {
    failed = true;
    const stderr = String(error.stderr ?? "");
    assert(stderr.includes(expectedMessage), `Expected ${expectedMessage}; received ${stderr}`);
  }
  assert(failed, `SQL unexpectedly succeeded; expected ${expectedMessage}.`);
}

async function uploadEvidence(issueId, index = 1) {
  const bytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZxvAAAAAASUVORK5CYII=",
    "base64",
  );
  const digest = createHash("sha256").update(bytes).digest("hex");
  const path = `${issueId}/${index}-${digest}.png`;
  const result = await request(`/storage/v1/object/${evidenceBucket}/${path}`, {
    method: "POST",
    key: serviceRoleKey,
    token: serviceRoleKey,
    headers: { "Content-Type": "image/png", "x-upsert": "false" },
    body: bytes,
  });
  assert(result.response.ok,
    `Evidence upload failed: ${result.response.status} ${JSON.stringify(result.body)}`);
  return path;
}

const emails = {
  admin: "cube-k-admin@example.test",
  centerA: "cube-k-center-a@example.test",
  centerB: "cube-k-center-b@example.test",
};

await createUser({ email: emails.admin, role: "admin" });
const adminToken = await signIn(emails.admin);

const agent = one(await rest("country_agents?select=id", adminToken, {
  method: "POST",
  prefer: true,
  body: { code: "CUBE-K-AGENT-EG", name: "Cube K Agent", country_code: "EG" },
}), "Create Cube K Agent");

const dealer = one(await rest("dealers?select=id", adminToken, {
  method: "POST",
  prefer: true,
  body: {
    code: "CUBE-K-DEALER-EG",
    name: "Cube K Dealer",
    country_code: "EG",
    country_agent_id: agent.id,
  },
}), "Create Cube K Dealer");

const centerA = one(await rest("installation_centers?select=id,status,approval_status", adminToken, {
  method: "POST",
  prefer: true,
  body: {
    code: "CUBE-K-CENTER-A",
    name: "Cube K Center A",
    country_code: "EG",
    city: "Cairo",
    dealer_id: dealer.id,
  },
}), "Create Center A");

const centerB = one(await rest("installation_centers?select=id,status", adminToken, {
  method: "POST",
  prefer: true,
  body: {
    code: "CUBE-K-CENTER-B",
    name: "Cube K Center B",
    country_code: "EG",
    city: "Giza",
    dealer_id: dealer.id,
  },
}), "Create Center B");

assert(centerA.status === "active" && centerA.approval_status !== "approved",
  "Cube K must be exercised with an active but unapproved Center.");

await createUser({ email: emails.centerA, role: "center", centerId: centerA.id });
await createUser({ email: emails.centerB, role: "center", centerId: centerB.id });
const centerAToken = await signIn(emails.centerA);
const centerBToken = await signIn(emails.centerB);

const centerAParty = one(
  await rest(`operational_parties?installation_center_id=eq.${centerA.id}&select=id`, adminToken),
  "Read Center A party",
);

const product = one(await rest("products?select=id,code", adminToken, {
  method: "POST",
  prefer: true,
  body: {
    code: "PG-CUBE-K-TEST",
    name: "Cube K Issue Test PPF",
    slug: "cube-k-issue-test-ppf",
    product_type: "PPF",
    category: "Paint Protection Film",
    version_name: "Cube K",
    width_mm: 1524,
    length_m: 15,
    thickness_mil: 7.5,
    weight_kg: 12.5,
    origin_country: "USA",
    default_warranty_months: 120,
    marketing_description: "Cube K fixture.",
    technical_description: "Cube K fixture.",
    features: ["Issue fixture"],
    warranty_coverage: "Test coverage.",
    care_instructions: "Test care.",
    publication_status: "draft",
  },
}), "Create Cube K Product");

const orderResult = await rpc("create_production_order", {
  p_request_id: randomUUID(),
  p_product_id: product.id,
  p_production_date: "2026-08-22",
  p_lots: [{ quantity: 9, source_reference: "CUBE-K-LOT" }],
  p_source_reference: "CUBE-K-ISSUES",
  p_notes: "Cube K verification",
}, adminToken);
assert(orderResult.response.ok && typeof orderResult.body === "string",
  `Could not create production order: ${orderResult.response.status} ${JSON.stringify(orderResult.body)}`);

const rollsResult = await rest(
  `rolls?production_order_id=eq.${encodeURIComponent(orderResult.body)}&select=id,serial_number&order=serial_number.asc`,
  adminToken,
);
assert(rollsResult.response.ok && rollsResult.body.length === 9, "Expected nine Cube K Rolls.");
const rolls = rollsResult.body;

for (const roll of rolls) {
  runSql(`
begin;
update public.roll_custody_current
set custodian_party_id = ${sqlUuid(centerAParty.id)}, confirmed_at = now()
where roll_id = ${sqlUuid(roll.id)};
insert into public.roll_custody_events (
  roll_id, custody_sequence, custodian_party_id, confirmed_at
) values (${sqlUuid(roll.id)}, 2, ${sqlUuid(centerAParty.id)}, now());
commit;
`);
}

for (const roll of rolls.slice(0, 8)) {
  const opened = await rpc("open_roll", {
    p_request_id: randomUUID(),
    p_roll_serial: roll.serial_number,
  }, centerAToken);
  assert(opened.response.ok && opened.body === roll.id,
    `Could not open ${roll.serial_number}: ${opened.response.status} ${JSON.stringify(opened.body)}`);
}

const candidate = one(await rpc("resolve_roll_preinstall_issue_candidate", {
  p_roll_serial: rolls[0].serial_number,
}, centerAToken), "Resolve issue candidate");
assert(candidate.eligibility === "eligible" && candidate.center_name === "Cube K Center A",
  `Unexpected candidate: ${JSON.stringify(candidate)}`);

await expectRpcError("resolve_roll_preinstall_issue_candidate", {
  p_roll_serial: rolls[0].serial_number,
}, centerBToken, "PG_ROLL_ISSUE_NOT_CURRENT_CUSTODIAN");
await expectRpcError("resolve_roll_preinstall_issue_candidate", {
  p_roll_serial: rolls[8].serial_number,
}, centerAToken, "PG_ROLL_ISSUE_ROLL_NOT_OPENED");

const issueId = randomUUID();
const issueRequest = randomUUID();
const evidencePath = await uploadEvidence(issueId);
const issueCreateBody = {
  p_request_id: issueRequest,
  p_issue_id: issueId,
  p_roll_serial: rolls[0].serial_number,
  p_category: "manufacturing_defect",
  p_description: "ظهرت علامة واضحة في طبقة الفيلم قبل بدء التركيب.",
  p_evidence_paths: [evidencePath],
};
const created = await rpc("create_roll_preinstall_issue", issueCreateBody, centerAToken);
assert(created.response.ok && created.body === issueId,
  `Issue creation failed: ${created.response.status} ${JSON.stringify(created.body)}`);

const retry = await rpc("create_roll_preinstall_issue", issueCreateBody, centerAToken);
assert(retry.response.ok && retry.body === issueId,
  `Matching issue retry failed: ${retry.response.status} ${JSON.stringify(retry.body)}`);

await expectRpcError("create_roll_preinstall_issue", {
  ...issueCreateBody,
  p_description: "وصف مختلف عمدًا لاختبار تعارض نفس رقم الطلب.",
}, centerAToken, "PG_ROLL_ISSUE_REQUEST_CONFLICT");

await expectRpcError("create_roll_preinstall_issue", {
  p_request_id: randomUUID(),
  p_issue_id: randomUUID(),
  p_roll_serial: rolls[0].serial_number,
  p_category: "physical_damage",
  p_description: "محاولة بلاغ ثانية أثناء وجود بلاغ قائم للمراجعة.",
  p_evidence_paths: [],
}, centerAToken, "PG_ROLL_ISSUE_ACTIVE_ISSUE_EXISTS");

await expectRpcError("create_roll_preinstall_issue", {
  p_request_id: randomUUID(),
  p_issue_id: randomUUID(),
  p_roll_serial: rolls[1].serial_number,
  p_category: "physical_damage",
  p_description: "المشرف الإداري لا يجوز أن ينشئ البلاغ بدل المركز.",
  p_evidence_paths: [],
}, adminToken, "PG_ROLL_ISSUE_CENTER_REQUIRED");

const centerAReads = await rest("roll_preinstall_issues?select=id,status,category", centerAToken);
assert(centerAReads.response.ok && centerAReads.body.some((row) => row.id === issueId),
  `Reporting Center must read its issue: ${JSON.stringify(centerAReads.body)}`);
const centerBReads = await rest("roll_preinstall_issues?select=id", centerBToken);
assert(centerBReads.response.ok && centerBReads.body.length === 0,
  `Other Center must not read issue rows: ${JSON.stringify(centerBReads.body)}`);
const adminReads = await rest("roll_preinstall_issues?select=id,status", adminToken);
assert(adminReads.response.ok && adminReads.body.some((row) => row.id === issueId),
  "Admin must read all issues.");

const centerEvidence = await rest(`roll_preinstall_issue_evidence?issue_id=eq.${issueId}&select=storage_path,mime_type,size_bytes`, centerAToken);
assert(centerEvidence.response.ok && centerEvidence.body.length === 1 && centerEvidence.body[0].storage_path === evidencePath,
  `Reporting Center should read evidence metadata: ${JSON.stringify(centerEvidence.body)}`);
const otherEvidence = await rest(`roll_preinstall_issue_evidence?issue_id=eq.${issueId}&select=storage_path`, centerBToken);
assert(otherEvidence.response.ok && otherEvidence.body.length === 0,
  "Other Center must not read evidence metadata.");

const anonymousEvidenceDownload = await request(`/storage/v1/object/authenticated/${evidenceBucket}/${evidencePath}`);
assert(!anonymousEvidenceDownload.response.ok, "Private issue evidence must not be anonymously downloadable.");

await expectRpcError("resolve_roll_preinstall_issue", {
  p_request_id: randomUUID(),
  p_issue_id: issueId,
  p_outcome: "cleared_for_use",
  p_reason: "المشكلة لا تؤثر على قابلية الاستخدام.",
}, centerAToken, "PG_ROLL_ISSUE_ADMIN_REQUIRED");

const recoveryBlocked = await rpc("recover_opened_roll", {
  p_request_id: randomUUID(),
  p_roll_serial: rolls[0].serial_number,
  p_reason: "اختبار منع الاسترداد قبل حسم البلاغ",
  p_confirm_physical_receipt: true,
}, adminToken);
assert(!recoveryBlocked.response.ok && recoveryBlocked.body?.message === "PG_ROLL_RECOVERY_ISSUE_PENDING",
  `Pending issue must block Recovery: ${recoveryBlocked.response.status} ${JSON.stringify(recoveryBlocked.body)}`);

const recoveryCandidatePending = one(await rpc("resolve_opened_roll_recovery_candidate", {
  p_roll_serial: rolls[0].serial_number,
}, adminToken), "Recovery candidate with pending issue");
assert(recoveryCandidatePending.eligibility === "issue_pending",
  `Recovery preflight should surface issue_pending: ${JSON.stringify(recoveryCandidatePending)}`);

const clearRequest = randomUUID();
const cleared = await rpc("resolve_roll_preinstall_issue", {
  p_request_id: clearRequest,
  p_issue_id: issueId,
  p_outcome: "cleared_for_use",
  p_reason: "تمت المراجعة ولا تؤثر العلامة على صلاحية استخدام الفيلم.",
}, adminToken);
assert(cleared.response.ok && cleared.body === issueId, `Admin clear failed: ${JSON.stringify(cleared.body)}`);
const clearRetry = await rpc("resolve_roll_preinstall_issue", {
  p_request_id: clearRequest,
  p_issue_id: issueId,
  p_outcome: "cleared_for_use",
  p_reason: "تمت المراجعة ولا تؤثر العلامة على صلاحية استخدام الفيلم.",
}, adminToken);
assert(clearRetry.response.ok && clearRetry.body === issueId, "Exact Admin decision retry must be idempotent.");

await expectRpcError("resolve_roll_preinstall_issue", {
  p_request_id: randomUUID(),
  p_issue_id: issueId,
  p_outcome: "return_required",
  p_reason: "قرار ثانٍ غير مسموح بعد الحسم.",
}, adminToken, "PG_ROLL_ISSUE_ALREADY_RESOLVED");

// A new real issue is allowed after clearance while the same Center still holds the opened Roll.
const secondIssueId = randomUUID();
const secondIssue = await rpc("create_roll_preinstall_issue", {
  p_request_id: randomUUID(),
  p_issue_id: secondIssueId,
  p_roll_serial: rolls[0].serial_number,
  p_category: "other",
  p_description: "ظهرت ملاحظة جديدة مستقلة بعد إغلاق البلاغ الأول.",
  p_evidence_paths: [],
}, centerAToken);
assert(secondIssue.response.ok && secondIssue.body === secondIssueId,
  `New issue after clearance should be allowed: ${JSON.stringify(secondIssue.body)}`);

const markedError = await rpc("mark_roll_preinstall_issue_reported_in_error", {
  p_request_id: randomUUID(),
  p_issue_id: secondIssueId,
  p_reason: "تم اختيار الرول الخطأ أثناء إدخال البلاغ.",
}, adminToken);
assert(markedError.response.ok && markedError.body === secondIssueId,
  `reported_in_error failed: ${JSON.stringify(markedError.body)}`);

// Return-required permanently blocks later Pre-install Issue creation, but permits physical Recovery.
const returnIssueId = randomUUID();
const returnIssue = await rpc("create_roll_preinstall_issue", {
  p_request_id: randomUUID(),
  p_issue_id: returnIssueId,
  p_roll_serial: rolls[1].serial_number,
  p_category: "physical_damage",
  p_description: "يوجد تلف مادي واضح يجعل استخدام الرول غير مناسب.",
  p_evidence_paths: [],
}, centerAToken);
assert(returnIssue.response.ok, `Return fixture issue failed: ${JSON.stringify(returnIssue.body)}`);
const returnDecision = await rpc("resolve_roll_preinstall_issue", {
  p_request_id: randomUUID(),
  p_issue_id: returnIssueId,
  p_outcome: "return_required",
  p_reason: "التلف مؤثر ويجب استلام الرول لدى الشركة.",
}, adminToken);
assert(returnDecision.response.ok, `return_required decision failed: ${JSON.stringify(returnDecision.body)}`);
await expectRpcError("create_roll_preinstall_issue", {
  p_request_id: randomUUID(),
  p_issue_id: randomUUID(),
  p_roll_serial: rolls[1].serial_number,
  p_category: "other",
  p_description: "لا يجوز فتح بلاغ جديد بعد قرار الإرجاع النهائي.",
  p_evidence_paths: [],
}, centerAToken, "PG_ROLL_ISSUE_RETURN_REQUIRED_ALREADY");

const recoveredAfterReturn = await rpc("recover_opened_roll", {
  p_request_id: randomUUID(),
  p_roll_serial: rolls[1].serial_number,
  p_reason: "استلام فعلي بعد قرار الشركة بإرجاع الرول",
  p_confirm_physical_receipt: true,
}, adminToken);
assert(recoveredAfterReturn.response.ok && typeof recoveredAfterReturn.body === "string",
  `Recovery after return_required must remain available: ${JSON.stringify(recoveredAfterReturn.body)}`);

// Two different issue requests racing on one held/opened Roll: exactly one commits.
const raceAId = randomUUID();
const raceBId = randomUUID();
const [raceA, raceB] = await Promise.all([
  rpc("create_roll_preinstall_issue", {
    p_request_id: randomUUID(),
    p_issue_id: raceAId,
    p_roll_serial: rolls[2].serial_number,
    p_category: "manufacturing_defect",
    p_description: "بلاغ السباق الأول لاختبار التسلسل الذري على نفس الرول.",
    p_evidence_paths: [],
  }, centerAToken),
  rpc("create_roll_preinstall_issue", {
    p_request_id: randomUUID(),
    p_issue_id: raceBId,
    p_roll_serial: rolls[2].serial_number,
    p_category: "physical_damage",
    p_description: "بلاغ السباق الثاني لاختبار منع وجود بلاغين نشطين.",
    p_evidence_paths: [],
  }, centerAToken),
]);
assert([raceA.response.ok, raceB.response.ok].filter(Boolean).length === 1,
  `Exactly one concurrent issue must succeed: A=${raceA.response.status} ${JSON.stringify(raceA.body)} B=${raceB.response.status} ${JSON.stringify(raceB.body)}`);
const raceFailure = raceA.response.ok ? raceB : raceA;
assert(raceFailure.body?.message === "PG_ROLL_ISSUE_ACTIVE_ISSUE_EXISTS",
  `Concurrent loser must receive active-issue error: ${JSON.stringify(raceFailure.body)}`);

// Submission vs physical Recovery shares the Cube J Production -> custody lock order.
const raceIssueId = randomUUID();
const [issueRace, recoveryRace] = await Promise.all([
  rpc("create_roll_preinstall_issue", {
    p_request_id: randomUUID(),
    p_issue_id: raceIssueId,
    p_roll_serial: rolls[3].serial_number,
    p_category: "contamination_or_packaging",
    p_description: "اختبار سباق البلاغ مع الاسترداد المادي لنفس الرول.",
    p_evidence_paths: [],
  }, centerAToken),
  rpc("recover_opened_roll", {
    p_request_id: randomUUID(),
    p_roll_serial: rolls[3].serial_number,
    p_reason: "اختبار سباق الاسترداد مع بلاغ المركز",
    p_confirm_physical_receipt: true,
  }, adminToken),
]);
assert([issueRace.response.ok, recoveryRace.response.ok].filter(Boolean).length === 1,
  `Exactly one issue/Recovery race action must succeed: issue=${issueRace.response.status} ${JSON.stringify(issueRace.body)} recovery=${recoveryRace.response.status} ${JSON.stringify(recoveryRace.body)}`);
if (issueRace.response.ok) {
  assert(recoveryRace.body?.message === "PG_ROLL_RECOVERY_ISSUE_PENDING",
    `Recovery loser should see pending issue: ${JSON.stringify(recoveryRace.body)}`);
} else {
  assert(issueRace.body?.message === "PG_ROLL_ISSUE_NOT_CURRENT_CUSTODIAN",
    `Issue loser should see custody move: ${JSON.stringify(issueRace.body)}`);
}

// Direct mutation/deletion must not rewrite the audit record even with privileged SQL.
expectSqlFailure(
  `update public.roll_preinstall_issues set description = 'changed illegally' where id = ${sqlUuid(issueId)};`,
  "PG_ROLL_ISSUE_IDENTITY_IMMUTABLE",
);
expectSqlFailure(
  `update public.roll_preinstall_issues set status = 'return_required' where id = ${sqlUuid(issueId)};`,
  "PG_ROLL_ISSUE_INVALID_TRANSITION",
);
expectSqlFailure(
  `delete from public.roll_preinstall_issues where id = ${sqlUuid(issueId)};`,
  "PG_ROLL_ISSUE_IMMUTABLE",
);
const eventId = querySql(`select id from public.roll_preinstall_issue_events where issue_id = ${sqlUuid(issueId)} order by created_at limit 1;`);
expectSqlFailure(
  `delete from public.roll_preinstall_issue_events where id = ${sqlUuid(eventId)};`,
  "PG_ROLL_ISSUE_HISTORY_IMMUTABLE",
);

const detail = one(await rpc("get_roll_preinstall_issue_detail", { p_issue_id: issueId }, centerAToken), "Center issue detail");
assert(detail.serial_number === rolls[0].serial_number && detail.status === "cleared_for_use",
  `Historical detail should remain readable: ${JSON.stringify(detail)}`);
await expectRpcError("get_roll_preinstall_issue_detail", { p_issue_id: issueId }, centerBToken, "PG_ROLL_ISSUE_NOT_FOUND");

const listForAdmin = await rpc("list_roll_preinstall_issues", { p_limit: 100, p_offset: 0 }, adminToken);
assert(listForAdmin.response.ok && listForAdmin.body.some((row) => row.issue_id === issueId),
  `Admin queue must include issue: ${JSON.stringify(listForAdmin.body)}`);

console.log("Cube K Pre-install Roll Issue database contracts passed.");
