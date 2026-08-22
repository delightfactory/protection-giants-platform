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

const structuralSources = [
  ["receipt flow", new URL("../components/transfers/transfer-receipt-flow.tsx", import.meta.url)],
  ["unresolved resolution panel", new URL("../components/transfers/unresolved-resolution-panel.tsx", import.meta.url)],
  ["transfer actions", new URL("../app/operations/transfers/[transferId]/actions.ts", import.meta.url)],
  ["receipt server reads", new URL("../lib/transfers/receipt.server.ts", import.meta.url)],
];

for (const [label, url] of structuralSources) {
  const source = readFileSync(url, "utf8");
  assert.doesNotMatch(source, /RpcInvoker/, `${label} must not bypass generated Supabase RPC typing.`);
  assert.doesNotMatch(source, /supabase\.rpc\s+as\s+unknown/, `${label} must call generated RPC definitions directly.`);
}

const receiptDomainSource = readFileSync(new URL("../lib/transfers/receipt.ts", import.meta.url), "utf8");
assert.match(
  receiptDomainSource,
  /case "opened_roll_recovery_created": return "تم إنشاء استرداد رول مفتوح";/,
  "Opened Roll Recovery must be explicit in the Transfer timeline instead of using the generic fallback label.",
);

console.log("Cube H Transfer receipt contracts and Cube J recovery timeline integration verified.");
