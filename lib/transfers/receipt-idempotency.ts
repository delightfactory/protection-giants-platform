export type TransferRetryAction = "receive" | "release" | "admin-release";

function sortedUnique(ids: string[]): string[] {
  return [...new Set(ids)].sort();
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function buildTransferActionFingerprint(
  action: TransferRetryAction,
  transferId: string,
  rollIds: string[],
  reason = "",
): Promise<string> {
  return sha256(JSON.stringify({
    action,
    transferId,
    rollIds: sortedUnique(rollIds),
    reason: reason.trim(),
  }));
}

function actionStorageKey(action: TransferRetryAction, transferId: string): string {
  return `pg:transfer:${transferId}:${action}:request`;
}

export async function requestIdForTransferAction(
  action: TransferRetryAction,
  transferId: string,
  rollIds: string[],
  reason = "",
): Promise<string> {
  const fingerprint = await buildTransferActionFingerprint(action, transferId, rollIds, reason);
  const key = actionStorageKey(action, transferId);
  try {
    const stored = JSON.parse(sessionStorage.getItem(key) ?? "null") as { fingerprint?: string; requestId?: string } | null;
    if (stored?.fingerprint === fingerprint && stored.requestId) return stored.requestId;
  } catch {
    // Corrupt session continuity is replaceable and must never become business state.
  }

  const requestId = crypto.randomUUID();
  sessionStorage.setItem(key, JSON.stringify({ fingerprint, requestId }));
  return requestId;
}

export function clearTransferActionRequest(action: TransferRetryAction, transferId: string): void {
  sessionStorage.removeItem(actionStorageKey(action, transferId));
}

export function receiptDraftStorageKey(transferId: string): string {
  return `pg:transfer:${transferId}:receipt-selection`;
}
