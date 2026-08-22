# Protection Giants — Planning Stage Closure Index

**Date:** 2026-08-22  
**Status:** PLANNING PACKAGE COMPLETE

## 1. Purpose

This index records the completed planning package and the approved execution order so Product Cubes and Platform Experience Harmonization remain separate and implementation can continue without reopening already-settled design questions.

## 2. Two separate execution tracks

### Track A — Product Development Cubes

Adds real capabilities/business state/security contracts.

Approved near-term order:

```text
Cube K — Pre-install Roll Issue Reporting
        ↓
Cube L — Role-aware Notifications + Web Push + Minimal PWA
        ↓
Warranty Activation
        ↓
Public Warranty access / verification
        ↓
Claims / replacement / reinstall
```

### Track B — Platform Experience Harmonization

Non-Cube quality program for already-authorized capabilities:

- rendered role audit;
- reachability/access correction;
- presentation consistency;
- role navigation;
- Center journey continuity;
- role Home/workbench improvement;
- dense-form refinement;
- visual/state polish.

Track B never consumes Cube letters and may not silently create Product behavior.

## 3. Cube K current gate

Cube K is implemented but remains unmerged pending its own rendered UI/UX closure and explicit Product Owner merge approval.

The app-wide UX program does **not** require every global UX improvement to be finished before K can merge. Only K-owned rendered blockers belong in PR #63.

## 4. Cube L planning package

Branch:

`study/notification-foundation`

Frozen implementation documents:

- `docs/cube-l-notification-pwa-frozen-spec.md`
- `docs/cube-l-notification-event-catalog.md`
- `docs/cube-l-notification-qa-acceptance-spec.md`
- `docs/roadmap-amendment-cube-l-notifications.md`
- `docs/cube-l-planning-closure.md`

Supporting approved studies/amendments:

- `docs/notification-foundation-pre-design-study-2026-08-22.md`
- `docs/notification-foundation-approved-planning-amendment-2026-08-22.md`
- `docs/notification-pwa-v1-approved-amendment-2026-08-22.md`

Precedence:

Frozen implementation documents override older supporting-study wording if a wording conflict remains.

Planning conclusion:

**Cube L requires no further Product design round before implementation after Cube K closure.**

## 5. Platform Experience planning package

Branch:

`audit/platform-role-experience`

Documents:

- `docs/platform-role-experience-inventory-2026-08-22.md`
- `docs/platform-experience-improvement-guardrails-2026-08-22.md`
- `docs/development-stream-separation-2026-08-22.md`
- `docs/platform-role-capability-reachability-contract.md`
- `docs/platform-experience-harmonization-execution-spec.md`
- `docs/platform-role-rendered-walkthrough-spec.md`
- `docs/platform-experience-planning-closure.md`

Planning conclusion:

**The UX track is ready for rendered walkthrough; broad implementation must be evidence-driven from that walkthrough rather than another speculative redesign phase.**

## 6. Approved execution order from here

### Step 1 — Rendered Cube K closure + role walkthrough begins

- run Center/Admin Cube K surfaces in real browser at mobile/desktop viewports;
- fix only Cube K-owned blockers in PR #63;
- record app-wide findings separately in UX backlog.

### Step 2 — Cube K final GO/merge decision

- rerun Product gates after any K-owned UI corrections;
- double review;
- Product Owner explicitly approves merge;
- merge K to `main`.

### Step 3 — UX-S01 Access Correctness

From fresh `main`, small non-Cube PR:

- fix Product Reference access contradiction for Agent/Dealer/Center;
- verify other advertised/authorized route mismatches;
- preserve Admin Product management.

### Step 4 — UX-S02 Cross-cutting correctness

If conflict-safe and still small:

- shared browser/device timezone formatter;
- user-facing terminology/internal-jargon corrections;
- feedback/status consistency.

Can be split into smaller PRs if needed.

### Step 5 — Cube L implementation

From then-current fresh `main`:

- create `feature/cube-l-notifications-pwa` or equivalent;
- implement frozen spec in coherent small increments;
- no speculative channels/offline/rules engine;
- close through permanent CI + real Push/PWA acceptance + double review.

### Step 6 — UX-S03 Role Navigation

After Cube L's actual Bell/Inbox/PWA shell exists:

- harmonize mobile/desktop navigation once around final role capability set;
- preserve reachability contract.

### Step 7 — UX-S04/S05 and remaining high-priority experience work

- Center physical Roll journey;
- attention-first Role Home/workbenches;
- dense-form and shared-state refinements as evidence supports.

### Step 8 — Warranty Activation planning/implementation

Only after Cube L is closed:

- freeze Warranty Activation Product spec from current `main`;
- assign its Cube letter at that time;
- define its own notification events/recipients and integrate them into Cube L infrastructure;
- do not reuse Roll/ERP/Transfer identifiers as Activation identity without the required identifier decision.

Then continue Public Warranty and Claims in the approved Product order.

## 7. What is deliberately NOT a planning blocker

- official final company logo/icons;
- VAPID/deployment secrets;
- exact production scheduler provider;
- subjective pixel-level polish before rendered review;
- final Warranty Activation identifier (belongs to its own future Product spec);
- future Claims state machine;
- email/SMS/WhatsApp notification channels not approved for Cube L V1.

## 8. Governance checks before any future work item

Ask:

1. Does this change create business/data/security capability?
   - Yes → Product Development Cube/spec.
   - No → UX Harmonization if it improves existing capability presentation/reachability.

2. Could this UX change remove or obscure a valid capability?
   - If yes, it fails the Reachability Contract.

3. Does this event need a notification?
   - Existing Cube L catalog only, unless the owning future Product Cube freezes a new catalog entry.

4. Does a technical implementation choice change frozen business behavior?
   - If yes, amend Product spec first; do not decide silently in code.

## 9. Planning completion statement

As of 2026-08-22, the planning needed to continue the approved near-term execution order is complete:

- Product/UX stream separation is documented;
- role capability preservation is documented;
- rendered UX audit method is documented;
- UX execution sequence is documented;
- Cube L scope, architecture, event catalog, delivery/PWA contract, QA and roadmap placement are frozen;
- implementation sequencing after Cube K is explicit.

The project should now return to **execution and evidence**, not another general planning cycle, unless a genuinely new Product decision appears.
