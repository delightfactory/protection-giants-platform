import type { OuterRollLabelViewModel } from "./outer-roll-label-plan";

export const OUTER_ROLL_LABEL_WIDTH_MM = 150;
export const OUTER_ROLL_LABEL_HEIGHT_MM = 100;

export type OuterRollPrintProfile = {
  id: string;
  mediaWidthMm: number;
  mediaHeightMm: number;
  marginTopMm: number;
  marginRightMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  gapXMm: number;
  gapYMm: number;
};

export type OuterRollLabelPlacement = {
  model: OuterRollLabelViewModel;
  copyNumber: 1 | 2;
  xMm: number;
  yMm: number;
};

export type OuterRollPrintPagePlan = {
  pageNumber: number;
  placements: readonly OuterRollLabelPlacement[];
};

export type OuterRollPrintLayoutPlan = {
  profile: OuterRollPrintProfile;
  columns: number;
  rows: number;
  cellsPerPage: number;
  pageCount: number;
  labelCount: number;
  pages: readonly OuterRollPrintPagePlan[];
};

export type OuterRollPrintLayoutErrorCode =
  | "invalid-profile"
  | "profile-too-small"
  | "empty-print-selection";

export class OuterRollPrintLayoutError extends Error {
  readonly code: OuterRollPrintLayoutErrorCode;

  constructor(code: OuterRollPrintLayoutErrorCode, message: string) {
    super(message);
    this.name = "OuterRollPrintLayoutError";
    this.code = code;
  }
}

function fail(code: OuterRollPrintLayoutErrorCode, message: string): never {
  throw new OuterRollPrintLayoutError(code, message);
}

function isFinitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isFiniteNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

export function validateOuterRollPrintProfile(profile: OuterRollPrintProfile): OuterRollPrintProfile {
  if (!profile.id.trim()) {
    return fail("invalid-profile", "Outer Roll print profile requires a stable identifier.");
  }

  if (!isFinitePositive(profile.mediaWidthMm) || !isFinitePositive(profile.mediaHeightMm)) {
    return fail("invalid-profile", "Outer Roll print media dimensions must be positive millimetre values.");
  }

  const nonNegativeValues = [
    profile.marginTopMm,
    profile.marginRightMm,
    profile.marginBottomMm,
    profile.marginLeftMm,
    profile.gapXMm,
    profile.gapYMm,
  ];
  if (nonNegativeValues.some((value) => !isFiniteNonNegative(value))) {
    return fail("invalid-profile", "Outer Roll print margins and gaps must be finite non-negative millimetre values.");
  }

  const usableWidthMm = profile.mediaWidthMm - profile.marginLeftMm - profile.marginRightMm;
  const usableHeightMm = profile.mediaHeightMm - profile.marginTopMm - profile.marginBottomMm;
  if (usableWidthMm <= 0 || usableHeightMm <= 0) {
    return fail("invalid-profile", "Outer Roll print margins consume the entire media area.");
  }

  return { ...profile, id: profile.id.trim() };
}

function calculateCellCount(usableMm: number, labelMm: number, gapMm: number): number {
  return Math.floor((usableMm + gapMm + 1e-9) / (labelMm + gapMm));
}

function buildCells(profile: OuterRollPrintProfile, columns: number, rows: number) {
  const cells: Array<{ xMm: number; yMm: number }> = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const xMm = profile.marginLeftMm + column * (OUTER_ROLL_LABEL_WIDTH_MM + profile.gapXMm);
      const topMm = profile.marginTopMm + row * (OUTER_ROLL_LABEL_HEIGHT_MM + profile.gapYMm);
      const yMm = profile.mediaHeightMm - topMm - OUTER_ROLL_LABEL_HEIGHT_MM;
      cells.push({ xMm, yMm });
    }
  }

  return cells;
}

export function planOuterRollPrintLayout(
  models: readonly OuterRollLabelViewModel[],
  rawProfile: OuterRollPrintProfile,
): OuterRollPrintLayoutPlan {
  if (models.length === 0) {
    return fail("empty-print-selection", "Outer Roll print layout requires at least one Roll label model.");
  }

  const profile = validateOuterRollPrintProfile(rawProfile);
  const usableWidthMm = profile.mediaWidthMm - profile.marginLeftMm - profile.marginRightMm;
  const usableHeightMm = profile.mediaHeightMm - profile.marginTopMm - profile.marginBottomMm;
  const columns = calculateCellCount(usableWidthMm, OUTER_ROLL_LABEL_WIDTH_MM, profile.gapXMm);
  const rows = calculateCellCount(usableHeightMm, OUTER_ROLL_LABEL_HEIGHT_MM, profile.gapYMm);
  const cellsPerPage = columns * rows;

  if (cellsPerPage < 1) {
    return fail(
      "profile-too-small",
      `Print profile ${profile.id} cannot fit the provisional ${OUTER_ROLL_LABEL_WIDTH_MM}×${OUTER_ROLL_LABEL_HEIGHT_MM} mm outer Roll label.`,
    );
  }

  const cells = buildCells(profile, columns, rows);
  const pages: OuterRollPrintPagePlan[] = [];

  if (cellsPerPage === 1) {
    for (const model of models) {
      for (const copyNumber of [1, 2] as const) {
        pages.push({
          pageNumber: pages.length + 1,
          placements: [{ model, copyNumber, ...cells[0] }],
        });
      }
    }
  } else {
    const rollsPerPage = Math.floor(cellsPerPage / 2);
    for (let offset = 0; offset < models.length; offset += rollsPerPage) {
      const pageModels = models.slice(offset, offset + rollsPerPage);
      const placements: OuterRollLabelPlacement[] = [];

      for (const model of pageModels) {
        for (const copyNumber of [1, 2] as const) {
          const cell = cells[placements.length];
          if (!cell) {
            return fail("profile-too-small", "Print profile pairing capacity changed unexpectedly.");
          }
          placements.push({ model, copyNumber, ...cell });
        }
      }

      pages.push({ pageNumber: pages.length + 1, placements });
    }
  }

  return {
    profile,
    columns,
    rows,
    cellsPerPage,
    pageCount: pages.length,
    labelCount: models.length * 2,
    pages,
  };
}
