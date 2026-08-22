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
      user_metadata: { display_name: `Cube J ${role}` },
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

function one(result, label) {
  assert(result.response.ok && Array.isArray(result.body) && result.body.length === 1,
    `${label}: ${result.response.status} ${JSON.stringify(result.body)}`);
  return result.body[0];
}

async function expectRpcError(name, body, token, expectedMessage) {
  const result = await rpc(name, body, token);
  assert(!result.response.ok, `${name} unexpectedly succeeded; expected ${expectedMessage}.`);
  assert(result.body?.message === expectedMessage,
    `${name} expected ${expectedMessage}, received ${result.response.status} ${JSON.stringify(result.body)}`);
  return result;
}

function dbContainerName() {
  const names = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" })
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
  const name = names.find((value) => value.startsWith("supabase_db_"));
  assert(name, "Supabase database container was not found for Cube J fixtures.");
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

const emails = {
  admin: "cube-j-admin@example.test",
  centerA: "cube-j-center-a@example.test",
  centerB: "cube-j-center-b@example.test",
};

await createUser({ email: emails.admin, role: "admin" });
const adminToken = await signIn(emails.admin);

const agent = one(await rest("country_agents?select=id", adminToken, {
  method: "POST",
  prefer: true,
  body: {
    code: "CUBE-J-AGENT-EG",
    name: "Cube J Agent",
    country_code: "EG",
  },
}), "Create Cube J Agent");

const dealer = one(await rest("dealers?select=id", adminToken, {
  method: "POST",
  prefer: true,
  body: {
    code: "CUBE-J-DEALER-EG",
    name: "Cube J Dealer",
    country_code: "EG",
    country_agent_id: agent.id,
  },
}), "Create Cube J Dealer");

const centerA = one(await rest("installation_centers?select=id,approval_status,status", adminToken, {
  method: "POST",
  prefer: true,
  body: {
    code: "CUBE-J-CENTER-A",
    name: "Cube J Center A",
    country_code: "EG",
    city: "Cairo",
    dealer_id: dealer.id,
  },
}), "Create Cube J Center A");

const centerB = one(await rest("installation_centers?select=id,status", adminToken, {
  method: "POST",
  prefer: true,
  body: {
    code: "CUBE-J-CENTER-B",
    name: "Cube J Center B",
    country_code: "EG",
    city: "Giza",
    dealer_id: dealer.id,
  },
}), "Create Cube J Center B");

assert(centerA.status === "active", "Opening fixture Center A must be active.");
assert(centerA.approval_status !== "approved", "Opening must be tested without requiring network approval.");

await createUser({ email: emails.centerA, role: "center", centerId: centerA.id });
await createUser({ email: emails.centerB, role: "center", centerId: centerB.id });
const centerAToken = await signIn(emails.centerA);
const centerBToken = await signIn(emails.centerB);

const centerAParty = one(
  await rest(`operational_parties?installation_center_id=eq.${centerA.id}&select=id,transfer_code`, adminToken),
  "Read Center A party",
);
const centerBParty = one(
  await rest(`operational_parties?installation_center_id=eq.${centerB.id}&select=id,transfer_code`, adminToken),
  "Read Center B party",
);

const product = one(await rest("products?select=id,code", adminToken, {
  method: "POST",
  prefer: true,
  body: {
    code: "PG-CUBE-J-TEST",
    name: "Cube J Opening Test PPF",
    slug: "cube-j-opening-test-ppf",
    product_type: "PPF",
    category: "Paint Protection Film",
    version_name: "Cube J",
    width_mm: 1524,
    length_m: 15,
    thickness_mil: 7.5,
    weight_kg: 12.5,
    origin_country: "USA",
    default_warranty_months: 120,
    marketing_description: "Cube J opening contract fixture.",
    technical_description: "Cube J opening contract fixture.",
    features: ["Opening fixture"],
    warranty_coverage: "Test coverage.",
    care_instructions: "Test care.",
    publication_status: "draft",
  },
}), "Create Cube J Product");

const orderResult = await rpc("create_production_order", {
  p_request_id: randomUUID(),
  p_product_id: product.id,
  p_production_date: "2026-08-22",
  p_lots: [{ quantity: 6, source_reference: "CUBE-J-LOT" }],
  p_source_reference: "CUBE-J-OPENING",
  p_notes: "Cube J opening verification",
}, adminToken);
assert(orderResult.response.ok && typeof orderResult.body === "string",
  `Could not create Cube J production order: ${orderResult.response.status} ${JSON.stringify(orderResult.body)}`);

const rollResult = await rest(
  `rolls?production_order_id=eq.${encodeURIComponent(orderResult.body)}&select=id,serial_number&order=serial_number.asc`,
  adminToken,
);
assert(rollResult.response.ok && rollResult.body.length === 6,
  `Expected six Cube J Rolls: ${JSON.stringify(rollResult.body)}`);
const rolls = rollResult.body;

for (const roll of rolls) {
  runSql(`
begin;
update public.roll_custody_current
set custodian_party_id = ${sqlUuid(centerAParty.id)}, confirmed_at = now()
where roll_id = ${sqlUuid(roll.id)};
insert into public.roll_custody_events (
  roll_id, custody_sequence, custodian_party_id, confirmed_at
) values (
  ${sqlUuid(roll.id)}, 2, ${sqlUuid(centerAParty.id)}, now()
);
commit;
`);
}

const openingRequestId = randomUUID();
const openingResult = await rpc("open_roll", {
  p_request_id: openingRequestId,
  p_roll_serial: rolls[0].serial_number.toLowerCase(),
}, centerAToken);
assert(openingResult.response.ok && openingResult.body === rolls[0].id,
  `Center Opening failed: ${openingResult.response.status} ${JSON.stringify(openingResult.body)}`);

const openingRetry = await rpc("open_roll", {
  p_request_id: openingRequestId,
  p_roll_serial: rolls[0].serial_number,
}, centerAToken);
assert(openingRetry.response.ok && openingRetry.body === rolls[0].id,
  `Matching Opening retry failed: ${openingRetry.response.status} ${JSON.stringify(openingRetry.body)}`);

await expectRpcError("open_roll", {
  p_request_id: openingRequestId,
  p_roll_serial: rolls[1].serial_number,
}, centerAToken, "PG_ROLL_OPENING_REQUEST_CONFLICT");

await expectRpcError("open_roll", {
  p_request_id: randomUUID(),
  p_roll_serial: rolls[0].serial_number,
}, centerAToken, "PG_ROLL_ALREADY_OPENED");

await expectRpcError("open_roll", {
  p_request_id: randomUUID(),
  p_roll_serial: rolls[1].serial_number,
}, adminToken, "PG_ROLL_OPENING_CENTER_REQUIRED");

await expectRpcError("open_roll", {
  p_request_id: randomUUID(),
  p_roll_serial: rolls[1].serial_number,
}, centerBToken, "PG_ROLL_OPENING_NOT_CURRENT_CUSTODIAN");

const custodyAfterOpening = querySql(
  `select custodian_party_id from public.roll_custody_current where roll_id = ${sqlUuid(rolls[0].id)};`,
);
assert(custodyAfterOpening === centerAParty.id, "Opening must not move confirmed custody.");

const transferRequestId = randomUUID();
const transferResult = await rpc("create_roll_transfer", {
  p_request_id: transferRequestId,
  p_recipient_transfer_code: centerBParty.transfer_code,
  p_roll_ids: [rolls[2].id],
}, centerAToken);
assert(transferResult.response.ok && typeof transferResult.body === "string",
  `Could not create reservation fixture Transfer: ${transferResult.response.status} ${JSON.stringify(transferResult.body)}`);

await expectRpcError("open_roll", {
  p_request_id: randomUUID(),
  p_roll_serial: rolls[2].serial_number,
}, centerAToken, "PG_ROLL_OPENING_TRANSFER_RESERVED");

await expectRpcError("create_roll_transfer", {
  p_request_id: randomUUID(),
  p_recipient_transfer_code: centerBParty.transfer_code,
  p_roll_ids: [rolls[0].id],
}, centerAToken, "PG_TRANSFER_ROLL_OPENED");

const centerAOpenings = await rest(
  "roll_openings?select=roll_id,opened_by_center_party_id,opened_at&order=opened_at.asc",
  centerAToken,
);
assert(centerAOpenings.response.ok && centerAOpenings.body.length === 1,
  `Origin Center should read its Opening: ${centerAOpenings.response.status} ${JSON.stringify(centerAOpenings.body)}`);

const centerBOpenings = await rest("roll_openings?select=roll_id", centerBToken);
assert(centerBOpenings.response.ok && centerBOpenings.body.length === 0,
  `Other Center must not read Opening history: ${centerBOpenings.response.status} ${JSON.stringify(centerBOpenings.body)}`);

const adminOpenings = await rest("roll_openings?select=roll_id", adminToken);
assert(adminOpenings.response.ok && adminOpenings.body.some((row) => row.roll_id === rolls[0].id),
  `Admin should read Roll Openings: ${adminOpenings.response.status} ${JSON.stringify(adminOpenings.body)}`);

expectSqlFailure(
  `update public.roll_openings set opened_at = now() where roll_id = ${sqlUuid(rolls[0].id)};`,
  "PG_ROLL_OPENING_IMMUTABLE",
);
expectSqlFailure(
  `delete from public.roll_openings where roll_id = ${sqlUuid(rolls[0].id)};`,
  "PG_ROLL_OPENING_IMMUTABLE",
);
expectSqlFailure(
  `update public.roll_transfers set transfer_kind = 'opened_roll_recovery' where id = ${sqlUuid(transferResult.body)};`,
  "PG_TRANSFER_KIND_IMMUTABLE",
);

const transferKind = querySql(
  `select transfer_kind from public.roll_transfers where id = ${sqlUuid(transferResult.body)};`,
);
assert(transferKind === "standard", "Ordinary Transfer must default to standard kind.");

// Concurrency contract: Opening and a new standard Transfer for the same held
// Roll cannot both commit. The shared Production/Custody lock order makes one
// winner visible to the other before it checks reservation/opened eligibility.
const raceOpeningRequest = randomUUID();
const raceTransferRequest = randomUUID();
const [raceOpening, raceTransfer] = await Promise.all([
  rpc("open_roll", {
    p_request_id: raceOpeningRequest,
    p_roll_serial: rolls[4].serial_number,
  }, centerAToken),
  rpc("create_roll_transfer", {
    p_request_id: raceTransferRequest,
    p_recipient_transfer_code: centerBParty.transfer_code,
    p_roll_ids: [rolls[4].id],
  }, centerAToken),
]);

const raceSuccesses = [raceOpening.response.ok, raceTransfer.response.ok].filter(Boolean).length;
assert(raceSuccesses === 1,
  `Exactly one Opening/Transfer race action must succeed: opening=${raceOpening.response.status} ${JSON.stringify(raceOpening.body)}, transfer=${raceTransfer.response.status} ${JSON.stringify(raceTransfer.body)}`);

if (raceOpening.response.ok) {
  assert(raceTransfer.body?.message === "PG_TRANSFER_ROLL_OPENED",
    `Transfer loser should observe opened Roll: ${JSON.stringify(raceTransfer.body)}`);
} else {
  assert(raceOpening.body?.message === "PG_ROLL_OPENING_TRANSFER_RESERVED",
    `Opening loser should observe active reservation: ${JSON.stringify(raceOpening.body)}`);
}

const raceOpeningCount = Number(querySql(
  `select count(*) from public.roll_openings where roll_id = ${sqlUuid(rolls[4].id)};`,
));
const raceReservationCount = Number(querySql(
  `select count(*) from public.roll_transfer_reservations where roll_id = ${sqlUuid(rolls[4].id)};`,
));
assert(raceOpeningCount + raceReservationCount === 1,
  `Race must leave exactly one durable state, opening=${raceOpeningCount}, reservation=${raceReservationCount}.`);

console.log("Cube J Roll Opening database contracts verified.");
