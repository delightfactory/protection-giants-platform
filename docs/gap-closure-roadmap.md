# Protection Giants — Dependency-Ordered Gap Closure Roadmap

**Status:** Approved sequencing baseline — 2026-08-13  
**Applies after:** merged Agent & Network Foundation (`main` at `bfc72c00`)  
**Purpose:** close the remaining operational gaps in small complete cubes, with every cube starting only after its real prerequisites exist.

## 1. Authority and correction

This roadmap is the current sequencing authority for the remaining gaps.

It was produced after re-reading:

- `docs/development-governance.md`;
- `docs/product-decisions.md`;
- `docs/distribution-network-flow-spec.md`;
- `docs/center-location-approval-activation-amendment.md`;
- `docs/center-location-approval-impact-review.md`;
- the merged Agent & Network Foundation;
- the already-closed Product and Production foundations.

Where older wording says simply **Production Labels → Roll Custody & Transfers**, this document supersedes that ordering.

The old order was too coarse because it treated every physical label as one dependency. The real dependency is narrower:

- **current Roll custody does not depend on a label**;
- **Transfer state/reservation does not depend on a label**;
- **scan-based Transfer UX does depend on a machine-readable physical Roll identity**;
- therefore a narrow **Operational Roll Scan Identity Label** is required before the scan workflow, not the complete Production Label package;
- Activation/Warranty labels remain behind their own future identifier/lifecycle decisions.

This is a sequencing correction only. Approved business rules in `product-decisions.md` remain unchanged.

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

## Production Order / Lot / Roll Foundation

Already provides immutable Production Orders, Lots, one record per physical Roll, internal Roll serial, independent ERP serial, historical Product snapshot and the voided-order downstream block rule.

## Agent & Network Foundation

Already provides Country Agent, Company/Agent/Dealer/Center hierarchy and RLS, Operational Parties, stable Transfer ID/exact resolver, and controlled Center invitation/onboarding.

These are closed dependencies and are not redesigned by the remaining roadmap.

---

# 4. Center Foundation Completion

The previously agreed Center correction remains a three-step dependency chain.

## Cube A — Center Location Foundation

### Depends on

- Center entity;
- Center operational account/onboarding;
- existing operational authorization.

All dependencies are already merged.

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

### Done when

Center and Admin location workflows are secure, auditable and fully usable.

---

## Cube B — Center Network Approval Foundation

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

### Done when

Approval authority, prerequisites and invalidation rules are fully enforced and audited.

---

## Cube C — Public Center Directory & Map

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
- light provider-agnostic map visualization chosen during implementation.

### Done when

Public Center discovery works from deliberately public data only.

### Macro gate

Only after **A + B + C** are closed is **Center Foundation Completion** considered Done.

---

# 5. Roll Custody & Transfers

This macro-capability is intentionally decomposed so we do not make labels a fake dependency and do not make Transfers incomplete.

## Cube D — Roll Custody Foundation

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

### Done when

Every eligible Roll has exactly one confirmed custodian and custody cannot drift or duplicate.

---

## Cube E — Operational Roll Scan Identity Label

### Depends on

- existing Roll identity from Production only.

### Does not depend on

Custody or Transfer implementation.

### Purpose

Provide the minimum physical machine-readable identity needed by the later scan workflow and later Roll Opening scan flow.

This is **not** the full Production Labels cube.

### Identity contract

The label represents the existing canonical physical Roll identity. It creates no new business identifier and must never masquerade as:

- Activation code;
- Warranty token;
- Transfer ID;
- Product marketing QR.

### Owns

- one fixed operational Roll identity label;
- deterministic print/reprint;
- human-readable identity beside the machine code where operationally required;
- bounded Admin print path;
- payload/readability tests;
- exact QR/barcode symbology and physical dimensions frozen after real print/scan validation;
- voided-order protection.

### Does not own

