from pathlib import Path

branch_file = Path("components/transfers/transfer-receipt-flow.tsx")
test_file = Path("scripts/verify-transfer-receipt-interactions.test.mjs")

flow = branch_file.read_text()
test = test_file.read_text()

old_toggle = '''  function toggleRow(row: TransferItem) {
    if (row.item_status !== "pending") return;
    const nextSelection = new Set(selectionRef.current);
    const wasSelected = nextSelection.has(row.roll_id);
    if (wasSelected) nextSelection.delete(row.roll_id);
    else if (nextSelection.size < MAX_TRANSFER_RECEIPT_ROLLS) nextSelection.add(row.roll_id);
    selectionRef.current = nextSelection;
    setSelected(nextSelection);
    setSelectionDetails((current) => {
      const next = new Map(current);
      if (wasSelected) next.delete(row.roll_id);
      else next.set(row.roll_id, {
        roll_id: row.roll_id,
        serial_number: row.serial_number,
        lot_id: row.lot_id,
        lot_number: row.lot_number,
        product_name: row.product_name,
      });
      return next;
    });
  }
'''

new_toggle = '''  function toggleRow(row: TransferItem) {
    if (row.item_status !== "pending") return;
    const nextSelection = new Set(selectionRef.current);
    const wasSelected = nextSelection.has(row.roll_id);
    if (!wasSelected && nextSelection.size >= MAX_TRANSFER_RECEIPT_ROLLS) {
      setFeedback({ tone: "error", text: "وصلت للحد الأقصى 10,000 لفة." });
      return;
    }
    if (wasSelected) nextSelection.delete(row.roll_id);
    else nextSelection.add(row.roll_id);
    selectionRef.current = nextSelection;
    setSelected(nextSelection);
    setSelectionDetails((current) => {
      const next = new Map(current);
      if (wasSelected) next.delete(row.roll_id);
      else next.set(row.roll_id, {
        roll_id: row.roll_id,
        serial_number: row.serial_number,
        lot_id: row.lot_id,
        lot_number: row.lot_number,
        product_name: row.product_name,
      });
      return next;
    });
  }
'''

if flow.count(old_toggle) != 1:
    raise SystemExit(f"Expected one toggleRow block, found {flow.count(old_toggle)}")
flow = flow.replace(old_toggle, new_toggle, 1)

old_rows = '''          data: [{
            roll_id: "outside-selection",
            serial_number: "PG-R-OUTSIDE",
            lot_id: "44444444-4444-4444-8444-444444444444",
            lot_number: "LOT-OUTSIDE",
            product_name: "Protection Film",
            item_status: "pending",
          }],
'''
new_rows = '''          data: [{
            roll_id: "outside-selection",
            serial_number: "PG-R-OUTSIDE",
            lot_id: "44444444-4444-4444-8444-444444444444",
            lot_number: "LOT-OUTSIDE",
            product_name: "Protection Film",
            item_status: "pending",
          }, {
            roll_id: "beyond-cap",
            serial_number: "PG-R-BEYOND-CAP",
            lot_id: "77777777-7777-4777-8777-777777777777",
            lot_number: "LOT-BEYOND",
            product_name: "Protection Film",
            item_status: "pending",
          }],
'''
if test.count(old_rows) != 1:
    raise SystemExit(f"Expected one expected-items fixture, found {test.count(old_rows)}")
test = test.replace(old_rows, new_rows, 1)

old_boundary = '''    expect(textOf(root.container)).toContain("10000 لفة");
    expect(textOf(root.container)).not.toContain("10001 لفة");

    const plan = planReceiptLotSelection(
'''
new_boundary = '''    expect(textOf(root.container)).toContain("10000 لفة");
    expect(textOf(root.container)).not.toContain("10001 لفة");

    const checkboxesAtCap = root.container.queryAll((node) => node.type === "input" && node.props.type === "checkbox");
    expect(checkboxesAtCap).toHaveLength(2);
    expect(checkboxesAtCap[1].props.checked).toBe(false);

    await act(async () => {
      checkboxesAtCap[1].props.onChange();
    });

    const checkboxesAfterRejectedAddition = root.container.queryAll((node) => node.type === "input" && node.props.type === "checkbox");
    expect(checkboxesAfterRejectedAddition[1].props.checked).toBe(false);
    expect(textOf(root.container)).toContain("10000 لفة");
    expect(textOf(root.container)).not.toContain("10001 لفة");

    await act(async () => {
      findButton(root.container, /مراجعة الاستلام/).props.onClick();
    });
    expect(textOf(root.container)).not.toContain("LOT-BEYOND");

    const plan = planReceiptLotSelection(
'''
if test.count(old_boundary) != 1:
    raise SystemExit(f"Expected one boundary assertion block, found {test.count(old_boundary)}")
test = test.replace(old_boundary, new_boundary, 1)

branch_file.write_text(flow)
test_file.write_text(test)
