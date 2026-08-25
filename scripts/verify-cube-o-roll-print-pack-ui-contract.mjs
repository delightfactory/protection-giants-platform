import { readFileSync } from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const page = readFileSync("app/operations/production-orders/[id]/outer-roll-labels/page.tsx", "utf8");
const route = readFileSync("app/print/production-orders/[id]/outer-roll-labels/route.ts", "utf8");
const preview = readFileSync("components/labels/roll-print-pack-preview.tsx", "utf8");
const previewCss = readFileSync("components/labels/roll-print-pack-preview.module.css", "utf8");

assert(page.includes('title="Roll Print Pack"'), "Operations print page must identify the unified Roll Print Pack surface.");
assert(page.includes("RollPrintPackPreview"), "Operations print page must render the grouped Pack preview.");
assert(page.includes("buildRollPrintPackPlan"), "Operations print page must build the grouped Pack plan.");
assert(page.includes("loadRollWarrantyPrintIdentities"), "Operations print page must load permanent Warranty identities through the bounded server source.");
assert(!page.includes("<OuterRollLabelPreview"), "Operations print page must not retain the old Outer-only preview surface.");
assert(page.includes("Outer ×2") && page.includes("Warranty ×3"), "Operations print page must state the exact five-piece Pack contract.");

assert(route.includes("renderRollPrintPackPdf"), "Download route must render the unified Roll Print Pack PDF.");
assert(route.includes("planRollPrintPackMasterLayout"), "Download route must use the one-Roll Master Pack layout.");
assert(route.includes("buildRollPrintPackPlan"), "Download route must build complete Packs before chunk rendering.");
assert(route.includes("PG-ROLL-PACK-"), "Download filename must identify Roll Pack output.");
assert(route.includes('"X-PG-Pack-Count"'), "Download response must expose Pack count for operational verification.");
assert(!route.includes("renderOuterRollPrintPdf"), "Download route must not fall back to the old Outer-only renderer.");
assert(!route.includes("planOuterRollPrintLayout"), "Download route must not use the old Outer-only page plan.");

assert(preview.includes("pack.outerCopies.map") && preview.includes("pack.warrantyCopies.map"), "Pack preview must render both Outer and Warranty pieces from one Roll model.");
assert(preview.includes("Outer ×2 · Warranty ×3"), "Pack preview guide must make the five-piece grouping visible.");
assert(previewCss.includes("@media (max-width: 760px)"), "Pack preview must preserve an explicit mobile breakpoint.");
assert(previewCss.includes("grid-template-columns: 1fr"), "Pack pieces must collapse to one column on narrow mobile screens.");

console.log("Cube O Roll Print Pack UI/download contract PASS");
