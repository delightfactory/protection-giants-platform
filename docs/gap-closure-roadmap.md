# Protection Giants — Dependency-Ordered Gap Closure Roadmap

**Status:** Approved sequencing baseline — 2026-08-13; Cube E boundary amended 2026-08-14  
**Applies after:** merged Agent & Network Foundation and subsequent completed Center/Custody cubes  
**Purpose:** close the remaining operational gaps in small complete cubes, with every cube starting only after its real prerequisites exist.

## 1. Authority and correction

This roadmap is the sequencing authority for the remaining gaps, subject to later approved Product Decisions and normative amendments.

It was produced after re-reading:

- `docs/development-governance.md`;
- `docs/product-decisions.md`;
- `docs/distribution-network-flow-spec.md`;
- `docs/center-location-approval-activation-amendment.md`;
- `docs/center-location-approval-impact-review.md`;
- the merged Agent & Network Foundation;
- the already-closed Product and Production foundations.

The 2026-08-14 `docs/outer-roll-label-print-foundation-amendment.md` and PD-030 through PD-032 refine the original Cube E boundary after the physical outer-label requirements and historical client output were re-confirmed.

Where older wording says simply **Production Labels → Roll Custody & Transfers**, this document supersedes that ordering.

The old order was too coarse because it treated every physical label as one dependency. The real dependency is narrower:

- **current Roll custody does not depend on a label**;
- **Transfer state/reservation does not depend on a label**;
- **scan-based Transfer UX does depend on a machine-readable physical Roll identity**;
- the first real outer Roll label can carry that identity and establish the reusable print foundation without pulling unresolved Activation/Warranty labels forward;
- Activation/Warranty labels remain behind their own future identifier/lifecycle decisions.

---

## 2. Cube discipline

Every remaining cube follows the existing project governance:

1. one clear responsibility;
2. complete vertical slice for that responsibility;
3. no speculative generic engines;
4. no dead/placeholder UI;
5. security/RLS/validation/failure paths are part of the feature;
6. previous completed cubes are not reopened merely for convenience;
7. double review before closure/merge;
8. each new cube starts from updated `main`.

A larger capability may contain several small cubes. The individual cubes stay small, but the larger capability is not called complete until all of its required cubes are closed.

---

# 3. Foundations already complete

## Product Foundation

Already provides canonical SKU, stable physical specification, Product assets/content boundaries and the Product warranty-policy source.

Cube E adds the now-approved optional official Product GTIN field without changing the one-SKU/one-Product-spec foundation.

## Production Order / Lot / Roll Foundation

Already provides immutable Production Orders, Lots, one record per physical Roll, internal Roll serial, independent ERP serial, historical Product snapshot and the voided-order downstream block rule.

## Agent & Network Foundation

Already provides Country Agent, Company/Agent/Dealer/Center hierarchy and RLS, Operational Parties, stable Transfer ID/exact resolver, and controlled Center invitation/onboarding.

These are closed dependencies and are not redesigned by the remaining roadmap.

---

# 4. Center Foundation Completion

The Center correction was completed as a three-step dependency chain.

## Cube A — Center Location Foundation

**Status:** Complete / merged.

### Depends on

- Center entity;
- Center operational account/onboarding;
- existing operational authorization.

### Owns

- current latitude/longitude;
- reported accuracy;
- capture timestamp/source;
- append-only location history;
- Center self-capture from browser/device while at the premises;
- initial 50m-or-better application accuracy target;
- Admin correction path;
- server/database validation;
- Center dashboard location state;
- mobile permission/retry/error handling.

### Does not own

Network approval, public map, custody, Transfers or Activation.

---

## Cube B — Center Network Approval Foundation

**Status:** Complete / merged.

### Depends on

- **Cube A — Center Location**;
- Agent network scope from the merged Network Foundation.

### Owns

- `approved | unapproved` current projection;
- immutable approval/revocation audit events;
- Admin approval/revocation for any Center;
- Agent approval/revocation only inside own network;
- Dealer/Center denial;
- approval blocked without active Center + valid current location;
- atomic approval invalidation when saved location changes;
- Center/Admin/Agent approval-state UI.

