import { normalizeTransferId } from "./transfer-id";

export const transferSendSessionKey = "pg.transfer-send.pending.v1";

type PendingTransferSend = {
  payloadFingerprint: string;
  requestId: string;
};

export async function buildTransferSendFingerprint(recipientTransferId: string, rollIds: Iterable<string>): Promise<string> {
  const recipient = normalizeTransferId(recipientTransferId);
  if (!recipient) throw new Error("A valid recipient Transfer ID is required.");

  const sortedRollIds = [...new Set(rollIds)].sort();
  const source = `${recipient}|${sortedRollIds.join(",")}`;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function requestIdForTransferSend(
  payloadFingerprint: string,
  storage: Pick<Storage, "getItem" | "setItem"> = globalThis.sessionStorage,
): string {
  try {
    const existing = storage.getItem(transferSendSessionKey);
    if (existing) {
      const parsed = JSON.parse(existing) as Partial<PendingTransferSend>;
      if (
        parsed.payloadFingerprint === payloadFingerprint
        && typeof parsed.requestId === "string"
        && /^[0-9a-f-]{36}$/i.test(parsed.requestId)
      ) {
        return parsed.requestId;
      }
    }
  } catch {
    // Corrupt or blocked session storage falls through to a fresh key.
  }

  const requestId = globalThis.crypto.randomUUID();
  try {
    storage.setItem(transferSendSessionKey, JSON.stringify({ payloadFingerprint, requestId } satisfies PendingTransferSend));
  } catch {
    // Cube F still protects duplicate execution within the active request.
  }
  return requestId;
}

export function clearTransferSendRequest(storage: Pick<Storage, "removeItem"> = globalThis.sessionStorage) {
  try {
    storage.removeItem(transferSendSessionKey);
  } catch {
    // Success is already committed; inability to clear local session state is non-fatal.
  }
}
