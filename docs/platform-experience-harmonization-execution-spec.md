# Protection Giants — Platform Experience Harmonization Execution Specification

**Date:** 2026-08-22  
**Track:** Platform Experience Harmonization  
**Status:** FROZEN execution plan  
**Important:** This track is **not** the Product Cube roadmap. Its work items are called UX Slices, never Cubes.

## 1. Objective

Make Protection Giants feel like one coherent role-aware operational product across all already-built capabilities, without changing Product-domain rules merely to improve presentation.

The program answers:

- What does each role see on entry?
- What does that role need to do most often?
- What needs attention now?
- Can the user find every legitimate capability?
- Do adjacent Product Cubes form a continuous real-world journey?
- Are language, states, times, feedback, navigation and controls consistent?
- Is the experience professional on the phone first, then desktop?

## 2. Governance boundary

This program may improve:

- information architecture;
- role Home/workbench composition;
- navigation and discoverability;
- contextual links between existing flows;
- Arabic terminology/copy;
- visual hierarchy;
- responsive/mobile ergonomics;
- shared UI consistency;
- empty/loading/error/success states;
- time/status presentation;
- rendered/browser quality.

It must not silently:

- add a business workflow;
- add persistent domain state;
- change RLS/role authority;
- remove a valid capability;
- invent notification/event semantics;
- create a generic engine;
- renumber/reorder Product Cubes.

If a UX finding needs new Product behavior, stop and escalate it to Product Development. Cube L Notifications is the precedent for this rule.

## 3. Non-regression authority

All UX work is governed by:

- `docs/platform-role-capability-reachability-contract.md`;
- `docs/platform-experience-improvement-guardrails-2026-08-22.md`;
- `docs/development-stream-separation-2026-08-22.md`;
- existing `docs/design-system.md`;
- existing `docs/mobile-native-interface-standard.md`.

Every slice must record a before/after reachability matrix for affected roles.

## 4. Work-item naming

Use identifiers such as:

- `UX-S01`
- `UX-S02`

These are **UX Slices**, not Product Cubes and do not consume Cube letters.

Recommended branches:

- `ux/access-correctness`
- `ux/presentation-consistency`
- `ux/role-navigation`
- `ux/center-journey`
- `ux/role-home-workbenches`

Each slice should be a small PR with focused rendered evidence and regression checks.

## 5. Immediate Cube K closure boundary

Cube K is currently a Product PR and remains unmerged pending its own rendered UI/UX closure.

Only defects directly owned by Cube K should be fixed in PR #63 before merge, for example:

- Cube K submission/detail/decision visual defects;
- Cube K image evidence review usability;
- Cube K misleading copy/internal jargon;
- Cube K time inconsistency on its own screens;
- mobile overflow/touch/hierarchy defects in Cube K routes;
- broken contextual next-step links owned by Cube K.

Do **not** bundle the entire platform navigation redesign, Role Home redesign, Product reference correction or other global UX work into PR #63.

Cube K can close when its own functional + rendered experience is professional and its existing global dependencies remain intact.

## 6. Frozen UX execution sequence

The sequence below is a quality/program order, not a Product Cube order.

### Baseline — Rendered Role Walkthrough

Before broad UI changes, execute the frozen rendered walkthrough spec across:

- Admin;
- Agent;
- Dealer;
- Center;
- public/pre-auth supporting surfaces.

Output is evidence-backed findings, not speculative redesign.

### UX-S01 — Access Correctness & Reachability

Priority: **P0**

Scope:

- fix confirmed Products contradiction:
  - Admin keeps Product management;
  - Agent/Dealer/Center get authorized read-only Product Reference;
- identify any other route where Home/Nav advertises access but page guard rejects an otherwise authorized role;
- identify authorized routes with no meaningful entry path;
- preserve every current legitimate contextual action.

Acceptance:

