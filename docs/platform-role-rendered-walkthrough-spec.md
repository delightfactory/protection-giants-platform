# Protection Giants — Rendered Role Walkthrough Specification

**Date:** 2026-08-22  
**Track:** Platform Experience Harmonization — **NOT a Product Cube**  
**Status:** FROZEN audit/acceptance method

## 1. Purpose

This walkthrough is the required visual/interaction audit for the actual application each role experiences.

It does not ask only whether a route renders. It asks, from the user's point of view:

- Do I understand where I am?
- Is the work I need obvious?
- Is the information here the information I need?
- Is the primary action clear?
- Can I complete the task without knowing internal architecture?
- Does the next step make sense?
- Can I recover from errors?
- Can I find every capability I am allowed to use?
- Does the phone experience feel intentionally designed?

## 2. Baseline and evidence

Run the walkthrough against a named commit/branch and record it in the findings document.

For every finding capture:

- role;
- route/flow;
- viewport/device class;
- scenario/data state;
- observed result;
- expected user outcome;
- severity (`P0 | P1 | P2 | P3`);
- screenshot or browser evidence for visual findings where practical;
- affected Product-domain rule, if any;
- proposed UX owner/slice or Product escalation.

Never mark a screen visually passed from source-code inspection alone when browser rendering is practical.

## 3. Required viewport matrix

Phone-first review:

- 320× representative height;
- 360× representative height;
- 390× representative height;
- 430× representative height.

Also review:

- representative tablet width;
- representative desktop width.

For camera/device-specific tasks, use real or browser-supported device behavior where possible rather than assuming desktop emulation proves the experience.

## 4. Common checklist for every authenticated route

### 4.1 Orientation

- Page title answers “where am I?”
- supporting copy explains purpose without implementation jargon;
- role does not see controls it cannot use;
- back/context path is predictable;
- destructive/irreversible task is visibly distinct from ordinary navigation.

### 4.2 Information hierarchy

- most important state appears before secondary metadata;
- IDs/serials are readable and copyable where operationally useful;
- Arabic/RTL and LTR machine identifiers do not visually corrupt each other;
- status terminology is consistent with other routes;
- same concept is not presented under conflicting names.

### 4.3 Action hierarchy

- one obvious primary action per context where an action exists;
- secondary actions do not visually compete unnecessarily;
- disabled action explains why when that helps the user;
- no visible dead/placeholder action;
- contextual action appears at point of need rather than requiring module hunting.

### 4.4 Feedback

- loading state;
- empty state;
- validation failure;
- server/domain failure;
- permission/access failure;
- success/result state;
- retry behavior where connectivity/interruption matters.

Feedback must explain what the user can do next, not merely expose an error code.

### 4.5 Mobile ergonomics

- no horizontal page overflow;
- touch targets at least existing 44px contract;
- primary control reachable without precision tapping;
- no desktop table squeezed into phone;
- long text/IDs do not break layout;
- fixed bottom navigation does not obscure content/action;
- keyboard/input opening does not hide submit/navigation controls;
- camera/scanner sheet is usable one-handed where relevant.

### 4.6 Accessibility basics

- visible focus where keyboard applies;
- status not communicated by color alone;
- icons with meaningful action have accessible names/text;
- forms have labels/instructions;
- confirmation consequence is understandable before irreversible action.

## 5. Public / pre-auth walkthrough

### `/`

Scenarios:

- first visitor;
- phone/desktop.

Check:

- Protection Giants purpose clear;
- public Product/Center/Warranty entry hierarchy;
- operational login does not dominate public value proposition unnecessarily;
- no false promise for unfinished Warranty lifecycle.

### `/products` + `/products/[slug]`

Check:

- published Product discovery;
- Product specification/content hierarchy;
- image/layout behavior;
- no operational Admin controls leak publicly;
- marketing QR route/content remains informational.

### `/centers`

Check:

- registered vs approved trust status understandable;
- map/list works on phone;
- no private hierarchy/Transfer/auth data exposed;
- empty/no-location handling.

### `/r/[serial]`

Check:

- contextual Roll identity is useful but does not imply custody/activation authority;
- invalid/voided/not-found behavior clear;
- scanner destination does not expose private internal data.

### `/login`

Check:

- copy does not incorrectly imply network approval is a login requirement;
- email/password flow clear;
- auth failures understandable;
- post-login routing correct per role.

### `/onboarding/center`

Check:

- invite purpose and predetermined Center identity clear;
- user never chooses role/network binding;
- accepted/retry/review-required states clear;
- phone keyboard/form usability.

## 6. Admin walkthrough

### Entry / Home

Scenario: Admin with mixed real attention states:

