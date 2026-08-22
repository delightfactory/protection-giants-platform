import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildRollQrUrl,
  normalizePublicSiteOrigin,
  normalizeRollSerial,
  parseRollQrPayload,
} from "../lib/rolls/roll-qr.ts";

const serial = "PG-R-20260814-00000001-01-0001";
const origin = "https://platform.example";

assert.equal(normalizeRollSerial(serial.toLowerCase()), serial);
assert.equal(normalizeRollSerial("PG-R-invalid"), null);
assert.equal(normalizePublicSiteOrigin(`${origin}/some/path?x=1`), origin);
assert.equal(normalizePublicSiteOrigin("http://platform.example"), null);
assert.equal(normalizePublicSiteOrigin("http://localhost:3000"), "http://localhost:3000");

const payload = buildRollQrUrl(origin, serial);
assert.equal(payload, `${origin}/r/${serial}`);
assert.equal(parseRollQrPayload(payload, origin), serial);
assert.equal(parseRollQrPayload(`${payload}/`, origin), serial);

assert.equal(parseRollQrPayload(`${payload}?mode=transfer`, origin), null);
assert.equal(parseRollQrPayload(`${payload}#fragment`, origin), null);
assert.equal(parseRollQrPayload(`https://evil.example/r/${serial}`, origin), null);
assert.equal(parseRollQrPayload(`${origin}/products/${serial}`, origin), null);
assert.equal(parseRollQrPayload(`${origin}/r/PG-R-invalid`, origin), null);

assert.throws(() => buildRollQrUrl("http://platform.example", serial));
assert.throws(() => buildRollQrUrl(origin, "not-a-roll"));

for (const componentPath of [
  "components/rolls/roll-opening-flow.tsx",
  "components/rolls/opened-roll-recovery-flow.tsx",
]) {
  const source = fs.readFileSync(new URL(`../${componentPath}`, import.meta.url), "utf8");
  assert.match(source, /publicSiteOrigin/);
  assert.match(source, /parseRollQrPayload\(payload, publicSiteOrigin\)/);
  assert.doesNotMatch(source, /parseRollQrPayload\(payload, window\.location\.origin\)/);
}

console.log("Contextual Roll QR contract and Cube J canonical-origin reuse verified.");
