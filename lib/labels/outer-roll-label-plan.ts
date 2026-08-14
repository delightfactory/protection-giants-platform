export const OUTER_ROLL_LABEL_TEMPLATE_ID = "outer-roll-label-v1" as const;
export const OUTER_ROLL_LABEL_COPIES_PER_ROLL = 2 as const;
export const OUTER_ROLL_LABEL_DEFAULT_ROLL_CHUNK_SIZE = 100;
export const OUTER_ROLL_LABEL_MAX_ROLL_CHUNK_SIZE = 500;

const canonicalRollSerialPattern = /^PG-R-[0-9]{8}-[0-9]{8}-[0-9]{2}-[0-9]{4,5}$/;
const supportedGtinLengths = new Set([8, 12, 13, 14]);

export type OuterRollLabelSelection =
  | { mode: "order" }
  | { mode: "lot"; lotId: string }
  | { mode: "roll-range"; fromSerial: string; toSerial: string };

export type OuterRollLabelProductSource = {
  id: string;
  gtin: string | null;
};

export type OuterRollLabelOrderSource = {
  id: string;
  productId: string;
  status: string;
  orderNumber: string;
  productionDate: string;
  totalRolls: number;
  productCodeSnapshot: string;
  productNameSnapshot: string;
  productVersionSnapshot: string | null;
  widthMmSnapshot: number;
  lengthMSnapshot: number;
  thicknessMilSnapshot: number;
};

export type OuterRollLabelLotSource = {
  id: string;
  productionOrderId: string;
  lotNumber: string;
  lotSequence: number;
  rollCount: number;
};

export type OuterRollLabelRollSource = {
  id: string;
  productionOrderId: string;
  productionLotId: string;
  serialNumber: string;
  rollIndex: number;
};

export type OuterRollLabelPlanInput = {
  publicSiteOrigin: string;
  product: OuterRollLabelProductSource;
  order: OuterRollLabelOrderSource;
  lots: readonly OuterRollLabelLotSource[];
  rolls: readonly OuterRollLabelRollSource[];
  selection: OuterRollLabelSelection;
  rollChunkSize?: number;
};

export type OuterRollLabelViewModel = {
  templateId: typeof OUTER_ROLL_LABEL_TEMPLATE_ID;
  productName: string;
  productVersion: string | null;
  sku: string;
  gtin: string;
  widthMm: number;
  lengthM: number;
  thicknessMil: number;
  productionOrderNumber: string;
  productionDate: string;
  lotNumber: string;
  lotSequence: number;
  rollId: string;
  rollSerial: string;
  rollIndex: number;
  qrPayload: string;
};

export type OuterRollLabelChunk = {
  chunkNumber: number;
  rollCount: number;
  labelCount: number;
  firstRollSerial: string;
  lastRollSerial: string;
  items: readonly OuterRollLabelViewModel[];
};

export type OuterRollLabelPlan = {
  templateId: typeof OUTER_ROLL_LABEL_TEMPLATE_ID;
  copiesPerRoll: typeof OUTER_ROLL_LABEL_COPIES_PER_ROLL;
  selection: OuterRollLabelSelection;
  rollCount: number;
  labelCount: number;
  rollChunkSize: number;
  chunks: readonly OuterRollLabelChunk[];
};

export type OuterRollLabelPlanErrorCode =
  | "order-not-generated"
  | "product-mismatch"
  | "missing-gtin"
  | "invalid-gtin"
  | "invalid-public-origin"
  | "invalid-lot"
  | "invalid-roll"
  | "duplicate-roll"
  | "source-incomplete"
  | "selection-not-found"
  | "invalid-range"
  | "empty-selection"
  | "invalid-chunk-size";

export class OuterRollLabelPlanError extends Error {
  readonly code: OuterRollLabelPlanErrorCode;

  constructor(code: OuterRollLabelPlanErrorCode, message: string) {
    super(message);
    this.name = "OuterRollLabelPlanError";
    this.code = code;
  }
}

function fail(code: OuterRollLabelPlanErrorCode, message: string): never {
  throw new OuterRollLabelPlanError(code, message);
}

function normalizePublicOrigin(value: string): string {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      return fail("invalid-public-origin", "Outer Roll label QR requires an HTTPS public site origin.");
    }
    return url.origin;
  } catch (error) {
    if (error instanceof OuterRollLabelPlanError) throw error;
    return fail("invalid-public-origin", "Outer Roll label QR requires a valid public site origin.");
  }
}