- at least one pending incoming Transfer;
- one partial/unresolved Transfer;
- one submitted Cube K issue;
- at least one Center/network record requiring attention if fixture permits.

Evaluate:

- what Admin notices first;
- whether attention and management destinations are distinguishable;
- whether physical operations are discoverable;
- whether Home feels like a workbench vs flat module catalog.

### Navigation

Check desktop + all phone widths:

- Accounts;
- Agents;
- Dealers;
- Centers;
- Products;
- Production;
- Rolls;
- Transfers;
- Issues;
- future Notifications after Cube L.

Do not require all to be bottom-nav items; require understandable reachability.

### Operational Accounts

Check list/new/edit/lifecycle states and consequences.

### Country Agents

Check list/new/edit/status and Transfer ID/reference presentation where applicable.

### Dealers

Check global Admin scope vs normal Agent ownership clarity.

### Centers

Check:

- list;
- new;
- edit;
- identity/parent/status hierarchy;
- invitation/onboarding management;
- approval path;
- Admin location correction;
- relationship between operational status, location and network approval is visually distinct.

### Products

Check Admin management experience separately from future non-Admin reference view.

### Production

Check:

- list/new/detail;
- immutable Production concept clear;
- labels/print actions separated from ordinary record editing;
- void consequences and blocked states understandable.

### Roll custody

Check:

- current custodian emphasized;
- opened status/context where shown;
- standard Transfer eligibility vs opened-Roll exception does not confuse.

### Transfers

Run:

- hub;
- send Recipient → Rolls → Review;
- detail;
- receive when Admin is recipient party where valid;
- cancellation/support resolution where valid;
- partial receipt/unresolved state.

Check Transfer number, parties, counts, status and next action hierarchy.

### Opened Roll Recovery

Check:

- exceptional nature clear;
- physical receipt confirmation explicit;
- reason field/consequence;
- not presented as Undo Opening;
- successful result shows custody moved while Opening history remains.

### Cube K Admin

Run:

- queue with submitted first;
- detail with zero evidence;
- detail with 1 and 5 images;
- evidence review;
- each terminal outcome confirmation;
- result state after terminal action.

Check:

- images easy to inspect;
- exact Roll/Center context visible;
- consequence shown before confirm;
- `return_required` does not imply auto-custody movement;
- `reported_in_error` clearly administrative correction, not quality clearance;
- time display consistent.

## 7. Country Agent walkthrough

### Entry / Home

Fixture:

- own Dealer(s);
- own direct/Dealer Centers;
- mixed Center approval/location states;
- at least one pending Transfer;
- Recovery enabled and disabled variants where possible.

Evaluate whether Home feels like “my network + my physical operations”.

### Navigation/reachability

Prove Agent can find:

- Dealers;
- Centers;
- Center approval;
- Product reference;
- custody;
- Transfers;
- Recovery only when enabled;
- future Notifications.

### Dealers/Centers

Check scope clarity and no Company-global data leakage.

### Center approval

Check:

- location prerequisite;
- approved/revoked states;
- approval is trust status, not activation/custody permission;
- Dealer cannot perform action.

### Product reference

Current baseline expected to expose contradiction. After UX-S01 prove:

- list/detail information useful operationally;
- no create/edit/lifecycle controls;
- no Access Denied from advertised entry.

### Custody + Transfers

Run send/receive/partial states under Agent's own party.

### Recovery

Check both:

- Company disabled → capability not misleadingly offered;
- enabled → eligible own-network Center Roll only;
- out-of-scope/not-opened/pending-Issue states explained in operational language.

## 8. Dealer walkthrough

### Entry / Home

Fixture:

- one or more Centers;
- pending incoming Transfer;
- own custody.

Evaluate whether core job is immediately clear:

**Centers + physical Rolls/Transfers + Product reference**.

### Navigation/reachability

Transfers must not become practically hidden on mobile.

Prove Dealer can find:

- Centers;
- Product reference;
- custody;
- Transfers;
- future Notifications.

### Centers

Check create/edit and first-user invite management without exposing Agent/Admin-only approval authority.

### Product reference

Read-only, no Admin controls.

### Transfers

Run full send/receipt flow and validate that Transfer remains one of Dealer's easiest tasks to find.

## 9. Installation Center walkthrough

Center walkthrough is the highest-priority phone experience.

Use 360/390 phone as primary, then 320/430 and desktop.

### 9.1 Entry / Home

Fixture states:

- no pending work;
- pending incoming Transfer;
- Roll in custody unopened;
- submitted Issue waiting;
- cleared issue;
- return-required issue.

Ask from first screen:

- What should I do now?
- Can I find my Rolls?
- Can I receive a shipment?
- Can I Open a Roll?
- Can I find my Issue/result?

