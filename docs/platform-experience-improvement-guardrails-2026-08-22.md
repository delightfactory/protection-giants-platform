# Protection Giants — Platform Experience Improvement Guardrails

**Date:** 2026-08-22  
**Baseline:** `audit/platform-role-experience`  
**Status:** Product-owner approved guardrail for the platform UX/UI review and harmonization stage.

## 1. Core rule: improvement must never create access regression

A UX simplification is **not** allowed to remove, hide beyond practical discovery, or break access to a route/function that a role:

1. is already authorized to use; or
2. needs as part of a valid end-to-end operational flow.

The review must distinguish three separate things:

- **Authorization:** whether the role is actually allowed to read/execute the capability.
- **Discoverability:** whether the user can reasonably find the capability.
- **Flow reachability:** whether the user can reach the capability at the correct point in a real task and return/continue safely.

A change may simplify navigation presentation, but it may not silently convert an authorized or required capability into a hidden/dead-end feature.

## 2. Source-of-truth order before changing any screen

Every material UX change must be checked against the following sources in order:

1. frozen product decisions/specifications;
2. database authorization/RLS/RPC contracts;
3. route-level role gates;
4. existing end-to-end flow dependencies and contextual links;
5. current Home/navigation exposure;
6. rendered UX behavior.

If these disagree, the disagreement is an audit finding. The UI must not be used to guess a new authorization rule.

## 3. Mandatory Role × Capability Access Matrix

Before changing navigation, Home, lists, or task entry points, maintain a Role × Capability matrix for:

- Admin / Company;
- Country Agent;
- Dealer / Distributor;
- Installation Center.

For every capability record:

- allowed role(s);
- read vs mutate vs review/decision authority;
- scope rule;
- current entry point(s);
- contextual entry point(s);
- required predecessor task/state;
- expected return/next step;
- whether it is high-frequency, occasional, exceptional, or administrative.

No change is accepted if a previously valid cell in this matrix becomes practically unreachable without an explicit product decision changing the role model.

## 4. Navigation taxonomy — do not solve clutter by deletion

Each destination must be classified before redesign:

### A. Primary destination
High-frequency role workspace that deserves persistent navigation.

Examples may include:
- Center physical Roll work;
- Dealer Transfers;
- Agent network/Transfers;
- Admin attention/workbench.

### B. Work queue / attention surface
A place the user visits because something currently requires action.

Examples:
- submitted Pre-install Issues;
- incoming Transfers;
- unresolved receipt states;
- onboarding/approval exceptions.

### C. Contextual task
A task that should normally be entered from a parent record or previous step, not necessarily from persistent navigation.

Examples:
- Open Roll;
- receive a specific Transfer;
- approve a specific Center;
- resolve a specific Pre-install Issue;
- opened-Roll Recovery.

### D. Reference / settings / administrative destination
Lower-frequency but still valid destinations that must remain findable.

Examples:
- Product reference for non-Admin roles;
- Product management for Admin;
- Center location;
- account/entity maintenance.

**Rule:** removing a destination from bottom navigation/sidebar is acceptable only if a clear alternative discovery path remains and the task does not become harder to complete in its real workflow.

## 5. End-to-end flow preservation

The audit must validate complete operational journeys, not isolated pages.

### Center physical Roll journey

At minimum:

`Receive Transfer → Roll in custody → Open Roll → inspect/use → Pre-install Issue if needed → Company decision → continue or return-required handling → future Warranty Activation`

Every transition must preserve:

- current Roll identity/context;
- correct action availability;
- clear next step;
- safe back/cancel behavior;
- no requirement to return to Home just to discover the next logical action.

### Transfer journey

`Create/Send → pending → recipient discovers incoming work → Receive → partial/unresolved handling if applicable → completed/history`

Both sender and receiver views must remain reachable for every authorized role.

### Network journey

Admin/Agent/Dealer scopes must preserve appropriate access to:

`create/manage entity → first account/onboarding → location where relevant → approval where relevant → lifecycle/status → operational use`

No UI simplification may accidentally remove the management action needed to complete the entity's operational readiness.

## 6. Role Home design rule

Role Home may become more task-oriented, but it must **not** become the only way to access the platform.

Home should prioritize:

