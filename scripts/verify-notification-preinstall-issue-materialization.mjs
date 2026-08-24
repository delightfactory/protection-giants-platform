import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const apiUrl = process.env.API_URL;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
const anonKey = process.env.ANON_KEY;

if (!apiUrl || !serviceRoleKey || !anonKey) {
  throw new Error("Local Supabase API_URL, SERVICE_ROLE_KEY and ANON_KEY are required.");
}

const password = "Cube-L-Preinstall-Notifications-2026!";

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

async function createUser({ email, role, countryAgentId = null, dealerId = null, centerId = null }) {
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
          country_agent_id: countryAgentId,
          dealer_id: dealerId,
          installation_center_id: centerId,
        },
      },
      user_metadata: { display_name: `Cube L QA ${role}` },
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
    .split("\n").map((value) => value.trim()).filter(Boolean);
  const name = names.find((value) => value.startsWith("supabase_db_"));
  assert(name, "Supabase database container was not found for Cube L Pre-install Issue fixtures.");
  return name;
}

function runSql(sql) {
  execFileSync(
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

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function profileId(email) {
  const value = querySql(`
    select p.id
    from public.profiles p
    join auth.users u on u.id = p.id
    where u.email = ${sqlText(email)};
  `);
  assert(/^[0-9a-f-]{36}$/i.test(value), `Profile not found for ${email}`);
  return value;
}

function issueEventId(issueId, eventKind) {
  const value = querySql(`
    select id
    from public.roll_preinstall_issue_events
    where issue_id = ${sqlUuid(issueId)}
      and event_kind = ${sqlText(eventKind)}
    order by created_at desc, id desc
    limit 1;
  `);
  assert(/^[0-9a-f-]{36}$/i.test(value), `Issue event ${eventKind} not found for ${issueId}`);
  return value;
}

function notificationsForEvent(eventId) {
  const raw = querySql(`
    select coalesce(json_agg(json_build_object(
      'profile_id', n.recipient_profile_id,
      'event_type', n.event_type,
      'attention', n.attention_level,
      'title', n.title,
      'body', n.body,
      'action_path', n.action_path,
      'push_eligible', n.push_eligible,
      'source_event_key', n.source_event_key
    ) order by n.recipient_profile_id)::text, '[]')
    from public.notifications n
    where n.source_domain = 'roll_preinstall_issue'
      and n.source_event_key = 'roll_preinstall_issue_events:' || ${sqlUuid(eventId)}::text;
  `);
  return JSON.parse(raw || "[]");
}

function expectRecipients(rows, expectedProfileIds, label) {
  const actual = rows.map((row) => row.profile_id).sort();
  const expected = [...expectedProfileIds].sort();
  assert(JSON.stringify(actual) === JSON.stringify(expected),
    `${label} recipients mismatch. expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)} rows=${JSON.stringify(rows)}`);
  for (const row of rows) {
    assert(row.push_eligible === true, `${label} must remain Push eligible.`);
    assert(/^\/operations\/rolls\/issues\/[0-9a-f-]{36}$/i.test(row.action_path),
      `${label} must use the internal role-valid issue detail route: ${row.action_path}`);
  }
}

function assertPrivateContentAbsent(rows, privateValues, label) {
  for (const row of rows) {
    const content = `${row.title}\n${row.body}`;
    for (const value of privateValues) {
      assert(!content.includes(value), `${label} leaked private issue content: ${value}`);
    }
  }
}

const emails = {
  adminOne: "cube-l-qa-admin-one@example.test",
  adminTwo: "cube-l-qa-admin-two@example.test",
  adminSuspended: "cube-l-qa-admin-suspended@example.test",
  agent: "cube-l-qa-agent@example.test",
  dealer: "cube-l-qa-dealer@example.test",
  centerOne: "cube-l-qa-center-one@example.test",
  centerTwo: "cube-l-qa-center-two@example.test",
  centerSuspended: "cube-l-qa-center-suspended@example.test",
};

await createUser({ email: emails.adminOne, role: "admin" });
await createUser({ email: emails.adminTwo, role: "admin" });
await createUser({ email: emails.adminSuspended, role: "admin" });
const adminToken = await signIn(emails.adminOne);

const agent = one(await rest("country_agents?select=id", adminToken, {
  method: "POST", prefer: true,
  body: { code: "CUBE-L-QA-AGENT", name: "Cube L QA Agent", country_code: "EG" },
}), "Create Cube L QA Agent");

const dealer = one(await rest("dealers?select=id", adminToken, {
  method: "POST", prefer: true,
  body: {
    code: "CUBE-L-QA-DEALER",
    name: "Cube L QA Dealer",
    country_code: "EG",
    country_agent_id: agent.id,
  },
}), "Create Cube L QA Dealer");

const center = one(await rest("installation_centers?select=id", adminToken, {
  method: "POST", prefer: true,
  body: {
    code: "CUBE-L-QA-CENTER",
    name: "Cube L QA Center",
    country_code: "EG",
    city: "Cairo",
    dealer_id: dealer.id,
  },
}), "Create Cube L QA Center");

await createUser({ email: emails.agent, role: "agent", countryAgentId: agent.id });
await createUser({ email: emails.dealer, role: "dealer", dealerId: dealer.id });
await createUser({ email: emails.centerOne, role: "center", centerId: center.id });
await createUser({ email: emails.centerTwo, role: "center", centerId: center.id });
await createUser({ email: emails.centerSuspended, role: "center", centerId: center.id });

const ids = Object.fromEntries(Object.entries(emails).map(([key, email]) => [key, profileId(email)]));
runSql(`
  update public.profiles set status = 'suspended'
  where id in (${sqlUuid(ids.adminSuspended)}, ${sqlUuid(ids.centerSuspended)});
`);

const centerParty = one(
  await rest(`operational_parties?installation_center_id=eq.${center.id}&select=id`, adminToken),
  "Read Cube L QA Center party",
);

const product = one(await rest("products?select=id", adminToken, {
  method: "POST", prefer: true,
  body: {
    code: "PG-CUBE-L-QA",
    name: "Cube L QA Notification PPF",
    slug: "cube-l-qa-notification-ppf",
    product_type: "PPF",
    category: "Paint Protection Film",
    version_name: "Cube L QA",
    width_mm: 1524,
    length_m: 15,
    thickness_mil: 7.5,
    weight_kg: 12.5,
    origin_country: "USA",
    default_warranty_months: 120,
    marketing_description: "Cube L QA fixture.",
    technical_description: "Cube L QA fixture.",
    features: ["Notification fixture"],
    warranty_coverage: "Test coverage.",
    care_instructions: "Test care.",
    publication_status: "draft",
  },
}), "Create Cube L QA Product");

const orderResult = await rpc("create_production_order", {
  p_request_id: randomUUID(),
  p_product_id: product.id,
  p_production_date: "2026-08-23",
  p_lots: [{ quantity: 3, source_reference: "CUBE-L-QA-LOT" }],
  p_source_reference: "CUBE-L-QA-NOTIFICATIONS",
  p_notes: "Cube L 3D verification",
}, adminToken);
assert(orderResult.response.ok && typeof orderResult.body === "string",
  `Could not create production order: ${orderResult.response.status} ${JSON.stringify(orderResult.body)}`);

const rollsResult = await rest(
  `rolls?production_order_id=eq.${encodeURIComponent(orderResult.body)}&select=id,serial_number&order=serial_number.asc`,
  adminToken,
);
assert(rollsResult.response.ok && rollsResult.body.length === 3,
  `Expected three Cube L QA Rolls: ${JSON.stringify(rollsResult.body)}`);
const rolls = rollsResult.body;

for (const roll of rolls) {
  runSql(`
    begin;
    update public.roll_custody_current
    set custodian_party_id = ${sqlUuid(centerParty.id)}, confirmed_at = now()
    where roll_id = ${sqlUuid(roll.id)};
    insert into public.roll_custody_events (
      roll_id, custody_sequence, custodian_party_id, confirmed_at
    ) values (${sqlUuid(roll.id)}, 2, ${sqlUuid(centerParty.id)}, now());
    commit;
  `);
}

const centerToken = await signIn(emails.centerOne);
for (const roll of rolls) {
  const opened = await rpc("open_roll", {
    p_request_id: randomUUID(),
    p_roll_serial: roll.serial_number,
  }, centerToken);
  assert(opened.response.ok && opened.body === roll.id,
    `Could not open ${roll.serial_number}: ${opened.response.status} ${JSON.stringify(opened.body)}`);
}

const privateDescription = "PRIVATE-DEFECT-DESCRIPTION-3D";
const issueIds = [randomUUID(), randomUUID(), randomUUID()];
const createRequests = [randomUUID(), randomUUID(), randomUUID()];

for (let index = 0; index < rolls.length; index += 1) {
  const body = {
    p_request_id: createRequests[index],
    p_issue_id: issueIds[index],
    p_roll_serial: rolls[index].serial_number,
    p_category: index === 0 ? "manufacturing_defect" : "physical_damage",
    p_description: `${privateDescription}-${index} تفاصيل خاصة لا يجب أن تظهر في الإشعار.`,
    p_evidence_paths: [],
  };
  const created = await rpc("create_roll_preinstall_issue", body, centerToken);
  assert(created.response.ok && created.body === issueIds[index],
    `Issue ${index} creation failed: ${created.response.status} ${JSON.stringify(created.body)}`);

  const retry = await rpc("create_roll_preinstall_issue", body, centerToken);
  assert(retry.response.ok && retry.body === issueIds[index],
    `Issue ${index} idempotent create retry failed: ${retry.response.status} ${JSON.stringify(retry.body)}`);

  const eventId = issueEventId(issueIds[index], "submitted");
  const submittedRows = notificationsForEvent(eventId);
  expectRecipients(submittedRows, [ids.adminOne, ids.adminTwo], `L-QA-01 submitted ${index}`);
  assert(submittedRows.every((row) =>
    row.event_type === "roll.preinstall_issue_submitted" && row.attention === "action_required"),
  `L-QA-01 mapping mismatch: ${JSON.stringify(submittedRows)}`);
  assert(submittedRows.every((row) => row.action_path === `/operations/rolls/issues/${issueIds[index]}`),
    `L-QA-01 deep link mismatch: ${JSON.stringify(submittedRows)}`);
  assertPrivateContentAbsent(submittedRows, [`${privateDescription}-${index}`], `L-QA-01 submitted ${index}`);
  assert(submittedRows.length === 2, "Idempotent issue create retry must not duplicate submission notifications.");
}

const decisions = [
  {
    rpcName: "resolve_roll_preinstall_issue",
    eventKind: "cleared_for_use",
    eventType: "roll.preinstall_issue_cleared_for_use",
    attention: "info",
    privateReason: "PRIVATE-RESOLUTION-CLEAR-3D",
    extra: { p_outcome: "cleared_for_use" },
  },
  {
    rpcName: "resolve_roll_preinstall_issue",
    eventKind: "return_required",
    eventType: "roll.preinstall_issue_return_required",
    attention: "action_required",
    privateReason: "PRIVATE-RESOLUTION-RETURN-3D",
    extra: { p_outcome: "return_required" },
  },
  {
    rpcName: "mark_roll_preinstall_issue_reported_in_error",
    eventKind: "reported_in_error",
    eventType: "roll.preinstall_issue_reported_in_error",
    attention: "info",
    privateReason: "PRIVATE-RESOLUTION-ERROR-3D",
    extra: {},
  },
];

for (let index = 0; index < decisions.length; index += 1) {
  const decision = decisions[index];
  const requestId = randomUUID();
  const body = {
    p_request_id: requestId,
    p_issue_id: issueIds[index],
    ...decision.extra,
    p_reason: `${decision.privateReason} سبب داخلي لا يجب أن يظهر في الإشعار.`,
  };
  const resolved = await rpc(decision.rpcName, body, adminToken);
  assert(resolved.response.ok && resolved.body === issueIds[index],
    `${decision.eventKind} failed: ${resolved.response.status} ${JSON.stringify(resolved.body)}`);

  const retry = await rpc(decision.rpcName, body, adminToken);
  assert(retry.response.ok && retry.body === issueIds[index],
    `${decision.eventKind} idempotent retry failed: ${retry.response.status} ${JSON.stringify(retry.body)}`);

  const eventId = issueEventId(issueIds[index], decision.eventKind);
  const rows = notificationsForEvent(eventId);
  expectRecipients(rows, [ids.centerOne, ids.centerTwo], `L-QA outcome ${decision.eventKind}`);
  assert(rows.every((row) => row.event_type === decision.eventType && row.attention === decision.attention),
    `${decision.eventKind} mapping mismatch: ${JSON.stringify(rows)}`);
  assert(rows.every((row) => row.action_path === `/operations/rolls/issues/${issueIds[index]}`),
    `${decision.eventKind} deep link mismatch: ${JSON.stringify(rows)}`);
  assertPrivateContentAbsent(rows,
    [`${privateDescription}-${index}`, decision.privateReason],
    `L-QA outcome ${decision.eventKind}`,
  );
  assert(rows.length === 2, `${decision.eventKind} retry must not duplicate Center notifications.`);
}

const leakedNetworkRecipients = querySql(`
  select count(*)
  from public.notifications n
  where n.source_domain = 'roll_preinstall_issue'
    and n.recipient_profile_id in (${sqlUuid(ids.agent)}, ${sqlUuid(ids.dealer)});
`);
assert(leakedNetworkRecipients === "0",
  `Agent/Dealer must not receive Cube K issue notifications from network membership; got ${leakedNetworkRecipients}.`);

const suspendedRecipients = querySql(`
  select count(*)
  from public.notifications n
  where n.source_domain = 'roll_preinstall_issue'
    and n.recipient_profile_id in (${sqlUuid(ids.adminSuspended)}, ${sqlUuid(ids.centerSuspended)});
`);
assert(suspendedRecipients === "0",
  `Suspended Admin/Center Profiles must not receive Cube K issue notifications; got ${suspendedRecipients}.`);

console.log("Cube L Cube K Pre-install Issue notification materialization verified.");
