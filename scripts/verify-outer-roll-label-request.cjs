const assert = require("node:assert/strict");
const {
  OuterRollLabelRequestError,
  buildOuterRollLabelSearchParams,
  parseOuterRollLabelChunk,
  parseOuterRollLabelSelection,
} = require("../lib/labels/outer-roll-label-request.ts");

assert.deepEqual(parseOuterRollLabelSelection({}), { mode: "order" });
assert.deepEqual(parseOuterRollLabelSelection({ mode: "order" }), { mode: "order" });
assert.deepEqual(
  parseOuterRollLabelSelection({ mode: "lot", lot: "lot-123" }),
  { mode: "lot", lotId: "lot-123" },
);
assert.deepEqual(
  parseOuterRollLabelSelection({ mode: "roll-range", from: "PG-R-FROM", to: "PG-R-TO" }),
  { mode: "roll-range", fromSerial: "PG-R-FROM", toSerial: "PG-R-TO" },
);

assert.throws(
  () => parseOuterRollLabelSelection({ mode: "lot" }),
  (error) => error instanceof OuterRollLabelRequestError,
);
assert.throws(
  () => parseOuterRollLabelSelection({ mode: "roll-range", from: "PG-R-FROM" }),
  (error) => error instanceof OuterRollLabelRequestError,
);
assert.throws(
  () => parseOuterRollLabelSelection({ mode: "unsupported" }),
  (error) => error instanceof OuterRollLabelRequestError,
);

assert.equal(parseOuterRollLabelChunk(undefined, 4), 1);
assert.equal(parseOuterRollLabelChunk("4", 4), 4);
assert.throws(() => parseOuterRollLabelChunk("0", 4), OuterRollLabelRequestError);
assert.throws(() => parseOuterRollLabelChunk("5", 4), OuterRollLabelRequestError);
assert.throws(() => parseOuterRollLabelChunk("1.5", 4), OuterRollLabelRequestError);

assert.equal(buildOuterRollLabelSearchParams({ mode: "order" }).toString(), "mode=order");
assert.equal(
  buildOuterRollLabelSearchParams({ mode: "lot", lotId: "lot-123" }, 2).toString(),
  "mode=lot&lot=lot-123&chunk=2",
);
assert.equal(
  buildOuterRollLabelSearchParams({ mode: "roll-range", fromSerial: "PG-R-FROM", toSerial: "PG-R-TO" }, 3).toString(),
  "mode=roll-range&from=PG-R-FROM&to=PG-R-TO&chunk=3",
);

console.log("Outer Roll label request parsing and bounded chunk verification passed.");
