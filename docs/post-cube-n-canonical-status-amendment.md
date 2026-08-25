# Protection Giants — Post-Cube-N Canonical Status Amendment

**Status:** CUBE N IMPLEMENTATION CLOSURE — becomes merged status with PR #78  
**Implementation base:** `main` at `61cdf9473522fa8f8f7e7e09589dc85d9dc62e45`  
**Pre-closure qualified implementation HEAD:** `40bd6515e7b49e21a89d061e50e95d9f1bceb8c3`  
**Frozen contract:** `docs/cube-n-public-warranty-access-verification-spec.md`

## 1. Purpose and precedence

This amendment becomes the current implementation/status handoff after Cube N is merged.

Cube M remains closed and authoritative for Warranty issuance, correction, `voided_in_error`, reactivation and expiry semantics. Cube N consumes that lifecycle without rewriting it.

For Public Warranty identity/access, current precedence is:

1. Product Decisions PD-051 through PD-056 in `docs/product-decisions.md`;
2. `docs/cube-n-public-warranty-access-verification-spec.md`;
3. `docs/cube-n-final-spec-review-amendment.md`;
4. this post-implementation status amendment;
5. older post-Cube-M Public Warranty wording only where it does not conflict with the above.

## 2. Cube N delivered boundary

Cube N now provides the durable customer-facing access layer from a physical Roll to its current real Warranty state.

Delivered responsibilities:

- exactly one permanent customer Warranty public identity per physical Roll;
- cryptographically strong random 64-character lowercase hexadecimal Public Code with no business meaning;
- one-time migration backfill so every Roll present when Cube N is installed receives an identity;
- atomic future Roll provisioning through the Roll insert transaction: Roll + public identity both commit or neither commits;
- immutable Public Code with no normal rotation, replacement, reassignment or deletion path;
- private identity persistence outside direct Data API browsing;
- permanent production URL contract `https://protectiongiants.com/w/<PUBLIC-CODE>`;
- narrow `resolve_public_warranty` anonymous resolver instead of direct Roll/Warranty table exposure;
- deterministic public states: `not_activated`, `active`, `expired`, `no_current_warranty_after_void`, `unavailable_for_warranty`, plus fail-closed `temporarily_unavailable`;
- Product identity before Activation from the immutable Production Order snapshot;
- effective Warranty presentation from Cube M Warranty issuance snapshots plus approved corrected vehicle fields;
- malformed and unknown Public Codes share the same zero-row / generic invalid-link behavior;
- no manual lookup by Warranty Number, VIN/chassis, plate, Roll serial, ERP serial, customer data or other enumerable identifiers;
- Arabic mobile-first `/w/[publicCode]` public page with no customer account, login or OTP requirement;
- `noindex`, `nofollow`, `no-referrer` and dynamic/non-stale presentation for bearer Warranty URLs;
- runtime mapping that treats unexpected resolver shapes or failures as safe temporary-unavailable state rather than exposing partial data;
- `/warranty` retained as a non-search information/QR-guidance landing surface.

## 3. Permanent identity lifecycle invariant

The customer Warranty QR identity is owned by the physical Roll, not by one Warranty row.

The qualified lifecycle is:

`Roll created -> permanent Public Code allocated -> Warranty may be activated -> allowed details may be corrected -> mistaken Warranty may be voided in error -> legitimate new Warranty may later be activated -> same Public Code resolves the current real state throughout`

Qualification specifically proves that:

- correction does not change Public Code or Warranty Number;
- `voided_in_error` does not change or destroy Public Code and does not expose the historical Warranty Number publicly while no effective Warranty exists;
- legitimate reactivation creates a new Warranty row and new Warranty Number;
- the same unchanged Public Code then resolves to that new effective Warranty;
- prior mistaken-activation history remains preserved;
- exactly one effective `issued` Warranty remains allowed per Roll;
- natural expiry changes only the derived public state and never creates reactivation eligibility.

This is the invariant required for future physical QR copies to remain valid for the lifetime of the Roll.

## 4. Public projection and security boundary

For an effective Warranty, V1 public presentation is deliberately bounded to:

- Warranty Number;
- derived status;
- Product name snapshot;
- Activation/start date;
- coverage end date;
- activating/installation Center name snapshot;
- vehicle make;
- vehicle model;
- vehicle year when present.

The public layer does not expose customer name, phone, email, VIN/chassis, plate, Roll/ERP serials, internal UUIDs, custody/Transfer/Opening/Issue history, audit events, correction reasons or void reasons.

Possession of the high-entropy `/w/<PUBLIC-CODE>` bearer URL is sufficient for this read-only projection. No customer identity system is introduced by Cube N.

The existing Cube E contextual Roll QR `/r/<canonical-roll-serial>` remains a separate unchanged surface with a different operational/public-Product purpose.

## 5. Qualification evidence

Cube N was implemented and qualified incrementally:

- **N1 — Roll Public Identity Persistence:** global one-Roll/one-identity completeness, cryptographic random identity, private persistence, immutability and forced identity-failure transaction rollback;
- **N2 — Public Resolver / Security Boundary:** exact public projection, lifecycle state derivation, snapshot sourcing, malformed/unknown anti-enumeration behavior and direct-table denial;
- **N3 — Public Warranty Page:** anonymous server-only mapping, Arabic mobile-first states, no manual lookup, no PII/deferred actions, noindex/no-referrer/non-stale presentation, TypeScript and production build;
- **N4 — Integration / Regression Closure:** one real Cube M Roll/Warranty lifecycle through correction -> void-in-error -> legitimate reactivation while proving one unchanged Public Code resolves every public state correctly.

The pre-closure implementation HEAD `40bd6515e7b49e21a89d061e50e95d9f1bceb8c3` passed from scratch:

- PR Quality — PASS;
- Database Quality — PASS;
- Cube M Warranty Quality — PASS;
- Cube N Public Warranty Quality — PASS.

The final PR merge gate remains the same four checks on one exact final reviewed HEAD after this closure documentation update.

## 6. Explicitly not delivered by Cube N

Cube N intentionally does not implement:

- customer Warranty QR rendering or physical printing;
- vehicle / Warranty-card / invoice layouts;
- QR print/reprint UI;
- Claims submission or Claims buttons;
- replacement/reinstall lifecycle;
- customer accounts or OTP;
- manual public Warranty search;
- Public Code rotation/revocation management;
- QR scan/view analytics;
- SMS/email/WhatsApp delivery;
- multilingual public Warranty UI.

## 7. Next critical slice

The next critical customer-Warranty slice is:

**Customer Warranty QR / Print**

It must not invent a new identity model. It must consume the already-frozen Cube N contract and use the exact same canonical URL for the three approved physical copies:

1. vehicle copy;
2. Warranty-card/certificate copy;
3. invoice copy.

That slice should reuse the existing shared QR/vector reliability foundation, own physical layouts and print/reprint UX, and physically validate scannability at the final printed sizes/materials.

Every reprint for a Roll must reproduce the same `/w/<PUBLIC-CODE>` URL. Claims/replacement/reinstall remain later lifecycle work.

## 8. Release boundary

PR #78 is the Cube N implementation delivery vehicle.

Production Supabase migration/deployment and Production-domain release are not implied by repository merge and remain separately controlled release actions. Development/staging validation may apply the tracked migrations to the known staging environment without changing this Production boundary.
