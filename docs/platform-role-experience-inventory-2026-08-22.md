# Protection Giants — Platform Role Experience Inventory

**Date:** 2026-08-22  
**Audit baseline:** `feature/cube-k-preinstall-issues` at `6e9b98a598939a55ecf2bd31d5df4c3e842b4b14`  
**Purpose:** inventory the current user-facing platform before performing rendered UI/UX walkthroughs and harmonization work.

> This is an inventory and role-experience map, not a claim that every screen has passed rendered/browser/device QA.

## 1. Why this inventory exists

Protection Giants has been built incrementally as bounded functional cubes. That has produced several strong individual workflows, but the platform now needs a second lens: **what does each real user experience when they enter the product and try to do their job?**

The review question is therefore not merely “is every page responsive?” It is:

- What does each role see first?
- What work does that role actually need to complete?
- Are the high-frequency actions obvious and reachable?
- Does navigation reflect actual access?
- Does the platform tell the user what needs attention now, or force them to inspect modules manually?
- Do adjacent cubes form one coherent journey?
- Are terminology, hierarchy, feedback, dates, statuses, and actions consistent across the product?

The four authenticated operational roles are:

1. **Admin / Company**
2. **Country Agent**
3. **Dealer / Distributor**
4. **Installation Center**

Public visitors and Center invite/onboarding are included as supporting surfaces because they are part of the same product experience.

## 2. Existing interface standards already approved

The repository already has a meaningful UX foundation. This audit must use it rather than inventing a replacement design language.

### `docs/design-system.md`

Key current rules:

- operational, technical, premium, automotive, Arabic-first product character;
- one obvious primary action per context;
- no visible action without a real function;
- Record patterns for dense operational lists;
- explicit empty/loading/error/success states;
- at least 44px mobile touch targets;
- focused task routes reduce navigation distraction;
- `PageHeader`, `FeedbackBanner`, `StatusBadge`, `EmptyState`, `FormField`, `FormPanel`, `RecordList`, `ModuleCard`, `TaskBackLink`, and `ConfirmSubmitButton` are shared primitives;
- phone widths down to 320px are part of the supported contract;
- every primary route should have understandable navigation context.

### `docs/mobile-native-interface-standard.md`

Mobile is the **primary operational surface**, not a reduced desktop layout. Important implications:

- phone-first task design;
- one-handed reachability;
- progressive disclosure instead of dumping all fields;
- scanner/camera-assisted entry where the real workflow benefits;
- predictable back/cancel behavior;
- no horizontal page scrolling as a layout fix;
- visual/mobile smoke review is part of Definition of Done.

### Previous interface audit

`docs/interface-audit-2026-08-07.md` materially improved the early shell, native-style mobile navigation, shared visual tokens, form behavior, and public surfaces. It predates most of the current network, custody, transfer, receipt, opening, recovery, and Pre-install Issue workflows, so it is a foundation rather than a sufficient audit of the current application.

## 3. Current top-level surface inventory

The current branch contains approximately **40+ user-facing page/task surfaces**, plus loading/error/not-found states and print endpoints.

### 3.1 Public / pre-auth surfaces

| Route | User | Current purpose | Inventory status |
|---|---|---|---|
| `/` | Public visitor | Brand/product value proposition and entry to public products/warranty | Real surface |
| `/products` | Public visitor | Published PPF product directory | Real surface |
| `/products/[slug]` | Public visitor | Published product detail | Real surface |
| `/centers` | Public visitor | Registered/approved Center directory and map/browser | Real surface |
| `/warranty` | Public visitor | Warranty verification/access entry | Placeholder/future lifecycle surface |
| `/r/[serial]` | Anyone with contextual Roll QR | Contextual Roll QR destination | Real contextual route |
| `/login` | Operational user | Auth entry | Real surface |
| `/access-denied` | Auth/invalid operational context | Protected access state | Real system state |
| `/onboarding/center` | Invited Center user | Claim first Center account | Real controlled onboarding surface |

### 3.2 Authenticated operations surfaces

