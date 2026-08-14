# Cube F — Pre-Design Context Review

**Date:** 2026-08-14  
**Status:** Context review complete; design decisions not yet frozen  
**Purpose:** capture real cross-module constraints before specifying `Roll Transfer State & Reservation Engine`.

This document is deliberately **pre-design**. It records facts, dependencies, supersessions and unresolved design gates discovered by reviewing the current project context and merged implementation. It does not authorize a schema or state-machine shape by itself.

## 1. Reviewed baseline

Current reviewed `main` baseline:

`59c3dad636680316bd6963088ce276ab241a23d7`

Reviewed sources include:

- current Product Decisions;
- canonical context and post-Cube-E status amendment;
- Distribution Network & Transfer Foundation spec;
- Development Governance;
- dependency roadmap;
- merged Agent & Network implementation;
- merged Cube D custody migrations/contracts;
- merged Cube E implementation and local-validation evidence;
- prior confirmed project discussions and supersession history;
- legacy implementation only as historical functional reference.

## 2. Real current custody schema

The merged Cube D schema is intentionally small:

- `roll_custody_current(roll_id, custodian_party_id, confirmed_at, created_at)`;
- `roll_custody_events(... custody_sequence, custodian_party_id, confirmed_at, recorded_at)`.

There is no implemented reservation column or Transfer foreign key in the custody projection.

Important consequence for Cube F:

**reservation is new Cube F state and must not be confused with confirmed custody.**

The old conceptual `reserved_transfer_id` example in the Network spec is not an implemented contract.

## 3. First confirmed custody transition is not Cube F

Cube F creates/reserves a pending Transfer while confirmed custody remains with the sender.

The actual custody-changing operation belongs to the later receipt cube. When that first confirmed transition is implemented, it must atomically:

1. lock/revalidate the current custody and relevant Transfer item;
2. update `roll_custody_current`;
3. append the next immutable `roll_custody_events` sequence;
4. update the receipt/Transfer state in the same transaction.

Cube F must remain compatible with this future atomic transition but must not move custody early.

## 4. Critical Admin / Company acting-party design gate

This is the most important cross-module design question found during the review.

Facts on current `main`:

- every newly generated Roll begins in the singleton **Company** operational party custody;
- Admin profiles intentionally have no Agent/Dealer/Center entity binding;
- `private.current_active_operational_party_id()` currently derives an acting party only for Agent, Dealer and Center profiles;
- approved routes include Company → Agent and Company → Center.

Therefore Cube F cannot rely blindly on the current ordinary-party helper for every sender.

Before implementation, the Cube F spec must explicitly define the trusted rule by which an active Protection Giants Admin acts for the singleton Company party when creating/cancelling Company Transfers.

This must be a narrow Company-operation rule, not a generic “Admin may impersonate any party” facility.

## 5. Sender/recipient active-state semantics

Current operational lifecycle deliberately does not cascade suspension down the management hierarchy.

Examples already established by the platform:

- suspending an Agent does not automatically suspend its Dealers/Centers;
- suspending a Dealer does not automatically suspend a separately active Center beneath it.

The exact Transfer ID resolver checks the target entity's own active state. It does not require every administrative ancestor to be active.

Cube F must not silently introduce a new parent-status cascade into Transfer eligibility unless a later Product Decision explicitly changes the lifecycle model.

## 6. Center recipient may have zero users

Center entity identity and user identity are separate.

A Center can already have:

- an entity record;
- Operational Party;
- Transfer ID;

before its first operational user is onboarded.

This was an intentional reason for moving Center Onboarding earlier into the Network Foundation.

Therefore Transfer creation may target an active Center with no user account. The lack of a user prevents later authenticated receipt until onboarding, but it must not invalidate the recipient entity itself.

## 7. Transfer route authorization is not hierarchy traversal

The management tree is a visibility/administration model, not a shipping route matrix.

Cube F must not encode ancestry-only route checks that would block approved direct/return/peer flows.

The governing authorization inputs are:

- authenticated authorized actor;
- sender operational party;
- sender confirmed current custody;
- recipient exact active operational party identity;
- recipient != sender;
- Roll eligibility;
- no conflicting reservation;
- valid state transition.

## 8. Transfer ID resolver is already a privacy contract

The Network Foundation already supplies an exact-match recipient resolver.

Its behavior matters to Cube F:

- caller must be an authenticated active operational user;
- malformed/unknown/suspended target returns no recipient;
- only minimum recipient-verification fields are returned;
- cross-network recipient discovery is exact-code only;
- ordinary operational users do not receive a global party directory.

Cube F should consume/reuse this identity contract rather than create a second recipient search mechanism.

Transfer ID knowledge alone never authorizes movement.

## 9. Company is a valid recipient

The current resolver and approved routes allow the singleton Company party to be a recipient, including return flows such as Dealer → Company.

Company has no separate mutable operational status field. Cube F must preserve the singleton Company-party invariant rather than invent a Company entity lifecycle simply for Transfers.

