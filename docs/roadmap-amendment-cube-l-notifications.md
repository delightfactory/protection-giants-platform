# Protection Giants — Roadmap Amendment: Cube L Notifications

**Date:** 2026-08-22  
**Status:** APPROVED planning amendment.  
**Scope:** Product Development roadmap only. Platform Experience Harmonization remains a parallel non-Cube program.

## 1. Decision

The next Product Development Cube after Cube K is:

**Cube L — Role-aware Notifications + Web Push + Minimal PWA**

The approved sequence is:

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

This amendment supersedes older roadmap wording that placed Warranty Activation immediately after Pre-install Issue Reporting without an intervening notification capability.

## 2. Why Cube L is inserted here

The platform already contains asynchronous cross-role handoffs:

- Transfer send → recipient receipt/rejection;
- partial receipt → sender attention/resolution;
- Center location → approval/re-approval;
- Center onboarding completion/repair;
- Cube K Center submission → Company decision → Center result;
- opened-Roll physical Recovery.

Warranty Activation and Claims will add more cross-role state changes. Building one notification foundation now prevents later Cubes from inventing ad-hoc alert mechanisms and allows them to integrate with a stable recipient/event contract.

## 3. Cube L boundary

Cube L owns:

- durable in-app Inbox;
- role/entity-aware recipient resolution;
- Web Push;
- Push delivery outbox/retry;
- Minimal PWA technical prerequisites for install/Home Screen/Push;
- notification shell/badge/settings;
- explicit integrations to current approved source events.

Cube L does not own the business state machines of Transfer, Center, Roll, Issue, Warranty or Claim.

## 4. Future Cube integration rule

Later Product Cubes may add notification catalog entries only for events whose business semantics they themselves own and freeze.

Therefore:

- Cube L must not invent Warranty Activation events before the Warranty Activation spec;
- Warranty Activation will define its own notification-worthy events and recipients, then integrate those events into Cube L infrastructure;
- Public Warranty and Claims follow the same rule.

This preserves bounded-context ownership.

## 5. Warranty Activation naming

This roadmap amendment intentionally does **not** assign a Cube letter to Warranty Activation yet.

Cube L is the next unused letter because its scope is now frozen. The following capability receives its own letter when its specification is frozen from fresh `main`, preventing planning labels from getting ahead of actual dependencies.

## 6. Relationship to Platform Experience Harmonization

Platform Experience Harmonization is not part of this lettered roadmap.

It runs in parallel as an audit/improvement program and may improve:

- role Home composition;
- navigation;
- discoverability;
- terminology;
- visual consistency;
- rendered/mobile quality.

It may consume Cube L's Bell/Inbox/attention state after Cube L exists, but it may not implement Notification schema/event/security logic itself.

UX work must never be named Cube L or consume later Cube letters.

## 7. Execution sequencing rule

1. close Cube K's own required UI/UX blockers and final review;
2. merge Cube K only after explicit Product Owner approval;
3. update local/development baseline from `main`;
4. start Cube L implementation from fresh `main` using the frozen Cube L specs;
5. close Cube L through full automated + real Push/PWA acceptance;
6. then freeze/start Warranty Activation from then-current `main`.

Platform-wide UX Harmonization slices may proceed in parallel where they do not create merge conflict or change product-domain rules, but they must not reorder the Product Cube chain.

## 8. Precedence

For roadmap ordering after 2026-08-22, this amendment takes precedence over earlier documents that say:

`Pre-install Issue → Warranty Activation`

The current approved order is:

`Pre-install Issue → Cube L Notifications/PWA → Warranty Activation`.