| Domain | Routes / screens | Current roles |
|---|---|---|
| Operations home | `/operations` | Admin, Agent, Dealer, Center |
| Country Agents | list / new / edit | Admin |
| Dealers | list / new / edit | Admin, Agent within scope |
| Installation Centers | list / new / edit | Admin, Agent, Dealer within scope |
| Center approval | `/centers/[id]/approval` | Admin, Agent within scope |
| Center admin location | `/centers/[id]/location` | Admin-oriented correction/review path |
| Center self-location | `/operations/location` | Center |
| Products | list / new / edit | **Page currently Admin-only; data layer supports active Agent/Dealer/Center read** |
| Production Orders | list / new / detail / outer Roll labels | Admin |
| Roll custody | `/operations/rolls` | Admin, Agent, Dealer, Center scoped by custody/visibility |
| Roll Opening | `/operations/rolls/open` | Center |
| Opened Roll Recovery | `/operations/rolls/recovery` | Admin; enabled Agent within approved scope |
| Pre-install Issues | list / new / detail | Admin + Center; creation Center-only; resolution Admin-only |
| Transfers | hub / new / detail / receive | All operational roles subject to transfer scope |
| Operational accounts | list / new / edit | Admin |
| Print | Production Order print / outer Roll labels | Admin/production workflow |

## 4. Shared interaction/component inventory

The application already has a reusable visual foundation rather than dozens of completely independent page patterns.

### Shared primitives

- `BrandLockup`
- `PageHeader`
- `FeedbackBanner`
- `StatusBadge`
- `EmptyState`
- `FormField`
- `FormGrid` / `FormPanel` / `FormSection`
- `FilterBar` / `FilterGrid` / `FilterField` / `FilterActions`
- `TaskBackLink`
- `ConfirmSubmitButton`
- `RecordList` / `RecordItem`
- `ModuleCard`
- shared icons and buttons

### Shared operational composites

- role-aware Operations navigation shell;
- entity core fields for Agent / Dealer / Center / Product / Operational User;
- device location capture;
- QR scanner sheet;
- Transfer ID copy/QR;
- Transfer Send flow;
- Transfer Receipt flow;
- Transfer Detail actions and unresolved-resolution surfaces;
- Roll Opening flow;
- Opened Roll Recovery flow;
- Pre-install Issue submission and decision flows;
- Production/outer-label preview and printing tools.

**Inventory implication:** the platform does not need a visual redesign from zero. It needs role-oriented information architecture, consistency corrections, and selective refinement of shared patterns.

## 5. Role Experience Matrix — current state

## 5.1 Admin / Company

### What the Admin currently sees

Operations Home exposes:

- Operational Accounts
- Country Agents
- Dealers
- Installation Centers
- Products
- Production / Rolls
- Roll custody
- Pre-install Issues
- Transfers

Desktop navigation exposes most of these as a persistent list. Mobile bottom navigation exposes only a small subset and relies on Home for the remainder.

### What the Admin actually needs from the platform

The Admin is not merely an entity editor. The role has three different jobs:

1. **Govern the network** — Accounts, Agents, Dealers, Centers, approvals, lifecycle status.
2. **Operate the physical product chain** — Products, Production, Lots, Rolls, custody, Transfers, exceptional Recovery.
3. **Resolve exceptions / decisions** — pending Pre-install Issues, invitation problems, approval decisions, unresolved receipt/transfer states, future Warranty/Claim decisions.

### Current strengths

- strong CRUD lifecycle screens for users/network entities;
- protected confirmation for destructive operations;
- strong Transfer hub with incoming/outgoing/history and attention semantics;
- strong explicit Production and custody records;
- Cube K gives Admin a submitted-first quality-review queue;
- permission boundaries are usually explicit in both route and database layers.

### Current experience gaps

**A1 — Home is a module directory, not an Admin workbench.**  
The Admin sees where modules are, but not what requires attention *now*. Existing attention already exists inside individual domains (for example incoming/unresolved Transfers and submitted Pre-install Issues), but the Home surface does not aggregate or prioritize it.

**A2 — Administrative, network, physical-stock, and exception tasks have equal visual weight.**  
A rarely used “edit Country Agent” destination and an operational “quality issue waiting for a decision” are presented as peer module cards rather than different classes of work.

**A3 — Mobile Admin navigation is intentionally limited but has no explicit “More / Operations” navigation model.**  
Production, Rolls, Transfers, Country Agents, and Issues depend heavily on returning to Home for discovery.

