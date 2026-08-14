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

async function createTransfer({ senderToken, recipientTransferCode, rollIds, requestId = randomUUID() }) {
  const result = await rpc("create_roll_transfer", {
    p_request_id: requestId,
    p_recipient_transfer_code: recipientTransferCode,
    p_roll_ids: rollIds,
  }, senderToken);
  assert(result.response.ok && typeof result.body === "string",
    `Could not create Transfer: ${result.response.status} ${JSON.stringify(result.body)}`);
  return result.body;
}

async function transferHeader(id, adminToken) {
  return one(await rest(
    `roll_transfers?id=eq.${id}&select=id,transfer_number,status,roll_count,sender_party_id,recipient_party_id,closed_at`,
    adminToken,
  ), `Transfer ${id}`);
}

async function itemStates(id, adminToken) {
  const result = await rest(
    `roll_transfer_item_states?transfer_id=eq.${id}&select=roll_id,status,action_request_id,acted_by_profile_id,acted_by_party_id,acted_at,resolution_reason&order=roll_id.asc`,
    adminToken,
  );
  assert(result.response.ok, `Could not read item states: ${JSON.stringify(result.body)}`);
  return result.body;
}

async function reservations(id, adminToken) {
  const result = await rest(
    `roll_transfer_reservations?transfer_id=eq.${id}&select=roll_id,transfer_id`,
    adminToken,
  );
  assert(result.response.ok, `Could not read reservations: ${JSON.stringify(result.body)}`);
  return result.body;
}

async function custody(rollIds, adminToken) {
  const result = await rest(
    `roll_custody_current?roll_id=in.(${rollIds.join(",")})&select=roll_id,custodian_party_id,confirmed_at`,
    adminToken,
  );
  assert(result.response.ok, `Could not read custody: ${JSON.stringify(result.body)}`);
  return result.body;
}

async function custodyEvents(rollIds, adminToken) {
  const result = await rest(
    `roll_custody_events?roll_id=in.(${rollIds.join(",")})&select=roll_id,custody_sequence,custodian_party_id,transfer_id,confirmed_at&order=roll_id.asc,custody_sequence.asc`,
    adminToken,
  );
  assert(result.response.ok, `Could not read custody events: ${JSON.stringify(result.body)}`);
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
  method: "POST",
  prefer: true,
  body: {
    code: "CUBE-H-AGENT-EG",
    name: "Cube H Agent",
    country_code: "EG",
  },
}), "Create Cube H Agent");
await createUser({ email: emails.agent, role: "agent", countryAgentId: agent.id });
const agentToken = await signIn(emails.agent);

const dealer = one(await rest("dealers?select=id,code,status,country_agent_id", adminToken, {
  method: "POST",
  prefer: true,
  body: {
    code: "CUBE-H-DEALER",
    name: "Cube H Dealer",
    country_code: "EG",
    country_agent_id: agent.id,
  },
}), "Create Cube H Dealer");
await createUser({ email: emails.dealer, role: "dealer", dealerId: dealer.id });
const dealerToken = await signIn(emails.dealer);

const center = one(await rest("installation_centers?select=id,code,status,dealer_id", adminToken, {
  method: "POST",
  prefer: true,
  body: {
    code: "CUBE-H-CENTER",
    name: "Cube H Center",
    country_code: "EG",
    city: "Cairo",
    dealer_id: dealer.id,
  },
}), "Create Cube H Center");
await createUser({ email: emails.center, role: "center", centerId: center.id });
await createUser({ email: emails.center2, role: "center", centerId: center.id });
const centerToken = await signIn(emails.center);
const centerToken2 = await signIn(emails.center2);

const companyParty = one(await rest("operational_parties?party_type=eq.company&select=id,transfer_code", adminToken), "Company party");
const centerParty = one(await rest(`operational_parties?installation_center_id=eq.${center.id}&select=id,transfer_code`, adminToken), "Center party");