### 9.2 Location

Check device capture:

- permission request context;
- accuracy feedback;
- successful save;
- invalid/low-accuracy path;
- location change/approval consequence explained without implying operational suspension.

### 9.3 Product reference

After access correction:

- Center can review Product information;
- no Company management controls.

### 9.4 Incoming Transfer → Receipt → Custody

Run real flow:

1. pending incoming Transfer visible/discoverable;
2. open detail;
3. receipt task explains physical truth;
4. choose/scan exact received Rolls;
5. partial receipt if applicable;
6. success;
7. received Rolls appear in Center custody.

No user should need to understand reservation tables or custody event internals.

### 9.5 Custody → Roll Opening

Run:

1. find Roll from custody or scan/contextual entry;
2. Open Roll task;
3. QR primary/manual serial fallback;
4. identity verification before irreversible submit;
5. opening success;
6. next choices understandable.

Check copy never equates Opening with Warranty Activation.

### 9.6 Opening → healthy path

Before Warranty Activation exists:

- success should clearly say Opening is recorded;
- if Roll is healthy, no fake “Activate” button may exist;
- future Activation should not be simulated by UX.

After Warranty Activation Product Cube lands, walkthrough gains the real next step additively.

### 9.7 Opening → Pre-install Issue

Run Cube K submission:

- exact Roll identity;
- activation-hold consequence before submit;
- four categories;
- description;
- zero images valid;
- 1/5 images;
- image validation errors;
- selected-image preview/remove usability if implemented;
- success “قيد مراجعة الشركة”;
- no Undo;
- own history/detail reachable.

### 9.8 Waiting state

Check Center understands:

- do not use Roll while submitted;
- Company is reviewing;
- no internal “Recovery” terminology required;
- history remains accessible if custody later changes under Cube K rules.

### 9.9 `cleared_for_use`

Check result tells Center:

- this Issue hold is removed;
- approval does not invent Warranty Activation or guarantee every other condition;
- next physical step clear.

### 9.10 `return_required`

Check result tells Center:

- do not use Roll;
- physical return is required;
- custody has **not** automatically moved;
- later physical receipt by Company/enabled Agent causes custody change;
- no false Undo/Opening reversal.

### 9.11 `reported_in_error`

Check it reads as administrative correction, not a quality verdict.

## 10. Cross-role handoff walkthroughs

The strongest UX test is both sides of one business event.

Required scenarios:

### Transfer

Sender creates → recipient discovers → recipient receives/partially receives → sender sees resulting state/resolution path.

### Center approval

Center captures location → responsible Agent/Admin discovers approval need → approves → Center understands new trust status.

### Cube K

Center submits → Admin discovers queue/detail → Admin decides → Center sees understandable result.

### Recovery

Admin/enabled Agent confirms physical receipt → custody changes → former Center sees correct result/history.

After Cube L:

repeat these with Inbox/Push entry as an additional discovery path, while proving notification does not replace task authorization.

## 11. Error and interruption matrix

For each critical task test where applicable:

- browser refresh mid-form;
- duplicate submit/retry;
- server/domain conflict;
- stale state changed by another user;
- permission revoked;
- inactive Profile/entity;
- scanner/camera unavailable;
- manual fallback;
- network interruption around submit;
- image upload ambiguity for Cube K;
- back navigation after success/error.

The UI should not invite duplicate irreversible actions after an ambiguous outcome.

## 12. Finding severity

### P0

- valid capability advertised but blocked/unreachable;
- unauthorized capability exposed;
- user could perform wrong irreversible action due to UI;
- serious mobile blocker in core flow.

### P1

- major journey confusion/dead end;
- misleading state/consequence;
- wrong time/context presentation;
- primary task hard to discover;
- essential evidence/decision UX materially weak.

### P2

- density/consistency/efficiency issue without likely operational error.

### P3

- visual polish/microcopy refinement.

## 13. Walkthrough output

Produce one findings document from actual rendered execution with:

- baseline commit;
- environment;
- roles tested;
- route/scenario matrix completion;
- findings grouped by P0/P1/P2/P3;
- screenshots/evidence references where useful;
- proposed owning UX Slice or Product escalation;
- explicit list of screens with no material finding;
- unresolved device-only acceptance items.

Do not convert every subjective preference into backlog. Record only changes that improve correctness, reachability, task clarity, efficiency or coherent product quality.

## 14. Exit gate

The initial walkthrough is complete when all four roles and public/onboarding support surfaces have been exercised enough to produce an evidence-backed prioritized backlog.

Platform Experience Harmonization final closure requires repeating the critical role journeys after fixes and proving the Role Capability & Reachability Contract still holds.