**A4 — Several entity records are information/action dense.**  
Center management in particular combines entity identity, parent scope, operational lifecycle, geographic location, network approval, onboarding invite/account state, and exceptional recovery-related administration across adjacent screens. This is functionally powerful but needs rendered hierarchy review so the Admin always understands “where am I and what am I changing?”

### Desired Admin experience direction

Home should eventually answer:

- What needs my decision today?
- What physical operations are currently pending or exceptional?
- What network/account setup requires action?
- Then: where can I manage reference/master data?

This does **not** require a large analytics dashboard. It can be a small real-data “attention first” workbench using counters/queues already supported by current domains.

## 5.2 Country Agent

### What the Agent currently sees

- Dealers in own network
- Centers in own network
- Products entry
- Roll custody
- Transfers
- optional opened-Roll Recovery when Company enables the capability

Agent may also approve/revoke Center network approval within authorized scope.

### What the Agent actually needs

1. manage own distribution/installation network;
2. create/edit Dealers and Centers within scope;
3. understand Center operational/approval status;
4. know what Rolls are physically in own custody;
5. send/receive Transfers;
6. execute exceptional opened-Roll Recovery only if explicitly enabled;
7. reference available product information without receiving Company-only edit controls.

### Current strengths

- scope-aware Dealer and Center management is already implemented;
- Agent cannot browse Company-global data outside RLS scope;
- Center approval has a focused dedicated task;
- Transfer workflow is role-neutral and physical-action-oriented;
- exceptional Recovery is separately gated rather than bundled into ordinary custody rights.

### Current experience gaps

**G1 — Product navigation currently leads to an Admin-only page.**  
This is a real role/access UX contradiction. The database contract explicitly grants active Agent/Dealer/Center read access to Products, and Home/Nav describe Products as a read/review module for these roles. The page itself currently calls `requireAdminProfile()`. The intended experience appears to be a read-only operational Product surface for non-Admin roles.

**G2 — Network “health” must be discovered by browsing records.**  
The Agent Home does not summarize Centers needing location/approval/account attention, pending inbound Transfers, or other scope-specific actions.

**G3 — Exceptional Recovery discoverability is conditional and distributed.**  
The capability is correctly gated and appears from Roll custody when enabled, but the user model needs to clearly explain why the action exists and when to use it without requiring knowledge of Cube J terminology.

**G4 — Persistent navigation vs Home differs.**  
Transfers exist in desktop nav/Home but not in Agent mobile bottom navigation; no explicit More/Tasks model explains omitted destinations.

### Desired Agent experience direction

Agent Home should feel like **“my network and my physical operations”**, not a smaller copy of Admin Home.

## 5.3 Dealer / Distributor

### What the Dealer currently sees

- own Centers
- Products entry
- own Roll custody
- Transfers

Dealer can create/edit Centers under own scope but cannot access Admin/Agent governance surfaces.

### What the Dealer actually needs

1. manage direct Centers;
2. establish/maintain the first Center account when needed;
3. see own Roll custody;
4. send/receive Rolls accurately;
5. reference Product information;
6. understand Center operational readiness without seeing Company-only controls.

### Current strengths

- role scope is simple and bounded;
- Center parent relationship is locked appropriately when Dealer edits a direct Center;
- Transfer Send and Receipt are strong task flows and fit Dealer operations well;
- no unnecessary access to quality decisions or Company-wide user administration.

### Current experience gaps

**D1 — Same Product access contradiction as Agent/Center.**

**D2 — Home remains module-first rather than task-first.**  
A Dealer with a pending receipt should not need to know that “Transfers” is the module to inspect before seeing work that needs action.

**D3 — Center edit screen carries multiple responsibilities.**  
Identity/parent, account onboarding/invite lifecycle, and recovery/error handling are powerful but can become a long administrative surface on phone. Progressive disclosure may be needed after rendered review.

**D4 — Mobile Transfers are omitted from bottom navigation despite being one of the Dealer’s primary operational jobs.**  
This is especially important because Dealer has fewer modules; losing Transfers from the persistent mobile destinations weakens the role’s core journey.

### Desired Dealer experience direction

The Dealer experience should be the simplest operational workspace: **Centers + incoming/outgoing physical Rolls + Product reference**.

## 5.4 Installation Center

### What the Center currently sees

Home exposes:

- Center Location
- Products entry
- Roll custody
- Pre-install Issues
- Transfers

