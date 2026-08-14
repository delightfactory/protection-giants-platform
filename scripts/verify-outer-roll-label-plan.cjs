const assert = require("node:assert/strict");
const {
  OUTER_ROLL_LABEL_COPIES_PER_ROLL,
  OUTER_ROLL_LABEL_DEFAULT_ROLL_CHUNK_SIZE,
  OuterRollLabelPlanError,
  buildOuterRollLabelPlan,
  materializeOuterRollLabelCopies,
} = require("../lib/labels/outer-roll-label-plan.ts");
const { buildRollQrUrl } = require("../lib/rolls/roll-qr.ts");

const origin = "https://platform.example";
const orderId = "11111111-1111-4111-8111-111111111111";
const productId = "22222222-2222-4222-8222-222222222222";
const lot1Id = "33333333-3333-4333-8333-333333333331";
const lot2Id = "33333333-3333-4333-8333-333333333332";

function serial(lotSequence, rollIndex) {
  return `PG-R-20260814-00000001-${String(lotSequence).padStart(2, "0")}-${String(rollIndex).padStart(4, "0")}`;
}

function roll(idSuffix, lotId, lotSequence, rollIndex) {
  return {
    id: `44444444-4444-4444-8444-${String(idSuffix).padStart(12, "0")}`,
    productionOrderId: orderId,
    productionLotId: lotId,
    serialNumber: serial(lotSequence, rollIndex),
    rollIndex,
  };
}

function fixture(overrides = {}) {
  return {
    publicSiteOrigin: origin,
    product: { id: productId, gtin: "4006381333931" },
    order: {
      id: orderId,
      productId,
      status: "generated",
      orderNumber: "PG-PO-20260814-00000001",
      productionDate: "2026-08-14",
      totalRolls: 3,
      productCodeSnapshot: "AI-PRO-75",
      productNameSnapshot: "AI Pro",
      productVersionSnapshot: "7.5 mil",
      widthMmSnapshot: 1524,
      lengthMSnapshot: 15,
      thicknessMilSnapshot: 7.5,
    },
    lots: [
      { id: lot2Id, productionOrderId: orderId, lotNumber: "PG-L-20260814-00000001-02", lotSequence: 2, rollCount: 1 },
      { id: lot1Id, productionOrderId: orderId, lotNumber: "PG-L-20260814-00000001-01", lotSequence: 1, rollCount: 2 },
    ],
    rolls: [
      roll(3, lot2Id, 2, 1),
      roll(2, lot1Id, 1, 2),
      roll(1, lot1Id, 1, 1),
    ],
    selection: { mode: "order" },
    rollChunkSize: 2,
    ...overrides,
  };
}

function expectPlanError(code, callback) {
  assert.throws(callback, (error) => error instanceof OuterRollLabelPlanError && error.code === code);
}

const plan = buildOuterRollLabelPlan(fixture());
assert.equal(plan.rollCount, 3);
assert.equal(plan.labelCount, 3 * OUTER_ROLL_LABEL_COPIES_PER_ROLL);
assert.equal(plan.chunks.length, 2);
assert.deepEqual(
  plan.chunks.flatMap((chunk) => chunk.items.map((item) => item.rollSerial)),
  [serial(1, 1), serial(1, 2), serial(2, 1)],
);
assert.equal(plan.chunks[0].rollCount, 2);
assert.equal(plan.chunks[0].labelCount, 4);
assert.equal(plan.chunks[1].rollCount, 1);
assert.equal(plan.chunks[1].labelCount, 2);

const firstModel = plan.chunks[0].items[0];
assert.equal(firstModel.productName, "AI Pro");
assert.equal(firstModel.productVersion, "7.5 mil");
assert.equal(firstModel.sku, "AI-PRO-75");
assert.equal(firstModel.gtin, "4006381333931");
assert.equal(firstModel.widthMm, 1524);
assert.equal(firstModel.lengthM, 15);
assert.equal(firstModel.thicknessMil, 7.5);
assert.equal(firstModel.lotNumber, "PG-L-20260814-00000001-01");
assert.equal(firstModel.qrPayload, buildRollQrUrl(origin, firstModel.rollSerial));

