# Protection Giants — Notification Foundation Pre-design Study

**Date:** 2026-08-22  
**Branch:** `study/notification-foundation`  
**Status:** Product-capability study. No implementation is authorized by this document alone.

## 1. Why this is a Product capability, not a UX tweak

Protection Giants has reached a point where many correct workflows are asynchronous and cross-role:

- one party sends a Transfer and another party must receive or reject it;
- a Center onboarding invitation can be completed or enter an exceptional review state;
- a Center approval state can change;
- a Center can report a Pre-install issue and Company/Admin must decide it;
- Company can decide `return_required` and the Center needs to know what to do next;
- opened-Roll Recovery changes physical custody after an earlier Center action;
- future Warranty Activation, public Warranty and Claims will introduce additional cross-role decisions and lifecycle events.

A role-specific Home screen can surface current queues when the user opens the platform, but that is not equivalent to a durable notification capability.

A real notification system requires persisted notification state, recipient resolution, security, idempotency/deduplication, read/unread semantics, deep links and explicit event coverage. Therefore it belongs to the **Product Development roadmap**, not to Platform Experience Harmonization.

---

## 2. Current platform state

No general notification engine currently exists in the Protection Giants application.

The platform already has several ingredients that a notification system can safely reuse conceptually:

- authenticated operational Profiles;
- four operational roles: Admin, Agent, Dealer, Center;
- exact role/entity bindings;
- `operational_parties` for Company/Agent/Dealer/Center physical identity;
- immutable/auditable domain events in several existing Cubes;
- strong RLS and active-entity checks;
- stable application routes suitable for notification deep links;
- controlled Supabase Auth email invitation for Center onboarding.

The existing Center invitation email is an Auth onboarding mechanism, not a reusable application notification engine and must not be treated as one.

---

## 3. Product objective

Provide a **role-aware Notification Foundation** so every authenticated operational user can reliably discover events that require attention or materially change the state of work they are responsible for.

The engine should answer four questions safely:

1. **What happened?**
2. **Why does this user need to know?**
3. **What, if anything, should the user do now?**
4. **Where does the user go to act or inspect the event?**

The engine must reduce missed operational handoffs without becoming a generic workflow/rules platform.

---

## 4. Core design principles

### 4.1 Notification never grants authorization

A notification may contain a deep link, but opening that link must pass the normal route/RLS/business authorization again.

Receiving a notification must never be used as proof that the user remains authorized to see the underlying object.

### 4.2 Do not leak domain data

Notification title/body must contain only information that the recipient is allowed to know under the source domain.

Examples:

- an Agent does not gain Pre-install quality-review details merely because a Center is inside the Agent network;
- a Dealer does not receive Company quality decisions that its role cannot otherwise read;
- a user whose entity/profile becomes suspended must not continue receiving or reading operational notifications through a bypass.

### 4.3 Recipient resolution is role/entity aware

The platform permits multiple users to represent one operational entity. Therefore business events generally target an operational responsibility, while final Inbox rows need per-user read state.

Recommended V1 approach:

- resolve all currently active Profiles representing the responsible entity/role at event time;
- create one durable Notification recipient row per Profile;
- each Profile owns its own `read_at` state;
- a new user joining the entity later does not retroactively inherit every historical notification unless a future explicit business need requires it.

This is simpler and safer than inventing shared read state for an organization.

### 4.4 Explicit event catalog, not a rules engine

Notification coverage must be explicitly defined per domain event.

Do not build:

- user-authored notification rules;
- arbitrary condition builders;
- generic workflow assignment;
- template scripting;
- BPM/rules-engine behavior.

### 4.5 Actionability over noise

Not every database change deserves a notification.

Prefer events that:

- require another role to act;
- change the user's physical responsibility/custody;
- resolve a state the user was waiting on;
- create a material exception;
- invalidate a previously valid operational assumption.

Avoid notifying the actor merely to repeat a synchronous success message they already saw.

### 4.6 Idempotent and deduplicated

Retries, duplicated domain calls or replayed event processing must not create duplicate notifications for the same recipient and source event.

A deterministic source-event/recipient uniqueness contract is required.

---

## 5. Recommended V1 notification model

A minimal bounded model can remain simple.

### `notifications`

One row per recipient Profile notification.

Recommended fields:

- `id`
- `recipient_profile_id`
- `event_type`
- `source_domain`
- `source_event_id` or another stable source identity
- `title`
- `body`
- `action_url` nullable
- `attention_level`
- `created_at`
- `read_at` nullable

Possible bounded `attention_level` values:

- `info`
- `action_required`
- `warning`

Avoid a large severity taxonomy unless real use proves it necessary.

### Idempotency

A unique key should prevent duplicate materialization for the same:

`recipient_profile_id + source_domain + source_event_id + event_type`

where the source domain has an immutable event identity.

### Read model

V1 needs only:

- unread/read;
- mark one as read;
- mark all visible notifications as read;
- stable history ordered newest first.

Archive/delete/snooze/pinning are not required unless later evidence proves a need.

---

## 6. Event production recommendation

There are two broad approaches:

### Option A — every Server Action manually creates notifications

