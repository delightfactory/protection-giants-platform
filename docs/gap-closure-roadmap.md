# Protection Giants — Dependency-Ordered Gap Closure Roadmap

**Status:** Approved sequencing baseline — 2026-08-13  
**Applies after:** merged Agent & Network Foundation (`main` at `bfc72c00`)  
**Purpose:** close the remaining operational gaps in small complete cubes without forcing one module to wait on unrelated work or allowing a later workflow to start without its real prerequisites.

## 1. Authority and precedence

This roadmap records the current implementation sequence after reviewing the approved Product Decisions, the Distribution Network specification, the Center Location/Approval amendment, the merged Network Foundation, and the already-closed Product/Production foundations.

Where an older document says simply **Production Labels → Roll Custody & Transfers**, this roadmap is the newer sequencing authority.

That older order was too coarse because it treated all physical labels as one dependency. The actual dependency is narrower:

- current Roll custody does **not** depend on a printed label;
- transfer state/reservation does **not** depend on the complete Production Label package;
- the **scan-based physical transfer path** does require a machine-readable physical Roll identity;
- therefore only a small **Operational Roll Scan Label** is a prerequisite for the scan path;
- Activation/Warranty labels remain owned by their later identifier/lifecycle decisions and are not pulled forward merely to unblock Transfers.

This roadmap changes implementation order only. It does not change the approved business rules in `docs/product-decisions.md`.

## 2. Development rule

The project continues to use the cube principle:

1. one clear responsibility per cube;
2. no advanced workflow before its dependencies exist;
3. each cube is functionally complete for its declared responsibility;
4. no placeholder/dead UI;
5. no speculative generic engines;
6. affected security/RLS/failure paths are part of the cube;
7. double review before merge/closure;
8. the next cube starts from updated `main`, not from an unrelated feature branch.

A macro-capability may contain several small cubes, but the project must finish the whole dependency chain for that macro-capability before declaring it closed.

---

# 3. Current completed foundations

The following prerequisites already exist in `main` and are not reopened:

## 3.1 Product Foundation — complete

Provides:

- canonical Product/SKU;
- stable physical Product specification;
- Product public/internal data boundaries;
- Product warranty policy source;
- Product assets.

## 3.2 Production Order / Lot / Roll Foundation — complete

Provides:

- immutable Production Order;
- Lot lineage;
- one record per physical Roll;
- internal Roll serial;
- independent ERP serial;
- historical Product snapshot;
- voided Production Order downstream block contract.

## 3.3 Agent & Network Foundation — complete

Provides:

- Country Agent entity and role;
- Company → Agent → Dealer → Center management hierarchy;
- scoped RLS/management permissions;
- Operational Party registry;
- stable Transfer ID and exact recipient resolver;
- Center invitation/onboarding and trusted first-user provisioning.

These foundations already satisfy the identity prerequisites for the remaining work.

---

# 4. Remaining gap-closure sequence

## Cube A — Center Location Foundation

### Responsibility

Give each operational Center an auditable current physical location without mixing in network approval or public map behavior.

### Depends on

- Center entity;
- Center operational account/onboarding;
- existing Admin/Agent/Dealer/Center authorization model.

All are already implemented.

### Includes

- current Center latitude/longitude projection;
- reported accuracy;
- capture timestamp/source;
- append-only location history;
- Center self-capture using device/browser geolocation while at premises;
- initial application acceptance target of 50m accuracy or better;
- Admin manual correction path;
- server/database validation and authorization;
- Center dashboard location state;
- mobile geolocation permission/error/retry states.

### Does not include

- network approval;
- public Center map;
- custody/Transfers;
- Activation/Warranty.

### Closure condition

Center and Admin location workflows are fully usable and auditable, with cross-Center/location authorization regression covered.

---

## Cube B — Center Network Approval Foundation

### Responsibility

Implement Protection Giants network approval as a separate trust/quality state.

### Depends on