### Critical rule

Network approval is a trust/public designation. It is **not** a custody, Roll Opening or Warranty Activation permission.

---

## Cube C — Public Center Directory & Map

**Status:** Complete / merged.

### Depends on

- **Cube A — Location**;
- **Cube B — Network Approval**;
- existing public application shell.

### Owns

- narrow public Center projection;
- only active located Centers;
- Registered Center vs Approved Center distinction;
- public map/list mobile experience;
- no leakage of Transfer ID, Auth/profile IDs, private email, private hierarchy or audit history;
- light provider-agnostic map visualization.

### Macro gate

**A + B + C are closed; Center Foundation Completion is Done.**

---

# 5. Roll Custody & Transfers

This macro-capability is intentionally decomposed so we do not make the full label package a fake dependency and do not make Transfers incomplete.

## Cube D — Roll Custody Foundation

**Status:** Complete / closed after independent review and closure patch.

### Depends on

- physical Rolls from Production;
- Operational Parties;
- singleton Company party.

### Does not depend on

Center location, Center approval, public map, or any printed label.

### Owns

- one authoritative current-custody projection per Roll;
- custodian = `operational_parties.id`, never User ID;
- backfill existing Rolls to Company custody;
- initialize future Rolls to Company custody through a narrow database path without reopening the Production RPC;
- immutable custody-history/event contract;
- one confirmed custodian only;
- voided Production Order downstream eligibility rule;
- custody read/RLS contracts.

### Does not own

Pending Transfer, reservation, receipt, scan UX, labels or Activation.

---

## Cube E — Outer Roll Label & Print Foundation

**Status:** Current implementation cube — approved 2026-08-14 boundary.

### Depends on

- Product Foundation;
- existing Roll identity from Production;
- immutable Production Order Product snapshot;
- Production Lot identity.

### Does not depend on

Custody or Transfer implementation.

### Purpose

Provide the first real production-grade physical Roll label and the professional deterministic print foundation required by later Production labels and scan workflows.

Cube E is **not** the complete future Production Label package and must not invent unresolved Activation/Warranty identifiers.

### Identity contract

Cube E preserves the distinction between:

- Product SKU;
- official Product GTIN;
- Lot number;
- canonical Roll serial;
- ERP serial;
- Transfer ID;
- future Activation identity;
- future Warranty/public token.

The outer label uses:

- one Product-level linear barcode from the official GTIN;
- one contextual QR derived from the existing canonical Roll serial through the stable public Roll-resolver URL.

No new random Roll QR identifier is created merely for printing.

A normal phone-camera scan of the Roll QR reaches only the public Product-information experience. The same QR can later be parsed inside authenticated Transfer/Receipt/Roll Opening workflows to identify the exact Roll, while each workflow independently enforces authorization and state rules.

### Owns

- optional validated/unique official Product GTIN field;
- one fixed V1 outer carton Product/Roll label;
- two identical physical copies per Roll for front/back;
- historical `150 × 100 mm` size as the first real validation target, not a frozen printer specification;
- canonical Roll QR payload builder/parser contract;
- narrow exact-match public Roll -> public Product resolver without anonymous Roll browsing;
- human-readable Product/Lot/Roll identity;
- Product GTIN linear barcode;
- deterministic print/reprint;
- exact-geometry, vector-first label rendering where supported;
- professional imposition/chunk planning for large Production Orders;
- bounded Admin print/export path;
- voided-order protection;
- automated payload/data/output tests;
- mandatory real print/cut + barcode/QR scan validation before physical closure.

### Does not own

- Transfer state/reservation/receipt;
- bag/case label;
- inner Roll/coil label;
- separate ERP label package;
- Activation sticker/code;
- vehicle/warranty/invoice Warranty QR;
- Transfer ID label;
- generic template engine;
- shipping/accounting/ERP workflow.

### Print-profile boundary

The following must be learned from the actual printer/cutter/RIP workflow rather than guessed:

- media width;
- edge margins and inter-label gaps;
- bleed;
- cut-contour/spot-color naming;
- registration marks;
- RIP-specific PDF requirements;
- color profile.

They are isolated as a small print profile so physical validation can freeze them without redesigning Product/Roll identity.

### Done when

A real generated Roll can produce two deterministic print-ready outer labels; the Product GTIN barcode scans correctly; the contextual Roll QR opens the public Product experience in a normal camera and resolves to the exact Roll in the internal parser; large orders are automatically imposed/chunked without manual label editing; reprints are stable; voided orders are blocked; CI plus real print/scan acceptance and double review pass.

---

## Cube F — Roll Transfer State & Reservation Engine

### Depends on

- **Cube D — Roll Custody Foundation**;
- Operational Party / Transfer ID foundation;
- exact active-recipient resolver;
- Roll/Production eligibility rules.

### Important non-dependency

**Cube F does not depend on Cube E.**

The database/service Transfer state machine can be built and tested using canonical Roll IDs. The physical scan label becomes a dependency when the real camera/scan UX is implemented in Cube G.

### Owns

- Transfer header and Roll items;
- idempotent creation;
- sender must be confirmed current custodian;
- active recipient != sender;
- atomic no-conflicting-reservation rule;
- generated/non-voided Production Order check;
- reservation while custody remains with sender;
- immutable Transfer/custody events;
- rejection/cancellation rules before receipt;
- race/concurrency protection.

### Done when

The Transfer state machine cannot double-reserve, double-transfer or move confirmed custody before recipient receipt.

---

## Cube G — Transfer Send UX: Transfer ID + Scan / Select / Lot

### Depends on

- **Cube F — Transfer engine**;
- **Cube E — contextual physical Roll QR/outer label** for scan mode;
- exact Transfer ID resolver already merged.

### Owns

- enter/scan exact recipient Transfer ID;
- minimal recipient verification card;
- `Scan Rolls` for small/mixed moves;
- `Select Rolls` for known subsets;
- `Select Lot` for trusted bulk movement;
- Lot expansion into individual Roll items;
- explicit total/available/elsewhere behavior for partially held Lots;
- review count before send;
- mobile camera/scanner flow;
- duplicate/interrupted submission handling.

### Rule retained from PD-014

Per-Roll scan is not mandatory for a trusted whole-Lot move. The system still records each physical Roll as an individual Transfer item.

### Done when

Sender can create a valid pending Transfer through every approved input mode without bypassing custody/reservation rules.

---

## Cube H — Transfer Receipt, Partial Receipt & Resolution

### Depends on

- **Cube F — Transfer engine**;
- **Cube G — send workflow**.

### Owns

- recipient pending-transfer inbox/detail;
- receipt confirmation;
- scan-assisted receipt verification where appropriate;
- partial receipt;
- custody moves only for confirmed received Rolls;
- unresolved Roll remains reserved and sender remains confirmed custodian;
- whole-transfer rejection before any receipt;
- sender cancellation before any receipt;
- first-release unresolved-item resolution path;
- audit/timeline;
- mobile failure/connectivity states.

### Macro gate

Only after **D + E + F + G + H** are closed is **Roll Custody & Transfers** considered Done.

A Transfer implementation without recipient receipt/partial-receipt behavior or without the approved scan path is not complete.

---

# 6. Production-owned Label Package

## Cube I — Remaining Production Label Package

### Depends on

- Product Foundation;
- Production Foundation;
- print primitives proven by **Cube E**.

### Does not depend on

Custody or Transfers, and therefore does not block them.

### Owns, after final physical label matrix is approved

- bag/case labels;
- broader inner-Roll presentation where required;
- separate ERP serial label;
- any other confirmed Production-owned label not already completed in Cube E;
- bounded batch print/reprint using the Cube E renderer/imposition primitives;
- physical copy counts, dimensions and printer tolerances for those remaining label types.

Cube I must **reuse** the Product/Roll identity and print foundation proven by Cube E. It must not create a second renderer, print engine, or alternate Roll QR identity.

### Explicit exclusion