Carton/bag artwork, ERP label package, Activation sticker, vehicle/warranty/invoice QR, or generic template engine.

### Why this cube exists

PD-014 requires scan confirmation for small/mixed movements. Pulling the entire Production Label package forward merely to obtain one scan identity would add false dependencies and would pressure the design to invent unresolved Activation/Warranty identifiers.

### Done when

A physical Roll can be scanned reliably into its existing canonical Roll identity and the label can be safely reprinted.

---

## Cube F — Roll Transfer State & Reservation Engine

### Depends on

- **Cube D — Roll Custody Foundation**;
- Operational Party / Transfer ID foundation;
- exact active-recipient resolver;
- Roll/Production eligibility rules.

### Important non-dependency

**Cube F does not depend on Cube E.**

The database/service Transfer state machine can be built and tested using canonical Roll IDs. The label becomes a dependency only when the real camera/scan UX is implemented in Cube G.

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
- **Cube E — Operational Roll Scan Identity Label** for scan mode;
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

## Cube I — Production Label Package

### Depends on

- Product Foundation;
- Production Foundation;
- print primitives proven by **Cube E**.

### Does not depend on

Custody or Transfers, and therefore does not block them.

### Owns, after final physical label matrix is approved

- outer carton Product/Roll labels;
- bag/case labels;
- broader inner-Roll presentation where required;
- ERP serial label;
- Product/Lot/spec data;
- informational Marketing website QR;
- bounded batch print/reprint;
- physical copy counts, dimensions and printer tolerances.

### Explicit exclusion

Activation/Warranty labels are not included merely because they may eventually be printed near Production time.

### Done when

Every approved production-owned label can be deterministically printed/reprinted from existing immutable data with no invented business identity.

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
Center Onboarding ───────────────┐    │    │
                                 │    │    │
CENTER COMPLETION                │    │    │
A Location                       │    │    │
  ↓                              │    │    │
B Network Approval               │    │    │
  ↓                              │    │    │
C Public Center Map              │    │    │
                                      │    │
ROLL OPERATIONS                       │    │
D Custody Foundation ← Parties + Rolls    │
  ↓                                        │
F Transfer State/Reservation               │
                                           │
E Operational Scan Label ← Rolls ──────────┘
              E + F
                ↓
G Send UX: Transfer ID + Scan/Select/Lot
                ↓
H Receipt / Partial Receipt → confirmed custody changes

PRODUCTION PRINTING
E print primitives
  ↓
I Broader Production-owned Label Package

LATER DECISION GATE
Activation/Warranty identity
  ↓
Activation sticker + vehicle/card/invoice Warranty QR strategy
```

The important dependency is:

- D → F;
- E is independent of D/F;
- E + F → G;
- G + F → H.

This is the reason the full Production Label package is not placed in front of custody/Transfers.

---

# 10. Immediate next development step

The immediate next code cube is:

**Cube A — Center Location Foundation**

Why:

- all dependencies are already merged;
- Network Approval depends on it;
- Public Center Map depends on it;
- it is the first unfinished part of the approved Center correction;
- it is contained enough to complete and double-review without touching Transfer or label logic.

After A closes: B, then C.

Only after Center Foundation Completion is closed do we move into the Roll Operations chain. D and E are independent foundations, but they must remain separate cubes/PRs rather than being mixed together.

---

# 11. Review rule for every remaining cube

Before merge:

### Review 1 — implementation integrity

Review schema/migrations, invariants, atomicity, RLS/grants, server/RPC path, UI/mobile behavior, failure states, auditability and affected regressions.

### Review 2 — fresh dependency review

Re-read this roadmap plus applicable Product Decisions/specs and verify:

- no later responsibility leaked into the cube;
- all declared dependencies already exist;
- no completed foundation was reopened unnecessarily;
- no identifier was reused for a different business meaning;
- CI/database/types/build and relevant runtime smoke tests pass on the final head.

Only then may the cube be proposed for merge.