Roll custody additionally exposes the primary **Open Roll** task. Opening success can lead to the Pre-install Issue path when needed. Warranty Activation is intentionally a future cube.

### What the Center actually needs

The Center is the most field/mobile-oriented role. Its mental model is not “modules”; it is mostly:

1. Is this Roll actually in my custody?
2. I received a shipment — confirm what is physically here.
3. I am starting work — open/claim this exact Roll.
4. Something is wrong before installation — report it and know exactly what to do next.
5. If everything is fine — continue to installation and future Warranty Activation.
6. Maintain the Center location when needed.
7. Reference Product information.

### Current strengths

- phone-oriented Roll Opening with QR/manual fallback;
- exact-custody enforcement rather than a broad inventory selector;
- Transfer Receipt explicitly matches physical receipt rather than merely changing system state;
- Pre-install Issue submission is a bounded field task with QR/manual identification, clear Activation hold, optional evidence, and no unnecessary ticket workflow;
- Home clearly explains that network approval is a trust classification, not an automatic operational gate.

### Current experience gaps

**C1 — Product access contradiction.**  
The Center sees Products in Home and persistent navigation but the operational Products page is Admin-only.

**C2 — The Center journey is split across modules rather than organized around the Roll lifecycle.**  
Custody, Transfer, Opening, Issue reporting, and later Warranty Activation are logically related physical steps. Current screens link some transitions, but Home still makes the Center interpret module names before choosing the next real-world action.

**C3 — Center Location is Home-only, absent from persistent navigation.**  
It is a genuine self-service Center responsibility but discoverability depends on returning to `/operations`.

**C4 — Pre-install Issues are Home-only, absent from persistent navigation.**  
The Center can reach them from Home and Opening success, but the history/status surface is not a persistent destination.

**C5 — Mobile bottom navigation omits Transfers, one of the Center’s essential physical workflows.**

**C6 — Some Center-facing copy leaks system/internal terminology.**  
For example `Recovery` is meaningful internally but a Center should primarily receive role-specific instructions such as “لا تستخدم الرول وانتظر قرار الشركة” or “الرول مطلوب للإرجاع”.

**C7 — Evidence UX is functionally safe but not yet field-polished.**  
The user picks optional images and sees filenames/sizes, but no visual thumbnails/reorder/remove affordance has yet been evaluated. This requires rendered/device review rather than automatic expansion.

### Desired Center experience direction

The Center Home should eventually feel like a **field operations launcher**:

- استلام تحويل
- فتح رول
- اللفات في عهدتي
- بلاغ يحتاج متابعة
- الموقع
- لاحقًا: تفعيل ضمان

The user should not need to understand internal bounded-context names to complete the physical lifecycle.

## 6. Cross-role navigation and information-architecture inventory

## 6.1 Current Desktop navigation

Desktop uses a persistent sidebar and is structurally strong. Role-specific links are explicit.

However, Home and navigation are not fully synchronized:

- Admin Home includes Pre-install Issues but desktop nav does not.
- Center Home includes Location and Pre-install Issues but desktop nav does not.
- capability-driven Recovery is a contextual Roll action rather than a nav destination, which is reasonable.

The issue is not that every task needs a nav item. The issue is that the product does not yet declare a consistent distinction between:

- **primary destinations**;
- **work queues**;
- **contextual tasks**;
- **rare settings/admin operations**.

## 6.2 Current Mobile navigation

Bottom navigation intentionally limits items, but the current selection was designed before the later physical workflows existed.

Current effects include:

- Admin: no persistent Production / Rolls / Transfers / Issues / Country Agents;
- Agent: Transfers omitted;
- Dealer: Transfers omitted;
- Center: Transfers, Location, and Issues omitted.

This should not be solved by stuffing every route into the bottom bar. A revised role-based primary-navigation model is needed, potentially with a task/More surface or a stronger role Home.

## 6.3 Task-route detection

The mobile shell hides bottom navigation for suffixes such as `/new`, `/edit`, `/receive`, `/open`, and `/recovery`. This is a good focus principle but is currently path-pattern driven rather than a declared task-layout contract. Other focused tasks such as `/approval` and some location flows do not follow the same rule.

A later harmonization pass should make task focus intentional at route/layout level rather than growing a suffix list indefinitely.

## 7. Confirmed access/experience contradiction

### P0 — Operational Products

