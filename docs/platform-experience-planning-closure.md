# Protection Giants — Platform Experience Planning Closure

**Date:** 2026-08-22  
**Track:** Platform Experience Harmonization — **NOT a Product Cube**  
**Status:** PLANNING COMPLETE / RENDERED WALKTHROUGH NEXT

## 1. Closure statement

The planning phase for platform-wide Role/UI/UX harmonization is complete enough to begin evidence-based rendered walkthrough and then small UX Slices.

No redesign should begin from taste or speculation. The next step is browser-rendered role walkthrough using the frozen checklist, followed by prioritized implementation slices.

## 2. Authoritative UX planning set

The current planning set is:

1. `docs/platform-role-experience-inventory-2026-08-22.md`
   - current route/screen inventory;
   - current role experiences;
   - strengths/gaps;
   - initial priorities.

2. `docs/platform-experience-improvement-guardrails-2026-08-22.md`
   - non-regression principles;
   - no capability loss;
   - authorization vs discoverability vs reachability.

3. `docs/development-stream-separation-2026-08-22.md`
   - strict separation between Product Cubes and UX Harmonization;
   - escalation rule for new business capabilities.

4. `docs/platform-role-capability-reachability-contract.md`
   - capabilities/routes each role must retain;
   - destination classifications;
   - cross-flow continuity rules;
   - P0 Products access contradiction;
   - before/after reachability evidence requirement.

5. `docs/platform-experience-harmonization-execution-spec.md`
   - frozen UX Slice sequence;
   - Cube K closure boundary;
   - access/presentation/navigation/Center/Home/form/polish plan;
   - Slice Ready/Done criteria;
   - interaction with Cube L/future Product Cubes.

6. `docs/platform-role-rendered-walkthrough-spec.md`
   - actual browser/device audit method;
   - route/scenario checklist per role;
   - 320/360/390/430 + tablet/desktop matrix;
   - cross-role handoff scenarios;
   - evidence/severity/exit criteria.

Existing `docs/design-system.md` and `docs/mobile-native-interface-standard.md` remain foundational design constraints.

## 3. Frozen program priorities

### P0

Access/reachability correctness, beginning with the confirmed non-Admin Product Reference contradiction.

### P1

- rendered Cube K closure defects owned by Cube K;
- consistent browser/device time presentation;
- role-appropriate terminology;
- role navigation architecture;
- Center physical Roll journey continuity;
- attention-first Role Home/workbench composition using real data.

### P2

- dense form progressive disclosure;
- shared state/feedback consistency;
- efficiency improvements.

### P3

Visual/microcopy polish only after structural correctness.

## 4. Immediate next UX action

Do **not** start broad UI code immediately.

Execute the `platform-role-rendered-walkthrough-spec.md` against the current Cube K-inclusive baseline and record actual findings.

During that walkthrough:

- a Cube K-specific blocker is fixed in Cube K PR #63;
- a global UX issue enters a `UX-Sxx` Slice backlog;
- a finding requiring new Product capability is escalated out of UX.

## 5. Cube K relationship

Platform-wide audit does not require Cube K to remain unmerged until every app-wide UX improvement is complete.

Cube K remains blocked only until:

- its own rendered Center/Admin surfaces are professionally complete;
- its image/decision/copy/time/phone issues are closed;
- its Product QA/regression gates remain green;
- explicit Product Owner merge approval is given.

Global navigation/Home improvements stay in UX track.

## 6. Product-track relationship

Product sequence remains independently:

`Cube K → Cube L Notifications/Web Push/PWA → Warranty Activation → Public Warranty → Claims`

UX Slices may interleave between Product Cubes when safe, but do not consume letters or alter this dependency order.

Recommended coordination:

1. close/merge K;
2. merge small UX-S01 Access Correctness from fresh main;
3. merge UX-S02 cross-cutting correctness if small/conflict-safe;
4. start Cube L from then-current main;
5. after Cube L shell lands, perform UX-S03 role-navigation harmonization once rather than redesigning shell twice;
6. continue Center/Role Home and later slices with fresh-main discipline.

## 7. No open UX planning blocker

The following are not reasons for more speculative planning before walkthrough:

- exact visual spacing on every screen;
- final navigation icon choice;
- exact Role Home card arrangement;
- exact progressive-disclosure grouping;
- image-gallery final styling.

These decisions should be made from rendered evidence inside the corresponding UX Slice, under the frozen reachability/design rules.

## 8. Change control

Reopen planning only if rendered review reveals a material issue that changes:

- role authorization;
- Product lifecycle/state;
- cross-domain workflow;
- new external integration;
- Product roadmap dependency.

Pure layout/copy/navigation findings remain execution-level UX work.

## 9. Exit statement

**Platform Experience Harmonization planning is closed. The next step is rendered role walkthrough, not another design-planning round.**
