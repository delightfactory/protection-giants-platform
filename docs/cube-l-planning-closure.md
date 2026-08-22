# Cube L — Planning Closure

**Date:** 2026-08-22  
**Status:** PLANNING COMPLETE / IMPLEMENTATION NOT STARTED

## 1. Planning closure decision

The Product Development planning phase for **Cube L — Role-aware Notifications + Web Push + Minimal PWA** is complete.

No unresolved product decision remains that requires implementation to guess business scope, recipient authority, delivery semantics, retry behavior, PWA boundary or Definition of Done.

Implementation is deliberately blocked only by sequencing:

1. Cube K must finish its own rendered UI/UX closure;
2. Cube K remains unmerged until explicit Product Owner merge approval;
3. Cube L must then start from fresh updated `main`.

## 2. Frozen specification set

The authoritative Cube L planning set is:

1. `docs/cube-l-notification-pwa-frozen-spec.md`
   - capability boundary;
   - data model;
   - recipient rules;
   - read/unread semantics;
   - Web Push standard;
   - Push subscription/outbox/worker;
   - retries;
   - Minimal PWA;
   - service worker;
   - permission/settings UX;
   - security invariants;
   - Definition of Done.

2. `docs/cube-l-notification-event-catalog.md`
   - exact current V1 source events;
   - exact intended recipients/non-recipients;
   - attention level;
   - Push eligibility;
   - deep-link intent;
   - payload/privacy intent;
   - suppression/noise rules.

3. `docs/cube-l-notification-qa-acceptance-spec.md`
   - permanent DB/RLS/concurrency tests;
   - event-catalog tests;
   - Push subscription security;
   - outbox/worker failure tests;
   - service worker/PWA tests;
   - real hosted Push acceptance;
   - rendered mobile/desktop/browser matrix;
   - double-review exit gate.

4. `docs/roadmap-amendment-cube-l-notifications.md`
   - freezes Cube L placement between Cube K and Warranty Activation;
   - preserves Product-vs-UX stream separation;
   - prevents future Cubes from being pre-numbered before their own specs freeze.

Supporting approved planning history remains:

- `docs/notification-foundation-pre-design-study-2026-08-22.md`;
- `docs/notification-foundation-approved-planning-amendment-2026-08-22.md`;
- `docs/notification-pwa-v1-approved-amendment-2026-08-22.md`.

If older supporting-study wording conflicts with the frozen four-document set above, the frozen set takes precedence.

## 3. Frozen decisions summary

### Scope

V1 is one Product Cube containing:

**In-app Inbox + Web Push + Minimal PWA technical foundation**.

### Roles

All four operational roles can own a personal Inbox:

- Admin;
- Country Agent;
- Dealer;
- Installation Center.

Actual notification delivery is event/authority-specific, never “all roles get all events”.

### Recipient state

- materialize per active Profile;
- bound operational entity must also be active;
- independent per-user read state;
- new Profile does not inherit old notifications;
- worker rechecks active state before external Push.

### Attention

`info | action_required | warning`

### Read model

- unread/read only;
- no mark-unread;
- mark one;
- mark all;
- 30/page;
- no archive/delete/snooze/pin/search/filter V1.

### History retention

No automatic purge in V1. Notification history is not the authoritative domain audit trail. Retention may be revisited when real production volume exists.

### Push

- standards Web Push only as canonical architecture;
- Push API + Notifications API + Service Worker + VAPID;
- no Firebase/APNs-specific app contract;
- multiple devices per Profile;
- permission only after explicit gesture;
- Push denial/unsupported state never blocks platform use;
- lock-screen payload intentionally narrower than Inbox/source data.

### Delivery

- external Push never runs as indispensable source-transaction side effect;
- durable outbox/delivery state;
- worker batch 100;
- max 4 attempts: initial, +5m, +30m, +120m;
- 404/410 disables dead endpoint;
- transient network/429/5xx retries;
- normal production delivery should begin within ~5 minutes;
- exact scheduler provider is deployment infrastructure choice, not business-domain scope.

### Realtime

No Supabase Realtime requirement in V1.

Use shell load/navigation/focus/read refresh, Service Worker client message and if necessary light visible polling no more frequently than 60 seconds.

### Preferences

No category mute/preferences in V1.

User may enable/disable Push on the current device. Durable Inbox remains mandatory for catalog events.

### Admin fan-out

Company-level event with no narrower operational owner → all active Admin Profiles.

### PWA

Minimal technical PWA belongs to Cube L because iPhone/iPad Web Push requires Home Screen web app behavior.

Cube L includes manifest, temporary valid icons, standalone identity, root Service Worker and install/help UX.

It explicitly excludes offline business-data sync/caching architecture.

## 4. Current-domain source validation completed during planning

The event catalog was checked against actual current implementation contracts, including:

- `roll_transfer_events` and Transfer lifecycle;
- receipt `received` events and partial/terminal Transfer status;
- unresolved release events;
- Cube J `opened_roll_recovery_created` + atomic Cube H receipt reuse;
- `center_location_events`;
- `center_network_approval_events` actions `approved | revoked | location_changed`;
- `center_onboarding_invitations` status/review markers;
- Cube K `roll_preinstall_issue_events` kinds `submitted | cleared_for_use | return_required | reported_in_error`.

The catalog therefore projects from current business truth rather than inventing parallel lifecycle state.

## 5. Compatibility research completed for planning

As of 2026-08-22 planning was checked against current public platform guidance for:

- standards Web Push / Push API;
- Notifications API;
- Service Workers;
- VAPID/Web Push model;
- Safari/WebKit Web Push;
- iOS/iPadOS Home Screen Web Push from 16.4+;
- current Next.js App Router PWA/manifest conventions.

Implementation must re-check compatibility when Cube L coding begins because browser/framework behavior can evolve. This is a normal implementation verification, not an open product decision.

## 6. Inputs that are NOT planning blockers

The following are execution/deployment inputs and do not reopen the Product spec:

### Final company logo / production icons

Temporary valid technical PWA icons may ship in development/staging. Official Protection Giants icons replace them before final production branding release without changing architecture.

### VAPID key pair

Generate/manage through deployment-secret procedure during implementation/deployment. The private key never belongs in Git.

### Worker/scheduler deployment secret

Created at deployment; not a business decision.

### Production scheduler provider

May be selected when production hosting is available, provided it invokes the frozen worker safely and satisfies the bounded delivery-latency contract.

### Real device availability

Real browser/iPhone/Android acceptance evidence is a Cube L closure requirement. Device availability affects how acceptance is executed, not what the product is supposed to do.

## 7. Implementation branch rule

Do **not** implement Cube L on `study/notification-foundation`.

After Cube K merge:

1. update `main`;
2. create a fresh Product branch such as `feature/cube-l-notifications-pwa`;
3. carry the frozen specs forward;
4. implement in small coherent increments while keeping one Cube L PR or similarly controlled review boundary;
5. no merge until all frozen gates and double review pass.

## 8. Change-control rule

During implementation, normal technical refinements are allowed only if they preserve the frozen business contract.

A change requires Product-spec amendment before coding when it changes, for example:

- who receives an event;
- whether an event is Push-eligible;
- whether Email/SMS/WhatsApp enters V1;
- category preferences;
- notification read semantics;
- offline business-data behavior;
- assignment/rules-engine capability;
- Product Cube ordering.

Do not silently reinterpret these as implementation details.

## 9. Planning exit statement

**Cube L planning is closed and implementation-ready after Cube K closure/merge.**

There is no need for another Notification design phase before coding unless a new Product Owner decision intentionally changes the frozen scope.