- **Cube A — Center Location Foundation**;
- Agent network scope from the merged Network Foundation.

### Includes

- current `approved | unapproved` projection;
- approval/revocation audit events;
- Admin approval/revocation for any Center;
- Agent approval/revocation only inside own network;
- Dealer/Center denial;
- approval blocked when Center is suspended or has no valid location;
- atomic invalidation of approval when saved Center location changes;
- Center/Admin/Agent UI state.

### Critical non-dependency

Network approval is **not** a custody, Roll Opening, or Warranty Activation permission.

### Closure condition

Approval can be granted/revoked only by authorized actors, location changes invalidate it atomically, and operational status/custody remain independent.

---

## Cube C — Public Center Directory & Map

### Responsibility

Complete the public-facing Center discovery experience so the Center macro-foundation is not left with unused internal location/approval data.

### Depends on

- **Cube A — Location**;
- **Cube B — Network Approval**;
- existing public application shell.

### Includes

- narrow public Center projection/API/view/RPC;
- only active Centers with valid current location;
- Registered Center vs Approved Center visual distinction;
- public map/list mobile experience;
- no Transfer ID, Auth/profile IDs, private email, private operational hierarchy, or audit-history leakage;
- light provider-agnostic map integration chosen at implementation time.

### Closure condition

The public Center discovery flow works from controlled public data and the complete Center Location/Approval/Public Map macro-capability passes double review.

### Macro gate after Cube C

Only after A+B+C are complete is **Center Foundation Completion** considered closed.

---

## Cube D — Roll Custody Foundation

### Responsibility

Create the authoritative current-custodian projection and immutable custody history prerequisites without yet implementing the Transfer workflow.

### Depends on

- physical Rolls from Production Foundation;
- Operational Parties from Network Foundation;
- singleton Company party.

It does **not** depend on Center Location, Network Approval, Public Map, or any printed label.

### Includes

- one current-custody row/projection per operational Roll;
- current custodian references `operational_parties.id`, never a User ID;
- existing Rolls backfilled to Company custody;
- future Roll insert initialization to Company custody through a narrow database path without reopening the Production RPC;
- immutable initial/current custody event contract;
- voided Production Order downstream eligibility rule;
- RLS/read contracts appropriate to current custodian visibility;
- concurrency/uniqueness protection so one Roll cannot have two confirmed custodians.

### Does not include

- pending Transfers;
- recipient acceptance;
- scan UI;
- labels;
- Roll Opening/Activation.

### Closure condition

Every eligible Roll has exactly one confirmed current custodian and the state/history cannot drift or duplicate.

---

## Cube E — Operational Roll Scan Identity Label

### Responsibility

Provide the minimum physical machine-readable Roll identity required for reliable scan-based movement and later Roll Opening workflows.

This is deliberately **not** the complete Production Labels cube.

### Depends on

- existing Production Order/Lot/Roll identities only.

It does not depend on Custody or Transfers.

### Identifier contract

The scan label represents the existing canonical physical Roll identity. It must not generate a new business identifier and must not impersonate:

- Activation code;
- Warranty token;
- Transfer ID;
- Product marketing QR.

The human-readable Roll identity must remain visible alongside the machine-readable code where required for operational verification.

The exact QR/barcode symbology and print dimensions are frozen inside this cube after real print/scan verification.

### Includes

- one fixed operational Roll identity label template;
- deterministic print/reprint from persisted Roll data;
- bounded Admin print path;
- machine-readable payload tests;
- physical scan readability review;
- voided Production Order protection.

### Does not include

- carton artwork;
- bag/case artwork;
- Marketing label package;
- Activation sticker;
- vehicle/warranty/invoice QR labels;
- generic template engine.

### Why it is separated

PD-014 requires scan confirmation for small/mixed physical movements. Building the complete Production Label package merely to obtain one scannable Roll identity would create an unnecessary dependency and would pull unresolved Activation/Warranty identifiers forward.

