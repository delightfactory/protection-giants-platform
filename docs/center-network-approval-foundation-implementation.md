# Center Network Approval Foundation — Implementation Contract

**Status:** Implementation in review  
**Date:** 2026-08-13  
**Roadmap:** `docs/gap-closure-roadmap.md` — Cube B only

## Purpose

Complete the Network Approval responsibility for registered Centers without coupling approval to Roll custody, Roll Opening, Warranty Activation, public Center discovery, or KYC/document workflows.

## Dependencies

- merged Center Location Foundation (Cube A);
- merged Agent & Network Foundation;
- existing Admin/Agent/Dealer/Center operational authorization and hierarchy.

## Current approval projection

Each Center receives a current approval projection:

- `approval_status`: `unapproved | approved`;
- `approved_at`;
- `approved_by_profile_id`.

The operational `status` field remains separate. Revoking approval never suspends a Center.

## Immutable approval audit

A narrow append-only approval event records:

- Center ID;
- action: `approved | revoked | location_changed`;
- actor Profile ID where available;
- event timestamp.

Authenticated Admin may read all approval history. An active Country Agent may read approval history only for Centers in the Agent's existing network scope. Dealer and Center roles do not receive approval-history table access.

## Approval authority

- Admin: approve/revoke any Center.
- Country Agent: approve/revoke only Centers in the Agent's own network, including Agent-direct Centers and Centers owned by Dealers assigned to that Agent.
- Dealer: cannot approve/revoke.
- Center: cannot approve itself.

Authorization is enforced at the database boundary; UI gating is secondary.

## Approval prerequisite

Approval succeeds only when the target Center:

- exists;
- is operationally `active`;
- has a complete current geographic location projection.

No documents, KYC, checklists, custody state, Transfer state, or Warranty state are introduced as approval prerequisites.

## Location-change invalidation

When an approved Center's saved current location changes, the same database transaction must:

1. reset the current approval projection to `unapproved`;
2. clear approval actor/time;
3. append an approval audit event with action `location_changed`.

This attaches to the completed Cube A location mutation paths without changing their public contract.

## Controlled mutation paths

Approval fields are not added to generic authenticated UPDATE grants. Changes occur only through explicit audited RPCs with:

- authenticated caller checks;
- active Profile validation;
- Admin or responsible Agent authority;
- row locking;
- prerequisite validation for approval;
- atomic projection + audit write;
- explicit EXECUTE grants only to `authenticated`;
- PUBLIC/anon/service-role execution revoked.

Approval also binds to the location snapshot reviewed by the operator. The approval form sends the current `location_captured_at`; after locking the Center row the database rejects approval if that timestamp no longer matches. The operator must reload and review the new location before approving it.

## Application flow

### Admin / Agent

A dedicated Center approval task shows:

- Center identity and hierarchy summary;
- operational state;
- current location summary;
- current approval state and approval time/actor when available;
- approve/revoke action when authorized;
- approval history.

Approval is visibly blocked when the Center is suspended or has no current location. A stale approval attempt is rejected and requires a fresh location review.

### Center

The Center Operations dashboard shows its current approval state and explains that approval is a Protection Giants trust/public designation. It is not a prerequisite for Roll custody, Roll Opening or Warranty Activation. The Center receives no approval action.

### Dealer

Dealer may continue viewing/managing Centers according to existing network rules but receives no approval action or approval-history access.

## Security and privacy

- approval history RLS enabled immediately;
- no anonymous approval data path;
- no broad authenticated mutation grant for approval fields;
- no user-editable Auth metadata used for authorization;
- Agent scope reuses the existing network hierarchy rather than creating a second hierarchy model;
- approval does not become an Activation/Custody authorization predicate.

## Verification contract

Dedicated regression coverage must prove at minimum:

1. new Centers start `unapproved`;
2. approval without location fails;
3. approval of suspended Center fails;
4. Admin can approve any eligible Center;
5. responsible Agent can approve Agent-direct and child-Dealer Centers;
6. Agent cannot approve another Agent's Center or Company-direct Center;
7. Dealer and Center cannot approve/revoke;
8. approval appends history;
9. revoke resets projection and appends history without suspending Center;
10. repeated approve/revoke state transitions do not silently rewrite history;
11. Center location change atomically invalidates approval and appends `location_changed` history;
12. failed location update does not invalidate approval;
13. Admin reads all approval history;
14. Agent reads only own-network approval history;
15. Dealer/Center cannot enumerate approval history;
16. direct Data API mutation of approval projection fails;
17. service role cannot invoke approval RPCs;
18. stale reviewed-location approval is rejected without projection/history mutation;
19. suspended Agent Profile or Country Agent entity cannot approve/revoke;
20. existing Center Location, network, onboarding, Product and Production regressions remain green;
21. generated database types, TypeScript and production build pass.

## Explicit non-goals

Cube B does not implement:

- public Center directory/map;
- Dealer-issued approval;
- KYC/documents;
- approval expiry/scoring/tiering;
- custody, Transfers, Roll Opening, Activation or Warranty;
- public badge rendering outside the authenticated application.

## Definition of Done

Cube B is complete only when schema, audit, authority, location invalidation, stale-location protection, Admin/Agent/Center UX, failure states, database contracts, generated types, TypeScript, production build, browser smoke, and two review passes are complete. It remains unmerged until explicit user approval.
