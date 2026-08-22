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

const openingActions = fs.readFileSync(
  new URL("../app/operations/rolls/open/actions.ts", import.meta.url),
  "utf8",
);
const recoveryActions = fs.readFileSync(
  new URL("../app/operations/rolls/recovery/actions.ts", import.meta.url),
  "utf8",
);
const openingPage = fs.readFileSync(
  new URL("../app/operations/rolls/open/page.tsx", import.meta.url),
  "utf8",
);
const openingFlow = fs.readFileSync(
  new URL("../components/rolls/roll-opening-flow.tsx", import.meta.url),
  "utf8",
);

for (const [label, source] of [
  ["Roll Opening actions", openingActions],
  ["Opened Roll Recovery actions", recoveryActions],
]) {
  assert.doesNotMatch(source, /RpcCaller|supabase\.rpc\.bind|as unknown as RpcCaller/,
    `${label} must use generated Supabase RPC typing directly.`);
}

assert.match(openingActions, /supabase\.rpc\("resolve_roll_opening_candidate"/);
assert.match(openingActions, /supabase\.rpc\("open_roll"/);
assert.match(recoveryActions, /supabase\.rpc\("resolve_opened_roll_recovery_candidate"/);
assert.match(recoveryActions, /supabase\.rpc\("recover_opened_roll"/);
assert.match(openingActions, /PG_TRANSFER_ACTOR_INACTIVE[\s\S]*PG_ROLL_OPENING_CENTER_INACTIVE/);
assert.match(recoveryActions, /PG_TRANSFER_ACTOR_INACTIVE[\s\S]*PG_ROLL_RECOVERY_ACTOR_INACTIVE/);

assert.match(openingPage, /centerName=\{center\.name\}/,
  "Roll Opening page must pass the authenticated Center identity into confirmation UX.");
assert.match(openingFlow, /centerName:\s*string/);
assert.match(openingFlow, /المركز:\s*\{centerName\}/,
  "Roll Opening confirmation must visibly identify the acting Center.");

console.log("Contextual Roll QR and Cube J post-merge client contracts verified.");
