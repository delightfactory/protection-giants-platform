# Protection Giants — Post-Cube-O Canonical Status Amendment

**Status:** Canonical software-delivery handoff for Cube O  
**Date:** 2026-08-25  
**Applies to:** Customer Warranty QR / Unified Roll Print Pack and the Production-print release boundary

This amendment supersedes older wording that described Customer Warranty QR / Print as future work. It does not supersede Cube N's permanent Roll-owned Public Code or public Warranty lifecycle contract.

## 1. Delivered Cube O software boundary

Cube O delivers the complete software-side composition for the currently approved customer/outer Roll print set.

For every selected physical Roll, one deterministic **Roll Print Pack** contains exactly:

1. Outer Roll copy 1;
2. Outer Roll copy 2;
3. Warranty QR copy 1;
4. Warranty QR copy 2;
5. Warranty QR copy 3.

The three Warranty stickers are identical and reuse the permanent Cube N Roll-owned Public Code. Their QR payload is always:

`https://protectiongiants.com/w/<PUBLIC-CODE>`

They do not depend on Warranty Activation and contain no customer, vehicle, Warranty Number, Center or coverage-date data.

## 2. O1 — bounded Warranty print-identity read boundary

Cube O adds an Admin-only database RPC that returns only `roll_id` and the permanent `public_code` for Rolls belonging to one exact Production Order.

The private identity table remains unavailable for direct Data API browsing. Center, Agent, Dealer, anonymous and service-role Data API callers do not receive this print read capability. Missing or inconsistent mappings fail closed before print planning.

## 3. O2 — customer Warranty QR template contract

The Warranty QR template has one canonical production URL builder and uses the existing shared vector QR foundation. Exactly three identical physical copies are materialized for one Roll.

The current `70 × 45 mm` sticker geometry and its `30 × 30 mm` QR proof area are development/validation geometry only. They are not a frozen Production machine specification.

## 4. O3 — deterministic Roll Print Pack planner

The Pack planner composes existing Outer Roll label models with the permanent Warranty print identity for the same Roll.

Ordering remains deterministic by the existing Production/Lot/Roll plan. A Roll cannot be split across chunks/files, and another Roll's labels cannot be interleaved inside its Pack. A missing or mismatched Warranty identity stops output rather than producing a partial Pack.

## 5. O4 — one-Roll Master Pack PDF

The proof/master PDF gives each Roll its own visually obvious Pack page:

- Outer ×2 together;
- Warranty ×3 together;
- an operator-only Roll guide/ordinal outside customer cut areas.

The Pack renderer embeds the existing Cube E Outer master instead of copying or replacing its label engine. Warranty QR rendering uses the shared QR vector primitive. The operator guide does not expose the Public Code.

## 6. O5 — Admin preview and PDF download integration

The existing Production Order label action is now the unified **Roll Print Pack** workflow rather than a parallel second print route.

Admin may select the whole Production Order, one Lot, or a Roll range. Preflight validates the existing Product/Outer requirements and permanent Warranty identity completeness. Preview shows one complete representative Pack, and downloads are split only between complete Pack chunks.

The legacy route path containing `outer-roll-labels` remains an implementation URL for compatibility; its actual UI/output contract is the unified Roll Print Pack. No competing Outer-only operator workflow is retained.

## 7. Product Decisions

The approved Cube O decisions are folded into the main Product Decisions ledger as PD-057 through PD-062. They finalize the three-copy and Roll-Pack behavior that earlier decisions left for the print-template cube.

## 8. Production release boundary — still NO-GO for real customer printing

Cube O software completion is distinct from authorizing physical Production customer labels.

Before a real Production Warranty QR is printed/used, all of the following must be verified:

1. `https://protectiongiants.com/w/<PUBLIC-CODE>` routes to the Production public Warranty experience over valid HTTPS;
2. the client printer/media/RIP/cutter profile is known and represented by a bounded physical print profile;
3. final label dimensions, margins/gaps and any cut/registration requirements are physically validated;
4. a real printed customer Warranty QR is scanned by a normal phone camera and opens the correct Production Warranty page reliably.

Preview/Staging hostnames must never be substituted into the permanent customer QR.

These are Production release gates, not reasons to redesign the permanent Roll/Public-Code/Pack model. If machine details arrive after PR #79 software closure, they should be implemented as the narrow O6 physical-profile patch described by the Cube O spec.

## 9. Deferred boundaries remain deferred

Cube O does not implement Claims, replacement/reinstall entitlement, customer accounts/OTP, scan analytics, arbitrary template design, printer-fleet/RIP automation, or the historically deferred bag/case, inner-Roll and separate ERP labels.

Future label work must reuse the current print foundation. Future Warranty lifecycle work must reuse the same permanent Roll-owned customer identity rather than invent another public credential.

## 10. Closure rule

PR #79 may be treated as Cube O **software merge-ready** only after its exact final HEAD passes PR Quality, Database Quality, Cube M Warranty Quality, Cube N Public Warranty Quality and Cube O Roll Print Pack Quality, followed by independent engineering/security and operational/DoD reviews.

Production customer printing remains separately blocked by Section 8 even after software merge.
