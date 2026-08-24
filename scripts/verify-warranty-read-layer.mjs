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
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
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

async function signIn(email) {
  const result = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email, password },
  });
  assert(result.response.ok && result.body?.access_token,
    `Could not sign in ${email}: ${result.response.status} ${JSON.stringify(result.body)}`);
  return result.body.access_token;
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
      user_metadata: { display_name: `Cube M Read ${role}` },
    },
  });
  assert(result.response.ok && result.body?.id,
    `Could not create ${role} read user: ${result.response.status} ${JSON.stringify(result.body)}`);
  return result.body;
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
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
  const name = names.find((value) => value.startsWith("supabase_db_"));
  assert(name, "Supabase database container was not found for Cube M read verification.");
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
    ["exec", "-i", dbContainerName(), "psql", "-At", "-F", "|", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-c", sql],
    { encoding: "utf8" },
  ).trim();
}

function sqlUuid(value) {
  assert(/^[0-9a-f-]{36}$/i.test(value), `Unsafe UUID fixture value: ${value}`);
  return `'${value}'::uuid`;
}

const adminToken = await signIn("cube-j-admin@example.test");
const centerAToken = await signIn("cube-j-center-a@example.test");
const centerBToken = await signIn("cube-j-center-b@example.test");

const agent = one(await rest("country_agents?code=eq.CUBE-J-AGENT-EG&select=id", adminToken), "Read Cube M Agent");
const dealer = one(await rest("dealers?code=eq.CUBE-J-DEALER-EG&select=id", adminToken), "Read Cube M Dealer");
const centerA = one(await rest("installation_centers?code=eq.CUBE-J-CENTER-A&select=id,name", adminToken), "Read Center A");
const centerB = one(await rest("installation_centers?code=eq.CUBE-J-CENTER-B&select=id", adminToken), "Read Center B");
const centerAParty = one(await rest(
  `operational_parties?installation_center_id=eq.${centerA.id}&select=id`, adminToken,
), "Read Center A party");

await createUser({ email: "cube-m-read-agent@example.test", role: "agent", countryAgentId: agent.id });
await createUser({ email: "cube-m-read-dealer@example.test", role: "dealer", dealerId: dealer.id });
const agentToken = await signIn("cube-m-read-agent@example.test");
const dealerToken = await signIn("cube-m-read-dealer@example.test");

for (const role of ["anon", "service_role"]) {
  assert(querySql(`
    select has_function_privilege(
      '${role}',
      'public.list_internal_warranties(integer,integer,text,text)',
      'EXECUTE'
    );
  `) === "f", `${role} must not execute internal Warranty list.`);
  assert(querySql(`
    select has_function_privilege(
      '${role}',
      'public.get_internal_warranty_detail(uuid)',
      'EXECUTE'
    );
  `) === "f", `${role} must not execute internal Warranty detail.`);
}
for (const signature of [
  "public.list_internal_warranties(integer,integer,text,text)",
  "public.get_internal_warranty_detail(uuid)",
]) {
  assert(querySql(`select has_function_privilege('authenticated', '${signature}', 'EXECUTE');`) === "t",
    `authenticated must receive explicit EXECUTE on ${signature}.`);
}
for (const role of ["anon", "authenticated", "service_role"]) {
  assert(querySql(`select has_table_privilege('${role}', 'public.warranties', 'SELECT');`) === "f",
    `${role} must not have direct SELECT on public.warranties.`);
  assert(querySql(`select has_table_privilege('${role}', 'public.warranty_events', 'SELECT');`) === "f",
    `${role} must not have direct SELECT on public.warranty_events.`);
}

const targetParts = querySql(`
  select concat_ws('|',
    warranty.id,
    warranty.warranty_number,
    warranty.roll_id,
    roll.serial_number,
    warranty.customer_phone,
    warranty.vehicle_vin,
    warranty.customer_name
  )
  from public.warranties warranty
  join public.rolls roll on roll.id = warranty.roll_id
  where warranty.customer_name = 'Cube M Customer'
    and warranty.vehicle_vin = 'ABC123XYZ789'
    and warranty.record_state = 'issued'
  order by warranty.activated_at desc, warranty.id desc
  limit 1;
`).split("|");
assert(targetParts.length === 7 && targetParts.every(Boolean), `Issued read fixture missing: ${targetParts}`);
const [targetWarrantyId, targetWarrantyNumber, targetRollId, targetRollSerial, targetPhone, targetVin, targetCustomerName] = targetParts;

