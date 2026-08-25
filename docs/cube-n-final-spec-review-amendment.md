# Cube N — Final Specification Review Amendment

**Status:** Final independent specification review PASS with one bounded correction — 2026-08-25  
**Reviewed branch:** `spec/cube-n-public-warranty-access`  
**Reviewed against:** current Production/Roll persistence, Cube D Roll initialization pattern, Cube K terminal issue semantics, Cube M Warranty lifecycle, Development Governance

## 1. Review conclusion

The Cube N Public Warranty Access / Verification specification is logically complete and compatible with the implemented Roll and Warranty lifecycle.

No redesign is required. The ownership model remains:

`physical Roll -> one permanent public Warranty identity -> current real Warranty state`

The existing contextual Roll QR `/r/<serial>` remains separate and unchanged.

The final review found one migration-completeness issue in the wording of section 2.3 / N1: limiting identity provisioning only to Rolls created after Cube N would leave any Rolls already present in a migrated environment outside the one-Roll/one-public-identity invariant.

## 2. Bounded correction — one-time migration backfill

Cube N N1 must perform a **one-time migration backfill** for every Roll that already exists when the N1 migration is applied.

This is not a legacy migration subsystem and does not introduce a repair queue, token-management workflow, background job or UI.

The migration contract is:

1. create the private one-to-one Roll public-identity persistence;
2. allocate one cryptographically strong random public code to every existing Roll missing an identity;
3. verify that no Roll is left without exactly one identity;
4. install the permanent Roll-insert provisioning trigger for all future Rolls;
5. make the identity immutable through ordinary application/Data API paths.

After the migration commits, the invariant is global:

**Every Roll in the database has exactly one permanent public Warranty identity.**

For a future Roll insert, Roll creation and public-identity creation remain one database transaction: both commit or neither commits.

This amendment supersedes only the wording in `docs/cube-n-public-warranty-access-verification-spec.md` section 2.3 and N1 that said existing test Rolls may simply be recreated / that there is no backfill. The intended scope-control principle remains valid: Cube N builds no ongoing backfill or repair subsystem.

## 3. Compatibility findings

The review confirmed:

- Production creates Rolls inside the existing atomic `create_production_order()` transaction, so an `AFTER INSERT` Roll identity trigger can participate without reopening or rewriting the Production RPC.
- Cube D already uses an independent Roll `AFTER INSERT` trigger for initial Company custody; a separate public-identity trigger is compatible because both effects remain inside the same Roll-creation transaction.
- `return_required` is a terminal Pre-install Issue state and is valid input to Cube N's `unavailable_for_warranty` public state when no effective Warranty exists.
- Cube M already preserves one effective issued Warranty per Roll and allows a new Warranty only after `voided_in_error`; the permanent Roll-owned public identity therefore correctly survives mistaken Activation and legitimate reactivation.
- Warranty expiry remains derived from timestamps and does not require a cron/status rewrite.
- The approved public projection does not require direct anonymous access to Roll/Warranty/private identity tables.

## 4. Security findings

The reviewed security contract remains appropriate for V1:

- high-entropy random bearer code;
- no human-identifier search fallback;
- fixed narrow public resolver;
- no direct anonymous table reads;
- same malformed/unknown-link behavior;
- no customer PII beyond the approved projection;
- `noindex`, `no-referrer` and non-stale public presentation;
- no deliberate public-code logging/analytics feature;
- no token rotation/revocation subsystem without a demonstrated requirement.

## 5. Execution authorization

With the bounded migration correction above, the Cube N specification review is **PASS** and N1 implementation may begin.

N1 remains intentionally limited to Roll public-identity persistence, one-time migration backfill, atomic future provisioning, immutability and focused database regression evidence. N2 resolver/public exposure work must not be pulled into N1.