Rejected as the primary architecture because:

- business mutations also occur through database RPCs;
- retries can create divergence;
- another caller could execute the domain transition without producing the matching notification;
- notification generation would be coupled to specific UI paths.

### Option B — notification projection from authoritative domain transitions/events

Recommended.

Where a domain already records immutable events, a small domain-specific database trigger/function can materialize the corresponding recipient notifications from that authoritative event.

Where a domain lacks an appropriate immutable event, the owning Product Cube should expose an explicit stable transition/event rather than the Notification Foundation inventing business state.

This keeps notifications downstream from business truth.

Important restriction:

- do not create one giant polymorphic trigger attempting to interpret every table generically;
- each integration remains explicit and bounded per domain/event type.

---

## 7. Initial cross-role event coverage candidate

This is a study matrix, not a frozen contract. It should be finalized against each merged domain before implementation.

### 7.1 Transfers

**Recipient entity Profiles**

- new pending incoming Transfer → `action_required`, link to Transfer detail/receipt;

**Sender entity Profiles**

- Transfer rejected;
- partial receipt occurred;
- Transfer fully received/completed;
- unresolved-item resolution materially changes remaining Transfer state.

Avoid notifying the sender that it successfully created the Transfer; the send flow already shows a synchronous success screen.

### 7.2 Center onboarding/account lifecycle

Potential recipients are the Profiles that are authorized to manage the exact Center in the relevant scope.

Useful events:

- invited Center completed onboarding;
- invitation entered a state requiring administrative review/repair.

The Auth invite email remains its own onboarding delivery and should not be duplicated as an Inbox notification to a user who does not yet have an operational Profile.

### 7.3 Center network approval / location

**Center Profiles**

- Center approved;
- approval revoked;
- saved location change invalidated previous approval.

These are meaningful trust-state changes visible to the Center.

Agent/Admin notifications should be limited to cases requiring action; simple location saves should not generate noise automatically.

### 7.4 Roll Opening

Normal Roll Opening is performed synchronously by the Center and does not by itself need a second notification to the same actor.

A later cross-role consequence may generate notifications if another role takes an action affecting that Roll.

### 7.5 Opened Roll Recovery

**Former Center custodian Profiles**, when appropriate under the finalized privacy contract:

- physical Recovery completed and confirmed custody moved away from the Center.

The message should describe the operational result in user language, not internal Cube terminology.

### 7.6 Pre-install Roll Issues — Cube K

**Admin Profiles**

- new `submitted` Pre-install issue → `action_required`, link to issue detail.

**Reporting Center Profiles**

- issue resolved `cleared_for_use`;
- issue resolved `return_required`;
- issue administratively closed `reported_in_error`.

Agent/Dealer are intentionally not recipients merely because the Center sits in their network; Cube K does not grant them quality-review/read authority.

### 7.7 Production and Product reference data

Normal Admin-only creation/edit actions generally do not need notifications to the same Admin who just performed them.

Only future cross-role events should be considered if a real operational handoff emerges.

### 7.8 Future Warranty Activation / Warranty / Claims

The Notification Foundation should exist before these later lifecycles if possible so new events integrate into an established contract instead of building ad hoc alerts.

Expected future categories may include:

- activation blocked by an actionable state;
- claim submitted;
- claim decision/status change;
- replacement/reinstall action required;
- other warranty lifecycle handoffs approved by the future specs.

Exact recipients/content must remain owned by those future Product Cubes.

---

## 8. Inbox and navigation experience

Notification Foundation should provide a real authenticated application surface, not only toast messages.

Recommended UI:

- notification bell/icon in the authenticated shell;
- unread counter/badge;
- `/operations/notifications` Inbox;
- newest first;
- clear distinction between `action_required`, warning and informational events;
- unread styling that does not rely on color alone;
- title + short role-appropriate message + time + source context;
- deep link when an actionable/detail route exists;
- mark one read;
- mark all read;
- empty state;
- pagination/bounded loading once volume requires it;
- mobile-first touch behavior.

Opening a deep link must not mark an operation complete. Notification read-state and business-task state are independent.

### Relationship to Role Home / queues

Notifications and Role Home attention queues are complementary:

- **Queue/Home:** current state — what still requires action now.
- **Notification:** event history — what happened and alerted this user.

A notification may remain in history even after the business task is later completed.

The UX Harmonization program may consume unread counts and attention links after the engine exists, but does not own the notification domain.

---

## 9. Delivery channels

The term “complete Notification Engine” should be separated from “every possible outbound delivery channel.”

### In-app delivery

In-app Inbox is recommended as the mandatory foundation because:

- every operational user already authenticates into the platform;
- it can enforce platform permissions at read time;
- it gives durable read/unread state;
- it has no dependency on an external messaging provider;
- it directly improves role Home/navigation and work handoffs.

### Email / Web Push / other channels

External delivery introduces additional decisions:

- provider and production credentials;
- retry/dead-letter handling;
- rate limits;
- delivery logs;
- channel preferences;
- mandatory vs optional alerts;
- privacy of content outside the authenticated platform;
- browser push subscription lifecycle.

Recommendation:

- design the core event/recipient model so external delivery can be added cleanly;
- do **not** build a speculative generic multi-channel dispatcher inside the first foundation unless the Product Owner explicitly approves the channels and operational requirements;
- if external delivery is approved as part of the Notification macro-capability, implement it as a second bounded Product Cube after the in-app core rather than making one oversized release.

---

## 10. Suggested product-roadmap placement

The canonical roadmap currently goes from Pre-install Issue Reporting toward Warranty Activation → public Warranty → Claims.

Recommended sequencing:

```text
Cube K — Pre-install Issue Reporting
        ↓
Notification Foundation / role-aware Inbox
        ↓
Warranty Activation
        ↓
Public Warranty access
        ↓
Claims / replacement / reinstall
```

Reason:

- enough existing asynchronous domains now exist to justify the foundation;
- Cube K already creates an Admin↔Center decision handoff that benefits directly;
- Transfer/Receipt already creates strong cross-role events;
- building Notifications before Warranty/Claims prevents every future lifecycle from inventing ad hoc alert behavior;
- the Notification Foundation can integrate closed domains without reopening their business state machines.

This sequencing recommendation does **not** renumber or amend the canonical roadmap until explicitly approved.

If approved, the next unused Cube letter can be assigned to the Notification Foundation as a genuine Product Cube. The Platform UX audit must not use that Cube letter for navigation/visual improvements.

---

## 11. Recommended macro-capability decomposition

To respect the project’s small-cube method, do not implement an oversized “everything notification” release.

### Product Cube 1 — Notification Core + In-app Inbox

Would own:

- notification persistence;
- per-Profile recipient materialization;
- event-type catalog in code/contracts;
- idempotency/deduplication;
- RLS/security;
- read/unread;
- authenticated Inbox;
- unread badge;
- deep links;
- explicit integration with already-merged relevant domains;
- permanent regression tests for all four roles.

This cube can be functionally complete as the platform’s in-app notification capability.

### Product Cube 2 — External Delivery & Preferences, only if approved

Would own only approved external channels such as email/web push, including:

- provider integration;
- delivery queue/retries;
- delivery logs;
- mandatory/optional category preferences;
- channel subscriptions;
- failure observability.

Do not create this second cube merely because it is technically possible. It requires explicit business/channel decisions.

---

## 12. Security and regression gates

Minimum tests for the Notification Foundation should include:

- Admin receives only events intended for Admin;
- Agent receives own-scope events but not global/network-outside events;
- Dealer receives own-scope events only;
- Center receives own-Center events only;
- Agent/Dealer cannot read Cube K quality notifications unless a future product decision changes that domain;
- suspended Profile cannot read notifications;
- suspended bound entity cannot use notification RPCs/surfaces;
- notification deep link does not bypass target-route authorization;
- duplicate source event retry creates no duplicate notification;
- two Profiles representing the same entity each receive independent Inbox/read state;
- one user marking read does not mark another user's copy read;
- notification creation failure must not corrupt the source business transaction;
- notification content never exposes forbidden sensitive fields;
- pagination/order/unread counters are deterministic;
- unread count and Inbox remain consistent under concurrent mark-read operations.

---

## 13. UX quality gates

Because Notifications are a user-attention system, Definition of Done must include rendered behavior:

- bell/count understandable on phone and desktop;
- no badge overflow for large unread counts;
- Inbox usable at 320/360/390/430px;
- Arabic/RTL and mixed serial/Transfer IDs render correctly;
- action-required notifications are distinguishable without excessive alarm styling;
- deep links preserve context/back behavior;
- stale notification linking to a now-inaccessible object fails safely and explains the state;
- time display uses one platform timezone/formatting contract;
- empty/loading/error/read/unread states are visually complete.

---

## 14. Decisions still required before freezing a Notification Cube spec

The need for a role-aware notification capability is now identified, but these Product decisions should be explicitly approved before implementation:

1. **V1 channel scope** — in-app only, or include one external channel from the first macro release?
2. **External channel priority** if required — email, web push, or both?
3. **User preferences** — no preferences in core V1, or allow optional category muting while keeping mandatory operational alerts non-disableable?
4. **Retention** — keep notification history indefinitely in V1 or define a bounded retention window?
5. **Admin fan-out** — notify every active Admin Profile for Company-level action-required events, or define a future assignment model? Recommendation: every active Admin in V1; do not invent assignment.
6. **Realtime expectation** — is refresh-on-navigation/polling sufficient initially, or is near-live Supabase Realtime badge update required for V1?

These decisions should be resolved in the Notification study/spec, not inside the UX audit.

---

## 15. Current recommendation

Treat Notifications as a new **Product macro-capability** and insert its in-app foundation immediately after Cube K closure and before Warranty Activation.

Keep the implementation bounded:

- explicit event coverage;
- durable in-app Inbox;
- role/entity-safe recipient resolution;
- deep links;
- read/unread;
- idempotency;
- no generic rules engine;
- no speculative external-channel framework beyond a clean future extension boundary.

The Platform Experience Harmonization stream may then use this engine to improve Role Home, attention surfaces and task discoverability without owning or duplicating notification state.