const voidedParts = querySql(`
  select concat_ws('|', warranty.id, warranty.warranty_number, warranty.void_reason)
  from public.warranties warranty
  where warranty.customer_name = 'Cube M Customer'
    and warranty.vehicle_vin = 'ABC123XYZ789'
    and warranty.record_state = 'voided_in_error'
  order by warranty.activated_at desc, warranty.id desc
  limit 1;
`).split("|");
assert(voidedParts.length === 3 && voidedParts.every(Boolean), `Voided read fixture missing: ${voidedParts}`);
const [voidedWarrantyId, voidedWarrantyNumber, voidedReason] = voidedParts;

const centerList = await rpc("list_internal_warranties", {}, centerAToken);
assert(centerList.response.ok && Array.isArray(centerList.body) && centerList.body.some((row) => row.warranty_id === targetWarrantyId),
  `Center A must see its Warranty history: ${centerList.response.status} ${JSON.stringify(centerList.body)}`);
assert(centerList.body.every((row) => row.activating_center_name === centerA.name),
  "Center registry must not leak other Centers' Warranty history.");

const centerBList = await rpc("list_internal_warranties", {}, centerBToken);
assert(centerBList.response.ok && Array.isArray(centerBList.body) && !centerBList.body.some((row) => row.warranty_id === targetWarrantyId),
  `Center B must not see Center A Warranty history: ${JSON.stringify(centerBList.body)}`);

const adminList = await rpc("list_internal_warranties", {}, adminToken);
assert(adminList.response.ok && Array.isArray(adminList.body) && adminList.body.some((row) => row.warranty_id === targetWarrantyId),
  `Admin must read all internal Warranties: ${JSON.stringify(adminList.body)}`);

for (const search of [targetWarrantyNumber.toLowerCase(), targetRollSerial.toLowerCase(), " abc 123 xyz789 ", targetPhone]) {
  const result = await rpc("list_internal_warranties", { p_search: search }, adminToken);
  assert(result.response.ok && result.body.some((row) => row.warranty_id === targetWarrantyId),
    `Admin exact Warranty search failed for ${search}: ${result.response.status} ${JSON.stringify(result.body)}`);
}

const isolatedSearch = await rpc("list_internal_warranties", { p_search: targetWarrantyNumber }, centerBToken);
assert(isolatedSearch.response.ok && isolatedSearch.body.length === 0,
  "Exact search must not become a cross-Center existence oracle.");

const voidedList = await rpc("list_internal_warranties", { p_record_state: "voided_in_error" }, centerAToken);
assert(voidedList.response.ok && voidedList.body.some((row) => row.warranty_id === voidedWarrantyId),
  `Center must retain its voided historical Warranty record: ${JSON.stringify(voidedList.body)}`);
assert(voidedList.body.every((row) => row.record_state === "voided_in_error" && row.derived_state === "voided"),
  "Voided filter/derived state contract is inconsistent.");

const pageOne = await rpc("list_internal_warranties", { p_limit: 1, p_offset: 0 }, centerAToken);
const pageTwo = await rpc("list_internal_warranties", { p_limit: 1, p_offset: 1 }, centerAToken);
assert(pageOne.response.ok && pageTwo.response.ok && pageOne.body.length === 1 && pageTwo.body.length === 1,
  "Bounded Warranty pagination must return one row per requested page.");
assert(pageOne.body[0].warranty_id !== pageTwo.body[0].warranty_id,
  "Warranty pagination offset must advance deterministically.");

await expectRpcError("list_internal_warranties", { p_limit: 101 }, adminToken, "PG_WARRANTY_LIST_PAGING_INVALID");
await expectRpcError("list_internal_warranties", { p_search: "ab" }, adminToken, "PG_WARRANTY_SEARCH_INVALID");
await expectRpcError("list_internal_warranties", { p_record_state: "cancelled" }, adminToken, "PG_WARRANTY_FILTER_INVALID");

const centerDetail = one(await rpc("get_internal_warranty_detail", {
  p_warranty_id: targetWarrantyId,
}, centerAToken), "Center Warranty detail");
assert(centerDetail.warranty_number === targetWarrantyNumber
  && centerDetail.customer_name === targetCustomerName
  && centerDetail.customer_phone === targetPhone
  && centerDetail.vehicle_vin === targetVin
  && centerDetail.roll_id === targetRollId
  && centerDetail.roll_serial === targetRollSerial,
  `Center detail must return the exact snapshotted Warranty: ${JSON.stringify(centerDetail)}`);
assert(centerDetail.derived_state === "active", "Current issued fixture should derive active Warranty state.");
assert(centerDetail.admin_void_reason === null, "Center detail must never expose internal void reason.");

const centerVoidedDetail = one(await rpc("get_internal_warranty_detail", {
  p_warranty_id: voidedWarrantyId,
}, centerAToken), "Center voided Warranty detail");
assert(centerVoidedDetail.derived_state === "voided" && centerVoidedDetail.admin_void_reason === null,
  "Center may see void state but not internal support reason.");