1. work needing attention now;
2. high-frequency role actions;
3. role-specific operational context;
4. lower-frequency management/reference destinations.

However, all valid capabilities must remain discoverable through persistent navigation, a controlled More/Operations surface, contextual links, or another explicit route map appropriate to that role.

No capability should depend on the user remembering a URL or navigating via browser history.

## 7. Product access correction rule

The current Products contradiction is treated as an access-consistency defect, not a reason to remove Products from non-Admin roles.

The current contracts show:

- Admin: Product management authority;
- active Agent/Dealer/Center: Product read/reference access.

The UX direction must preserve this distinction:

- **Admin → Product Management**
- **Agent / Dealer / Center → Product Reference / read-only operational view**

No non-Admin edit/lifecycle controls may leak into the read-only experience.

## 8. Mobile-first non-regression

Because phone is the primary operational surface, every changed role flow must be checked at phone widths first.

Required review points:

- 320 / 360 / 390 / 430px where layout/navigation is affected;
- no horizontal page overflow;
- primary controls at least 44px touch targets;
- bottom/sticky navigation does not cover content;
- task routes keep predictable Back/Cancel behavior;
- keyboard does not obscure required action controls;
- QR/scanner-assisted flows remain reachable where already supported;
- long Arabic names, serials, Transfer IDs and technical LTR values remain readable;
- landscape/reduced-height behavior where a sticky surface is involved.

Desktop/tablet remain part of acceptance, but mobile is not allowed to be a degraded version.

## 9. Business-logic isolation

The UX audit must not casually rewrite business rules.

For each improvement classify it as one of:

- visual-only;
- information architecture/navigation;
- role-specific read presentation;
- flow orchestration/context linking;
- business-rule change.

The first four can be handled in the experience-improvement stage when contracts remain unchanged.

Any business-rule change must return to the normal cube/spec process and receive explicit product approval before implementation.

## 10. Small-slice implementation rule

Do not implement the platform UX review as one large redesign PR.

Preferred order:

1. freeze access/flow matrix;
2. rendered walkthroughs for all roles;
3. fix confirmed P0 access contradictions;
4. stabilize role navigation taxonomy;
5. improve Role Home/work queues;
6. connect fragmented end-to-end journeys;
7. harmonize terminology/status/date/feedback patterns;
8. selectively polish dense or weak screens;
9. run final cross-role regression walkthrough.

Each slice should be independently reviewable and should avoid unrelated business/domain changes.

## 11. Required evidence before accepting a UX slice

For every material slice record:

### Before
- affected roles;
- affected routes/capabilities;
- current entry points;
- current authorization contract;
- upstream/downstream flow dependencies.

### After
- all authorized capabilities still reachable;
- no role gained unauthorized actions;
- no valid contextual transition was broken;
- Home/nav/context links remain coherent;
- direct/deep link behavior still respects authorization;
- empty/loading/error/success states remain usable;
- mobile and desktop rendered checks completed for affected paths;
- existing business/domain tests remain green;
- additional navigation/access regression test added when the change exposes a repeatable contract.

## 12. Stop conditions

A UX change must stop and return for design/product review if any of the following appears:

- uncertainty over whether a role should retain a capability;
- need to change RLS or mutation authority merely to make a proposed UI simpler;
- a task can only be simplified by removing a valid branch of the workflow;
- a contextual task loses a stable entry or return path;
- Home/navigation and database authorization disagree;
- the proposed change mixes broad visual redesign with domain/business rewrites;
- rendered behavior cannot be verified for a high-risk mobile workflow.

## 13. Definition of Done for the platform experience-improvement stage

The stage is complete only when:

1. every operational role has a coherent Home/workspace;
2. every authorized capability is discoverable and reachable;
3. high-frequency work is prioritized without hiding lower-frequency valid work;
4. primary end-to-end journeys are navigable without dead ends or unnecessary dashboard resets;
5. permissions shown in UI match real authorization contracts;
6. mobile navigation reflects each role's actual work;
7. terminology and status language are role-appropriate and consistent;
8. shared UI patterns are reused where appropriate;
9. all affected flows pass access, business-rule, rendered mobile, and desktop regression checks;
10. no access simplification was achieved by silently taking an existing valid capability away from a user.