const product = one(await rest("products?select=id,code,name,status", adminToken, {
  method: "POST",
  prefer: true,
  body: {
    code: "PG-CUBE-H-PPF",
    name: "Cube H Receipt PPF",
    slug: "cube-h-receipt-ppf",
    product_type: "PPF",
    category: "Paint Protection Film",
    version_name: "H1",
    width_mm: 1524,
    length_m: 15,
    thickness_mil: 7.5,
    weight_kg: 12.5,
    origin_country: "USA",
    default_warranty_months: 120,
    marketing_description: "Cube H receipt fixture.",
    technical_description: "Cube H receipt fixture.",
    features: ["Cube H"],
    warranty_coverage: "Test coverage.",
    care_instructions: "Test care.",
    publication_status: "draft",
  },
}), "Create Cube H Product");

const orderCreate = await rpc("create_production_order", {
  p_request_id: randomUUID(),
  p_product_id: product.id,
  p_production_date: "2026-08-15",
  p_lots: [{ quantity: 14, source_reference: "CUBE-H-LOT" }],
  p_source_reference: "CUBE-H-ORDER",
  p_notes: "Cube H receipt contracts",
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

// Full lifecycle: partial receipt -> exact retry -> later receipt -> received.
const transferA = await createTransfer({
  senderToken: adminToken,
  recipientTransferCode: centerParty.transfer_code,
  rollIds: rolls.slice(0, 4).map((roll) => roll.id),
});

const receiveARequest = randomUUID();
const receiveA = await rpc("receive_roll_transfer_items", {
  p_request_id: receiveARequest,
  p_transfer_id: transferA,
  p_roll_ids: [rolls[2].id, rolls[0].id, rolls[1].id],
}, centerToken);
assert(receiveA.response.ok && receiveA.body === transferA,
  `Partial receipt failed: ${JSON.stringify(receiveA.body)}`);

let headerA = await transferHeader(transferA, adminToken);
assert(headerA.status === "partially_received" && headerA.closed_at === null,
  `Partial receipt header is wrong: ${JSON.stringify(headerA)}`);

let statesA = await itemStates(transferA, adminToken);
assert(statesA.filter((state) => state.status === "received").length === 3,
  `Expected three received item states: ${JSON.stringify(statesA)}`);
assert(statesA.filter((state) => state.status === "pending").length === 1,
  `Expected one unresolved pending item: ${JSON.stringify(statesA)}`);
assert(statesA.filter((state) => state.status === "received").every((state) => state.action_request_id === receiveARequest),
  "Receipt request identity was not persisted on received items.");

let reservationsA = await reservations(transferA, adminToken);
assert(reservationsA.length === 1 && reservationsA[0].roll_id === rolls[3].id,
  `Only the unresolved Roll should remain reserved: ${JSON.stringify(reservationsA)}`);

let custodyA = await custody(rolls.slice(0, 4).map((roll) => roll.id), adminToken);
assert(custodyA.filter((row) => row.custodian_party_id === centerParty.id).length === 3,
  `Exactly three Rolls should move to recipient custody: ${JSON.stringify(custodyA)}`);
assert(custodyA.find((row) => row.roll_id === rolls[3].id)?.custodian_party_id === companyParty.id,
  "Unresolved Roll did not remain with sender custody.");

const receiptEventsA = await custodyEvents(rolls.slice(0, 4).map((roll) => roll.id), adminToken);
for (const roll of rolls.slice(0, 3)) {
  const events = receiptEventsA.filter((event) => event.roll_id === roll.id);
  assert(events.length === 2 && events[1].custody_sequence === 2 && events[1].transfer_id === transferA,
    `Received Roll ${roll.id} lost linked custody event: ${JSON.stringify(events)}`);
}
assert(receiptEventsA.filter((event) => event.roll_id === rolls[3].id).length === 1,
  "Unreceived Roll unexpectedly received a synthetic custody event.");

const retryA = await rpc("receive_roll_transfer_items", {
  p_request_id: receiveARequest,
  p_transfer_id: transferA,
  p_roll_ids: [rolls[1].id, rolls[2].id, rolls[0].id],
}, centerToken);
assert(retryA.response.ok && retryA.body === transferA,
  `Matching reordered receipt retry was not idempotent: ${JSON.stringify(retryA.body)}`);

await expectRpcError(
  "receive_roll_transfer_items",
  { p_request_id: receiveARequest, p_transfer_id: transferA, p_roll_ids: [rolls[0].id] },
  centerToken,
  "PG_TRANSFER_RECEIPT_REQUEST_CONFLICT",
);
await expectRpcError(
  "cancel_roll_transfer",
  { p_transfer_id: transferA },
  adminToken,
  "PG_TRANSFER_INVALID_STATE",
);
await expectRpcError(
  "reject_roll_transfer",
  { p_transfer_id: transferA },
  centerToken,
  "PG_TRANSFER_INVALID_STATE",
);

const receiveRemainingRequest = randomUUID();
const receiveRemaining = await rpc("receive_roll_transfer_items", {
  p_request_id: receiveRemainingRequest,
  p_transfer_id: transferA,
  p_roll_ids: [rolls[3].id],
}, centerToken);
assert(receiveRemaining.response.ok, `Later receipt failed: ${JSON.stringify(receiveRemaining.body)}`);
headerA = await transferHeader(transferA, adminToken);
assert(headerA.status === "received" && headerA.closed_at,
  `Final receipt did not close Transfer: ${JSON.stringify(headerA)}`);
reservationsA = await reservations(transferA, adminToken);
assert(reservationsA.length === 0, "Final receipt left an active reservation.");

const retryRemaining = await rpc("receive_roll_transfer_items", {
  p_request_id: receiveRemainingRequest,
  p_transfer_id: transferA,
  p_roll_ids: [rolls[3].id],
}, centerToken);
assert(retryRemaining.response.ok && retryRemaining.body === transferA,
  "Final receipt matching retry failed.");

// Production is permanently non-voidable after confirmed distribution.
await expectRpcError(
  "void_production_order",
  { p_production_order_id: orderId },
  adminToken,
  "PG_TRANSFER_PRODUCTION_VOID_DISTRIBUTED",
);

// Sender unresolved-item release after partial receipt.
const transferB = await createTransfer({
  senderToken: adminToken,
  recipientTransferCode: centerParty.transfer_code,
  rollIds: [rolls[4].id, rolls[5].id],
});
await rpc("receive_roll_transfer_items", {
  p_request_id: randomUUID(),
  p_transfer_id: transferB,
  p_roll_ids: [rolls[4].id],
}, centerToken);
const releaseBRequest = randomUUID();
const releaseB = await rpc("release_unreceived_roll_transfer_items", {
  p_request_id: releaseBRequest,
  p_transfer_id: transferB,
  p_roll_ids: [rolls[5].id],
  p_reason: "اللفة بقيت فعليًا لدى المرسل ولم يتم تسليمها.",
}, adminToken);
assert(releaseB.response.ok && releaseB.body === transferB,
  `Sender unresolved release failed: ${JSON.stringify(releaseB.body)}`);
const headerB = await transferHeader(transferB, adminToken);
assert(headerB.status === "partially_completed" && headerB.closed_at,
  `Sender resolution did not close partially completed Transfer: ${JSON.stringify(headerB)}`);
const statesB = await itemStates(transferB, adminToken);
const releasedB = statesB.find((state) => state.roll_id === rolls[5].id);
assert(releasedB?.status === "released_to_sender" && releasedB.acted_by_party_id === companyParty.id,
  `Sender release audit is wrong: ${JSON.stringify(releasedB)}`);
assert((await custody([rolls[5].id], adminToken))[0]?.custodian_party_id === companyParty.id,
  "Released unresolved Roll custody changed unexpectedly.");
assert((await custodyEvents([rolls[5].id], adminToken)).length === 1,
  "Released unresolved Roll received a synthetic custody event.");
assert((await reservations(transferB, adminToken)).length === 0,
  "Sender resolution did not release reservation.");
const releaseBRetry = await rpc("release_unreceived_roll_transfer_items", {
  p_request_id: releaseBRequest,
  p_transfer_id: transferB,
  p_roll_ids: [rolls[5].id],
  p_reason: "اللفة بقيت فعليًا لدى المرسل ولم يتم تسليمها.",
}, adminToken);
assert(releaseBRetry.response.ok, "Sender resolution exact retry was not idempotent.");

// Admin support resolution is auditable and never impersonates a party.
const transferC = await createTransfer({
  senderToken: adminToken,
  recipientTransferCode: centerParty.transfer_code,
  rollIds: [rolls[6].id, rolls[7].id],
});
await rpc("receive_roll_transfer_items", {
  p_request_id: randomUUID(),
  p_transfer_id: transferC,
  p_roll_ids: [rolls[6].id],
}, centerToken);
const adminReleaseRequest = randomUUID();
const adminRelease = await rpc("admin_release_unreceived_roll_transfer_items", {
  p_request_id: adminReleaseRequest,
  p_transfer_id: transferC,
  p_roll_ids: [rolls[7].id],
  p_reason: "تسوية دعم موثقة بعد التأكد من بقاء اللفة لدى المرسل.",
}, adminToken);
assert(adminRelease.response.ok, `Admin resolution failed: ${JSON.stringify(adminRelease.body)}`);
const adminReleasedState = (await itemStates(transferC, adminToken)).find((state) => state.roll_id === rolls[7].id);
assert(adminReleasedState?.status === "released_to_sender" && adminReleasedState.acted_by_party_id === null,
  `Admin support action impersonated a party: ${JSON.stringify(adminReleasedState)}`);
const transferCEvents = await rest(
  `roll_transfer_events?transfer_id=eq.${transferC}&event_type=eq.administrative_unresolved_released&select=event_type,actor_party_id,reason,action_request_id,affected_roll_count`,
  adminToken,
);
assert(transferCEvents.response.ok && transferCEvents.body.length === 1
  && transferCEvents.body[0].actor_party_id === null
  && transferCEvents.body[0].action_request_id === adminReleaseRequest
  && transferCEvents.body[0].affected_roll_count === 1,
  `Admin support event is incorrect: ${JSON.stringify(transferCEvents.body)}`);

await expectRpcError(
  "admin_release_unreceived_roll_transfer_items",
  {
    p_request_id: randomUUID(),
    p_transfer_id: transferC,
    p_roll_ids: [rolls[6].id],
    p_reason: "محاولة غير صالحة على عنصر مستلم بالفعل.",
  },
  adminToken,
  "PG_TRANSFER_RESOLUTION_STATE_INVALID",
);

// Pre-receipt whole-Transfer closure synchronizes truthful item state.
const transferD = await createTransfer({
  senderToken: adminToken,
  recipientTransferCode: centerParty.transfer_code,
  rollIds: [rolls[8].id],
});
const cancelledD = await rpc("cancel_roll_transfer", { p_transfer_id: transferD }, adminToken);
assert(cancelledD.response.ok, `Pending cancellation failed: ${JSON.stringify(cancelledD.body)}`);
const stateD = await itemStates(transferD, adminToken);
assert(stateD.length === 1 && stateD[0].status === "closed_unreceived",
  `Cancelled Transfer item remained operationally pending: ${JSON.stringify(stateD)}`);
assert((await reservations(transferD, adminToken)).length === 0,
  "Cancelled Transfer retained reservation.");
assert((await custody([rolls[8].id], adminToken))[0]?.custodian_party_id === companyParty.id,
  "Cancelled Transfer changed confirmed custody.");

const transferE = await createTransfer({
  senderToken: adminToken,
  recipientTransferCode: centerParty.transfer_code,
  rollIds: [rolls[9].id],
});
const rejectedE = await rpc("reject_roll_transfer", { p_transfer_id: transferE }, centerToken);
assert(rejectedE.response.ok, `Pending rejection failed: ${JSON.stringify(rejectedE.body)}`);
const stateE = await itemStates(transferE, adminToken);
assert(stateE.length === 1 && stateE[0].status === "closed_unreceived",
  `Rejected Transfer item remained operationally pending: ${JSON.stringify(stateE)}`);

// Authorization and membership boundaries.
const transferF = await createTransfer({
  senderToken: adminToken,
  recipientTransferCode: centerParty.transfer_code,
  rollIds: [rolls[10].id],
});
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
    p_request_id: randomUUID(),
    p_transfer_id: transferF,
    p_roll_ids: [rolls[10].id],
    p_reason: "لا يجوز حل العنصر قبل حدوث استلام جزئي.",
  },
  adminToken,
  "PG_TRANSFER_RESOLUTION_STATE_INVALID",
);