const adminVoidedDetail = one(await rpc("get_internal_warranty_detail", {
  p_warranty_id: voidedWarrantyId,
}, adminToken), "Admin voided Warranty detail");
assert(adminVoidedDetail.warranty_number === voidedWarrantyNumber
  && adminVoidedDetail.admin_void_reason === voidedReason,
  "Admin detail must include internal void reason for support context.");

await expectRpcError("get_internal_warranty_detail", {
  p_warranty_id: targetWarrantyId,
}, centerBToken, "PG_WARRANTY_NOT_FOUND");
await expectRpcError("list_internal_warranties", {}, agentToken, "PG_WARRANTY_FORBIDDEN");
await expectRpcError("list_internal_warranties", {}, dealerToken, "PG_WARRANTY_FORBIDDEN");
await expectRpcError("get_internal_warranty_detail", { p_warranty_id: targetWarrantyId }, agentToken, "PG_WARRANTY_FORBIDDEN");
await expectRpcError("get_internal_warranty_detail", { p_warranty_id: targetWarrantyId }, dealerToken, "PG_WARRANTY_FORBIDDEN");

const directRead = await rest("warranties?select=id&limit=1", centerAToken);
assert(!directRead.response.ok && directRead.body?.code === "42501",
  `Direct Warranty table read must remain denied: ${directRead.response.status} ${JSON.stringify(directRead.body)}`);

const expiredWarrantyId = randomUUID();
const expiredRequestId = randomUUID();
const expiredEventRequestId = randomUUID();
const unusedRoll = querySql(`
  select r.id
  from public.rolls r
  where not exists (
    select 1 from public.warranties warranty
    where warranty.roll_id = r.id and warranty.record_state = 'issued'
  )
  order by r.created_at, r.id
  limit 1;
`);
assert(/^[0-9a-f-]{36}$/i.test(unusedRoll), `No Roll available for expired read fixture: ${unusedRoll}`);
const centerAProfileId = querySql(`
  select id from public.profiles
  where installation_center_id = ${sqlUuid(centerA.id)} and role = 'center'
  order by created_at, id limit 1;
`);
runSql(`
  insert into public.warranties (
    id, request_id, roll_id, warranty_number, record_state,
    activated_by_profile_id, activating_center_party_id, activating_center_name_snapshot,
    activated_at, coverage_expires_at,
    product_id, product_code_snapshot, product_name_snapshot, product_version_snapshot,
    warranty_months_snapshot, warranty_coverage_snapshot, care_instructions_snapshot,
    customer_name, customer_phone, customer_email,
    vehicle_make, vehicle_model, vehicle_year, vehicle_plate, vehicle_color, vehicle_vin
  )
  select
    ${sqlUuid(expiredWarrantyId)}, ${sqlUuid(expiredRequestId)}, r.id, 'PG-W-99999990', 'issued',
    ${sqlUuid(centerAProfileId)}, ${sqlUuid(centerAParty.id)}, c.name,
    '2018-01-15T10:00:00Z'::timestamptz, '2019-01-15T10:00:00Z'::timestamptz,
    po.product_id, po.product_code_snapshot, po.product_name_snapshot, po.product_version_snapshot,
    12, 'Expired read fixture coverage.', 'Expired read fixture care.',
    'Expired Read Customer', '+201055555555', null,
    'Test Make', 'Test Model', 2018, null, null, 'EXPIRED12345'
  from public.rolls r
  join public.production_orders po on po.id = r.production_order_id
  join public.installation_centers c on c.id = ${sqlUuid(centerA.id)}
  where r.id = ${sqlUuid(unusedRoll)};

  insert into public.warranty_events (
    warranty_id, action_request_id, event_kind, actor_profile_id
  ) values (
    ${sqlUuid(expiredWarrantyId)}, ${sqlUuid(expiredEventRequestId)}, 'activated', ${sqlUuid(centerAProfileId)}
  );
`);
const expiredSearch = one(await rpc("list_internal_warranties", {
  p_search: "PG-W-99999990",
}, centerAToken), "Expired Warranty registry state");
assert(expiredSearch.derived_state === "expired", "Elapsed issued Warranty must derive expired state without cron mutation.");
const expiredDetail = one(await rpc("get_internal_warranty_detail", {
  p_warranty_id: expiredWarrantyId,
}, centerAToken), "Expired Warranty detail state");
assert(expiredDetail.derived_state === "expired", "Warranty detail must derive expiry from timestamps.");

runSql(`update public.installation_centers set status = 'inactive' where id = ${sqlUuid(centerB.id)};`);
await expectRpcError("list_internal_warranties", {}, centerBToken, "PG_WARRANTY_CENTER_INACTIVE");
runSql(`update public.installation_centers set status = 'active' where id = ${sqlUuid(centerB.id)};`);

console.log("Cube M internal Warranty read layer verified.");
