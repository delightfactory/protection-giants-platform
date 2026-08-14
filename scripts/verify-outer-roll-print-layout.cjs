const assert = require("node:assert/strict");
const {
  OUTER_ROLL_LABEL_HEIGHT_MM,
  OUTER_ROLL_LABEL_WIDTH_MM,
  OUTER_ROLL_MASTER_PAGE_PROFILE,
  OuterRollPrintLayoutError,
  planOuterRollPrintLayout,
} = require("../lib/labels/outer-roll-print-layout.ts");

function model(index) {
  const suffix = String(index).padStart(4, "0");
  return {
    templateId: "outer-roll-label-v1",
    productName: "AI Pro",
    productVersion: "7.5 mil",
    sku: "AI-PRO-75",
    gtin: "4006381333931",
    widthMm: 1524,
    lengthM: 15,
    thicknessMil: 7.5,
    productionOrderNumber: "PG-PO-20260814-00000001",
    productionDate: "2026-08-14",
    lotNumber: "PG-L-20260814-00000001-01",
    lotSequence: 1,
    rollId: `44444444-4444-4444-8444-${String(index).padStart(12, "0")}`,
    rollSerial: `PG-R-20260814-00000001-01-${suffix}`,
    rollIndex: index,
    qrPayload: `https://platform.example/r/PG-R-20260814-00000001-01-${suffix}`,
  };
}

function expectError(code, callback) {
  assert.throws(callback, (error) => error instanceof OuterRollPrintLayoutError && error.code === code);
}

assert.equal(OUTER_ROLL_LABEL_WIDTH_MM, 150);
assert.equal(OUTER_ROLL_LABEL_HEIGHT_MM, 100);
assert.equal(OUTER_ROLL_MASTER_PAGE_PROFILE.mediaWidthMm, OUTER_ROLL_LABEL_WIDTH_MM);
assert.equal(OUTER_ROLL_MASTER_PAGE_PROFILE.mediaHeightMm, OUTER_ROLL_LABEL_HEIGHT_MM);
assert.equal(OUTER_ROLL_MASTER_PAGE_PROFILE.marginTopMm, 0);
assert.equal(OUTER_ROLL_MASTER_PAGE_PROFILE.marginRightMm, 0);
assert.equal(OUTER_ROLL_MASTER_PAGE_PROFILE.marginBottomMm, 0);
assert.equal(OUTER_ROLL_MASTER_PAGE_PROFILE.marginLeftMm, 0);

const fourCellProfile = {
  id: "synthetic-ci-2x2",
  mediaWidthMm: 310,
  mediaHeightMm: 210,
  marginTopMm: 0,
  marginRightMm: 0,
  marginBottomMm: 0,
  marginLeftMm: 0,
  gapXMm: 10,
  gapYMm: 10,
};

const models = [model(1), model(2), model(3)];
const layout = planOuterRollPrintLayout(models, fourCellProfile);
assert.equal(layout.columns, 2);
assert.equal(layout.rows, 2);
assert.equal(layout.cellsPerPage, 4);
assert.equal(layout.pageCount, 2);
assert.equal(layout.labelCount, 6);
assert.deepEqual(
  layout.pages[0].placements.map((placement) => [placement.model.rollIndex, placement.copyNumber]),
  [[1, 1], [1, 2], [2, 1], [2, 2]],
  "Front/back copies must stay paired before moving to the next Roll.",
);
assert.deepEqual(
  layout.pages[0].placements.map((placement) => [placement.xMm, placement.yMm]),
  [[0, 110], [160, 110], [0, 0], [160, 0]],
  "2x2 imposition must be deterministic and top-to-bottom/left-to-right.",
);
assert.deepEqual(
  layout.pages[1].placements.map((placement) => [placement.model.rollIndex, placement.copyNumber]),
  [[3, 1], [3, 2]],
);

const singleLayout = planOuterRollPrintLayout(models, OUTER_ROLL_MASTER_PAGE_PROFILE);
assert.equal(singleLayout.cellsPerPage, 1);
assert.equal(singleLayout.pageCount, 6);
assert.deepEqual(
  singleLayout.pages.map((page) => [page.placements[0].model.rollIndex, page.placements[0].copyNumber]),
  [[1, 1], [1, 2], [2, 1], [2, 2], [3, 1], [3, 2]],
  "Master pages must preserve copy adjacency across consecutive pages.",
);

expectError("profile-too-small", () => planOuterRollPrintLayout([model(1)], {
  ...OUTER_ROLL_MASTER_PAGE_PROFILE,
  id: "too-small",
  mediaWidthMm: 149,
}));
expectError("invalid-profile", () => planOuterRollPrintLayout([model(1)], {
  ...OUTER_ROLL_MASTER_PAGE_PROFILE,
  id: "negative-gap",
  gapXMm: -1,
}));
expectError("empty-print-selection", () => planOuterRollPrintLayout([], fourCellProfile));

console.log("Outer Roll master-page profile and deterministic imposition verification passed.");