- no valid role receives Access Denied from a normal advertised capability;
- no unauthorized role gains edit/mutation controls;
- before/after reachability matrix green.

Recommended timing: after Cube K merge and before Cube L implementation branch is cut, because this is a small non-domain correction and gives Cube L a cleaner role baseline.

### UX-S02 — Cross-cutting Presentation Correctness

Priority: **P1**

Scope:

- one shared user-facing operational time/date formatter;
- browser/device timezone presentation contract;
- Arabic/RTL treatment of IDs/serials/dates;
- consistent status-label grammar;
- remove internal architecture jargon from user-facing copy where inappropriate;
- harmonize FeedbackBanner/confirmation/success/error wording patterns;
- ensure destructive/irreversible states explain consequence before action.

Examples:

- Center-facing “Recovery” should become physical/user language;
- Server Component time must not disagree with client/browser time.

Acceptance:

- same timestamp displays consistently across surfaces;
- role language describes user action/result, not implementation terminology;
- no domain meaning is softened or changed.

This slice may be split into two PRs if time formatting and terminology touch too many files.

### Cube L Product implementation — separate track

Product track proceeds:

`Cube K → Cube L Notifications/Web Push/PWA → Warranty Activation ...`

UX-S01/S02 may merge between K and L without becoming Cubes. Once Cube L implementation starts, avoid simultaneous UX edits to the same shell/Service Worker/notification routes unless coordinated through fresh-main sequencing.

### UX-S03 — Role Navigation Architecture

Priority: **P1**

Recommended timing: after Cube L shell/notification entry exists so navigation is harmonized once around the actual final authenticated shell.

Scope:

- classify each destination Primary / Attention / Contextual / Reference/Settings;
- redesign mobile persistent navigation per role frequency, not module creation order;
- introduce an explicit More/Operations destination if needed instead of overloading Bottom Navigation;
- ensure Transfers are persistently discoverable for Agent/Dealer/Center as appropriate;
- ensure Admin can reach physical operations and exception queues without repeatedly hunting through Home;
- integrate Notifications entry without displacing core role work;
- desktop navigation uses same role mental model as mobile even if layout differs.

Acceptance:

- every authorized destination has at least one understandable entry path;
- primary role tasks are reachable in minimal navigation steps;
- contextual tasks remain contextual instead of becoming permanent clutter;
- no role sees navigation items it cannot use;
- no valid capability disappears.

### UX-S04 — Center Physical Roll Journey

Priority: **P1**

Scope existing capabilities only:

- incoming Transfer → receipt → custody;
- custody → Opening;
- Opening → healthy/issue next step;
- Issue submitted → waiting state;
- Issue result → allowed use / return-required / corrected report;
- return-required → explain physical return without implying custody already changed;
- product reference and location remain discoverable supporting tasks.

Warranty Activation is not invented here. When its Product Cube lands, this journey gets an additive link to Activation rather than a UX-created placeholder workflow.

Improvements may include:

- contextual next-action cards;
- clear “what happens next” copy;
- evidence image preview/gallery refinement;
- reduced record density on phone;
- scanner/manual fallback clarity;
- consistent back-to-Roll/context behavior.

Acceptance:

- Center can narrate the journey in physical terms without knowing module names;
- no dead end after receipt/open/issue decision;
- phone use at 320–430px passes rendered review.

### UX-S05 — Role Home / Attention-first Workbenches

Priority: **P1/P2**

Scope:

Use **existing real data only** to make Home answer “what needs me now?” before “which modules exist?”.

Admin candidate groups:

- decisions/exceptions needing Company action;
- physical-operation attention;
- network/account attention;
- then management/reference destinations.

Agent candidate groups:

- own-network approval/setup attention;
- incoming/partial Transfer attention;
- physical custody/navigation;
- network management/reference.

Dealer candidate groups:

- incoming Transfer/receipt attention;
- Centers;
- custody;
- Product reference.

Center candidate groups:

- incoming receipt attention;
- Rolls in custody / Open Roll action;
- own issue state/result;
- location/reference support.

After Cube L, unread notification state may be surfaced as a complementary signal, but Home queues represent **current task state**, not notification history.

Do not build an analytics dashboard merely to make Home look richer.

### UX-S06 — Dense Forms / Progressive Disclosure

Priority: **P2**

Scope screens proven by walkthrough to be cognitively heavy, especially:

- Center management/edit;
- long Admin entity forms;
- dense operational detail records.

Use progressive disclosure while preserving all authorized data/actions.

Acceptance:

- primary task remains obvious;
- secondary/support controls do not dominate;
- no required field/action becomes hidden without a clear reveal mechanism;
- edit screens remain truthful about which concept is changing: identity, operational status, location, approval, account/onboarding.

### UX-S07 — Shared State & Visual Polish

Priority: **P2/P3**

Scope only after structural issues are solved:

- empty/loading/error/success consistency;
- spacing and hierarchy;
- evidence gallery polish;
- badge/icon consistency;
- long text truncation/expansion;
- focus/hover/touch feedback;
- copy refinement;
- public/auth supporting surface consistency.

Do not spend time polishing a structure that is still wrong.

### Final — Cross-role Regression Walkthrough

Repeat the full role walkthrough after the planned high-priority slices.

Exit only when:

- all authorized capabilities remain reachable;
- role navigation is coherent;
- critical journeys have no dead ends;
- phone/desktop rendered quality is consistent;
- Product-domain tests remain green;
- no UX Slice accidentally introduced new business authority/state.

## 7. Priority definitions

### P0 — Access/reachability correctness

User is shown a valid capability but cannot use it, or a required authorized flow becomes unreachable.

### P1 — Journey/task correctness

User can technically complete work but navigation, language, time/state, hierarchy or next-step design materially risks error/confusion.

### P2 — Efficiency/consistency

Experience works but is unnecessarily dense, repetitive or inconsistent.

### P3 — Polish

Visual/microcopy refinement with no meaningful workflow risk.

P0/P1 take precedence over visual polish.

## 8. Slice Definition of Ready

Before coding a UX Slice:

- rendered finding exists or the defect is objectively reproducible;
- affected roles/routes listed;
- current authorization/reachability known;
- Product-domain behavior can remain unchanged;
- target improvement and acceptance criteria written;
- overlapping Product branch/PR conflicts identified.

If Product behavior would have to change, the item is not ready for UX coding and must be escalated.

## 9. Slice Definition of Done

Every UX Slice requires:

- focused implementation;
- before/after reachability evidence;
- affected desktop + 320/360/390/430 rendered checks;
- no horizontal overflow on core tasks;
- role-based authorization smoke checks;
- relevant client/component tests;
- TypeScript/build green;
- existing Product CI/regressions green where affected;
- no new dead controls/placeholders;
- concise doc update of what changed and why;
- review specifically answering “did any role lose access?”

## 10. Interaction with future Product Cubes

UX Harmonization never creates future Product screens early.

When Warranty Activation arrives:

- its Product Cube owns Activation state, data and permissions;
- UX program may then connect the already-frozen Center journey to the real Activation task;
- Cube L event catalog receives only the Activation notifications frozen by that Product Cube.

Same pattern applies to public Warranty and Claims.

## 11. Merge strategy

- one small UX Slice/PR at a time;
- start each from current `main`;
- avoid long-lived mega redesign branch;
- do not merge UX audit documentation as though it were functional product behavior without review;
- do not bundle unrelated Product schema changes into UX PRs;
- when a Product Cube is active on overlapping shell files, sequence rather than fight merge conflicts.

## 12. Program exit criterion

Platform Experience Harmonization is successful when each role experiences a coherent workspace matching its actual job, while the underlying Product capabilities/security remain intact.

It is **not** complete merely because every page shares the same CSS.