const tooManyIds = Array.from({ length: 10001 }, () => randomUUID());
await expectRpcError(
  "receive_roll_transfer_items",
  { p_request_id: randomUUID(), p_transfer_id: transferF, p_roll_ids: tooManyIds },
  centerToken,
  "PG_TRANSFER_RECEIPT_ROLL_COUNT_INVALID",
);

// Two users bound to the same recipient party cannot receive one item twice.
const raceRequestOne = randomUUID();
const raceRequestTwo = randomUUID();
const [raceOne, raceTwo] = await Promise.all([
  rpc("receive_roll_transfer_items", {
    p_request_id: raceRequestOne,
    p_transfer_id: transferF,
    p_roll_ids: [rolls[10].id],
  }, centerToken),
  rpc("receive_roll_transfer_items", {
    p_request_id: raceRequestTwo,
    p_transfer_id: transferF,
    p_roll_ids: [rolls[10].id],
  }, centerToken2),
]);
assert([raceOne, raceTwo].filter((result) => result.response.ok).length === 1,
  `Concurrent receipt must have exactly one winner: ${JSON.stringify([raceOne.body, raceTwo.body])}`);
const raceLoser = raceOne.response.ok ? raceTwo : raceOne;
assert(
  ["PG_TRANSFER_RECEIPT_STATE_INVALID", "PG_TRANSFER_RECEIPT_ITEM_ALREADY_RECEIVED"].includes(raceLoser.body?.message),
  `Unexpected concurrent receipt loser: ${JSON.stringify(raceLoser.body)}`,
);
const raceCustodyEvents = await custodyEvents([rolls[10].id], adminToken);
assert(raceCustodyEvents.length === 2 && raceCustodyEvents[1].custody_sequence === 2,
  `Concurrent receipt created duplicate/missing custody events: ${JSON.stringify(raceCustodyEvents)}`);

