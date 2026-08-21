import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const apiUrl = process.env.API_URL;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
const anonKey = process.env.ANON_KEY;

if (!apiUrl || !serviceRoleKey || !anonKey) {
  throw new Error("Local Supabase API_URL, SERVICE_ROLE_KEY and ANON_KEY are required.");
}

const password = "Transfer-Receipt-Cube-H-2026!";

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

async function rpc(name, body, token, key = anonKey) {
  return request(`/rest/v1/rpc/${name}`, { method: "POST", body, token, key });
}

function one(result, label) {
  assert(result.response.ok && Array.isArray(result.body) && result.body.length === 1,
    `${label}: ${result.response.status} ${JSON.stringify(result.body)}`);
  return result.body[0];
}

async function expectRpcError(name, body, token, expectedMessage, key = anonKey) {
  const result = await rpc(name, body, token, key);
  assert(!result.response.ok, `${name} unexpectedly succeeded for ${expectedMessage}.`);
  assert(result.body?.message === expectedMessage,
    `${name} expected ${expectedMessage}, received ${result.response.status} ${JSON.stringify(result.body)}`);
  return result;
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
      user_metadata: { display_name: `Cube H ${role}` },
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
    `Could not sign in ${email}: ${JSON.stringify(result.body)}`);
  return result.body.access_token;
}