**Observed UI:** Agent, Dealer, and Center are shown Products in Operations Home and navigation.

**Observed page guard:** `/operations/products` calls `requireAdminProfile()` and therefore sends those roles to Access Denied.

**Observed data contract:** `scripts/verify-product-operational-access.mjs` explicitly verifies that active Agent, Dealer, and Center users can read Products through RLS, while suspended entities cannot.

**Conclusion:** this is not an intentional access restriction. It is an incomplete/mismatched operational UI contract.

**Likely correction direction:** split Product management from Product reference:

- Admin sees management controls (create/edit/archive/publication/assets).
- Agent/Dealer/Center see a read-only operational product directory/detail appropriate to their job.

Exact UX should be designed during harmonization, not patched by simply removing the link.

## 8. Strong journeys that should become design references

Not every area needs rework. Several current flows are good reference patterns.

### Transfer Send

- explicit 3-step progress: recipient → Rolls → review;
- exact Transfer ID or QR verification;
- multiple physical selection modes: scan individual Rolls, select held Rolls, select available Roll subset from a Lot;
- context preserved while switching modes;
- opened/reserved Rolls visibly excluded;
- explicit review before mutation;
- success state explains that custody has **not** moved yet.

### Transfer Receipt

- starts from a specific incoming Transfer;
- user confirms only Rolls physically present;
- copy explains partial receipt and exact custody effect;
- route preserves Transfer context and uses predictable back navigation.

### Roll Opening

- Center-only focused field task;
- exact QR/manual Roll identification;
- current Center identity surfaced;
- irreversibility and separation from Warranty Activation explained.

### Pre-install Issue

- exact opened/current-custody Roll;
- small four-category model;
- mandatory description, optional bounded images;
- immediate Activation-hold explanation;
- separate Admin quality decision and physical Recovery.

These flows are good candidates for a future shared **task-flow UX pattern** rather than replacing them with generic CRUD screens.

## 9. Systemic consistency findings to verify in rendered audit

These findings are source-level signals and must be verified visually before final severity is frozen.

### P1 — Role Home is directory-first rather than attention-first

The current Home is primarily `ModuleCard` entry points. As workflows mature, Admin/Agent/Dealer need real “requires action” cues. The solution must use real domain states, not invented metrics.

### P1 — Core mobile destination selection is now stale relative to the developed product

Transfers and newer lifecycle workflows are important enough that the early five-item bottom-nav assumptions need role-by-role reevaluation.

### P1 — Adjacent cubes need journey-level linking

Especially for Center:

`Receive → Custody → Open → Issue/normal continuation → future Warranty Activation`.

The individual screens largely exist, but the user should experience one physical lifecycle rather than a sequence of module guesses.

### P2 — Date/time formatting is not centrally normalized

Several Server Components and Client flows directly instantiate `Intl.DateTimeFormat` without an explicit shared product timezone/display policy. The same timestamp can therefore render differently depending on browser/server timezone. This was already observed in Cube K and appears in older surfaces such as Center approval and Roll custody.

A shared date/time presentation contract is needed before production launch.

### P2 — Terminology needs a role-language pass

Terms that are legitimate internally may not be appropriate for every user:

- Recovery
- Transfer ID
- Lot
- ERP Serial
- “operational party” concepts

The goal is not to eliminate operational terms, but to expose each only when the role needs it and explain it in that role’s language.

### P2 — Center edit is a multi-responsibility settings surface

It combines Center identity/parent changes with first-account invite/onboarding lifecycle and exceptional recovery/cleanup states. It is correct to keep related administration together, but the rendered hierarchy must be assessed for phone usability and progressive disclosure.

### P2 — Dense Record screens need field-priority verification

Centers, Products, Production Orders, Rolls and some account records can show many facts/actions. The shared `RecordItem` pattern is a good base, but each role should see only high-value first-layer fields.

### P2 — Login language has an approval-status ambiguity

Login copy refers to “مراكز التركيب المعتمدة” while operational access intentionally allows active Centers independently from network approval. This can incorrectly suggest that network approval is a login/access prerequisite.

### P3 — Cube K evidence review needs a visual QA decision

The current implementation is safe and functional. Final audit should decide whether:

- Center needs thumbnail preview/remove affordance before submission;
- Admin needs inline gallery/lightbox review rather than opening each signed image separately.

Do not build this automatically unless rendered review proves the current experience materially weak.

