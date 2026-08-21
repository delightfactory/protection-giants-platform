export const MAX_TRANSFER_RECEIPT_ROLLS = 10000;

export type ReceiptLotSelectionPlan = {
  next: Set<string>;
  additions: string[];
};

export function planReceiptLotSelection(
  current: ReadonlySet<string>,
  pendingRollIds: readonly string[],
  maxRolls = MAX_TRANSFER_RECEIPT_ROLLS,
): ReceiptLotSelectionPlan {
  const next = new Set(current);
  const additions: string[] = [];

  if (maxRolls <= 0 || next.size >= maxRolls) {
    return { next, additions };
  }

  for (const rollId of pendingRollIds) {
    if (next.has(rollId)) continue;
    if (next.size >= maxRolls) break;
    next.add(rollId);
    additions.push(rollId);
  }

  return { next, additions };
}