function assertGtin(gtin: string | null): string {
  if (!gtin) return fail("missing-gtin", "Product GTIN is required before outer Roll labels can be planned.");
  if (!/^\d+$/.test(gtin) || !supportedGtinLengths.has(gtin.length)) {
    return fail("invalid-gtin", "Product GTIN must be a canonical 8, 12, 13 or 14 digit value.");
  }
  return gtin;
}

function assertChunkSize(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > OUTER_ROLL_LABEL_MAX_ROLL_CHUNK_SIZE) {
    return fail(
      "invalid-chunk-size",
      `Outer Roll label software chunks must contain 1-${OUTER_ROLL_LABEL_MAX_ROLL_CHUNK_SIZE} Rolls.`,
    );
  }
  return value;
}

function compareRolls(
  left: OuterRollLabelRollSource,
  right: OuterRollLabelRollSource,
  lotSequenceById: ReadonlyMap<string, number>,
) {
  const lotDifference = (lotSequenceById.get(left.productionLotId) ?? 0) - (lotSequenceById.get(right.productionLotId) ?? 0);
  if (lotDifference !== 0) return lotDifference;
  if (left.rollIndex !== right.rollIndex) return left.rollIndex - right.rollIndex;
  return left.serialNumber.localeCompare(right.serialNumber, "en");
}

function selectRolls(
  rolls: readonly OuterRollLabelRollSource[],
  selection: OuterRollLabelSelection,
): readonly OuterRollLabelRollSource[] {
  if (selection.mode === "order") return rolls;

  if (selection.mode === "lot") {
    const selected = rolls.filter((roll) => roll.productionLotId === selection.lotId);
    if (selected.length === 0) return fail("selection-not-found", "Selected Lot has no eligible Rolls in this Production Order.");
    return selected;
  }

  const fromIndex = rolls.findIndex((roll) => roll.serialNumber === selection.fromSerial);
  const toIndex = rolls.findIndex((roll) => roll.serialNumber === selection.toSerial);
  if (fromIndex < 0 || toIndex < 0) {
    return fail("selection-not-found", "Roll range boundary is not part of this Production Order.");
  }
  if (fromIndex > toIndex) {
    return fail("invalid-range", "Roll range start must precede or equal its end in canonical Production order.");
  }
  return rolls.slice(fromIndex, toIndex + 1);
}

export function materializeOuterRollLabelCopies(
  model: OuterRollLabelViewModel,
): readonly [OuterRollLabelViewModel, OuterRollLabelViewModel] {
  return [{ ...model }, { ...model }];
}

