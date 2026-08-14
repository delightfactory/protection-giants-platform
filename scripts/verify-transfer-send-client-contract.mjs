import { normalizeTransferId } from "../lib/transfers/transfer-id.ts";
import {
  buildTransferSendFingerprint,
  clearTransferSendRequest,
  requestIdForTransferSend,
  transferSendSessionKey,
} from "../lib/transfers/send-idempotency.ts";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

class MemoryStorage {
  #values = new Map();
  getItem(key) { return this.#values.get(key) ?? null; }
  setItem(key, value) { this.#values.set(key, String(value)); }
  removeItem(key) { this.#values.delete(key); }
}

assert(normalizeTransferId(" pg-c-h7qf-3m9x-t5vk ") === "PG-C-H7QF-3M9X-T5VK", "Transfer ID normalization failed.");
assert(normalizeTransferId("PG-C-H7QF-3M9X-T5V0") === null, "Ambiguous Transfer ID character was accepted.");
assert(normalizeTransferId("PG-X-H7QF-3M9X-T5VK") === null, "Unsupported Transfer party prefix was accepted.");

const ids = [
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
];
const fingerprintA = await buildTransferSendFingerprint("PG-C-H7QF-3M9X-T5VK", ids);
const fingerprintReordered = await buildTransferSendFingerprint("pg-c-h7qf-3m9x-t5vk", [ids[2], ids[0], ids[1], ids[0]]);
assert(fingerprintA === fingerprintReordered, "Transfer Send fingerprint must be order-insensitive and duplicate-safe.");

const fingerprintDifferentRecipient = await buildTransferSendFingerprint("PG-D-M6YT-4R8K-W2PC", ids);
assert(fingerprintDifferentRecipient !== fingerprintA, "Recipient change did not change payload fingerprint.");
const fingerprintDifferentRolls = await buildTransferSendFingerprint("PG-C-H7QF-3M9X-T5VK", ids.slice(0, 2));
assert(fingerprintDifferentRolls !== fingerprintA, "Roll selection change did not change payload fingerprint.");

const storage = new MemoryStorage();
const requestA = requestIdForTransferSend(fingerprintA, storage);
const requestRetry = requestIdForTransferSend(fingerprintA, storage);
assert(requestA === requestRetry, "Same Transfer payload did not reuse the session request ID.");
assert(/^[0-9a-f-]{36}$/i.test(requestA), "Generated Transfer request ID is not UUID-shaped.");

const requestChanged = requestIdForTransferSend(fingerprintDifferentRolls, storage);
assert(requestChanged !== requestA, "Changed Transfer payload reused a stale request ID.");
const stored = JSON.parse(storage.getItem(transferSendSessionKey));
assert(stored.payloadFingerprint === fingerprintDifferentRolls && stored.requestId === requestChanged, "Session state did not track the latest payload safely.");

clearTransferSendRequest(storage);
assert(storage.getItem(transferSendSessionKey) === null, "Successful Transfer Send request state was not cleared.");

console.log("Cube G Transfer Send client idempotency and Transfer ID contracts verified.");
