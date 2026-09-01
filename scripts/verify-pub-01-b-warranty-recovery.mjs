import fs from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const entry = fs.readFileSync("app/(public)/warranty/page.tsx", "utf8");
const invalid = fs.readFileSync("app/(public)/w/[publicCode]/not-found.tsx", "utf8");

for (const [label, source] of [["Warranty entry", entry], ["Warranty invalid-link", invalid]]) {
  assert(!/<form\b/i.test(source) && !/<input\b/i.test(source),
    `${label} must not introduce a public identifier lookup form.`);
  assert(!source.includes("createSupabase") && !source.includes(".rpc(") && !source.includes(".from("),
    `${label} recovery presentation must not add a public data-query surface.`);
}

assert(entry.includes("لا توفر المنصة بحثًا عامًا برقم الضمان أو بيانات السيارة أو بيانات العميل"),
  "Warranty entry must explain QR-only access without suggesting a searchable public lookup.");
assert(entry.includes("إذا تعذر مسحه") && entry.includes("إضاءة واضحة") && entry.includes("الرمز كاملًا داخل الكاميرا"),
  "Warranty entry must provide practical re-scan guidance.");
assert(entry.includes('href="/centers"') && entry.includes('href="/"'),
  "Warranty entry must provide safe Center-directory and Home recovery paths.");
assert(!entry.includes("brandConfig.contact") && !entry.includes("mailto:") && !entry.includes("tel:"),
  "Warranty entry must not invent unapproved support contact details.");

assert(invalid.includes("تعذر فتح الضمان من هذا الرابط")
  && invalid.includes("أعد مسح رمز QR الرسمي")
  && invalid.includes('href="/warranty"')
  && invalid.includes('href="/centers"'),
  "Invalid Warranty link must provide generic branded re-scan and recovery actions.");
assert(invalid.includes("رقم الضمان") && invalid.includes("VIN / الشاسيه") && invalid.includes("الهاتف"),
  "Invalid Warranty state must explicitly reject identifier-based public lookup.");
assert(!invalid.includes("publicCode") && !invalid.includes("params"),
  "Invalid Warranty state must not echo or inspect the attempted public code.");
assert(!invalid.includes("mailto:") && !invalid.includes("tel:"),
  "Invalid Warranty state must not fabricate unapproved support contact details.");
assert(!invalid.includes("المراكز المعتمدة"),
  "Recovery copy must not imply every Center-directory entry is currently approved.");

console.log("PUB-01-B Warranty recovery contract PASS: QR-only guidance, safe recovery paths, no public enumeration or invented support contact.");