Activation/Warranty labels are not included merely because they may eventually be printed near Production time.

### Done when

Every approved remaining Production-owned label can be deterministically printed/reprinted from existing immutable data with no invented business identity and without rebuilding the Cube E print foundation.

---

# 7. Activation/Warranty label decision gate

The following remain outside Cubes E and I until their owning identifiers/lifecycles are formally defined:

- Activation sticker/QR;
- vehicle-pillar QR;
- warranty-card QR;
- invoice QR.

Before implementing them, the future Activation/Warranty specification must decide:

1. when Activation identity is allocated;
2. which object owns it;
3. whether it is printable at Production time or later;
4. whether vehicle/card/invoice copies share one Warranty public URL/token or use another approved model;
5. reprint and anti-enumeration behavior.

Current SKU, Roll serial, ERP serial or Transfer ID must not be substituted for these future identities just to complete artwork.

---

# 8. Later operational sequence

After Center Foundation Completion and Roll Custody & Transfers are closed, the next macro-flow should be planned from the approved Product Decisions:

1. **Roll Opening / Claiming** by authenticated active Center holding confirmed custody;
2. **Pre-install Roll Issue Reporting** after opening;
3. **Warranty Activation** as a separate event with customer/vehicle/VIN data and atomic activation;
4. **Warranty public access/verification** and customer QR strategy;
5. Claims and later replacement/reinstall flows.

Network approval is not an Activation gate.

This roadmap deliberately does not pre-build those later cubes.

---

# 9. Dependency graph

```text
COMPLETED
Product / Production Rolls ───────────────┐
Network / Operational Parties ───────┐    │
Center Foundation A/B/C ────────┐    │    │
Cube D Custody ──────────────────┼────┘    │
                                │         │
CURRENT                          │         │
E Outer Roll Label + Print Foundation ← Product/Rolls
                                │
ROLL TRANSFERS                   │
D Custody Foundation            │
  ↓                              │
F Transfer State/Reservation     │
                                 │
              E + F              │
                ↓                │
G Send UX: Transfer ID + Scan/Select/Lot
                ↓
H Receipt / Partial Receipt → confirmed custody changes

REMAINING PRODUCTION PRINTING
E print primitives
  ↓
I Remaining Production-owned Label Package

LATER DECISION GATE
Activation/Warranty identity
  ↓
Activation sticker + vehicle/card/invoice Warranty QR strategy
```

The important dependency is:

- D → F;
- E is independent of D/F;
- E + F → G;
- G + F → H;
- E print primitives → I.

This is the reason the unresolved full label package is not placed in front of custody/Transfers.

---

# 10. Immediate next development step

The immediate code cube is:

**Cube E — Outer Roll Label & Print Foundation**

Why:

- Product, Production, Center Foundation and Cube D are already complete;
- the outer carton front/back label is now confirmed as a real business output, not a throw-away scan sticker;
- the Product-level GTIN gap is now explicit and bounded;
- one contextual Roll QR can support public Product discovery now and authenticated operational scanning later without creating a second Roll identity;
- the print foundation can be proven now from immutable Product/Production/Lot/Roll data without inventing Activation/Warranty state;
- Cube F remains independently implementable after E and does not require reopening the print cube.

Cube E starts from current `main` on its own clean feature branch and remains separate from Transfer state/reservation.

---

# 11. Review rule for every remaining cube

Before merge:

### Review 1 — implementation integrity

Review schema/migrations, invariants, atomicity, RLS/grants, server/RPC path, UI/mobile behavior, failure states, auditability and affected regressions.

For print cubes, also review physical geometry, machine-readable payload correctness, deterministic reprint, bounded generation and real print/scan acceptance where applicable.

### Review 2 — fresh dependency review

Re-read this roadmap plus applicable Product Decisions/specs and verify:

- no later responsibility leaked into the cube;
- all declared dependencies already exist;
- no completed foundation was reopened unnecessarily;
- no identifier was reused for a different business meaning;
- CI/database/types/build and relevant runtime/physical smoke tests pass on the final head.

Only then may the cube be proposed for merge.
