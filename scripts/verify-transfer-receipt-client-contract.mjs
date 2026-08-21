import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildTransferActionFingerprint,
  clearTransferActionRequest,
  receiptDraftStorageKey,
  requestIdForTransferAction,
} from "../lib/transfers/receipt-idempotency.ts";

class MemoryStorage {
  #values = new Map();
  getItem(key) { return this.#values.has(key) ? this.#values.get(key) : null; }
  setItem(key, value) { this.#values.set(key, String(value)); }
  removeItem(key) { this.#values.delete(key); }
  clear() { this.#values.clear(); }
}

globalThis.sessionStorage = new MemoryStorage();

const transferId = "11111111-1111-4111-8111-111111111111";
const rollA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const rollB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const ordered = await buildTransferActionFingerprint("receive", transferId, [rollA, rollB]);
const reordered = await buildTransferActionFingerprint("receive", transferId, [rollB, rollA]);
const duplicated = await buildTransferActionFingerprint("receive", transferId, [rollA, rollB, rollA]);
assert.equal(ordered, reordered, "Receipt fingerprint must be order-insensitive.");
assert.equal(ordered, duplicated, "Duplicate UI selection must not change retry identity.");

const release = await buildTransferActionFingerprint("release", transferId, [rollA, rollB], " reason ");
const releaseTrimmed = await buildTransferActionFingerprint("release", transferId, [rollB, rollA], "reason");
assert.equal(release, releaseTrimmed, "Resolution reason whitespace must normalize for safe retry.");
assert.notEqual(ordered, release, "Different business actions must never share a retry fingerprint.");

const receiveRequestOne = await requestIdForTransferAction("receive", transferId, [rollA, rollB]);
const receiveRequestRetry = await requestIdForTransferAction("receive", transferId, [rollB, rollA]);
assert.equal(receiveRequestOne, receiveRequestRetry, "Same receipt payload must reuse request ID after interruption.");

const changedReceiptRequest = await requestIdForTransferAction("receive", transferId, [rollA]);
assert.notEqual(receiveRequestOne, changedReceiptRequest, "Changed receipt payload must allocate a new request ID.");

const releaseRequest = await requestIdForTransferAction("release", transferId, [rollA], "physical roll stayed with sender");
const releaseRetry = await requestIdForTransferAction("release", transferId, [rollA], " physical roll stayed with sender ");
assert.equal(releaseRequest, releaseRetry, "Same resolution payload must reuse request ID.");
const changedReasonRequest = await requestIdForTransferAction("release", transferId, [rollA], "different physical outcome");
assert.notEqual(releaseRequest, changedReasonRequest, "Changed resolution reason must allocate a new request ID.");

clearTransferActionRequest("release", transferId);
const afterClear = await requestIdForTransferAction("release", transferId, [rollA], "physical roll stayed with sender");
assert.notEqual(releaseRequest, afterClear, "Successful action cleanup must prevent stale request reuse later.");

sessionStorage.setItem(`pg:transfer:${transferId}:receive:request`, "not-json");
const recoveredFromCorruption = await requestIdForTransferAction("receive", transferId, [rollA, rollB]);
assert.match(recoveredFromCorruption, /^[0-9a-f-]{36}$/i, "Corrupt session continuity must recover with a new UUID.");

assert.equal(
  receiptDraftStorageKey(transferId),
  `pg:transfer:${transferId}:receipt-selection`,
  "Receipt draft storage key must stay scoped to one Transfer.",
);

const receiptFlowSource = readFileSync(new URL("../components/transfers/transfer-receipt-flow.tsx", import.meta.url), "utf8");
const resolutionPanelSource = readFileSync(new URL("../components/transfers/unresolved-resolution-panel.tsx", import.meta.url), "utf8");
const actionSource = readFileSync(new URL("../app/operations/transfers/[transferId]/actions.ts", import.meta.url), "utf8");
const receiptServerSource = readFileSync(new URL("../lib/transfers/receipt.server.ts", import.meta.url), "utf8");

for (const [label, source] of [
  ["receipt flow", receiptFlowSource],
  ["unresolved resolution panel", resolutionPanelSource],
  ["transfer actions", actionSource],
  ["receipt server reads", receiptServerSource],
]) {
  assert.doesNotMatch(source, /RpcInvoker/, `${label} must not bypass generated Supabase RPC typing.`);
  assert.doesNotMatch(source, /supabase\.rpc\s+as\s+unknown/, `${label} must call generated RPC definitions directly.`);
}

assert.match(
  resolutionPanelSource,
  /onClick=\{openResolutionConfirmation\}/,
  "Unresolved release must open a confirmation step instead of mutating immediately.",
);
assert.match(
  resolutionPanelSource,
  /تأكيد حسم \{selected\.size\} لفة؟/,
  "Resolution confirmation must show the exact selected Roll count.",
);
assert.match(
  resolutionPanelSource,
  /سيتم تحرير حجز \{selected\.size\} لفة/,
  "Resolution confirmation must explain reservation release.",
);
assert.match(
  resolutionPanelSource,
  /ستظل العهدة المؤكدة لهذه اللفات لدى المرسل/,
  "Resolution confirmation must explain that confirmed custody stays with the sender.",
);
assert.match(
  resolutionPanelSource,
  /onClick=\{submitResolution\}/,
  "The irreversible resolution mutation must be reachable only from the confirmation sheet control.",
);

const addLotStart = receiptFlowSource.indexOf("async function addLot");
const confirmLotStart = receiptFlowSource.indexOf("function confirmLotSelection");
assert.ok(addLotStart >= 0 && confirmLotStart > addLotStart, "Lot selection confirmation functions must exist in the receipt flow.");
const addLotSource = receiptFlowSource.slice(addLotStart, confirmLotStart);
assert.doesNotMatch(addLotSource, /setSelected\(/, "Lot expansion must not add Roll IDs before operator confirmation.");
assert.match(addLotSource, /setLotConfirmation\(\{ lot, additions \}\)/, "Lot expansion must stage exact candidate IDs for confirmation.");
assert.match(
  receiptFlowSource,
  /إضافة \{lotConfirmation\.additions\.length\} لفة من Lot/,
  "Lot confirmation sheet must display the exact number about to be added.",
);
assert.match(
  receiptFlowSource,
  /هذه الخطوة تضيف اللفات إلى الاختيار فقط؛ لن تنتقل العهدة قبل مراجعة الاستلام ثم تأكيده صراحةً/,
  "Lot confirmation must distinguish selection from custody movement.",
);
assert.match(receiptFlowSource, /onClick=\{confirmLotSelection\}/, "Lot IDs must only be added from the explicit confirmation control.");

console.log("Cube H Transfer receipt client retry, confirmation, and RPC typing contracts verified.");
