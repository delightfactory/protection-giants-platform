import {
  materializeOuterRollLabelCopies,
  type OuterRollLabelPlan,
  type OuterRollLabelViewModel,
} from "./outer-roll-label-plan";
import {
  buildWarrantyQrLabelModel,
  materializeWarrantyQrLabelCopies,
  type WarrantyQrLabelCopy,
} from "./warranty-qr-label-plan";

export const ROLL_PRINT_PACK_LABEL_PIECES = 5 as const;

export type RollPrintPackWarrantyIdentity = {
  rollId: string;
  publicCode: string;
};

export type RollPrintPackOuterCopy = {
  copyNumber: 1 | 2;
  model: OuterRollLabelViewModel;
};

export type RollPrintPack = {
  rollId: string;
  rollSerial: string;
  lotSequence: number;
  rollIndex: number;
  outerCopies: readonly [RollPrintPackOuterCopy, RollPrintPackOuterCopy];
  warrantyCopies: readonly [WarrantyQrLabelCopy, WarrantyQrLabelCopy, WarrantyQrLabelCopy];
};

export type RollPrintPackChunk = {
  chunkNumber: number;
  packCount: number;
  physicalLabelCount: number;
  firstRollSerial: string;
  lastRollSerial: string;
  packs: readonly RollPrintPack[];
};

export type RollPrintPackPlan = {
  rollCount: number;
  packCount: number;
  outerLabelCount: number;
  warrantyLabelCount: number;
  physicalLabelCount: number;
  chunks: readonly RollPrintPackChunk[];
};

export class RollPrintPackPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RollPrintPackPlanError";
  }
}

export function buildRollPrintPackPlan(input: {
  outerPlan: OuterRollLabelPlan;
  warrantyIdentities: ReadonlyMap<string, RollPrintPackWarrantyIdentity>;
}): RollPrintPackPlan {
  const usedRollIds = new Set<string>();
  const chunks: RollPrintPackChunk[] = input.outerPlan.chunks.map((outerChunk) => {
    const packs = outerChunk.items.map<RollPrintPack>((outerModel) => {
      if (usedRollIds.has(outerModel.rollId)) {
        throw new RollPrintPackPlanError("Outer Roll plan contains a duplicate Roll across Pack chunks.");
      }
      usedRollIds.add(outerModel.rollId);

      const identity = input.warrantyIdentities.get(outerModel.rollId);
      if (!identity || identity.rollId !== outerModel.rollId) {
        throw new RollPrintPackPlanError("Selected Roll is missing its exact Warranty print identity.");
      }

      const [outer1, outer2] = materializeOuterRollLabelCopies(outerModel);
      const warrantyModel = buildWarrantyQrLabelModel({
        publicCode: identity.publicCode,
        productNameSnapshot: outerModel.productName,
      });
      const warrantyCopies = materializeWarrantyQrLabelCopies(warrantyModel);

      return {
        rollId: outerModel.rollId,
        rollSerial: outerModel.rollSerial,
        lotSequence: outerModel.lotSequence,
        rollIndex: outerModel.rollIndex,
        outerCopies: [
          { copyNumber: 1, model: outer1 },
          { copyNumber: 2, model: outer2 },
        ],
        warrantyCopies,
      };
    });

    const first = packs[0];
    const last = packs[packs.length - 1];
    if (!first || !last) {
      throw new RollPrintPackPlanError("Roll Print Pack chunk cannot be empty.");
    }

    return {
      chunkNumber: outerChunk.chunkNumber,
      packCount: packs.length,
      physicalLabelCount: packs.length * ROLL_PRINT_PACK_LABEL_PIECES,
      firstRollSerial: first.rollSerial,
      lastRollSerial: last.rollSerial,
      packs,
    };
  });

  if (usedRollIds.size !== input.outerPlan.rollCount) {
    throw new RollPrintPackPlanError("Roll Print Pack count does not match the selected Outer Roll plan.");
  }

  const rollCount = input.outerPlan.rollCount;
  return {
    rollCount,
    packCount: rollCount,
    outerLabelCount: rollCount * 2,
    warrantyLabelCount: rollCount * 3,
    physicalLabelCount: rollCount * ROLL_PRINT_PACK_LABEL_PIECES,
    chunks,
  };
}
