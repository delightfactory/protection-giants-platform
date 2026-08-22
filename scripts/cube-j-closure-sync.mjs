import fs from "node:fs";

const path = "components/transfers/transfer-send-flow.tsx";
let source = fs.readFileSync(path, "utf8");

function replaceOnce(label, from, to) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`${label}: source pattern not found`);
  if (source.indexOf(from, first + from.length) >= 0) {
    throw new Error(`${label}: source pattern matched more than once`);
  }
  source = source.slice(0, first) + to + source.slice(first + from.length);
}

replaceOnce(
  "Roll availability union",
  '  availability: "available" | "reserved";\n',
  '  availability: "available" | "reserved" | "opened";\n',
);

replaceOnce(
  "Lot opened count",
  '  reserved_count: number;\n  elsewhere_count: number;\n',
  '  reserved_count: number;\n  opened_count: number;\n  elsewhere_count: number;\n',
);

replaceOnce(
  "Opened mutation error copy",
  '  PG_TRANSFER_ROLL_RESERVED: "بعض اللفات أصبحت محجوزة في تحويل آخر. راجع الاختيار قبل الإرسال.",\n',
  '  PG_TRANSFER_ROLL_RESERVED: "بعض اللفات أصبحت محجوزة في تحويل آخر. راجع الاختيار قبل الإرسال.",\n  PG_TRANSFER_ROLL_OPENED: "بعض اللفات تم فتحها وبدأ استخدامها، لذلك لا يمكن إرسالها عبر التحويل العادي. استخدم مسار الاسترداد الاستثنائي عند الحاجة.",\n',
);

replaceOnce(
  "Opened selection guard",
  '  const addRoll = useCallback((row: SendRollRow): ScannerDecodeOutcome => {\n    if (row.availability === "reserved") {\n',
  '  const addRoll = useCallback((row: SendRollRow): ScannerDecodeOutcome => {\n    if (row.availability === "opened") {\n      return { action: "continue", message: "هذه اللفة مفتوحة وبدأ استخدامها، لذلك لا يمكن إضافتها إلى تحويل عادي.", tone: "warning" };\n    }\n\n    if (row.availability === "reserved") {\n',
);

replaceOnce(
  "Opened stale selection handling",
  '        "PG_TRANSFER_ROLL_NOT_HELD",\n        "PG_TRANSFER_ROLL_RESERVED",\n',
  '        "PG_TRANSFER_ROLL_NOT_HELD",\n        "PG_TRANSFER_ROLL_RESERVED",\n        "PG_TRANSFER_ROLL_OPENED",\n',
);

replaceOnce(
  "Scanner opening copy",
  '                    <p>اللفة الصحيحة تُضاف فورًا ويظل الماسح جاهزًا للفة التالية. اللفات المحجوزة أو غير الموجودة في عهدتك لن تُضاف.</p>\n',
  '                    <p>اللفة الصحيحة تُضاف فورًا ويظل الماسح جاهزًا للفة التالية. اللفات المحجوزة أو المفتوحة أو غير الموجودة في عهدتك لن تُضاف.</p>\n',
);

replaceOnce(
  "Roll row disabled state",
  '                    const selected = selectedIds.has(row.roll_id);\n                    const disabled = row.availability === "reserved";\n                    return (\n',
  '                    const selected = selectedIds.has(row.roll_id);\n                    const disabled = row.availability !== "available";\n                    const availabilityLabel = row.availability === "opened"\n                      ? "مفتوحة"\n                      : row.availability === "reserved"\n                        ? "محجوزة"\n                        : selected\n                          ? "محددة"\n                          : "متاحة";\n                    return (\n',
);

replaceOnce(
  "Roll row accessibility",
  '                          aria-label={selected ? "إزالة اللفة من التحويل" : "إضافة اللفة للتحويل"}\n',
  '                          aria-label={row.availability === "opened"\n                            ? "اللفة مفتوحة وغير متاحة للتحويل العادي"\n                            : row.availability === "reserved"\n                              ? "اللفة محجوزة في تحويل آخر"\n                              : selected\n                                ? "إزالة اللفة من التحويل"\n                                : "إضافة اللفة للتحويل"}\n',
);

replaceOnce(
  "Roll row visible state",
  '                        <StatusBadge tone={disabled ? "warning" : selected ? "success" : "neutral"}>\n                          {disabled ? "محجوزة" : selected ? "محددة" : "متاحة"}\n                        </StatusBadge>\n',
  '                        <StatusBadge tone={disabled ? "warning" : selected ? "success" : "neutral"}>\n                          {availabilityLabel}\n                        </StatusBadge>\n',
);

replaceOnce(
  "Lot metrics opened count",
  '                        <div><strong>{lot.reserved_count.toLocaleString("en-US")}</strong><span>محجوزة</span></div>\n                        <div><strong>{lot.elsewhere_count.toLocaleString("en-US")}</strong><span>لدى جهات أخرى</span></div>\n',
  '                        <div><strong>{lot.reserved_count.toLocaleString("en-US")}</strong><span>محجوزة</span></div>\n                        <div><strong>{lot.opened_count.toLocaleString("en-US")}</strong><span>مفتوحة</span></div>\n                        <div><strong>{lot.elsewhere_count.toLocaleString("en-US")}</strong><span>لدى جهات أخرى</span></div>\n',
);

replaceOnce(
  "Partial Lot metrics opened count",
  '              <div><strong>{pendingLot.reserved_count.toLocaleString("en-US")}</strong><span>محجوزة</span></div>\n              <div><strong>{pendingLot.elsewhere_count.toLocaleString("en-US")}</strong><span>لدى جهات أخرى</span></div>\n',
  '              <div><strong>{pendingLot.reserved_count.toLocaleString("en-US")}</strong><span>محجوزة</span></div>\n              <div><strong>{pendingLot.opened_count.toLocaleString("en-US")}</strong><span>مفتوحة</span></div>\n              <div><strong>{pendingLot.elsewhere_count.toLocaleString("en-US")}</strong><span>لدى جهات أخرى</span></div>\n',
);

replaceOnce(
  "Partial Lot explanatory copy",
  '            <p>سيتم اختيار اللفات المتاحة فقط، ولن يُسجل التحويل كأنه يحتوي الـLot بالكامل.</p>\n',
  '            <p>سيتم اختيار اللفات المتاحة فقط. اللفات المفتوحة والمحجوزة واللفات الموجودة لدى جهات أخرى لن تدخل هذا التحويل.</p>\n',
);

fs.writeFileSync(path, source);
console.log("Cube J Transfer Send closure patch applied deterministically.");
