import fs from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const mobileStandard = fs.readFileSync("docs/mobile-native-interface-standard.md", "utf8");
const designSystem = fs.readFileSync("docs/design-system.md", "utf8");
const globals = fs.readFileSync("app/globals.css", "utf8");
const interaction = fs.readFileSync("app/interaction.css", "utf8");
const operationsInteraction = fs.readFileSync("app/operations/interaction.css", "utf8");
const rootLayout = fs.readFileSync("app/layout.tsx", "utf8");
const statusBadge = fs.readFileSync("components/ui/status-badge.tsx", "utf8");
const emptyState = fs.readFileSync("components/ui/empty-state.tsx", "utf8");
const evidenceReview = fs.readFileSync("components/ui/local-evidence-review.tsx", "utf8");
const rootNotFound = fs.readFileSync("app/not-found.tsx", "utf8");
const operationsError = fs.readFileSync("app/operations/error.tsx", "utf8");
const operationsNotFound = fs.readFileSync("app/operations/not-found.tsx", "utf8");

assert(mobileStandard.includes("44x44 CSS pixels"),
  "Mobile standard must retain the 44x44 CSS pixel minimum touch target contract.");
assert(designSystem.includes("Touch targets لا تقل عن 44px"),
  "Design System must retain the 44px mobile target minimum.");
assert(designSystem.includes("prefers-reduced-motion"),
  "Design System must retain the reduced-motion contract.");

assert(globals.includes("--control-height: 44px;"),
  "Shared control-height token must remain 44px.");
assert(globals.includes("@media (prefers-reduced-motion: reduce)"),
  "Global CSS must retain reduced-motion handling.");
assert(globals.includes("transition-duration: 0.01ms !important;"),
  "Reduced-motion handling must suppress transitions.");
assert(globals.includes("animation-duration: 0.01ms !important;"),
  "Reduced-motion handling must suppress animations.");

assert(interaction.includes('[dir="ltr"] { unicode-bidi: isolate; }'),
  "Shared interaction layer must isolate LTR identifiers inside Arabic UI.");
assert(rootLayout.includes('<html lang="ar" dir="rtl"'),
  "Root document must remain Arabic-first RTL.");

assert(interaction.includes("@media (max-width: 900px)"),
  "Shared mobile interaction override must remain bounded to phone/tablet interaction widths.");
for (const selector of [
  ".nav-link",
  ".ui-page-actions .button",
  ".ui-filter-actions .button",
  ".ui-record-actions .button",
  ".auth-back-link",
  ".ui-icon-button",
]) {
  assert(interaction.includes(selector), `Shared mobile touch target group must retain ${selector}.`);
}
assert(interaction.includes("min-height: 44px;"),
  "Shared mobile targets must retain the 44px minimum height.");
assert(/\.ui-icon-button\s*\{[\s\S]*?width:\s*44px;[\s\S]*?min-width:\s*44px;[\s\S]*?\}/.test(interaction),
  "Mobile icon buttons must have an explicit 44px width as well as height.");
assert(/\.ui-filter-field input,\s*\n\s*\.ui-filter-field select\s*\{[\s\S]*?min-height:\s*44px;[\s\S]*?\}/.test(interaction),
  "Mobile filter inputs/selects must meet the 44px touch-height minimum.");
assert(/\.ui-filter-field input,\s*\n\s*\.ui-filter-field select\s*\{[\s\S]*?font-size:\s*16px;[\s\S]*?\}/.test(interaction),
  "Mobile filter inputs/selects must retain 16px text to avoid browser zoom behavior.");

assert(/\.operations-mobile-signout\s*\{[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;[\s\S]*?min-width:\s*44px;[\s\S]*?min-height:\s*44px;[\s\S]*?\}/.test(operationsInteraction),
  "Operations mobile sign-out target must remain an explicit 44x44 control.");
assert(/\.operations-mobile-identity\s*\{[\s\S]*?min-height:\s*44px;[\s\S]*?\}/.test(operationsInteraction),
  "Operations mobile account identity link must retain a 44px minimum touch height.");
assert(/\.operations-mobile-header \.ui-brand-lockup\.operations-mobile-brand\s*\{[\s\S]*?min-width:\s*44px;[\s\S]*?min-height:\s*44px;[\s\S]*?\}/.test(operationsInteraction),
  "Operations compact mobile brand must use a specificity-safe 44x44 touch contract that wins over the shared compact BrandLockup rule.");
assert(/\.operations-mobile-nav \.operations-nav-link\s*\{[\s\S]*?min-height:\s*54px;[\s\S]*?\}/.test(operationsInteraction),
  "Operations mobile primary navigation must retain the qualified 54px target height.");
assert(!/\.operations-mobile-user\s*>\s*span\s*\{\s*display:\s*none;\s*\}/.test(operationsInteraction),
  "Narrow mobile headers must not hide the visible operational role context.");
assert(/@media \(max-width:\s*340px\)[\s\S]*?\.operations-mobile-user\s*>\s*span\s*\{[\s\S]*?display:\s*block;[\s\S]*?font-size:\s*7\.5px;[\s\S]*?\}/.test(operationsInteraction),
  "320px mobile headers must retain a compact visible role line rather than removing role context.");

assert(statusBadge.includes('type StatusTone = "success" | "neutral" | "warning" | "danger" | "accent"'),
  "Shared StatusBadge semantic tones must remain centralized.");
assert(statusBadge.includes("ui-status-${tone}"),
  "StatusBadge must continue to map semantic tone to the shared visual system.");
assert(emptyState.includes('className="ui-empty-state"'),
  "Shared EmptyState primitive must remain the no-data/no-results presentation foundation.");

for (const marker of [
  "previewUrls",
  "URL.createObjectURL",
  "onReplace",
  "onRemove",
  'aria-live="polite"',
  'dir="ltr"',
]) {
  assert(evidenceReview.includes(marker),
    `Shared evidence review must retain visual/review/accessibility behavior: ${marker}`);
}

assert(rootNotFound.includes("<EmptyState"),
  "Root not-found route must keep a branded/product-safe state instead of framework default UI.");
assert(rootNotFound.includes("الصفحة غير متاحة"),
  "Root not-found state must keep understandable Arabic recovery copy.");
assert(operationsError.includes("<EmptyState"),
  "Operations error boundary must keep a product-safe recoverable error state.");
assert(operationsError.includes("إعادة المحاولة"),
  "Operations recoverable error must retain an explicit retry action.");
assert(operationsNotFound.includes("<EmptyState"),
  "Operations not-found route must keep a product-safe state.");

console.log("UX-S07R-E mobile touch/visual conformance PASS: 44px shared and operations-header mobile targets, visible narrow role context, reduced motion, RTL/LTR handling, shared status/evidence states, and product-safe error surfaces are preserved.");