// Receipt vs sender resolution on the same unresolved item must serialize to one truth.
const transferG = await createTransfer({
  senderToken: adminToken,
  recipientTransferCode: centerParty.transfer_code,
  rollIds: [rolls[11].id, rolls[12].id],
});
await rpc("receive_roll_transfer_items", {
  p_request_id: randomUUID(),
  p_transfer_id: transferG,
  p_roll_ids: [rolls[11].id],
}, centerToken);
const [receiptG, releaseG] = await Promise.all([
  rpc("receive_roll_transfer_items", {
    p_request_id: randomUUID(),
    p_transfer_id: transferG,
    p_roll_ids: [rolls[12].id],
  }, centerToken),
  rpc("release_unreceived_roll_transfer_items", {
    p_request_id: randomUUID(),
    p_transfer_id: transferG,
    p_roll_ids: [rolls[12].id],
    p_reason: "سباق اختباري لتأكيد نتيجة ذرية واحدة فقط.",
  }, adminToken),
]);
assert([receiptG, releaseG].filter((result) => result.response.ok).length === 1,
  `Receipt/resolution race must have exactly one winner: ${JSON.stringify([receiptG.body, releaseG.body])}`);
const headerG = await transferHeader(transferG, adminToken);
assert(["received", "partially_completed"].includes(headerG.status),
  `Race left an invalid open state: ${JSON.stringify(headerG)}`);
