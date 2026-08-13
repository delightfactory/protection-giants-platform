# Center Location Foundation — Implementation Contract

**Status:** Implementation contract for Cube A  
**Date:** 2026-08-13  
**Roadmap:** `docs/gap-closure-roadmap.md` — Cube A only

## 1. Purpose

Close the Center geographic-location gap as one contained vertical slice without introducing Network Approval, public Center maps, Roll custody, Transfers, Activation, Warranty or KYC/document workflows.

The cube owns only the current Center location, the immutable location audit trail, Center self-capture, Admin correction, and the UI/security paths required to operate them.

## 2. Existing dependencies already satisfied

This cube relies only on foundations already merged into `main`:

- `installation_centers` operational entity;
- active/suspended Center lifecycle;
- Center first-account onboarding and trusted Profile binding;
- Admin/Agent/Dealer/Center operational RLS scopes;
- `requireOperationalProfile()` and `requireAdminProfile()`;
- mobile-first shared UI patterns.

No Product, Production or Network hierarchy redesign is required.

## 3. Current Center projection

Extend `public.installation_centers` with nullable current-location fields:

- `latitude double precision`;
- `longitude double precision`;
- `location_accuracy_m double precision`;
- `location_captured_at timestamptz`;
- `location_source text` constrained to `center_device | admin` when location exists;
- `location_updated_by_profile_id uuid` referencing `public.profiles` with history-preserving delete behavior.

Consistency rules:

- latitude and longitude are either both absent or both present;
- latitude must be in `[-90, 90]`;
- longitude must be in `[-180, 180]`;
- stored accuracy, when present, must be finite and greater than zero;
- a present location requires capture timestamp, source and actor;
- `center_device` requires a reported accuracy value;
- `admin` may store no accuracy because it is a manual correction rather than a device measurement.

The current fields are a fast projection only. They do not replace history.

## 4. Immutable location audit

Add a narrow append-only `public.center_location_events` table with:

- generated event ID;
- `installation_center_id`;
- latitude;
- longitude;
- optional reported accuracy;
- source (`center_device | admin`);
- acting Profile ID where still available;
- event timestamp.

The table is not an operator-editable entity. No authenticated INSERT/UPDATE/DELETE path is exposed.

Initial read scope:

- active Admin may inspect location history;
- Center/Dealer/Agent do not receive a general history-table read path in Cube A;
- current location remains visible through the already-scoped Center record.

Future Network Approval work may consume the current projection and add its own approval audit. It must not rewrite location history.

## 5. Controlled mutation paths

Direct authenticated UPDATE grants are **not** added for the new location columns. Location changes use two explicit atomic RPC contracts so the audit event cannot be bypassed.

### 5.1 Center self-capture

Conceptual RPC:

`update_own_center_location(latitude, longitude, accuracy_m)`

Rules:

- caller must be authenticated;
- caller Profile must be active `center`;
- caller must be bound to exactly one operationally active Center;
- Center ID is derived from the caller Profile, never submitted by the browser;
- latitude/longitude ranges are validated again at the database boundary;
- accuracy must be finite, positive and **50 metres or better** in the first release;
- database sets `location_source = center_device`;
- database sets actor and capture timestamp;
- projection update + location event insert occur in one transaction;
- caller cannot choose another Center, source, actor or timestamp.

The 50m threshold is also surfaced in application validation/configuration so a later evidence-based tuning does not require changing coordinate types or history shape.

### 5.2 Admin correction

Conceptual RPC:

`admin_update_center_location(center_id, latitude, longitude)`

Rules:

- caller must be authenticated active Admin;
- target Center must exist;
- correction may be performed even while the Center is suspended, because this is administrative data correction rather than Center operational access;
- database sets `location_source = admin`;
- accuracy is stored as null;
- database sets actor/timestamp;
- projection update + audit event insert occur atomically.

Dealer, Agent and Center users cannot invoke the Admin correction path successfully.

## 6. Future approval dependency without reopening Cube A

Cube B will need the rule “saved location change invalidates Network Approval atomically.”

Cube A must therefore avoid embedding approval behavior in either UI or location RPCs. Cube B can add a database trigger/constraint around location-column changes so approval invalidation participates in the same transaction without changing the meaning of the completed Center self-capture/Admin correction contracts.

