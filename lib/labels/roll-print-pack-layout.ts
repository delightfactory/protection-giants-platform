import type { RollPrintPack, RollPrintPackChunk } from "./roll-print-pack-plan";
import { OUTER_ROLL_LABEL_HEIGHT_MM, OUTER_ROLL_LABEL_WIDTH_MM } from "./outer-roll-print-layout";
import { WARRANTY_QR_LABEL_TEMPLATE } from "./warranty-qr-label-template";

export const ROLL_PRINT_PACK_MASTER_PROFILE = {
  id: "roll-print-pack-v1-master-page",
  widthMm: 318,
  heightMm: 181,
  marginMm: 6,
  horizontalGapMm: 6,
  rowGapMm: 8,
  headerGapMm: 4,
  headerHeightMm: 12,
} as const;

export type RollPrintPackPlacement =
  | {
      kind: "outer";
      copyNumber: 1 | 2;
      xMm: number;
      yMm: number;
      widthMm: number;
      heightMm: number;
    }
  | {
      kind: "warranty";
      copyNumber: 1 | 2 | 3;
      xMm: number;
      yMm: number;
      widthMm: number;
      heightMm: number;
    };

export type RollPrintPackMasterPage = {
  pack: RollPrintPack;
  packOrdinal: number;
  totalPackCount: number;
  pageNumber: number;
  header: {
    xMm: number;
    yMm: number;
    widthMm: number;
    heightMm: number;
  };
  placements: readonly RollPrintPackPlacement[];
};

export type RollPrintPackMasterLayout = {
  profile: typeof ROLL_PRINT_PACK_MASTER_PROFILE;
  pageCount: number;
  pages: readonly RollPrintPackMasterPage[];
};

export class RollPrintPackLayoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RollPrintPackLayoutError";
  }
}

function buildFixedPlacements(): readonly RollPrintPackPlacement[] {
  const profile = ROLL_PRINT_PACK_MASTER_PROFILE;
  const warrantyRowWidth = WARRANTY_QR_LABEL_TEMPLATE.widthMm * 3 + profile.horizontalGapMm * 2;
  const warrantyStartX = (profile.widthMm - warrantyRowWidth) / 2;
  const warrantyY = profile.marginMm;
  const outerY = warrantyY + WARRANTY_QR_LABEL_TEMPLATE.heightMm + profile.rowGapMm;
  const headerY = outerY + OUTER_ROLL_LABEL_HEIGHT_MM + profile.headerGapMm;

  const placements: RollPrintPackPlacement[] = [
    {
      kind: "outer",
      copyNumber: 1,
      xMm: profile.marginMm,
      yMm: outerY,
      widthMm: OUTER_ROLL_LABEL_WIDTH_MM,
      heightMm: OUTER_ROLL_LABEL_HEIGHT_MM,
    },
    {
      kind: "outer",
      copyNumber: 2,
      xMm: profile.marginMm + OUTER_ROLL_LABEL_WIDTH_MM + profile.horizontalGapMm,
      yMm: outerY,
      widthMm: OUTER_ROLL_LABEL_WIDTH_MM,
      heightMm: OUTER_ROLL_LABEL_HEIGHT_MM,
    },
    ...([1, 2, 3] as const).map((copyNumber, index) => ({
      kind: "warranty" as const,
      copyNumber,
      xMm: warrantyStartX + index * (WARRANTY_QR_LABEL_TEMPLATE.widthMm + profile.horizontalGapMm),
      yMm: warrantyY,
      widthMm: WARRANTY_QR_LABEL_TEMPLATE.widthMm,
      heightMm: WARRANTY_QR_LABEL_TEMPLATE.heightMm,
    })),
  ];

  if (placements.length !== 5) {
    throw new RollPrintPackLayoutError("Master Pack geometry must contain exactly five label cut regions.");
  }

  const maxX = Math.max(...placements.map((placement) => placement.xMm + placement.widthMm));
  const maxY = Math.max(...placements.map((placement) => placement.yMm + placement.heightMm));
  if (maxX > profile.widthMm - profile.marginMm + 1e-9 || maxY > headerY + 1e-9) {
    throw new RollPrintPackLayoutError("Master Pack label geometry exceeds the configured proof canvas.");
  }
  if (headerY + profile.headerHeightMm > profile.heightMm - profile.marginMm + 1e-9) {
    throw new RollPrintPackLayoutError("Master Pack guide header exceeds the configured proof canvas.");
  }

  return placements;
}

export function planRollPrintPackMasterLayout(input: {
  chunk: RollPrintPackChunk;
  firstPackOrdinal: number;
  totalPackCount: number;
}): RollPrintPackMasterLayout {
  if (!Number.isInteger(input.firstPackOrdinal) || input.firstPackOrdinal < 1) {
    throw new RollPrintPackLayoutError("Master Pack first ordinal must be a positive integer.");
  }
  if (!Number.isInteger(input.totalPackCount) || input.totalPackCount < input.chunk.packCount) {
    throw new RollPrintPackLayoutError("Master Pack total count is invalid.");
  }
  if (input.chunk.packs.length !== input.chunk.packCount || input.chunk.packCount < 1) {
    throw new RollPrintPackLayoutError("Master Pack chunk count does not match its Pack collection.");
  }

  const placements = buildFixedPlacements();
  const profile = ROLL_PRINT_PACK_MASTER_PROFILE;
  const outerY = profile.marginMm + WARRANTY_QR_LABEL_TEMPLATE.heightMm + profile.rowGapMm;
  const headerY = outerY + OUTER_ROLL_LABEL_HEIGHT_MM + profile.headerGapMm;

  const pages = input.chunk.packs.map<RollPrintPackMasterPage>((pack, index) => ({
    pack,
    packOrdinal: input.firstPackOrdinal + index,
    totalPackCount: input.totalPackCount,
    pageNumber: index + 1,
    header: {
      xMm: profile.marginMm,
      yMm: headerY,
      widthMm: profile.widthMm - profile.marginMm * 2,
      heightMm: profile.headerHeightMm,
    },
    placements,
  }));

  const lastOrdinal = pages[pages.length - 1]?.packOrdinal ?? 0;
  if (lastOrdinal > input.totalPackCount) {
    throw new RollPrintPackLayoutError("Master Pack chunk ordinal exceeds the selected Roll count.");
  }

  return {
    profile,
    pageCount: pages.length,
    pages,
  };
}