## 10. Role-oriented target mental models

These are not new features; they are the navigation/experience lens for the next audit stage.

| Role | The platform should feel like… | Primary recurring jobs |
|---|---|---|
| Admin | Company control + exception workbench | decisions, network governance, production/custody oversight |
| Agent | My network + my physical operations | Dealers/Centers, approvals, custody/transfers, exceptional Recovery |
| Dealer | My Centers + Roll movement | Center readiness, custody, send/receive, Product reference |
| Center | Field Roll lifecycle assistant | receive, custody, open, report issue, location, future Warranty Activation |

## 11. Screen families for rendered walkthrough

The inventory should now be followed by rendered walkthroughs in this order:

### Family A — Shared shell / entry

- Login
- Access Denied
- Operations shell desktop/mobile
- Operations Home for each role
- role navigation / bottom navigation
- loading/error/not-found

### Family B — Admin governance

- Users list/create/edit
- Agents list/create/edit
- Dealers list/create/edit
- Centers list/create/edit
- Center approval/location

### Family C — Master/production

- Products list/create/edit/publication/assets
- Production list/create/detail
- outer Roll label planning/preview/print

### Family D — Physical Roll lifecycle

- Roll custody per role
- Transfer hub
- Send
- Transfer detail
- Receive / partial receive / mismatch resolution
- Opening
- Recovery

### Family E — Cube K quality exception

- Center issue history/new/success/detail
- Admin queue/detail/decision
- evidence states
- return-required handoff to Recovery

### Family F — Public product/network experience

- Public Home
- Products list/detail
- Center directory/map
- Roll QR public/context page
- Warranty placeholder/next lifecycle handoff
- Center onboarding

## 12. Rendered walkthrough test matrix

Each relevant family must be checked at minimum at:

- 320px
- 360px
- 390px
- 430px
- representative tablet
- representative desktop

For each role/screen:

1. first-screen hierarchy;
2. primary action clarity;
3. touch targets;
4. Arabic RTL + mixed LTR codes;
5. long names / serials / emails;
6. no horizontal overflow;
7. keyboard/file-picker/camera implications where relevant;
8. loading/empty/error/success states;
9. destructive confirmation;
10. back/cancel/task continuity;
11. terminology understood without architecture knowledge;
12. role should not see irrelevant controls or dead-end links.

## 13. Priority inventory backlog

### P0 — Access / route contradiction

1. Resolve non-Admin operational Product experience mismatch.

### P1 — Role architecture / task discovery

2. Redesign Operations Home purpose from module directory toward role workbench/launcher without fake metrics.
3. Re-evaluate mobile primary destinations role by role.
4. Declare clear distinction between primary destination, work queue, contextual task, and settings page.
5. Connect Center physical Roll journey as one understandable lifecycle.

### P2 — Consistency and comprehension

6. Establish one date/time display policy and shared formatter.
7. Run terminology pass by role.
8. Review dense Record field priority and action hierarchy.
9. Review Center edit/onboarding progressive disclosure.
10. Correct login approval wording.
11. Make task-route navigation behavior an explicit pattern rather than suffix accumulation.

### P3 — Polish after rendered evidence

12. Decide whether Cube K evidence needs thumbnails/gallery.
13. Refine visual spacing/hierarchy only where rendered walkthrough exposes weakness.
14. Audit microcopy and empty/success states for consistent next-action language.

## 14. What this inventory does **not** authorize

This inventory does not authorize a broad redesign or bulk code rewrite.

Next changes should remain incremental:

1. perform rendered/browser walkthroughs;
2. confirm/falsify inventory findings;
3. freeze a small harmonization backlog;
4. implement one coherent UX cube at a time;
5. rerun role journeys after every increment.

Cube K PR #63 remains separate, Draft, and unmerged until UI/UX closure is resolved.

## 15. Inventory conclusion

The platform has a **strong functional and component foundation**. The main risk is not that screens were built carelessly; it is that the product has grown beyond the assumptions of its early navigation shell.

The next maturity step is therefore **role orchestration**, not wholesale redesign:

- preserve strong bounded workflows;
- remove access/navigation contradictions;
- make each role Home answer its own job;
- make physical lifecycle transitions obvious;
- normalize presentation semantics across cubes;
- then perform rendered/mobile QA before merge/launch claims.