This keeps Cube A closed while still allowing the approved dependency to attach cleanly later.

## 7. Application flow — Center

Add one Center-only task route reachable from the Center Operations home.

Expected phone-first flow:

1. show current location state and last capture time;
2. explain clearly that the action must be performed while physically present at the Center;
3. user taps `تحديث موقعي`;
4. browser requests geolocation with high accuracy;
5. UI shows progress while locating;
6. reject and explain when permission is denied, location is unavailable, request times out, or reported accuracy is worse than 50m;
7. show captured coordinates/accuracy as a simple confirmation summary before save;
8. save through the Center RPC;
9. show success with the stored capture time/source.

The Center user does not type coordinates and does not drag a pin.

A visualization map is **not required** to complete Cube A. Browser Geolocation provides the operational measurement. Public/admin map visualization belongs to later cubes and should not force a map dependency into this one.

## 8. Application flow — Admin

Add an explicit Center location-management task reachable from each Center record.

Admin sees:

- Center identity;
- current coordinates/source/capture time when present;
- location-history list newest first;
- manual latitude/longitude correction form;
- clear warning that saving a correction records a new immutable event rather than editing history.

The location action is separate from ordinary Center core editing so audit rules cannot be bypassed by a generic form.

Cube A does not add Agent or Dealer location-edit controls.

## 9. Security and privacy

Required boundaries:

- no anonymous access to current operational Center records or location events;
- no broad new authenticated UPDATE grant on Center location columns;
- Center self-update derives Center ID from authenticated Profile;
- Admin correction verifies Admin at the database boundary, not only in UI;
- new RPC functions have default PUBLIC/anon/service execution revoked and only the required authenticated EXECUTE grant;
- privileged functions use an empty/fixed search path and explicit schema references;
- location event table has RLS enabled immediately;
- no user-editable Auth metadata participates in authorization.

## 10. Failure paths

The cube is incomplete unless these paths are handled deliberately:

- geolocation unsupported;
- permission denied;
- device cannot produce a result;
- timeout;
- accuracy > 50m;
- malformed/non-finite/out-of-range coordinate payload;
- Center user suspended between page load and save;
- Center entity suspended between page load and save;
- forged Center target attempt;
- non-Admin attempts Admin correction;
- target Center deleted/missing;
- duplicate user tap / retry;
- database projection update without matching event must never occur.

Location updates are naturally repeatable: each accepted save is a new factual event and replaces only the current projection.

## 11. Verification contract

Add a dedicated local database verification script and include it in Database Quality.

It must prove at minimum:

1. current-location fields start empty;
2. Center can save own valid `center_device` location;
3. exact current projection is stored;
4. one matching audit event is appended;
5. Center cannot target another Center;
6. Center cannot submit >50m accuracy;
7. invalid latitude/longitude are rejected;
8. Dealer and Agent cannot use Admin correction;
9. Admin can correct any Center and source becomes `admin` with null accuracy;
10. Admin correction appends history instead of rewriting prior event;
11. suspended Center user/entity cannot self-capture;
12. ordinary Center/Dealer/Agent cannot enumerate location history;
13. Admin can read location history;
14. direct Data API mutation of location projection is denied;
15. existing Agent/Dealer/Center visibility and lifecycle tests remain green;
16. generated database types match;
17. TypeScript and production build pass.

## 12. Explicit non-goals

Cube A does not implement:

- `approved | unapproved` state;
- approval/revocation actions;
- approval invalidation logic yet;
- public Center projection;
- public or administrative map package;
- Agent location correction;
- Dealer location correction;
- continuous/background location tracking;
- GPS anti-spoofing infrastructure;
- KYC/documents;
- custody, Transfer, Roll Opening, Activation or Warranty.

## 13. Definition of Done

Cube A is Done only when:

- schema and audit trail are migration-backed;
- Center self-capture works end to end on mobile interaction rules;
- Admin correction and history inspection work end to end;
- all mutation paths are atomic and permission-safe;
- failure states are explicit in Arabic;
- database contract tests pass after a fresh migration rebuild;
- generated types, typecheck and build pass;
- existing network/user/Product/Production regressions remain green;
- Review 1 and independent Review 2 both pass before merge.