const [copyA, copyB] = materializeOuterRollLabelCopies(firstModel);
assert.deepEqual(copyA, copyB);
assert.notStrictEqual(copyA, copyB);

const repeatPlan = buildOuterRollLabelPlan(fixture());
assert.deepEqual(repeatPlan, plan, "Reprint planning must be deterministic for unchanged source data.");

const lotPlan = buildOuterRollLabelPlan(fixture({ selection: { mode: "lot", lotId: lot2Id } }));
assert.equal(lotPlan.rollCount, 1);
assert.equal(lotPlan.chunks[0].items[0].rollSerial, serial(2, 1));

const rangePlan = buildOuterRollLabelPlan(fixture({
  selection: { mode: "roll-range", fromSerial: serial(1, 2), toSerial: serial(2, 1) },
}));
assert.deepEqual(
  rangePlan.chunks.flatMap((chunk) => chunk.items.map((item) => item.rollSerial)),
  [serial(1, 2), serial(2, 1)],
);

expectPlanError("order-not-generated", () => buildOuterRollLabelPlan(fixture({
  order: { ...fixture().order, status: "voided" },
})));
expectPlanError("missing-gtin", () => buildOuterRollLabelPlan(fixture({ product: { id: productId, gtin: null } })));
expectPlanError("invalid-gtin", () => buildOuterRollLabelPlan(fixture({
  product: { id: productId, gtin: "4006381333932" },
})));
expectPlanError("invalid-public-origin", () => buildOuterRollLabelPlan(fixture({ publicSiteOrigin: "http://platform.example" })));
expectPlanError("invalid-range", () => buildOuterRollLabelPlan(fixture({
  selection: { mode: "roll-range", fromSerial: serial(2, 1), toSerial: serial(1, 1) },
})));
expectPlanError("source-incomplete", () => buildOuterRollLabelPlan(fixture({ rolls: fixture().rolls.slice(0, 2) })));
expectPlanError("source-incomplete", () => buildOuterRollLabelPlan(fixture({
  lots: [
    { ...fixture().lots[0], rollCount: 2 },
    fixture().lots[1],
  ],
})));
expectPlanError("duplicate-roll", () => {
  const source = fixture();
  buildOuterRollLabelPlan({
    ...source,
    rolls: [source.rolls[0], source.rolls[1], { ...source.rolls[2], id: source.rolls[1].id }],
  });
});

const tenThousandRolls = Array.from({ length: 10_000 }, (_, index) => {
  const rollIndex = index + 1;
  return roll(rollIndex, lot1Id, 1, rollIndex);
}).reverse();
const largeSource = fixture();
const largePlan = buildOuterRollLabelPlan({
  ...largeSource,
  order: { ...largeSource.order, totalRolls: 10_000 },
  lots: [{
    id: lot1Id,
    productionOrderId: orderId,
    lotNumber: "PG-L-20260814-00000001-01",
    lotSequence: 1,
    rollCount: 10_000,
  }],
  rolls: tenThousandRolls,
  selection: { mode: "order" },
  rollChunkSize: undefined,
});

assert.equal(largePlan.rollChunkSize, OUTER_ROLL_LABEL_DEFAULT_ROLL_CHUNK_SIZE);
assert.equal(largePlan.rollCount, 10_000);
assert.equal(largePlan.labelCount, 20_000);
assert.equal(largePlan.chunks.length, 100);
assert.ok(largePlan.chunks.every((chunk) => chunk.rollCount <= OUTER_ROLL_LABEL_DEFAULT_ROLL_CHUNK_SIZE));

const plannedSerials = largePlan.chunks.flatMap((chunk) => chunk.items.map((item) => item.rollSerial));
assert.equal(plannedSerials.length, 10_000);
assert.equal(new Set(plannedSerials).size, 10_000, "Chunk planning must not duplicate Rolls.");
assert.equal(plannedSerials[0], serial(1, 1));
assert.equal(plannedSerials.at(-1), serial(1, 10_000));
for (let index = 1; index <= 10_000; index += 1) {
  assert.equal(plannedSerials[index - 1], serial(1, index), `Missing or reordered Roll at position ${index}.`);
}

console.log("Outer Roll label view-model, GTIN preflight, source completeness, selection and chunk planning verification passed.");
