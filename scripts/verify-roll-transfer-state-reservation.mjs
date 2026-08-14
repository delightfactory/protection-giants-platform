import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const apiUrl = process.env.API_URL;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
const anonKey = process.env.ANON_KEY;

if (!apiUrl || !serviceRoleKey || !anonKey) {
  throw new Error("Local Supabase API_URL, SERVICE_ROLE_KEY and ANON_KEY are required.");
}

const password = "Roll-Transfer-Cube-F-2026!";

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
      user_metadata: { display_name: `Cube F ${role}` },
    },
  });
  assert(result.response.ok && result.body?.id, `Could not create ${role} user: ${result.response.status} ${JSON.stringify(result.body)}`);
  return result.body;
}

async function signIn(email) {
  const result = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email, password },
  });
  assert(result.response.ok && result.body?.access_token, `Could not sign in ${email}: ${JSON.stringify(result.body)}`);
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

function none(result, label) {
  assert(result.response.ok && Array.isArray(result.body) && result.body.length === 0,
    `${label} unexpectedly returned data: ${result.response.status} ${JSON.stringify(result.body)}`);
}

async function expectRpcError(name, body, token, expectedMessage) {
  const result = await rpc(name, body, token);
  assert(!result.response.ok, `${name} unexpectedly succeeded for ${expectedMessage}.`);
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
  assert(name, "Supabase database container was not found for Cube F fixtures.");
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

function reservationCount(rollId) {
  return Number(querySql(`select count(*) from public.roll_transfer_reservations where roll_id = ${sqlUuid(rollId)};`));
}

function custodyParty(rollId) {
  return querySql(`select custodian_party_id from public.roll_custody_current where roll_id = ${sqlUuid(rollId)};`);
}

const emails = {
  admin: "cube-f-admin@example.test",
  agent: "cube-f-agent@example.test",
  dealerA: "cube-f-dealer-a@example.test",
  dealerB: "cube-f-dealer-b@example.test",
  centerA: "cube-f-center-a@example.test",
  centerB: "cube-f-center-b@example.test",
};

await createUser({ email: emails.admin, role: "admin" });
const adminToken = await signIn(emails.admin);

const agent = one(await rest("country_agents?select=id,code,status", adminToken, {
  method: "POST",
  prefer: true,
  body: {
    code: "CUBE-F-AGENT-EG",
    name: "Cube F Agent",
    country_code: "EG",
  },
}), "Create Cube F Agent");
await createUser({ email: emails.agent, role: "agent", countryAgentId: agent.id });
const agentToken = await signIn(emails.agent);

const dealerA = one(await rest("dealers?select=id,code,status,country_agent_id", adminToken, {
  method: "POST",
  prefer: true,
  body: {
    code: "CUBE-F-DEALER-A",
    name: "Cube F Dealer A",
    country_code: "EG",
    country_agent_id: agent.id,
  },
}), "Create Cube F Dealer A");
const dealerB = one(await rest("dealers?select=id,code,status,country_agent_id", adminToken, {
  method: "POST",
  prefer: true,
  body: {
    code: "CUBE-F-DEALER-B",
    name: "Cube F Dealer B",
    country_code: "EG",
    country_agent_id: agent.id,
  },
}), "Create Cube F Dealer B");
await createUser({ email: emails.dealerA, role: "dealer", dealerId: dealerA.id });
await createUser({ email: emails.dealerB, role: "dealer", dealerId: dealerB.id });
const dealerAToken = await signIn(emails.dealerA);
const dealerBToken = await signIn(emails.dealerB);

const centerA = one(await rest("installation_centers?select=id,code,status,dealer_id", adminToken, {
  method: "POST",
  prefer: true,
  body: {
    code: "CUBE-F-CENTER-A",
    name: "Cube F Center A",
    country_code: "EG",
    city: "Cairo",
    dealer_id: dealerA.id,
  },
}), "Create Cube F Center A");
const centerB = one(await rest("installation_centers?select=id,code,status,dealer_id", adminToken, {
  method: "POST",
  prefer: true,
  body: {
    code: "CUBE-F-CENTER-B",
    name: "Cube F Center B",
    country_code: "EG",
    city: "Giza",
    dealer_id: dealerB.id,
  },
}), "Create Cube F Center B");
const centerWithoutUser = one(await rest("installation_centers?select=id,code,status,dealer_id", adminToken, {
  method: "POST",
  prefer: true,
  body: {
    code: "CUBE-F-CENTER-NO-USER",
    name: "Cube F Center Without User",
    country_code: "EG",
    city: "Alexandria",
    dealer_id: dealerA.id,
  },
}), "Create Center without user");
await createUser({ email: emails.centerA, role: "center", centerId: centerA.id });
await createUser({ email: emails.centerB, role: "center", centerId: centerB.id });
const centerAToken = await signIn(emails.centerA);
const centerBToken = await signIn(emails.centerB);

const parties = {};
for (const [key, filter] of Object.entries({
  company: "party_type=eq.company",
  agent: `country_agent_id=eq.${agent.id}`,
  dealerA: `dealer_id=eq.${dealerA.id}`,
  dealerB: `dealer_id=eq.${dealerB.id}`,
  centerA: `installation_center_id=eq.${centerA.id}`,
  centerB: `installation_center_id=eq.${centerB.id}`,
  centerWithoutUser: `installation_center_id=eq.${centerWithoutUser.id}`,
})) {
  parties[key] = one(
    await rest(`operational_parties?${filter}&select=id,party_type,transfer_code`, adminToken),
    `Read ${key} Operational Party`,
  );
}

const product = one(await rest("products?select=id,code", adminToken, {
  method: "POST",
  prefer: true,
  body: {
    code: "PG-CUBE-F-TEST",
    name: "Cube F Transfer Test PPF",
    slug: "cube-f-transfer-test-ppf",
    product_type: "PPF",
    category: "Paint Protection Film",
    version_name: "Cube F",
    width_mm: 1524,
    length_m: 15,
    thickness_mil: 7.5,
    weight_kg: 12.5,
    origin_country: "USA",
    default_warranty_months: 120,
    marketing_description: "Cube F transfer contract fixture.",
    technical_description: "Cube F transfer contract fixture.",
    features: ["Transfer fixture"],
    warranty_coverage: "Test coverage.",
    care_instructions: "Test care.",
    publication_status: "draft",
  },
}), "Create Cube F Product");

async function createOrder(quantity, sourceReference) {
  const result = await rpc("create_production_order", {
    p_request_id: randomUUID(),
    p_product_id: product.id,
    p_production_date: "2026-08-14",
    p_lots: [{ quantity, source_reference: `${sourceReference}-LOT` }],
    p_source_reference: sourceReference,
    p_notes: "Cube F verification",
  }, adminToken);
  assert(result.response.ok && typeof result.body === "string",
    `Could not create production order ${sourceReference}: ${result.response.status} ${JSON.stringify(result.body)}`);
  return result.body;
}

const routeOrderId = await createOrder(18, "CUBE-F-ROUTES");
const routeRollResult = await rest(
  `rolls?production_order_id=eq.${encodeURIComponent(routeOrderId)}&select=id,serial_number&order=serial_number.asc`,
  adminToken,
);
assert(routeRollResult.response.ok && routeRollResult.body.length === 18,
  `Expected 18 route Rolls: ${JSON.stringify(routeRollResult.body)}`);
const routeRolls = routeRollResult.body;

function assignCustody(roll, party) {
  runSql(`
begin;
update public.roll_custody_current
set custodian_party_id = ${sqlUuid(party.id)}, confirmed_at = now()
where roll_id = ${sqlUuid(roll.id)};
insert into public.roll_custody_events (
  roll_id, custody_sequence, custodian_party_id, confirmed_at
) values (
  ${sqlUuid(roll.id)}, 2, ${sqlUuid(party.id)}, now()
);
commit;
`);
}

for (const index of [2, 3, 4]) assignCustody(routeRolls[index], parties.agent);
for (const index of [5, 6, 7, 8]) assignCustody(routeRolls[index], parties.dealerA);
assignCustody(routeRolls[9], parties.dealerB);
for (const index of [10, 11, 12]) assignCustody(routeRolls[index], parties.centerA);
assignCustody(routeRolls[13], parties.centerB);

async function createTransfer(token, recipientCode, rollIds, requestId = randomUUID()) {
  const result = await rpc("create_roll_transfer", {
    p_request_id: requestId,
    p_recipient_transfer_code: recipientCode,
    p_roll_ids: rollIds,
  }, token);
  assert(result.response.ok && typeof result.body === "string",
    `Transfer creation failed: ${result.response.status} ${JSON.stringify(result.body)}`);
  return { id: result.body, requestId };
}

async function assertTransferStatus(transferId, token, expectedStatus) {
  const row = one(await rest(
    `roll_transfers?id=eq.${transferId}&select=id,transfer_number,status,roll_count,sender_party_id,recipient_party_id,closed_at`,
    token,
  ), `Read Transfer ${transferId}`);
  assert(row.status === expectedStatus, `Expected ${expectedStatus}, got ${row.status}`);
  assert(/^PG-T-\d{8}-\d{8}$/.test(row.transfer_number), `Invalid Transfer number: ${row.transfer_number}`);
  return row;
}

async function createAndCancel({ senderToken, senderParty, recipientParty, roll, label }) {
  assert(custodyParty(roll.id) === senderParty.id, `${label}: fixture custody is wrong.`);
  const transfer = await createTransfer(senderToken, recipientParty.transfer_code, [roll.id]);
  const pending = await assertTransferStatus(transfer.id, senderToken, "pending");
  assert(pending.roll_count === 1, `${label}: roll_count is not 1.`);
  assert(pending.sender_party_id === senderParty.id && pending.recipient_party_id === recipientParty.id,
    `${label}: sender/recipient identity mismatch.`);
  assert(reservationCount(roll.id) === 1, `${label}: active reservation was not created.`);
  assert(custodyParty(roll.id) === senderParty.id, `${label}: creation moved confirmed custody.`);

  const cancelled = await rpc("cancel_roll_transfer", { p_transfer_id: transfer.id }, senderToken);
  assert(cancelled.response.ok && cancelled.body === transfer.id,
    `${label}: sender cancellation failed: ${JSON.stringify(cancelled.body)}`);
  const retry = await rpc("cancel_roll_transfer", { p_transfer_id: transfer.id }, senderToken);
  assert(retry.response.ok && retry.body === transfer.id, `${label}: idempotent cancellation retry failed.`);
  await assertTransferStatus(transfer.id, senderToken, "cancelled");
  assert(reservationCount(roll.id) === 0, `${label}: cancellation did not release reservation.`);
  assert(custodyParty(roll.id) === senderParty.id, `${label}: cancellation changed custody.`);
}

const routeCases = [
  { label: "Company -> Agent", senderToken: adminToken, senderParty: parties.company, recipientParty: parties.agent, roll: routeRolls[0] },
  { label: "Company -> Center", senderToken: adminToken, senderParty: parties.company, recipientParty: parties.centerA, roll: routeRolls[1] },
  { label: "Agent -> Dealer", senderToken: agentToken, senderParty: parties.agent, recipientParty: parties.dealerA, roll: routeRolls[2] },
  { label: "Agent -> Center", senderToken: agentToken, senderParty: parties.agent, recipientParty: parties.centerA, roll: routeRolls[3] },
  { label: "Dealer -> Dealer", senderToken: dealerAToken, senderParty: parties.dealerA, recipientParty: parties.dealerB, roll: routeRolls[5] },
  { label: "Dealer -> Center", senderToken: dealerAToken, senderParty: parties.dealerA, recipientParty: parties.centerA, roll: routeRolls[6] },
  { label: "Center -> Center", senderToken: centerAToken, senderParty: parties.centerA, recipientParty: parties.centerB, roll: routeRolls[10] },
  { label: "Center -> Dealer", senderToken: centerAToken, senderParty: parties.centerA, recipientParty: parties.dealerA, roll: routeRolls[11] },
  { label: "Dealer -> Company", senderToken: dealerAToken, senderParty: parties.dealerA, recipientParty: parties.company, roll: routeRolls[7] },
];

for (const routeCase of routeCases) {
  await createAndCancel(routeCase);
}

// A Center exists as a recipient independently from Center-user onboarding.
await createAndCancel({
  label: "Company -> Center without user",
  senderToken: adminToken,
  senderParty: parties.company,
  recipientParty: parties.centerWithoutUser,
  roll: routeRolls[14],
});

// Recipient rejection is terminal, idempotent on the same path, releases only
// the reservation and never changes confirmed custody.
const rejection = await createTransfer(agentToken, parties.centerA.transfer_code, [routeRolls[4].id]);
assert(reservationCount(routeRolls[4].id) === 1, "Rejection fixture reservation is missing.");
const rejected = await rpc("reject_roll_transfer", { p_transfer_id: rejection.id }, centerAToken);
assert(rejected.response.ok && rejected.body === rejection.id, `Recipient rejection failed: ${JSON.stringify(rejected.body)}`);
const rejectionRetry = await rpc("reject_roll_transfer", { p_transfer_id: rejection.id }, centerAToken);
assert(rejectionRetry.response.ok && rejectionRetry.body === rejection.id, "Recipient rejection retry was not idempotent.");
await assertTransferStatus(rejection.id, centerAToken, "rejected");
assert(reservationCount(routeRolls[4].id) === 0, "Rejection did not release reservation.");
assert(custodyParty(routeRolls[4].id) === parties.agent.id, "Rejection moved confirmed custody.");
await expectRpcError("cancel_roll_transfer", { p_transfer_id: rejection.id }, agentToken, "PG_TRANSFER_INVALID_STATE");

// Payload-safe idempotency accepts order-insensitive retries and rejects every
// request-id reuse that changes ownership, recipient, or immutable membership.
const idempotencyRequestId = randomUUID();
const idempotentRolls = [routeRolls[5].id, routeRolls[8].id];
const idempotentTransfer = await createTransfer(
  dealerAToken,
  parties.centerA.transfer_code,
  idempotentRolls,
  idempotencyRequestId,
);
const reorderedRetry = await rpc("create_roll_transfer", {
  p_request_id: idempotencyRequestId,
  p_recipient_transfer_code: parties.centerA.transfer_code,
  p_roll_ids: [...idempotentRolls].reverse(),
}, dealerAToken);
assert(reorderedRetry.response.ok && reorderedRetry.body === idempotentTransfer.id,
  `Matching idempotent retry failed: ${JSON.stringify(reorderedRetry.body)}`);
assert(Number(querySql(`select count(*) from public.roll_transfer_events where transfer_id = ${sqlUuid(idempotentTransfer.id)};`)) === 1,
  "Idempotent retry duplicated Transfer events.");
assert(Number(querySql(`select count(*) from public.roll_transfer_reservations where transfer_id = ${sqlUuid(idempotentTransfer.id)};`)) === 2,
  "Idempotent retry duplicated or lost reservations.");
await expectRpcError("create_roll_transfer", {
  p_request_id: idempotencyRequestId,
  p_recipient_transfer_code: parties.dealerB.transfer_code,
  p_roll_ids: idempotentRolls,
}, dealerAToken, "PG_TRANSFER_REQUEST_PAYLOAD_CONFLICT");
await expectRpcError("create_roll_transfer", {
  p_request_id: idempotencyRequestId,
  p_recipient_transfer_code: parties.centerA.transfer_code,
  p_roll_ids: [routeRolls[8].id],
}, dealerAToken, "PG_TRANSFER_REQUEST_PAYLOAD_CONFLICT");
await expectRpcError("create_roll_transfer", {
  p_request_id: idempotencyRequestId,
  p_recipient_transfer_code: parties.centerA.transfer_code,
  p_roll_ids: idempotentRolls,
}, centerAToken, "PG_TRANSFER_REQUEST_ACTOR_CONFLICT");
await expectRpcError("create_roll_transfer", {
  p_request_id: randomUUID(),
  p_recipient_transfer_code: parties.centerB.transfer_code,
  p_roll_ids: [routeRolls[5].id],
}, dealerAToken, "PG_TRANSFER_ROLL_RESERVED");

// Only sender, recipient and active Admin may read the Transfer timeline.
await assertTransferStatus(idempotentTransfer.id, dealerAToken, "pending");
await assertTransferStatus(idempotentTransfer.id, centerAToken, "pending");
await assertTransferStatus(idempotentTransfer.id, adminToken, "pending");
none(await rest(`roll_transfers?id=eq.${idempotentTransfer.id}&select=id`, dealerBToken), "Unrelated Dealer reads Transfer");
none(await rest(`roll_transfer_items?transfer_id=eq.${idempotentTransfer.id}&select=roll_id`, dealerBToken), "Unrelated Dealer reads Transfer items");
none(await rest(`roll_transfer_events?transfer_id=eq.${idempotentTransfer.id}&select=id`, dealerBToken), "Unrelated Dealer reads Transfer events");

const reservationBrowse = await rest("roll_transfer_reservations?select=roll_id,transfer_id", adminToken);
assert(!reservationBrowse.response.ok, "Admin Data API unexpectedly browsed internal reservations.");
const directHeaderPatch = await rest(`roll_transfers?id=eq.${idempotentTransfer.id}`, dealerAToken, {
  method: "PATCH",
  body: { status: "cancelled", closed_at: new Date().toISOString() },
});
assert(!directHeaderPatch.response.ok, "Participant directly mutated Transfer header.");
const directItemDelete = await rest(`roll_transfer_items?transfer_id=eq.${idempotentTransfer.id}`, dealerAToken, { method: "DELETE" });
assert(!directItemDelete.response.ok, "Participant directly deleted Transfer membership.");
const directEventInsert = await rest("roll_transfer_events", dealerAToken, {
  method: "POST",
  body: {
    transfer_id: idempotentTransfer.id,
    event_sequence: 99,
    event_type: "cancelled",
    actor_profile_id: randomUUID(),
    actor_party_id: parties.dealerA.id,
  },
});
assert(!directEventInsert.response.ok, "Participant directly appended Transfer history.");
const serviceHeaders = await request("/rest/v1/roll_transfers?select=id", {
  key: serviceRoleKey,
  token: serviceRoleKey,
});
assert(!serviceHeaders.response.ok, "Service-role Data API unexpectedly received Transfer table access.");

// Stable failure taxonomy for invalid inputs and authority boundaries.
await expectRpcError("create_roll_transfer", {
  p_request_id: randomUUID(),
  p_recipient_transfer_code: "not-a-transfer-id",
  p_roll_ids: [routeRolls[15].id],
}, adminToken, "PG_TRANSFER_RECIPIENT_INVALID");
await expectRpcError("create_roll_transfer", {
  p_request_id: randomUUID(),
  p_recipient_transfer_code: parties.agent.transfer_code,
  p_roll_ids: [routeRolls[15].id, routeRolls[15].id],
}, adminToken, "PG_TRANSFER_ROLL_ID_DUPLICATE");
await expectRpcError("create_roll_transfer", {
  p_request_id: randomUUID(),
  p_recipient_transfer_code: parties.company.transfer_code,
  p_roll_ids: [routeRolls[15].id],
}, adminToken, "PG_TRANSFER_SENDER_RECIPIENT_SAME");
await expectRpcError("create_roll_transfer", {
  p_request_id: randomUUID(),
  p_recipient_transfer_code: parties.centerA.transfer_code,
  p_roll_ids: [routeRolls[9].id],
}, dealerAToken, "PG_TRANSFER_ROLL_NOT_HELD");
await expectRpcError("cancel_roll_transfer", { p_transfer_id: idempotentTransfer.id }, agentToken, "PG_TRANSFER_NOT_SENDER");
await expectRpcError("reject_roll_transfer", { p_transfer_id: idempotentTransfer.id }, dealerBToken, "PG_TRANSFER_NOT_RECIPIENT");

const cancelIdempotent = await rpc("cancel_roll_transfer", { p_transfer_id: idempotentTransfer.id }, dealerAToken);
assert(cancelIdempotent.response.ok, `Could not close idempotency fixture: ${JSON.stringify(cancelIdempotent.body)}`);

// Pending reservation blocks Production void; release restores the existing
// void path, and a Roll from the resulting voided order cannot enter Transfer.
const voidOrderId = await createOrder(2, "CUBE-F-VOID");
const voidRollsResult = await rest(
  `rolls?production_order_id=eq.${encodeURIComponent(voidOrderId)}&select=id,serial_number&order=serial_number.asc`,
  adminToken,
);
assert(voidRollsResult.response.ok && voidRollsResult.body.length === 2, "Void fixture Rolls were not generated.");
const voidRolls = voidRollsResult.body;
const voidTransfer = await createTransfer(adminToken, parties.agent.transfer_code, [voidRolls[0].id]);
await expectRpcError("void_production_order", {
  p_order_id: voidOrderId,
  p_reason: "Cube F active reservation guard",
}, adminToken, "PG_TRANSFER_PRODUCTION_VOID_RESERVED");
await rpc("cancel_roll_transfer", { p_transfer_id: voidTransfer.id }, adminToken);
const voidAfterRelease = await rpc("void_production_order", {
  p_order_id: voidOrderId,
  p_reason: "Cube F reservation was explicitly released",
}, adminToken);
assert(voidAfterRelease.response.ok && voidAfterRelease.body === voidOrderId,
  `Production void did not recover after reservation release: ${JSON.stringify(voidAfterRelease.body)}`);
await expectRpcError("create_roll_transfer", {
  p_request_id: randomUUID(),
  p_recipient_transfer_code: parties.agent.transfer_code,
  p_roll_ids: [voidRolls[1].id],
}, adminToken, "PG_TRANSFER_PRODUCTION_VOIDED");

// Administrative recovery is not a convenience action. It is denied while
// both parties are active, then becomes available only after party suspension.
const activeRecoveryFixture = await createTransfer(dealerAToken, parties.centerA.transfer_code, [routeRolls[6].id]);
await expectRpcError("admin_cancel_pending_roll_transfer", {
  p_transfer_id: activeRecoveryFixture.id,
  p_reason: "Both parties remain operational",
}, adminToken, "PG_TRANSFER_ADMIN_RECOVERY_NOT_ALLOWED");
await expectRpcError("admin_cancel_pending_roll_transfer", {
  p_transfer_id: activeRecoveryFixture.id,
  p_reason: "bad",
}, adminToken, "PG_TRANSFER_ADMIN_REASON_INVALID");
await rpc("cancel_roll_transfer", { p_transfer_id: activeRecoveryFixture.id }, dealerAToken);

const recoveryFixture = await createTransfer(centerAToken, parties.dealerA.transfer_code, [routeRolls[12].id]);
assert(reservationCount(routeRolls[12].id) === 1, "Recovery fixture reservation was not created.");
const suspendCenter = await rest(`installation_centers?id=eq.${centerA.id}&select=id,status`, adminToken, {
  method: "PATCH",
  prefer: true,
  body: { status: "suspended" },
});
assert(suspendCenter.response.ok && suspendCenter.body?.[0]?.status === "suspended",
  `Could not suspend Center for recovery test: ${JSON.stringify(suspendCenter.body)}`);
assert(reservationCount(routeRolls[12].id) === 1, "Party suspension silently released a pending reservation.");
none(await rest(`roll_transfers?id=eq.${recoveryFixture.id}&select=id`, centerAToken), "Suspended Center reads pending Transfer");
await expectRpcError("cancel_roll_transfer", { p_transfer_id: recoveryFixture.id }, centerAToken, "PG_TRANSFER_ACTOR_INACTIVE");
const recovered = await rpc("admin_cancel_pending_roll_transfer", {
  p_transfer_id: recoveryFixture.id,
  p_reason: "Suspended Center cannot resolve its pending Transfer",
}, adminToken);
assert(recovered.response.ok && recovered.body === recoveryFixture.id,
  `Admin recovery failed: ${JSON.stringify(recovered.body)}`);
assert(reservationCount(routeRolls[12].id) === 0, "Admin recovery did not release reservation.");
assert(custodyParty(routeRolls[12].id) === parties.centerA.id, "Admin recovery changed confirmed custody.");
const recoveryEvent = querySql(`
select event_type || '|' || coalesce(actor_party_id::text, 'NULL') || '|' || reason
from public.roll_transfer_events
where transfer_id = ${sqlUuid(recoveryFixture.id)} and event_sequence = 2;
`);
assert(recoveryEvent.startsWith("administrative_cancelled|NULL|Suspended Center"),
  `Admin recovery audit event is incorrect: ${recoveryEvent}`);

const reactivateCenter = await rest(`installation_centers?id=eq.${centerA.id}&select=id,status`, adminToken, {
  method: "PATCH",
  prefer: true,
  body: { status: "active" },
});
assert(reactivateCenter.response.ok && reactivateCenter.body?.[0]?.status === "active", "Could not reactivate Center A.");

// Parent suspension does not cascade Transfer inactivity into an independently
// active Dealer child.
const suspendAgent = await rest(`country_agents?id=eq.${agent.id}&select=id,status`, adminToken, {
  method: "PATCH",
  prefer: true,
  body: { status: "suspended" },
});
assert(suspendAgent.response.ok && suspendAgent.body?.[0]?.status === "suspended", "Could not suspend parent Agent.");
const childTransfer = await createTransfer(dealerAToken, parties.centerA.transfer_code, [routeRolls[7].id]);
await rpc("cancel_roll_transfer", { p_transfer_id: childTransfer.id }, dealerAToken);
const reactivateAgent = await rest(`country_agents?id=eq.${agent.id}&select=id,status`, adminToken, {
  method: "PATCH",
  prefer: true,
  body: { status: "active" },
});
assert(reactivateAgent.response.ok && reactivateAgent.body?.[0]?.status === "active", "Could not reactivate parent Agent.");

console.log("Cube F Roll Transfer state/reservation contract verification passed.");