### Closure condition

A real physical Roll can carry a deterministic label that resolves its existing Roll identity accurately and can be reprinted without creating new identity/state.

---

## Cube F — Roll Transfer State & Reservation Engine

### Responsibility

Implement the transfer state machine and atomic Roll reservation rules before adding complete operator/recipient UI.

### Depends on

- **Cube D — Roll Custody Foundation**;
- Operational Party / Transfer ID foundation;
- active-recipient resolver;
- existing Roll/Production eligibility rules.

It does not technically require Cube E for database state transitions, but the full Transfer macro-capability cannot close until the scan path has Cube E available.

### Includes

- Transfer header and per-Roll items;
- idempotent Transfer creation;
- sender must be confirmed current custodian;
- active recipient must differ from sender;
- no conflicting reservation;
- parent Production Order must be generated/non-voided;
- reservation without changing confirmed custody;
- immutable transfer/custody event history;
- cancellation/rejection rules before receipt;
- no automatic expiry in first release unless later approved.

### Closure condition

The database/service state machine is race-safe and cannot double-transfer or move custody before recipient confirmation.

---

## Cube G — Transfer Send UX: Transfer ID + Scan/Select/Lot

### Responsibility

Make Transfer creation usable in the real physical workflow.

### Depends on

- **Cube F — Transfer engine**;
- **Cube E — Operational Roll Scan Identity Label** for scan mode;
- exact Transfer ID resolver already implemented.

### Includes

- enter/scan exact recipient Transfer ID;
- minimal recipient verification card;
- `Scan Rolls` for small/mixed movements;
- `Select Rolls` for known subsets;
- `Select Lot` for trusted bulk movement;
- whole-Lot expansion into individual Roll items;
- explicit `total / available / elsewhere` behavior for partially held Lots;
- review count before send;
- mobile camera/scanner-friendly flow;
- interrupted/duplicate submission handling.

### Important rule

Per-Roll scanning is not mandatory for a trusted whole-Lot transfer. The platform still records every Roll item individually.

### Closure condition

Sender can create a valid pending Transfer through every approved input mode without bypassing custody/reservation rules.

---

## Cube H — Transfer Receipt, Partial Receipt & Resolution

### Responsibility

Close the recipient side so confirmed custody can move safely and physical discrepancies are represented truthfully.

### Depends on

- **Cube F — Transfer engine**;
- **Cube G — send workflow**.

### Includes

- recipient pending-transfer inbox/detail;
- accept confirmed received Rolls;
- scan-assisted receipt verification where appropriate;
- partial receipt;
- unresolved Roll remains reserved with sender custody unchanged;
- whole-transfer rejection before any receipt;
- sender cancellation before any receipt;
- explicit resolution path for unresolved items within the approved first-release rules;
- atomic custody move for received Rolls;
- audit/timeline;
- mobile failure/connectivity states.

### Macro gate after Cube H

Only after D+E+F+G+H are complete is **Roll Custody & Transfers** considered functionally closed.

A Transfer implementation without receipt/partial-receipt handling or without the required scan mode is not considered Done.

---

## Cube I — Production Label Package (production-owned labels only)

### Responsibility

Complete the broader factory label package whose truth already exists in Product/Production data.

### Depends on

- Product Foundation;
- Production Foundation;
- print primitives proven by Cube E.

It does **not** depend on Roll custody/Transfers and does not block them.

### Includes, subject to final physical matrix

- outer carton Product/Roll labels;
- bag/case labels;
- inner Roll identity presentation if broader artwork is required beyond Cube E;
- ERP serial label;
- Product/Lot/specification data;
- informational Marketing website QR;
- bounded batch print/reprint;
- final copy counts/sizes and printer tolerances.

### Explicit exclusion

Do not include Activation/Warranty labels merely because they are physically printed near Production time.

### Closure condition

Every approved production-owned label can be deterministically printed/reprinted from existing immutable data with no invented business identity.