## 10. Network approval/location do not gate Transfers

Center location and Protection Giants network approval remain independent from operational status and custody.

Cube F must not require:

- Center map location;
- network approval badge;
- public directory visibility;

to send to or receive from an otherwise active operational Center.

## 11. Roll/Production eligibility boundary

Transferable Roll must be a real generated physical Roll whose parent Production Order remains `generated`/non-voided.

A voided order retains its historical identities but is blocked from downstream operational use.

Cube F must revalidate this in the atomic mutation path; reading a Roll earlier in the request is not sufficient protection against a concurrent state change.

## 12. Idempotency precedent exists, but F must own its key

The Production Foundation already demonstrates a proven project pattern:

- caller-supplied UUID request key;
- unique database constraint;
- transaction-scoped advisory locking for the same request key;
- safe retry returns the original result only to the owning actor.

Cube F should evaluate this as an implementation precedent, not copy it mechanically. Transfer idempotency must bind to the Transfer creation actor/sender semantics and must also coexist with per-Roll reservation concurrency.

## 13. Reservation race is stronger than request idempotency

Two different request IDs may race to reserve the same Roll.

Therefore request-id uniqueness alone cannot satisfy Cube F.

The future design must have a database-enforced/transactionally locked rule proving that one eligible Roll cannot simultaneously belong to two active/pending Transfer reservations.

The UI must not be the final conflict guard.

## 14. Direct Data API mutation should remain closed

Current foundations intentionally use narrow controlled RPC/database paths for critical irreversible/stateful operations and explicit grants.

Cube F should preserve that security posture:

- no browser/client direct INSERT/UPDATE that can bypass state validation;
- no blanket `service_role` table mutation introduced merely for convenience;
- new public RPCs/functions require explicit grants under the existing Database Quality contract;
- table RLS/read surfaces should expose only what the sender/recipient/Admin genuinely need.

## 15. Cube E affects Cube G, not Cube F's state engine

Cube E now provides the real contextual Roll QR and outer-label print foundation.

That QR can identify the exact canonical Roll inside later authenticated scan workflows, but:

- QR possession is not Transfer authority;
- Cube F does not require camera scanning;
- deferred physical printer validation does not block Cube F;
- Cube G will combine Cube E scan identity with Cube F's state engine.

## 16. Cube F / G / H boundary to preserve

### Cube F

Owns Transfer state/reservation foundation and pre-receipt transition rules.

### Cube G

Owns sender UX and selection methods:

- Transfer ID entry/scan;
- Scan Rolls;
- Select Rolls;
- Select Lot;
- review/send interaction.

### Cube H

Owns recipient-facing receipt/partial receipt/resolution and the first confirmed custody-changing workflow.

Do not move G/H UI or partial-receipt implementation into F just to make the module feel larger.

## 17. Approved no-expiry rule

No automatic pending-Transfer expiry is required in the first release.

Cube F must not add cron jobs, expiry timestamps, background release, or timeout-driven state transitions without a new approved requirement.

## 18. Approved cancellation/rejection behavior

Before any receipt:

- sender may cancel;
- recipient may reject the whole Transfer;
- reservations are released;
- confirmed custody remains unchanged.

The state engine must protect these transitions against races with later receipt work.

## 19. Historical/older wording that must not re-enter the design

Do not restore any of the following from old documents or the legacy system:

- Approved Center as Transfer/Activation permission;
- hierarchy-only transfer paths;
- Production Labels as a prerequisite for Transfer state;
- one identifier reused for Transfer/Roll/ERP/Activation/Warranty;
- direct custody movement at send time;
- global recipient directory;
- mandatory per-Roll scan for trusted whole-Lot movement.

## 20. Decisions still required in the Cube F specification

The following are genuine design decisions still to be frozen from the approved behavior and current schema:

1. Transfer header identity/number and table shape;
2. Transfer-item shape;
3. exact minimal status vocabulary for Cube F;
4. reservation representation and uniqueness/concurrency mechanism;
5. sender acting-party resolution, especially Admin → singleton Company;
6. creation idempotency key ownership and retry behavior;
7. sender cancellation authorization and transition contract;
8. recipient rejection authorization and transition contract;
9. immutable Transfer event/audit shape, if needed in F;
10. sender/recipient/Admin read/RLS projection required before Cube G/H;
11. maximum Rolls per one Transfer request and any bounded payload rule based on realistic existing 10,000-Roll production limits;
12. failure/error taxonomy required for future mobile UX;
13. exact boundary between F's pre-receipt functions and H's later receipt mutations.

These must be resolved explicitly in the Cube F spec before code starts. No generic workflow/state-machine framework is justified.

## 21. Pre-implementation gate

Cube F implementation must not start until:

- this context review and the post-Cube-E status amendment are merged;
- current `main` is re-fetched;
- the Cube F spec resolves the design gates above;
- scope/exclusions and Definition of Done are frozen;
- a clean feature branch is created from that latest `main`.
