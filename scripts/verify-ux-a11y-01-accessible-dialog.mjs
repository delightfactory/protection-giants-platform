import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function count(source, needle) {
  return source.split(needle).length - 1;
}

const primitive = read("components/ui/accessible-dialog.tsx");
const primitiveCss = read("components/ui/accessible-dialog.module.css");
const scanner = read("components/transfers/qr-scanner-sheet.tsx");
const send = read("components/transfers/transfer-send-flow.tsx");
const receipt = read("components/transfers/transfer-receipt-flow.tsx");
const unresolved = read("components/transfers/unresolved-resolution-panel.tsx");

// Primitive semantics and browser-owned modal containment.
assert(primitive.includes("dialog.showModal()"), "AccessibleDialog must use native showModal() semantics.");
assert(primitive.includes('role="dialog"'), "AccessibleDialog is missing dialog semantics.");
assert(primitive.includes('aria-modal="true"'), "AccessibleDialog is missing aria-modal.");
assert(primitive.includes("aria-labelledby={titleId}"), "AccessibleDialog must require an accessible title association.");
assert(primitive.includes("aria-describedby={descriptionId}"), "AccessibleDialog must support an accessible description association.");
assert(primitive.includes("aria-busy={busy || undefined}"), "AccessibleDialog must expose in-flight busy state.");
assert(primitive.includes("event.preventDefault()") && primitive.includes("closeOnEscape"), "AccessibleDialog must own cancellable Escape behavior.");
assert(primitive.includes("closeOnBackdrop") && primitive.includes("event.target === event.currentTarget"), "AccessibleDialog must own explicit backdrop cancellation behavior.");
assert(primitive.includes("restoreFocusRef") && primitive.includes("restoreFocus("), "AccessibleDialog must restore focus after close/unmount.");
assert(primitive.includes("data-dialog-initial-focus") && primitive.includes("target?.focus"), "AccessibleDialog must implement deterministic initial focus.");
assert(primitive.includes("document.documentElement.style.overflow"), "AccessibleDialog must own modal scroll locking.");

// Geometry contract: native dialog owns the viewport; existing surface classes retain visual identity.
assert(primitiveCss.includes("100dvh"), "AccessibleDialog must use dynamic viewport height for mobile browser chrome/keyboard safety.");
assert(primitiveCss.includes("env(safe-area-inset-bottom)"), "AccessibleDialog must preserve mobile safe-area spacing.");
assert(primitiveCss.includes('.dialog[data-placement="responsive"]'), "AccessibleDialog is missing responsive sheet placement.");
assert(primitiveCss.includes("overscroll-behavior: contain"), "AccessibleDialog must contain modal overscroll.");

const migrated = [
  ["QR scanner", scanner],
  ["Transfer Send", send],
  ["Transfer Receipt", receipt],
  ["Unresolved Resolution", unresolved],
];

for (const [label, source] of migrated) {
  assert(source.includes("AccessibleDialog"), `${label} is not using the shared AccessibleDialog primitive.`);
  assert(!source.includes('role="dialog"'), `${label} reintroduced custom raw dialog semantics outside the primitive.`);
  assert(!source.includes('aria-modal="true"'), `${label} reintroduced custom aria-modal outside the primitive.`);
  assert(!source.includes("document.body.style.overflow"), `${label} reintroduced local body-scroll modal handling.`);
}

// Exact migrated overlay inventory from the frozen UX-A11Y-01 scope.
assert(count(scanner, "<AccessibleDialog") === 1, "QR scanner must have exactly one shared dialog surface.");
assert(count(send, "<AccessibleDialog") === 3, "Transfer Send must migrate exactly three decision overlays.");
assert(count(receipt, "<AccessibleDialog") === 2, "Transfer Receipt must migrate exactly two confirmation overlays.");
assert(count(unresolved, "<AccessibleDialog") === 1, "Unresolved Resolution must migrate exactly one confirmation overlay.");

// Title/description associations are explicit on every migrated custom overlay.
for (const id of [
  "scanner-instruction",
  "partial-lot-description",
  "change-recipient-description",
  "clear-selection-description",
  "lot-selection-confirm-description",
  "receipt-confirm-description",
  "resolution-confirm-description",
]) {
  assert(
    scanner.includes(id) || send.includes(id) || receipt.includes(id) || unresolved.includes(id),
    `Accessible dialog description id ${id} is missing.`,
  );
}

// Preserve prior cancellation behavior instead of silently changing business interaction.
assert(count(send, "closeOnBackdrop={false}") === 3, "Transfer Send decisions must remain non-cancellable by backdrop click.");
assert(!receipt.includes("closeOnBackdrop={false}"), "Transfer Receipt confirmations should retain cancellable backdrop behavior when not busy.");
assert(!scanner.includes("closeOnBackdrop={false}"), "QR scanner should retain cancellable backdrop behavior.");

// Irreversible in-flight operations cannot be dismissed while the authoritative request is pending.
assert(receipt.includes("busy={isSubmitting}"), "Transfer Receipt final confirmation must lock cancellation while submitting.");
assert(unresolved.includes("busy={isSubmitting}"), "Unresolved Resolution confirmation must lock cancellation while submitting.");

// Safe/cancel actions receive deterministic initial focus rather than destructive actions.
assert(count(scanner, "data-dialog-initial-focus") >= 1, "QR scanner is missing deterministic initial focus.");
assert(count(send, "data-dialog-initial-focus") === 3, "Each Transfer Send decision needs a safe initial-focus action.");
assert(count(receipt, "data-dialog-initial-focus") === 2, "Each Transfer Receipt confirmation needs a safe initial-focus action.");
assert(count(unresolved, "data-dialog-initial-focus") === 1, "Unresolved Resolution needs a safe initial-focus action.");

console.log("UX-A11Y-01 accessible dialog/sheet contracts verified: 7 custom operational overlays migrated.");