function dbContainerName() {
  const names = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" })
    .split("\n").map((value) => value.trim()).filter(Boolean);
  const name = names.find((value) => value.startsWith("supabase_db_"));
  assert(name, "Supabase database container was not found for Cube H verification.");
  return name;
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

function reservationIds(transferId) {
  const output = querySql(`
    select roll_id::text
    from public.roll_transfer_reservations
    where transfer_id = ${sqlUuid(transferId)}
    order by roll_id;
  `);
  return output ? output.split("\n").filter(Boolean) : [];
}

function itemStateRows(transferId) {
  const output = querySql(`
    select roll_id::text || '|' || status || '|' || coalesce(action_request_id::text, '') || '|' || coalesce(acted_by_party_id::text, '')
    from public.roll_transfer_item_states
    where transfer_id = ${sqlUuid(transferId)}
    order by roll_id;
  `);
  return output ? output.split("\n").filter(Boolean).map((line) => {
    const [rollId, status, requestId, actorPartyId] = line.split("|");
    return { rollId, status, requestId: requestId || null, actorPartyId: actorPartyId || null };
  }) : [];
}

function transferStatus(transferId) {
  return querySql(`select status from public.roll_transfers where id = ${sqlUuid(transferId)};`);
}

function custodyParty(rollId) {
  return querySql(`select custodian_party_id::text from public.roll_custody_current where roll_id = ${sqlUuid(rollId)};`);
}

function custodyEventShape(rollId) {
  const output = querySql(`
    select custody_sequence::text || '|' || custodian_party_id::text || '|' || coalesce(transfer_id::text, '')
    from public.roll_custody_events
    where roll_id = ${sqlUuid(rollId)}
    order by custody_sequence;
  `);
  return output ? output.split("\n").filter(Boolean) : [];
}

async function createTransfer(senderToken, recipientTransferCode, rollIds, requestId = randomUUID()) {
  const result = await rpc("create_roll_transfer", {
    p_request_id: requestId,
    p_recipient_transfer_code: recipientTransferCode,
    p_roll_ids: rollIds,
  }, senderToken);
  assert(result.response.ok && typeof result.body === "string",
    `Could not create Transfer: ${result.response.status} ${JSON.stringify(result.body)}`);
  return result.body;
}

const emails = {
  admin: "cube-h-admin@example.test",
  agent: "cube-h-agent@example.test",
  dealer: "cube-h-dealer@example.test",
  center: "cube-h-center@example.test",
  center2: "cube-h-center-two@example.test",
};

await createUser({ email: emails.admin, role: "admin" });
const adminToken = await signIn(emails.admin);

const agent = one(await rest("country_agents?select=id,code,status", adminToken, {
  method: "POST", prefer: true,
  body: { code: "CUBE-H-AGENT-EG", name: "Cube H Agent", country_code: "EG" },
}), "Create Cube H Agent");
await createUser({ email: emails.agent, role: "agent", countryAgentId: agent.id });
const agentToken = await signIn(emails.agent);

const dealer = one(await rest("dealers?select=id,code,status,country_agent_id", adminToken, {
  method: "POST", prefer: true,
  body: {
    code: "CUBE-H-DEALER", name: "Cube H Dealer", country_code: "EG", country_agent_id: agent.id,
  },
}), "Create Cube H Dealer");
await createUser({ email: emails.dealer, role: "dealer", dealerId: dealer.id });
const dealerToken = await signIn(emails.dealer);

const center = one(await rest("installation_centers?select=id,code,status,dealer_id", adminToken, {
  method: "POST", prefer: true,
  body: {
    code: "CUBE-H-CENTER", name: "Cube H Center", country_code: "EG", city: "Cairo", dealer_id: dealer.id,
  },
}), "Create Cube H Center");
await createUser({ email: emails.center, role: "center", centerId: center.id });
await createUser({ email: emails.center2, role: "center", centerId: center.id });
const centerToken = await signIn(emails.center);
const centerToken2 = await signIn(emails.center2);

const companyParty = one(await rest("operational_parties?party_type=eq.company&select=id,transfer_code", adminToken), "Company party");
const centerParty = one(await rest(`operational_parties?installation_center_id=eq.${center.id}&select=id,transfer_code`, adminToken), "Center party");

const product = one(await rest("products?select=id,code", adminToken, {
  method: "POST", prefer: true,
  body: {
    code: "PG-CUBE-H-PPF", name: "Cube H Receipt PPF", slug: "cube-h-receipt-ppf",
    product_type: "PPF", category: "Paint Protection Film", version_name: "H1",
    width_mm: 1524, length_m: 15, thickness_mil: 7.5, weight_kg: 12.5,
    origin_country: "USA", default_warranty_months: 120,
    marketing_description: "Cube H receipt fixture.", technical_description: "Cube H receipt fixture.",
    features: ["Cube H"], warranty_coverage: "Test coverage.", care_instructions: "Test care.",
    publication_status: "draft",
  },
}), "Create Cube H Product");

const orderCreate = await rpc("create_production_order", {
  p_request_id: randomUUID(), p_product_id: product.id, p_production_date: "2026-08-15",
  p_lots: [{ quantity: 14, source_reference: "CUBE-H-LOT" }],
  p_source_reference: "CUBE-H-ORDER", p_notes: "Cube H receipt contracts",
}, adminToken);
assert(orderCreate.response.ok && typeof orderCreate.body === "string",
  `Could not create Cube H production order: ${JSON.stringify(orderCreate.body)}`);
const orderId = orderCreate.body;

const rollsResult = await rest(
  `rolls?production_order_id=eq.${orderId}&select=id,serial_number,erp_serial,roll_index&order=roll_index.asc`,
  adminToken,
);
assert(rollsResult.response.ok && rollsResult.body.length === 14,
  `Expected fourteen Cube H Rolls: ${JSON.stringify(rollsResult.body)}`);
const rolls = rollsResult.body;

// A — partial receipt, retry, later receipt, immutable custody evidence.
const transferA = await createTransfer(
  adminToken,
  centerParty.transfer_code,
  rolls.slice(0, 4).map((roll) => roll.id),
);
const receiptRequestA = randomUUID();
const receiptA = await rpc("receive_roll_transfer_items", {
  p_request_id: receiptRequestA,
  p_transfer_id: transferA,
  p_roll_ids: [rolls[2].id, rolls[0].id, rolls[1].id],
}, centerToken);
assert(receiptA.response.ok && receiptA.body === transferA,
  `Partial receipt failed: ${JSON.stringify(receiptA.body)}`);
assert(transferStatus(transferA) === "partially_received", "Partial receipt did not open partially_received state.");

let statesA = itemStateRows(transferA);
assert(statesA.filter((row) => row.status === "received").length === 3, "Expected three received item states.");
assert(statesA.filter((row) => row.status === "pending").length === 1, "Expected one unresolved item state.");
assert(statesA.filter((row) => row.status === "received").every((row) => row.requestId === receiptRequestA),
  "Receipt request identity was not persisted per received item.");
assert(reservationIds(transferA).length === 1 && reservationIds(transferA)[0] === rolls[3].id,
  "Only the unresolved Roll should remain reserved.");
for (const roll of rolls.slice(0, 3)) {
  assert(custodyParty(roll.id) === centerParty.id, `Received Roll ${roll.id} did not move to recipient custody.`);
  const events = custodyEventShape(roll.id);
  assert(events.length === 2 && events[1].endsWith(`|${transferA}`),
    `Received Roll ${roll.id} lacks linked custody evidence: ${JSON.stringify(events)}`);
}
assert(custodyParty(rolls[3].id) === companyParty.id, "Unresolved Roll custody moved before receipt.");
assert(custodyEventShape(rolls[3].id).length === 1, "Unresolved Roll received synthetic custody history.");

const retryA = await rpc("receive_roll_transfer_items", {
  p_request_id: receiptRequestA,
  p_transfer_id: transferA,
  p_roll_ids: [rolls[1].id, rolls[2].id, rolls[0].id],
}, centerToken);
assert(retryA.response.ok && retryA.body === transferA, "Matching reordered receipt retry was not idempotent.");
await expectRpcError(
  "receive_roll_transfer_items",
  { p_request_id: receiptRequestA, p_transfer_id: transferA, p_roll_ids: [rolls[0].id] },
  centerToken,
  "PG_TRANSFER_RECEIPT_REQUEST_CONFLICT",
);
await expectRpcError("cancel_roll_transfer", { p_transfer_id: transferA }, adminToken, "PG_TRANSFER_INVALID_STATE");
await expectRpcError("reject_roll_transfer", { p_transfer_id: transferA }, centerToken, "PG_TRANSFER_INVALID_STATE");

const finalReceiptRequest = randomUUID();
const finalReceipt = await rpc("receive_roll_transfer_items", {
  p_request_id: finalReceiptRequest,
  p_transfer_id: transferA,
  p_roll_ids: [rolls[3].id],
}, centerToken);
assert(finalReceipt.response.ok && transferStatus(transferA) === "received", "Final receipt did not close Transfer as received.");
assert(reservationIds(transferA).length === 0, "Final receipt left active reservation.");
const finalRetry = await rpc("receive_roll_transfer_items", {
  p_request_id: finalReceiptRequest,
  p_transfer_id: transferA,
  p_roll_ids: [rolls[3].id],
}, centerToken);
assert(finalRetry.response.ok && finalRetry.body === transferA, "Terminal matching receipt retry failed.");

await expectRpcError(
  "void_production_order",
  { p_order_id: orderId, p_reason: "Cube H distributed-order void guard" },
  adminToken,
  "PG_TRANSFER_PRODUCTION_VOID_DISTRIBUTED",
);

// B — sender resolves the remaining physical Roll after one confirmed receipt.
const transferB = await createTransfer(adminToken, centerParty.transfer_code, [rolls[4].id, rolls[5].id]);
await rpc("receive_roll_transfer_items", {
  p_request_id: randomUUID(), p_transfer_id: transferB, p_roll_ids: [rolls[4].id],
}, centerToken);
const releaseRequestB = randomUUID();
const releaseB = await rpc("release_unreceived_roll_transfer_items", {
  p_request_id: releaseRequestB,
  p_transfer_id: transferB,
  p_roll_ids: [rolls[5].id],
  p_reason: "اللفة بقيت فعليًا لدى المرسل ولم يتم تسليمها.",
}, adminToken);
assert(releaseB.response.ok && transferStatus(transferB) === "partially_completed",
  `Sender unresolved resolution failed: ${JSON.stringify(releaseB.body)}`);
const releasedB = itemStateRows(transferB).find((row) => row.rollId === rolls[5].id);
assert(releasedB?.status === "released_to_sender" && releasedB.actorPartyId === companyParty.id,
  `Sender resolution audit is wrong: ${JSON.stringify(releasedB)}`);
assert(custodyParty(rolls[5].id) === companyParty.id && custodyEventShape(rolls[5].id).length === 1,
  "Released unresolved Roll changed confirmed custody/history.");
assert(reservationIds(transferB).length === 0, "Sender resolution did not release reservation.");
const releaseRetryB = await rpc("release_unreceived_roll_transfer_items", {
  p_request_id: releaseRequestB,
  p_transfer_id: transferB,
  p_roll_ids: [rolls[5].id],
  p_reason: "اللفة بقيت فعليًا لدى المرسل ولم يتم تسليمها.",
}, adminToken);
assert(releaseRetryB.response.ok, "Sender resolution matching retry failed.");

// C — Admin support path remains explicit and does not impersonate a party.
const transferC = await createTransfer(adminToken, centerParty.transfer_code, [rolls[6].id, rolls[7].id]);
await rpc("receive_roll_transfer_items", {
  p_request_id: randomUUID(), p_transfer_id: transferC, p_roll_ids: [rolls[6].id],
}, centerToken);
const adminReleaseRequest = randomUUID();
const adminRelease = await rpc("admin_release_unreceived_roll_transfer_items", {
  p_request_id: adminReleaseRequest,
  p_transfer_id: transferC,
  p_roll_ids: [rolls[7].id],
  p_reason: "تسوية دعم موثقة بعد التأكد من بقاء اللفة لدى المرسل.",
}, adminToken);
assert(adminRelease.response.ok, `Admin resolution failed: ${JSON.stringify(adminRelease.body)}`);
const adminReleased = itemStateRows(transferC).find((row) => row.rollId === rolls[7].id);
assert(adminReleased?.status === "released_to_sender" && adminReleased.actorPartyId === null,
  `Admin support action impersonated a business party: ${JSON.stringify(adminReleased)}`);
const adminEvent = querySql(`
  select event_type || '|' || coalesce(actor_party_id::text, '') || '|' || action_request_id::text || '|' || affected_roll_count::text
  from public.roll_transfer_events
  where transfer_id = ${sqlUuid(transferC)} and event_type = 'administrative_unresolved_released';
`);
assert(adminEvent === `administrative_unresolved_released||${adminReleaseRequest}|1`,
  `Admin support event is wrong: ${adminEvent}`);

// D/E — pre-receipt terminal actions close item state truthfully and never move custody.
const transferD = await createTransfer(adminToken, centerParty.transfer_code, [rolls[8].id]);
const cancelledD = await rpc("cancel_roll_transfer", { p_transfer_id: transferD }, adminToken);
assert(cancelledD.response.ok && itemStateRows(transferD)[0]?.status === "closed_unreceived",
  "Cancelled Transfer item remained pending.");
assert(reservationIds(transferD).length === 0 && custodyParty(rolls[8].id) === companyParty.id,
  "Cancellation failed to release reservation while preserving custody.");

const transferE = await createTransfer(adminToken, centerParty.transfer_code, [rolls[9].id]);
const rejectedE = await rpc("reject_roll_transfer", { p_transfer_id: transferE }, centerToken);
assert(rejectedE.response.ok && itemStateRows(transferE)[0]?.status === "closed_unreceived",
  "Rejected Transfer item remained pending.");
assert(reservationIds(transferE).length === 0 && custodyParty(rolls[9].id) === companyParty.id,
  "Rejection failed to release reservation while preserving custody.");

// F — authorization/membership/size boundaries and concurrent receipt winner.
const transferF = await createTransfer(adminToken, centerParty.transfer_code, [rolls[10].id]);
await expectRpcError(
  "receive_roll_transfer_items",
  { p_request_id: randomUUID(), p_transfer_id: transferF, p_roll_ids: [rolls[10].id] },
  dealerToken,
  "PG_TRANSFER_NOT_RECIPIENT",
);
await expectRpcError(
  "receive_roll_transfer_items",
  { p_request_id: randomUUID(), p_transfer_id: transferF, p_roll_ids: [rolls[11].id] },
  centerToken,
  "PG_TRANSFER_RECEIPT_ROLL_NOT_IN_TRANSFER",
);
await expectRpcError(
  "release_unreceived_roll_transfer_items",
  {
    p_request_id: randomUUID(), p_transfer_id: transferF, p_roll_ids: [rolls[10].id],
    p_reason: "لا يجوز حل العنصر قبل حدوث استلام جزئي.",
  },
  adminToken,
  "PG_TRANSFER_RESOLUTION_STATE_INVALID",
);
await expectRpcError(
  "receive_roll_transfer_items",
  { p_request_id: randomUUID(), p_transfer_id: transferF, p_roll_ids: Array.from({ length: 10001 }, () => randomUUID()) },
  centerToken,
  "PG_TRANSFER_RECEIPT_ROLL_COUNT_INVALID",
);

const [raceOne, raceTwo] = await Promise.all([
  rpc("receive_roll_transfer_items", {
    p_request_id: randomUUID(), p_transfer_id: transferF, p_roll_ids: [rolls[10].id],
  }, centerToken),
  rpc("receive_roll_transfer_items", {
    p_request_id: randomUUID(), p_transfer_id: transferF, p_roll_ids: [rolls[10].id],
  }, centerToken2),
]);
assert([raceOne, raceTwo].filter((result) => result.response.ok).length === 1,
  `Concurrent receipt must have exactly one winner: ${JSON.stringify([raceOne.body, raceTwo.body])}`);
assert(custodyEventShape(rolls[10].id).length === 2,
  "Concurrent receipt created duplicate or missing custody evidence.");

// G — receipt vs sender release on one unresolved Roll must serialize to one physical truth.
const transferG = await createTransfer(adminToken, centerParty.transfer_code, [rolls[11].id, rolls[12].id]);
await rpc("receive_roll_transfer_items", {
  p_request_id: randomUUID(), p_transfer_id: transferG, p_roll_ids: [rolls[11].id],
}, centerToken);
const [receiptG, releaseG] = await Promise.all([
  rpc("receive_roll_transfer_items", {
    p_request_id: randomUUID(), p_transfer_id: transferG, p_roll_ids: [rolls[12].id],
  }, centerToken),
  rpc("release_unreceived_roll_transfer_items", {
    p_request_id: randomUUID(), p_transfer_id: transferG, p_roll_ids: [rolls[12].id],
    p_reason: "سباق اختباري لتأكيد نتيجة ذرية واحدة فقط.",
  }, adminToken),
]);
assert([receiptG, releaseG].filter((result) => result.response.ok).length === 1,
  `Receipt/resolution race must have exactly one winner: ${JSON.stringify([receiptG.body, releaseG.body])}`);
assert(["received", "partially_completed"].includes(transferStatus(transferG)),
  `Race left invalid Transfer state: ${transferStatus(transferG)}`);
assert(reservationIds(transferG).length === 0, "Race left an active reservation after terminal outcome.");

// H Data API boundary: reservation projection remains internal even for Admin;
// item-state visibility is participant/Admin only; operational mutation RPCs are
// not callable through service_role or anon.
const adminReservationBrowse = await rest(
  `roll_transfer_reservations?transfer_id=eq.${transferA}&select=roll_id,transfer_id`,
  adminToken,
);
assert(!adminReservationBrowse.response.ok,
  `Admin unexpectedly browsed internal reservation projection: ${JSON.stringify(adminReservationBrowse.body)}`);

const unrelatedStates = await rest(
  `roll_transfer_item_states?transfer_id=eq.${transferA}&select=roll_id,status`,
  agentToken,
);
assert(unrelatedStates.response.ok && unrelatedStates.body.length === 0,
  `Unrelated party could browse receipt item state: ${JSON.stringify(unrelatedStates.body)}`);

for (const [name, body] of [
  ["receive_roll_transfer_items", { p_request_id: randomUUID(), p_transfer_id: transferG, p_roll_ids: [rolls[12].id] }],
  ["release_unreceived_roll_transfer_items", {
    p_request_id: randomUUID(), p_transfer_id: transferG, p_roll_ids: [rolls[12].id], p_reason: "service role denial",
  }],
]) {
  const service = await rpc(name, body, serviceRoleKey, serviceRoleKey);
  assert(!service.response.ok, `service_role unexpectedly executed ${name}: ${JSON.stringify(service.body)}`);
  const anonymous = await rpc(name, body, anonKey);
  assert(!anonymous.response.ok, `anon unexpectedly executed ${name}: ${JSON.stringify(anonymous.body)}`);
}

console.log("Cube H Transfer receipt/resolution lifecycle contracts verified on the intended privacy boundary.");
