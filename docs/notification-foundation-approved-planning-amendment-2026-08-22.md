# Protection Giants — Notification Foundation Approved Planning Amendment

**Date:** 2026-08-22  
**Branch:** `study/notification-foundation`  
**Status:** Product-owner-approved planning direction. This amendment authorizes planning/specification work, not implementation or merge.

## 1. Approved product direction

The role-aware Notification capability is approved as a **Product Development capability**, not as part of Platform Experience Harmonization.

It must remain separate from UI/UX harmonization work and follow the normal Product Cube governance when its implementation spec is frozen.

## 2. Approved roadmap placement

Subject to normal Cube closure and fresh-main sequencing, the intended order is:

```text
Cube K — Pre-install Roll Issue Reporting
        ↓
Notification Foundation — role-aware in-app notifications
        ↓
Warranty Activation
        ↓
Public Warranty access / verification
        ↓
Claims / replacement / reinstall
```

This placement is approved because the platform already contains several asynchronous cross-role handoffs and because future Warranty/Claims lifecycles should integrate into one established notification contract instead of inventing ad hoc alert mechanisms.

Cube K must still be fully closed before Notification implementation begins.

## 3. Approved V1 foundation boundary

The first Notification Product Cube should provide a complete **in-app notification foundation** including, at minimum:

- durable notification persistence;
- role/entity-aware recipient resolution;
- one notification recipient record per active Profile at event time;
- independent read/unread state per Profile;
- deterministic deduplication/idempotency by source event + recipient + event type;
- explicit event catalog/integrations rather than a generic rules engine;
- notification Inbox inside authenticated Operations;
- unread indicator/count in the authenticated shell;
- newest-first history;
- actionable deep links where appropriate;
- `info | action_required | warning` or another equally bounded attention model;
- mark one read and mark all visible notifications read;
- RLS/security and active-profile/entity checks;
- permanent cross-role regression coverage;
- mobile-first rendered UX quality.

Notification read state remains independent from the underlying business task state.

## 4. Approved architectural rules

### Notifications never grant authorization

A notification or deep link cannot bypass the source domain's route, RLS, custody, scope or lifecycle rules.

### Explicit integrations only

Do not build a generic notification rules/workflow engine. Each source domain explicitly defines which authoritative event creates which notification and who the intended recipient responsibility is.

### Domain truth remains authoritative

Notification materialization must be downstream of durable domain transitions/events where available. Notification logic must not become the owner of Transfer, Center, Roll, Issue, Warranty or Claim state.

### Per-Profile Inbox state

When multiple active Profiles represent the same operational entity, each receives an independent notification copy and independent `read_at` state.

### No privilege leakage

A role must not receive notification content that exposes information it cannot otherwise access. In particular, Agent/Dealer network position does not grant Cube K quality-review visibility.

## 5. Approved initial integration direction

The V1 event catalog should be finalized against merged domain contracts, with the current intended coverage including:

- incoming Transfer requiring recipient action;
- Transfer rejection / partial receipt / completion / material resolution changes to the sender side;
- Center onboarding completion and exceptional onboarding-review state where another existing Profile must act;
- Center approval/revocation/invalidation notifications to Center users where appropriate;
- opened-Roll Recovery completion where a previously responsible Center needs to know custody changed;
- Cube K new submitted issue to Admin Profiles;
- Cube K final decision (`cleared_for_use`, `return_required`, `reported_in_error`) to the reporting Center Profiles;
- later Warranty/Claims events defined by their own future Product Cube specs.

Normal synchronous success to the same actor should not be duplicated as notification noise unless a real cross-session/business need is identified.

## 6. External delivery boundary

The approved first foundation is **in-app**.

Email, Web Push or other outbound delivery channels are not part of the first Notification Cube merely by default. They may be added later as a separate bounded Product Cube once their provider, retry, privacy, delivery logging and preference requirements are explicitly approved.

The core Notification data/event model should remain compatible with later external delivery without prebuilding a speculative multi-channel dispatcher.

## 7. Relationship to Platform Experience Harmonization

Platform Experience Harmonization may consume the Notification foundation later for:

- unread badges;
- role Home attention links;
- navigation affordances;
- cross-screen discoverability;
- role-specific notification presentation.

It does not own the Notification schema, recipient model, event catalog, security or delivery behavior.

The UX track must continue to avoid Cube naming and must not use Notification work to alter the established Product Cube sequence implicitly.

## 8. Decisions deliberately still open before frozen implementation spec

The following are **not** silently decided by this planning approval and should be resolved during the Notification specification step:

1. notification history retention policy;
2. whether near-live Supabase Realtime badge updates are required in V1 or refresh/navigation updates are sufficient;
3. exact pagination/batch-size limits;
4. exact event-by-event message copy and action URLs;
5. exact Admin fan-out behavior for Company-level notifications if any future event requires a narrower assignment model;
6. any external delivery/preference capability beyond the approved in-app core.

Until those decisions are frozen, implementation must not start.

## 9. Governance and sequencing

- This amendment records product-owner approval of the planning direction.
- It does not merge Cube K or authorize Notification implementation immediately.
- Cube K remains under its existing closure/review process.
- After Cube K closure, Notification Foundation should move from study to a frozen Product Cube specification from fresh `main`.
- No UI/UX harmonization branch may implement the Notification engine as a cosmetic or navigation change.
