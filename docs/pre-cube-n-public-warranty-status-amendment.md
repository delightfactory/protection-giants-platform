# Pre-Cube-N Public Warranty Canonical Status Amendment

**Status:** Approved planning amendment — 2026-08-25  
**Planning base:** `main` at `61cdf9473522fa8f8f7e7e09589dc85d9dc62e45`  
**Applies after:** Cube M — Warranty Activation closure  
**Next cube:** Cube N — Public Warranty Access / Verification

## 1. Purpose

This amendment reconciles the post-Cube-M handoff with the Product Decisions approved during Cube N planning.

Cube M remains closed and unchanged. Its Warranty Number, `voided_in_error`, snapshot, correction, expiry and reactivation rules remain authoritative.

The only corrected assumption is **ownership and allocation timing of the future public Warranty credential**.

## 2. Superseding identity rule

Earlier post-Cube-M wording described the next cube as creating a secure public identity for a Warranty.

PD-051 now supersedes that ownership/timing assumption:

- the customer-facing public Warranty identity is owned by the **physical Roll**;
- it is allocated atomically when the Roll is created, before Warranty Activation;
- it remains unchanged for the lifetime of the Roll;
- Warranty Activation changes what that identity resolves to, not the identity itself;
- a mistaken Warranty may be `voided_in_error` and a later legitimate Warranty may be created with a new Warranty Number, while the Roll's public identity remains unchanged.

The valid security principle from PD-050 remains unchanged: Warranty Number, SKU, Roll serial, ERP serial and Transfer ID are not substitutes for the public Warranty credential.

## 3. Two QR identity surfaces remain intentionally separate

Cube E's existing contextual Roll QR remains unchanged:

`/r/<canonical-roll-serial>`

It continues to serve public Product discovery and authenticated operational identification under PD-031.

Cube N introduces the separate customer Warranty access contract:

`/w/<public-code>`

Its production canonical form is:

`https://protectiongiants.com/w/<PUBLIC-CODE>`

The `/w/` identity is random/non-enumerable and is the future target for the three approved customer copies: vehicle, Warranty card and invoice.

## 4. Cube N scope

Cube N owns only the complete public-access vertical slice:

- permanent Roll-owned public Warranty identity;
- atomic provisioning for new Rolls;
- stable `/w/` URL contract;
- narrow anonymous resolver;
- pre-activation, active, expired, post-void/no-current-Warranty and unavailable states;
- approved minimal snapshot-based public projection;
- anti-enumeration/fail-closed behavior;
- Arabic mobile-first public verification page;
- regression/security coverage.

It does not own customer QR rendering/printing, physical label layouts, Claims, customer accounts/OTP, manual public lookup, scan analytics or multilingual UI.

## 5. Next dependency after Cube N

Only after Cube N closes and the `/w/<public-code>` contract is qualified should the customer Warranty QR/print slice implement the three approved physical copies.

That later print work must reuse:

- the frozen Roll-owned `/w/` identity;
- the same URL for all three copies and every reprint;
- the existing shared QR reliability/rendering foundation.

No new customer Warranty identity may be invented by the print slice.

## 6. Source of truth

For Cube N implementation and later customer QR printing, precedence is:

1. `docs/product-decisions.md`, including PD-051 through PD-056;
2. `docs/cube-n-public-warranty-access-verification-spec.md`;
3. this amendment;
4. older post-Cube-M wording only where it does not conflict with the above.

This amendment does not reopen or alter Cube M implementation.