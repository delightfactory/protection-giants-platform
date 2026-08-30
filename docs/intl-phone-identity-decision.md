# Protection Giants — International Phone Identity Decision

Status: **APPROVED / FROZEN**

Decision date: 2026-08-30

Related finding: `ML-006 — International phone identity contract`

This document records the Product Owner decision only. It does not change application code, database behavior, Production data, or UI by itself.

## Approved contract

Protection Giants will require customer phone numbers used for Warranty Activation to be entered in a **full international format** from the moment the Warranty is created.

Examples:

- accepted canonical intent: `+201012345678`
- equivalent user input such as `00201012345678` may be normalized to the same international representation;
- spaces, hyphens, parentheses, and Arabic/Persian digit glyphs may be normalized away safely;
- a local-only form such as `01012345678` must not be silently guessed as Egypt or any other country.

The system must not infer a customer's country code from the installation Center, current operator, browser locale, or any other indirect context.

## Persistence boundary

- Reuse the existing `warranties.customer_phone` field.
- Do not add a phone-identity table, country-code column, or country-to-dialing-code mapping solely for this requirement.
- Do not add a third-party phone-number subsystem unless a later demonstrated requirement needs it.
- The canonical stored/comparison value should use the same normalization contract across Warranty Activation, Admin Warranty correction, Claim verification, and Claim access freshness checks.

## UI requirement — mandatory

The international-format requirement must be explained professionally **at the point where the Center enters customer Warranty data**. A placeholder alone is not sufficient.

The Warranty Activation form should:

1. label the field clearly as the customer's phone number;
2. state immediately below or beside the field that the number must be entered with the international country code;
3. show a short realistic example such as `+20 10 1234 5678` without implying that Egypt is the only supported country;
4. accept common visual separators while normalizing them safely;
5. reject local-only numbers with a clear user-facing message instead of guessing the country;
6. preserve the same guidance in the Admin Warranty correction UI;
7. update the public Claim verification prompt so it asks for the same internationally formatted number registered on the Warranty and removes the Egypt-only `01xxxxxxxxx` implication.

Suggested business-facing guidance concept:

> أدخل رقم العميل بصيغته الدولية متضمنًا كود الدولة، مثل: +20 10 1234 5678. لا تستخدم الرقم المحلي بدون كود الدولة.

The exact Arabic microcopy may be refined during implementation, but the meaning above is part of the approved contract.

## Existing/staging data

The platform has not yet launched broadly to Production customers. Therefore no permanent compatibility architecture or bulk backfill subsystem should be built merely to preserve test/staging local-phone formats.

If staging/test Warranties contain local-only numbers, they may be corrected through the existing bounded Admin Warranty support path or recreated as test fixtures as appropriate.

## Implementation cube impact

`INTL-01 — Phone Identity` can remain bounded to:

- one shared authoritative normalization/validation contract;
- reuse of the existing `customer_phone` persistence field;
- Activation and Admin correction enforcement;
- Claim verification/freshness using the same canonical representation;
- professional field guidance and error messages;
- regression tests for Arabic/Persian digits, separators, `00` international prefix, `+` international prefix, and local-only rejection;
- no unsafe country guessing and no public enumerable lookup.

No broader international identity subsystem is approved by this decision.