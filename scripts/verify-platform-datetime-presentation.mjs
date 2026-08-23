import fs from "node:fs";

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const localDateTime = read("components/ui/local-date-time.tsx");
const transferHub = read("components/transfers/transfer-hub.tsx");
const transferDetail = read("app/operations/transfers/[transferId]/page.tsx");
const centerLocationCapture = read("components/center-location-capture.tsx");

assert(localDateTime.includes('new Intl.DateTimeFormat("ar-EG-u-nu-latn"'),
  "LocalDateTime must use the Arabic Egypt locale with Latin digits.");
assert(localDateTime.includes('dateStyle: "medium"'),
  "LocalDateTime must use the shared medium date style.");
assert(localDateTime.includes('timeStyle: "short"'),
  "LocalDateTime must use the shared short time style.");
assert(!localDateTime.includes("timeZone:"),
  "LocalDateTime must follow the browser/device timezone rather than hard-code one timezone.");
assert(localDateTime.includes('dir="auto"'),
  "LocalDateTime must allow safe direction handling inside Arabic surfaces.");
assert(localDateTime.includes('dateTime={value}') && localDateTime.includes('title={value}'),
  "LocalDateTime must preserve the raw timestamp semantically and for inspection.");

for (const [name, source] of [
  ["TransferHub", transferHub],
  ["Transfer detail", transferDetail],
  ["Center location capture", centerLocationCapture],
]) {
  assert(source.includes("LocalDateTime"), `${name} must reuse LocalDateTime.`);
  assert(!source.includes("Africa/Cairo"), `${name} must not hard-code Cairo timezone for display.`);
  assert(!source.includes("Intl.DateTimeFormat"), `${name} must not introduce a parallel timestamp formatter.`);
}

assert(transferHub.includes('<LocalDateTime value={row.created_at}'),
  "Transfer registry timestamps must use LocalDateTime.");
assert(transferDetail.includes('<LocalDateTime value={detail.created_at}'),
  "Transfer creation timestamp must use LocalDateTime.");
assert(transferDetail.includes('<LocalDateTime value={event.occurred_at}'),
  "Transfer timeline timestamps must use LocalDateTime.");
assert(centerLocationCapture.includes('<LocalDateTime value={storedLocation.capturedAt}'),
  "Center current-location timestamp must use LocalDateTime.");

console.log("Operational timestamp presentation contract verified for UX-S02A.");