---

# 5. Activation/Warranty decision gate after gap closure

The following physical labels remain intentionally outside Cubes E and I until their owning identifiers/lifecycles are formally defined:

- Activation sticker/QR;
- vehicle-pillar QR;
- warranty-card QR;
- invoice QR.

Before these labels are implemented, the future Activation/Warranty specification must decide:

1. when the Activation identifier is allocated;
2. which business object owns it;
3. whether it is printed at Production time or later;
4. whether customer vehicle/card/invoice QR copies share one Warranty public URL/token or use another approved model;
5. reprint and anti-enumeration behavior.

The current identifiers must not be substituted for these future identifiers merely to finish artwork.

---

# 6. Later sequence after the current gap-closure roadmap

After Center Foundation Completion and Roll Custody & Transfers are closed, the next operational macro-flow should be planned against the already approved Product Decisions:

1. **Roll Opening / Claiming** by authenticated active Center that holds confirmed custody;
2. **Pre-install Roll Issue Reporting** after opening;
3. **Warranty Activation** as a separate later event using customer/vehicle/VIN data and an atomic activation transaction;
4. **Warranty public access/verification** and the customer QR copy strategy;
5. Claims and later advanced replacement/reinstall flows.

Network approval is not an Activation gate.

The detailed implementation sequence for those cubes must be approved when that phase begins; this document does not pre-build them.

---

# 7. Dependency summary

```text
COMPLETED
Product ───────────────┐
Production / Rolls ────┼──────────────────────────────┐
Network / Parties ─────┼───────────────┐              │
Center Onboarding ─────┘               │              │
                                       │              │
CENTER COMPLETION                      │              │
A Location                             │              │
  ↓                                    │              │
B Network Approval                     │              │
  ↓                                    │              │
C Public Center Map                    │              │
                                       │              │
ROLL OPERATIONS                        │              │
D Custody Foundation  ← Parties + Rolls│              │
                                       │              │
E Operational Scan Label ← Rolls ──────┘              │
             D + E                                      │
               ↓                                        │
F Transfer State/Reservation                            │
               ↓                                        │
G Send UX + Scan/Select/Lot                             │
               ↓                                        │
H Receipt/Partial Receipt → Custody changes             │
                                                        │
PRODUCTION PRINTING                                     │
I Production-owned Label Package ← Product/Production + E print primitives

LATER DECISION GATE
Activation/Warranty identity → Activation sticker + customer Warranty QR copies
```

A+B+C form the remaining **Center Foundation Completion** macro-capability.

D+E+F+G+H form the **Roll Custody & Transfers** macro-capability, with E being a narrow physical prerequisite rather than the complete Production Label package.

---

# 8. Immediate next development step

The immediate next code cube is:

**Cube A — Center Location Foundation**

Reason:

- all of its dependencies are already merged;
- it is the first unfinished requirement in the approved Center correction;
- Network Approval depends on it;
- Public Center Map depends on it;
- it does not require Transfer or label work;
- it can be completed and double-reviewed as a contained vertical slice.

After Cube A closes, proceed to Cube B, then Cube C. Do not start Transfer UI or full Production Labels in parallel on the same development branch.

---

# 9. Review discipline for every remaining cube

Before merge of each cube:

### Review 1 — implementation review

Review complete affected stack:

- schema/migrations;
- invariants/atomicity;
- RLS/grants;
- server actions/RPCs;
- UI/mobile behavior;
- failure paths;
- auditability;
- regressions.

### Review 2 — independent dependency review

Re-read this roadmap plus applicable Product Decisions/specs and verify:

- the cube did not silently absorb a later responsibility;
- all dependencies are real and already available;
- no later module was weakened or prematurely coupled;
- previous completed cubes remain unchanged in meaning;
- CI/database/type/build and relevant runtime smoke checks pass on the final head.

Only then may the cube be proposed for merge.
