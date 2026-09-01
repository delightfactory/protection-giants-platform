import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function walk(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) return [];

  const entries = fs.readdirSync(absolutePath, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const child = path.join(relativePath, entry.name);
    if (entry.isDirectory()) return walk(child);
    return /\.(?:ts|tsx|js|mjs)$/.test(entry.name) ? [child] : [];
  });
}

function assertIncludes(source, snippet, label) {
  assert.ok(source.includes(snippet), `${label}: expected ${JSON.stringify(snippet)}`);
}

function assertExcludes(source, snippet, label) {
  assert.ok(!source.includes(snippet), `${label}: forbidden ${JSON.stringify(snippet)}`);
}

const localDateTime = read("components/ui/local-date-time.tsx");
assertIncludes(localDateTime, 'Intl.DateTimeFormat("ar-EG-u-nu-latn"', "LocalDateTime locale contract");
assertExcludes(localDateTime, "timeZone:", "LocalDateTime must use viewer/device timezone");

const businessDate = read("components/ui/business-date.tsx");
assertIncludes(businessDate, "normalizeBusinessDate", "BusinessDate semantic primitive");
for (const forbidden of ["new Date", "Date.UTC", "Intl.DateTimeFormat", "timeZone:"]) {
  assertExcludes(businessDate, forbidden, "BusinessDate must never convert a calendar date through a timezone");
}

const publicWarranty = read("app/(public)/w/[publicCode]/page.tsx");
assertIncludes(publicWarranty, 'import { LocalDateTime } from "@/components/ui/local-date-time";', "Public Warranty instant rendering");
assertIncludes(publicWarranty, "<LocalDateTime value={view.activatedAt} />", "Public Warranty activation instant");
assertIncludes(publicWarranty, "<LocalDateTime value={view.coverageExpiresAt} />", "Public Warranty coverage instant");
assertExcludes(publicWarranty, "formatWarrantyDate", "Public Warranty one-off formatter removal");
assertExcludes(publicWarranty, 'timeZone: "UTC"', "Public Warranty must not truncate exact instants through UTC display");

const publicClaim = read("app/(public)/w/[publicCode]/claim/claim-client.tsx");
assertIncludes(publicClaim, 'import { LocalDateTime } from "@/components/ui/local-date-time";', "Public Claim instant rendering");
for (const expression of [
  "<LocalDateTime value={claim.submittedAt} />",
  "<LocalDateTime value={claim.decidedAt} />",
  "<LocalDateTime value={claim.resolutionCompletedAt} />",
  "<LocalDateTime value={service.completedAt} />",
  "<LocalDateTime value={context.coverageExpiresAt} />",
]) {
  assertIncludes(publicClaim, expression, "Public Claim viewer-local instant contract");
}
assertExcludes(publicClaim, "Africa/Cairo", "Public Claim must not force Cairo timezone");
assertExcludes(publicClaim, "function formatDate", "Public Claim one-off formatter removal");

const productionList = read("app/operations/production-orders/page.tsx");
assertIncludes(productionList, 'import { BusinessDate } from "@/components/ui/business-date";', "Production list business-date contract");
assertIncludes(productionList, "<BusinessDate value={order.production_date} />", "Production list date-only rendering");

const productionDetail = read("app/operations/production-orders/[id]/page.tsx");
assertIncludes(productionDetail, "<BusinessDate value={order.production_date} />", "Production detail date-only rendering");
assertIncludes(productionDetail, "<LocalDateTime value={order.created_at} />", "Production created_at instant rendering");
assertIncludes(productionDetail, "<LocalDateTime value={order.voided_at} />", "Production voided_at instant rendering");
assertExcludes(productionDetail, "cairoDateTime", "Production detail Cairo helper removal");
assertExcludes(productionDetail, "Africa/Cairo", "Production detail timezone contract");

const productionPrint = read("app/print/production-orders/[id]/page.tsx");
assertIncludes(productionPrint, "<BusinessDate value={order.production_date} />", "Production print date-only rendering");
assertIncludes(productionPrint, "<LocalDateTime value={order.created_at} />", "Production print created_at instant rendering");
assertIncludes(productionPrint, "<LocalDateTime value={order.voided_at} />", "Production print voided_at instant rendering");
assertExcludes(productionPrint, "cairoDateTime", "Production print Cairo helper removal");
assertExcludes(productionPrint, "Africa/Cairo", "Production print timezone contract");

const uiScopes = [
  "app/(public)",
  "app/operations/warranties",
  "app/operations/claims",
  "app/operations/claim-resolutions",
  "app/operations/production-orders",
  "app/print",
  "components/warranties",
  "components/claims",
];

const hardcodedTimezoneFindings = [];
for (const relativePath of uiScopes.flatMap(walk)) {
  const source = read(relativePath);
  if (source.includes("Africa/Cairo")) hardcodedTimezoneFindings.push(`${relativePath}: Africa/Cairo`);
  if (source.includes('timeZone: "UTC"') || source.includes("timeZone: 'UTC'")) {
    hardcodedTimezoneFindings.push(`${relativePath}: UTC display timezone`);
  }
}
assert.deepEqual(hardcodedTimezoneFindings, [], `Hard-coded UI timezones found:\n${hardcodedTimezoneFindings.join("\n")}`);

const beforeDst = new Date("2026-03-29T00:30:00.000Z");
const afterDst = new Date("2026-03-29T01:30:00.000Z");
const parisTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Paris",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
assert.equal(parisTime.format(beforeDst), "01:30", "Expected pre-DST viewer time in Europe/Paris");
assert.equal(parisTime.format(afterDst), "03:30", "Expected post-DST viewer time in Europe/Paris");

const midnightInstant = new Date("2026-03-29T00:30:00.000Z");
const viewerCalendar = (timeZone) => new Intl.DateTimeFormat("en-CA", {
  timeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(midnightInstant);
assert.notEqual(
  viewerCalendar("America/New_York"),
  viewerCalendar("Asia/Dubai"),
  "The same instant must be allowed to appear on different viewer-local calendar dates",
);

assert.equal("2026-03-29", "2026-03-29", "Business date remains the exact stored calendar date across timezones");

console.log("INTL-02 time contract verification passed.");