assert((await reservations(transferG, adminToken)).length === 0,
  "Race left unresolved reservation after terminal outcome.");

// Operational H RPCs are not callable through service_role/anon Data API roles.
const serviceReceipt = await rpc(
  "receive_roll_transfer_items",
  { p_request_id: randomUUID(), p_transfer_id: transferG, p_roll_ids: [rolls[12].id] },
  serviceRoleKey,
  serviceRoleKey,
);
assert(!serviceReceipt.response.ok,
  `service_role unexpectedly gained receipt RPC execution: ${JSON.stringify(serviceReceipt.body)}`);
const anonReceipt = await rpc(
  "receive_roll_transfer_items",
  { p_request_id: randomUUID(), p_transfer_id: transferG, p_roll_ids: [rolls[12].id] },
  anonKey,
);
assert(!anonReceipt.response.ok,
  `anon unexpectedly gained receipt RPC execution: ${JSON.stringify(anonReceipt.body)}`);

const unrelatedStates = await rest(
  `roll_transfer_item_states?transfer_id=eq.${transferA}&select=roll_id,status`,
  agentToken,
);
assert(unrelatedStates.response.ok && unrelatedStates.body.length === 0,
  `Unrelated operational party could browse receipt item state: ${JSON.stringify(unrelatedStates.body)}`);

console.log("Cube H Transfer receipt/resolution contracts verified.");