export function buildOuterRollLabelPlan(input: OuterRollLabelPlanInput): OuterRollLabelPlan {
  if (input.order.status !== "generated") {
    return fail("order-not-generated", "Only generated Production Orders are eligible for outer Roll labels.");
  }
  if (input.order.productId !== input.product.id) {
    return fail("product-mismatch", "Production Order Product does not match the supplied Product identity.");
  }
  if (!Number.isInteger(input.order.totalRolls) || input.order.totalRolls < 1) {
    return fail("source-incomplete", "Production Order Roll total is invalid for outer Roll label planning.");
  }

  const gtin = assertGtin(input.product.gtin);
  const publicOrigin = normalizePublicOrigin(input.publicSiteOrigin);
  const rollChunkSize = assertChunkSize(input.rollChunkSize ?? OUTER_ROLL_LABEL_DEFAULT_ROLL_CHUNK_SIZE);

  const lotById = new Map<string, OuterRollLabelLotSource>();
  const lotSequenceById = new Map<string, number>();
  const usedLotSequences = new Set<number>();
  let expectedRollsFromLots = 0;

  for (const lot of input.lots) {
    if (
      lot.productionOrderId !== input.order.id
      || !lot.id
      || !lot.lotNumber
      || !Number.isInteger(lot.lotSequence)
      || lot.lotSequence < 1
      || !Number.isInteger(lot.rollCount)
      || lot.rollCount < 1
      || lotById.has(lot.id)
      || usedLotSequences.has(lot.lotSequence)
    ) {
      return fail("invalid-lot", "Outer Roll label source contains an invalid or duplicate Lot.");
    }
    lotById.set(lot.id, lot);
    lotSequenceById.set(lot.id, lot.lotSequence);
    usedLotSequences.add(lot.lotSequence);
    expectedRollsFromLots += lot.rollCount;
  }

  if (expectedRollsFromLots !== input.order.totalRolls || input.rolls.length !== input.order.totalRolls) {
    return fail("source-incomplete", "Outer Roll label source is incomplete or over-complete for this Production Order.");
  }

  const rollIds = new Set<string>();
  const rollSerials = new Set<string>();
  const rollPositions = new Set<string>();
  const actualRollCountByLot = new Map<string, number>();

  for (const roll of input.rolls) {
    const lot = lotById.get(roll.productionLotId);
    const positionKey = `${roll.productionLotId}:${roll.rollIndex}`;
    if (
      roll.productionOrderId !== input.order.id
      || !lot
      || !roll.id
      || !canonicalRollSerialPattern.test(roll.serialNumber)
      || !Number.isInteger(roll.rollIndex)
      || roll.rollIndex < 1
    ) {
      return fail("invalid-roll", "Outer Roll label source contains a Roll outside the canonical Production identity contract.");
    }
    if (rollIds.has(roll.id) || rollSerials.has(roll.serialNumber) || rollPositions.has(positionKey)) {
      return fail("duplicate-roll", "Outer Roll label source contains a duplicate Roll identity or Lot position.");
    }
    rollIds.add(roll.id);
    rollSerials.add(roll.serialNumber);
    rollPositions.add(positionKey);
    actualRollCountByLot.set(roll.productionLotId, (actualRollCountByLot.get(roll.productionLotId) ?? 0) + 1);
  }

  for (const lot of input.lots) {
    if ((actualRollCountByLot.get(lot.id) ?? 0) !== lot.rollCount) {
      return fail("source-incomplete", `Outer Roll label source does not contain the expected Rolls for Lot ${lot.lotNumber}.`);
    }
  }

  const orderedRolls = [...input.rolls].sort((left, right) => compareRolls(left, right, lotSequenceById));
  const selectedRolls = selectRolls(orderedRolls, input.selection);
  if (selectedRolls.length === 0) {
    return fail("empty-selection", "Outer Roll label selection contains no Rolls.");
  }

  const items = selectedRolls.map<OuterRollLabelViewModel>((roll) => {
    const lot = lotById.get(roll.productionLotId);
    if (!lot) return fail("invalid-roll", "Roll Lot identity disappeared during outer label planning.");

    return {
      templateId: OUTER_ROLL_LABEL_TEMPLATE_ID,
      productName: input.order.productNameSnapshot,
      productVersion: input.order.productVersionSnapshot,
      sku: input.order.productCodeSnapshot,
      gtin,
      widthMm: input.order.widthMmSnapshot,
      lengthM: input.order.lengthMSnapshot,
      thicknessMil: input.order.thicknessMilSnapshot,
      productionOrderNumber: input.order.orderNumber,
      productionDate: input.order.productionDate,
      lotNumber: lot.lotNumber,
      lotSequence: lot.lotSequence,
      rollId: roll.id,
      rollSerial: roll.serialNumber,
      rollIndex: roll.rollIndex,
      qrPayload: `${publicOrigin}/r/${encodeURIComponent(roll.serialNumber)}`,
    };
  });

  const chunks: OuterRollLabelChunk[] = [];
  for (let offset = 0; offset < items.length; offset += rollChunkSize) {
    const chunkItems = items.slice(offset, offset + rollChunkSize);
    const first = chunkItems[0];
    const last = chunkItems[chunkItems.length - 1];
    if (!first || !last) continue;
    chunks.push({
      chunkNumber: chunks.length + 1,
      rollCount: chunkItems.length,
      labelCount: chunkItems.length * OUTER_ROLL_LABEL_COPIES_PER_ROLL,
      firstRollSerial: first.rollSerial,
      lastRollSerial: last.rollSerial,
      items: chunkItems,
    });
  }

  return {
    templateId: OUTER_ROLL_LABEL_TEMPLATE_ID,
    copiesPerRoll: OUTER_ROLL_LABEL_COPIES_PER_ROLL,
    selection: input.selection,
    rollCount: items.length,
    labelCount: items.length * OUTER_ROLL_LABEL_COPIES_PER_ROLL,
    rollChunkSize,
    chunks,
  };
}
