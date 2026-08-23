import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const apiUrl = process.env.API_URL;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
const anonKey = process.env.ANON_KEY;

if (!apiUrl || !serviceRoleKey || !anonKey) {
  throw new Error("Local Supabase API_URL, SERVICE_ROLE_KEY and ANON_KEY are required.");
}

const password = "Cube-K-Preinstall-Issues-2026!";
const bucket = "roll-preinstall-issue-evidence";
const deniedIssueId = "00000000-0000-4000-8000-000000000001";

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

async function request(path, { method = "GET", token = anonKey, key = anonKey, body } = {}) {
  const headers = { apikey: key, Authorization: `Bearer ${token}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { response, body: await readJson(response) };
}

async function rest(path, token) {
  return request(`/rest/v1/${path}`, { token });
}

async function rpc(name, body, token) {
  return request(`/rest/v1/rpc/${name}`, { method: "POST", token, body });
}

async function expectRpcError(name, body, token, expectedMessage) {
  const result = await rpc(name, body, token);
  assert(!result.response.ok && result.body?.message === expectedMessage,
    `${name} expected ${expectedMessage}: ${result.response.status} ${JSON.stringify(result.body)}`);
}

async function createUser({ email, role, agentId = null, dealerId = null }) {
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
          country_agent_id: agentId,
          dealer_id: dealerId,
          installation_center_id: null,
        },
      },
      user_metadata: { display_name: `Cube K boundary ${role}` },
    },
  });
  assert(result.response.ok && result.body?.id,
    `Could not create ${role} boundary user: ${result.response.status} ${JSON.stringify(result.body)}`);
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

async function assertAdminMutationDenied(role, token) {
  const resolveResult = await rpc("resolve_roll_preinstall_issue", {
    p_request_id: "00000000-0000-4000-8000-000000000002",
    p_issue_id: deniedIssueId,
    p_outcome: "cleared_for_use",
    p_reason: "اختبار منع قرار الجودة لغير الإدارة.",
  }, token);
  assert(!resolveResult.response.ok && resolveResult.body?.message === "PG_ROLL_ISSUE_ADMIN_REQUIRED",
    `${role} quality resolution must be Admin-only: ${resolveResult.response.status} ${JSON.stringify(resolveResult.body)}`);

  const correctionResult = await rpc("mark_roll_preinstall_issue_reported_in_error", {
    p_request_id: "00000000-0000-4000-8000-000000000003",
    p_issue_id: deniedIssueId,
    p_reason: "اختبار منع التصحيح الإداري لغير الإدارة.",
  }, token);
  assert(!correctionResult.response.ok && correctionResult.body?.message === "PG_ROLL_ISSUE_ADMIN_REQUIRED",
    `${role} reported_in_error correction must be Admin-only: ${correctionResult.response.status} ${JSON.stringify(correctionResult.body)}`);
}

function dbContainerName() {
  const names = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" })
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
  const name = names.find((value) => value.startsWith("supabase_db_"));
  assert(name, "Supabase database container was not found for Cube K boundary fixtures.");
  return name;
}

function runSql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", dbContainerName(), "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
    { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  );
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

function sqlUuid(value) {
  assert(/^[0-9a-f-]{36}$/i.test(value), `Unsafe UUID fixture: ${value}`);
  return `'${value}'::uuid`;
}

const bucketResult = await request(`/storage/v1/bucket/${bucket}`, {
  key: serviceRoleKey,
  token: serviceRoleKey,
});
assert(bucketResult.response.ok && bucketResult.body?.public === false,
  `Cube K evidence bucket must remain private: ${bucketResult.response.status} ${JSON.stringify(bucketResult.body)}`);
assert(bucketResult.body?.file_size_limit === 8388608,
  `Cube K evidence bucket size limit drifted: ${JSON.stringify(bucketResult.body)}`);
assert(Array.isArray(bucketResult.body?.allowed_mime_types)
  && ["image/jpeg", "image/png", "image/webp"].every((mime) => bucketResult.body.allowed_mime_types.includes(mime))
  && bucketResult.body.allowed_mime_types.length === 3,
  `Cube K evidence bucket MIME allowlist drifted: ${JSON.stringify(bucketResult.body)}`);

const agentResult = await request("/rest/v1/country_agents?code=eq.CUBE-K-AGENT-EG&select=id", {
  key: serviceRoleKey,
  token: serviceRoleKey,
});
const dealerResult = await request("/rest/v1/dealers?code=eq.CUBE-K-DEALER-EG&select=id", {
  key: serviceRoleKey,
  token: serviceRoleKey,
});
assert(agentResult.response.ok && agentResult.body?.length === 1, "Cube K Agent fixture is missing.");
assert(dealerResult.response.ok && dealerResult.body?.length === 1, "Cube K Dealer fixture is missing.");

await createUser({ email: "cube-k-boundary-agent@example.test", role: "agent", agentId: agentResult.body[0].id });
await createUser({ email: "cube-k-boundary-dealer@example.test", role: "dealer", dealerId: dealerResult.body[0].id });
const agentToken = await signIn("cube-k-boundary-agent@example.test");
const dealerToken = await signIn("cube-k-boundary-dealer@example.test");
const centerToken = await signIn("cube-k-center-a@example.test");
const adminToken = await signIn("cube-k-admin@example.test");

for (const [role, token] of [["Agent", agentToken], ["Dealer", dealerToken]]) {
  for (const table of ["roll_preinstall_issues", "roll_preinstall_issue_events", "roll_preinstall_issue_evidence"]) {
    const result = await rest(`${table}?select=id&limit=5`, token);
    assert(result.response.ok && Array.isArray(result.body) && result.body.length === 0,
      `${role} must not read ${table}: ${result.response.status} ${JSON.stringify(result.body)}`);
  }

  const list = await rpc("list_roll_preinstall_issues", { p_limit: 10, p_offset: 0 }, token);
  assert(!list.response.ok && list.body?.message === "PG_ROLL_ISSUE_FORBIDDEN",
    `${role} issue-list RPC must be denied: ${list.response.status} ${JSON.stringify(list.body)}`);
}

await assertAdminMutationDenied("Agent", agentToken);
await assertAdminMutationDenied("Dealer", dealerToken);
await assertAdminMutationDenied("Center", centerToken);

const clearedIssueResult = await rest(
  "roll_preinstall_issues?status=eq.cleared_for_use&select=id,roll_id,reporting_center_party_id&order=created_at.asc&limit=1",
  adminToken,
);
assert(clearedIssueResult.response.ok && clearedIssueResult.body?.length === 1,
  `Cleared Cube K issue fixture is missing through Admin RLS: ${JSON.stringify(clearedIssueResult.body)}`);
const clearedIssue = clearedIssueResult.body[0];
const custodyResult = await rest(
  `roll_custody_current?roll_id=eq.${clearedIssue.roll_id}&select=custodian_party_id`,
  adminToken,
);
assert(custodyResult.response.ok && custodyResult.body?.length === 1,
  `Cleared issue custody fixture is missing through Admin RLS: ${JSON.stringify(custodyResult.body)}`);
assert(custodyResult.body[0].custodian_party_id === clearedIssue.reporting_center_party_id,
  "Issue submission and Admin clearance must not move confirmed Roll custody.");

const evidenceMetadata = await rest(
  `roll_preinstall_issue_evidence?issue_id=eq.${clearedIssue.id}&select=id&limit=1`,
  adminToken,
);
assert(evidenceMetadata.response.ok && evidenceMetadata.body?.length === 1,
  `Cube K evidence metadata fixture is missing: ${JSON.stringify(evidenceMetadata.body)}`);
expectSqlFailure(
  `delete from public.roll_preinstall_issue_evidence where id = ${sqlUuid(evidenceMetadata.body[0].id)};`,
  "PG_ROLL_ISSUE_HISTORY_IMMUTABLE",
);

const pendingIssueResult = await rest(
  "roll_preinstall_issues?status=eq.submitted&select=id&order=created_at.asc&limit=1",
  adminToken,
);
assert(pendingIssueResult.response.ok && pendingIssueResult.body?.length === 1,
  `Pending Cube K issue fixture is missing: ${JSON.stringify(pendingIssueResult.body)}`);
await expectRpcError("mark_roll_preinstall_issue_reported_in_error", {
  p_request_id: randomUUID(),
  p_issue_id: pendingIssueResult.body[0].id,
  p_reason: "bad",
}, adminToken, "PG_ROLL_ISSUE_RESOLUTION_REASON_INVALID");

const reportedErrorList = await rpc("list_roll_preinstall_issues", { p_limit: 100, p_offset: 0 }, centerToken);
assert(reportedErrorList.response.ok, `Center issue list failed: ${JSON.stringify(reportedErrorList.body)}`);
const reportedErrorIssue = reportedErrorList.body.find((issue) => issue.status === "reported_in_error");
assert(reportedErrorIssue?.serial_number, "reported_in_error fixture is missing from Center history.");
const issueAfterCorrectionId = randomUUID();
const issueAfterCorrection = await rpc("create_roll_preinstall_issue", {
  p_request_id: randomUUID(),
  p_issue_id: issueAfterCorrectionId,
  p_roll_serial: reportedErrorIssue.serial_number,
  p_category: "other",
  p_description: "بلاغ جديد مستقل بعد إغلاق البلاغ السابق كتسجيل بالخطأ.",
  p_evidence_paths: [],
}, centerToken);
assert(issueAfterCorrection.response.ok && issueAfterCorrection.body === issueAfterCorrectionId,
  `New issue after reported_in_error must be allowed: ${JSON.stringify(issueAfterCorrection.body)}`);
const closeIssueAfterCorrection = await rpc("resolve_roll_preinstall_issue", {
  p_request_id: randomUUID(),
  p_issue_id: issueAfterCorrectionId,
  p_outcome: "cleared_for_use",
  p_reason: "إغلاق fixture التحقق بعد إثبات السماح ببلاغ جديد.",
}, adminToken);
assert(closeIssueAfterCorrection.response.ok,
  `Could not close post-correction fixture: ${JSON.stringify(closeIssueAfterCorrection.body)}`);

const returnedIssueResult = await rest(
  "roll_preinstall_issues?status=eq.return_required&select=id,roll_id,reporting_center_party_id&order=created_at.asc&limit=1",
  adminToken,
);
assert(returnedIssueResult.response.ok && returnedIssueResult.body?.length === 1,
  `return_required fixture is missing: ${JSON.stringify(returnedIssueResult.body)}`);
const returnedCustodyResult = await rest(
  `roll_custody_current?roll_id=eq.${returnedIssueResult.body[0].roll_id}&select=custodian_party_id`,
  adminToken,
);
assert(returnedCustodyResult.response.ok && returnedCustodyResult.body?.length === 1
  && returnedCustodyResult.body[0].custodian_party_id !== returnedIssueResult.body[0].reporting_center_party_id,
  "Return-required fixture must have moved custody through Recovery before historical-access verification.");
const historicalAfterRecovery = await rpc(
  "get_roll_preinstall_issue_detail",
  { p_issue_id: returnedIssueResult.body[0].id },
  centerToken,
);
assert(historicalAfterRecovery.response.ok && historicalAfterRecovery.body?.length === 1,
  `Reporting Center must retain historical issue access after custody moves: ${JSON.stringify(historicalAfterRecovery.body)}`);

// Exercise the defensive Production-state branch explicitly. Normal Cube J rules
// prevent a Roll from becoming opened after its Production Order is voided, so
// this fixture intentionally creates an impossible historical opening via
// privileged SQL after voiding. Cube K must still fail closed at both preflight
// and commit-time mutation boundaries.
const productResult = await rest("products?code=eq.PG-CUBE-K-TEST&select=id", adminToken);
assert(productResult.response.ok && productResult.body?.length === 1, "Cube K Product fixture is missing.");
const invalidOrder = await rpc("create_production_order", {
  p_request_id: randomUUID(),
  p_product_id: productResult.body[0].id,
  p_production_date: "2026-08-22",
  p_lots: [{ quantity: 1, source_reference: "CUBE-K-INVALID-PRODUCTION" }],
  p_source_reference: "CUBE-K-INVALID-PRODUCTION",
  p_notes: "Cube K invalid Production defensive fixture",
}, adminToken);
assert(invalidOrder.response.ok && typeof invalidOrder.body === "string",
  `Could not create invalid Production fixture: ${invalidOrder.response.status} ${JSON.stringify(invalidOrder.body)}`);

const invalidRollResult = await rest(
  `rolls?production_order_id=eq.${invalidOrder.body}&select=id,serial_number&limit=1`,
  adminToken,
);
assert(invalidRollResult.response.ok && invalidRollResult.body?.length === 1, "Invalid Production Roll fixture is missing.");
const invalidRoll = invalidRollResult.body[0];

const voided = await rpc("void_production_order", {
  p_order_id: invalidOrder.body,
  p_reason: "اختبار رفض بلاغ Cube K عند حالة إنتاج غير صالحة.",
}, adminToken);
assert(voided.response.ok && voided.body === invalidOrder.body,
  `Could not void invalid Production fixture before distribution: ${voided.response.status} ${JSON.stringify(voided.body)}`);

const centerEntityResult = await rest("installation_centers?code=eq.CUBE-K-CENTER-A&select=id", adminToken);
assert(centerEntityResult.response.ok && centerEntityResult.body?.length === 1, "Center A fixture is missing.");
const centerPartyResult = await rest(
  `operational_parties?installation_center_id=eq.${centerEntityResult.body[0].id}&select=id`,
  adminToken,
);
assert(centerPartyResult.response.ok && centerPartyResult.body?.length === 1, "Center A party fixture is missing.");
const centerUserResult = await request("/auth/v1/user", { token: centerToken });
assert(centerUserResult.response.ok && centerUserResult.body?.id, "Center A Auth fixture is missing.");

runSql(`
begin;
update public.roll_custody_current
set custodian_party_id = ${sqlUuid(centerPartyResult.body[0].id)}, confirmed_at = now()
where roll_id = ${sqlUuid(invalidRoll.id)};
insert into public.roll_custody_events (
  roll_id, custody_sequence, custodian_party_id, confirmed_at
) values (${sqlUuid(invalidRoll.id)}, 2, ${sqlUuid(centerPartyResult.body[0].id)}, now());
insert into public.roll_openings (
  roll_id, request_id, opened_by_profile_id, opened_by_center_party_id, opened_at
) values (
  ${sqlUuid(invalidRoll.id)}, ${sqlUuid(randomUUID())}, ${sqlUuid(centerUserResult.body.id)},
  ${sqlUuid(centerPartyResult.body[0].id)}, now()
);
commit;
`);

await expectRpcError("resolve_roll_preinstall_issue_candidate", {
  p_roll_serial: invalidRoll.serial_number,
}, centerToken, "PG_ROLL_ISSUE_PRODUCTION_INVALID");
await expectRpcError("create_roll_preinstall_issue", {
  p_request_id: randomUUID(),
  p_issue_id: randomUUID(),
  p_roll_serial: invalidRoll.serial_number,
  p_category: "manufacturing_defect",
  p_description: "يجب رفض البلاغ لأن أصل الإنتاج غير صالح رغم وجود سجل فتح تاريخي مصطنع.",
  p_evidence_paths: [],
}, centerToken, "PG_ROLL_ISSUE_PRODUCTION_INVALID");

const suspendCenter = await request(
  `/rest/v1/installation_centers?id=eq.${centerEntityResult.body[0].id}`,
  { method: "PATCH", token: adminToken, body: { status: "suspended" } },
);
assert(suspendCenter.response.ok,
  `Could not suspend Center A boundary fixture: ${suspendCenter.response.status} ${JSON.stringify(suspendCenter.body)}`);
await expectRpcError("list_roll_preinstall_issues", { p_limit: 10, p_offset: 0 }, centerToken, "PG_ROLL_ISSUE_CENTER_INACTIVE");
await expectRpcError("get_roll_preinstall_issue_detail", { p_issue_id: clearedIssue.id }, centerToken, "PG_ROLL_ISSUE_CENTER_INACTIVE");

console.log("Cube K role, private Storage, active-Center read lifecycle, Admin authority, custody, historical access, evidence immutability and Production-state boundaries passed.");