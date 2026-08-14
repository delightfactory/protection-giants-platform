# Protection Giants — Post-Cube-F Canonical Status Amendment

**Date:** 2026-08-14  
**Status:** Prepared status/context reconciliation after Cube F and before Cube G implementation  
**Applies to:** `delightfactory/protection-giants-platform`  
**Merged baseline:** `main` at `e9cd60902a148b2203b3e7e128e8e7108f4c5712`

## 1. Purpose

This document reconciles the project status after Cube F so later development does not inherit the older roadmap wording that still described Cube F as the current design/specification cube.

It does not change any approved Product Decision or reopen Cube F. It records the merged implementation reality and fixes the immediate dependency boundary for Cube G.

Once the Cube G specification is approved/merged, its implementation contract is:

`docs/cube-g-transfer-send-ux-spec.md`

## 2. Cube F is complete and merged

Cube F — Roll Transfer State & Reservation Engine was merged through PR #50 with squash merge commit:

`e9cd60902a148b2203b3e7e128e8e7108f4c5712`

The merged Cube F implementation owns:

- pending Transfer identity/header;
- immutable physical Roll membership;
- one active reservation per Roll;
- exact Transfer ID recipient resolution at mutation time;
- payload-safe request idempotency;
- sender cancellation and recipient rejection before receipt;
- narrow audited Admin recovery for the approved suspended-party condition;
- Production Order void coordination while a reservation is active;
- participant/Admin read boundaries and RPC-only critical mutations;
- concurrency/lifecycle/10,000-Roll verification;
- generated database types and permanent Database Quality coverage.

Creating a pending Transfer still does **not** move confirmed custody or append confirmed custody history.

Cube F is a closed dependency for Cube G. Cube G may consume its public contracts but must not duplicate or weaken its mutation rules in UI code.

## 3. Current next cube

The immediate next software cube is:

**Cube G — Transfer Send UX: Transfer ID + Scan / Select / Lot**

Cube G owns the sender-facing vertical slice required to create a valid pending Transfer through the approved input modes:

- exact recipient Transfer ID entry/scan;
- minimal recipient verification card;
- Scan Rolls;
- Select Rolls;
- Select Lot;
- explicit full/partial Lot availability;
- review/count confirmation;
- mobile camera flow and manual fallback;
- duplicate/interrupted submission handling;
- success state after the existing Cube F `create_roll_transfer` RPC succeeds.

Cube G is the first Transfer cube that intentionally contains operational UI.

## 4. Verified implementation dependencies available to Cube G

### 4.1 Recipient resolver

The existing exact resolver is:

`public.resolve_transfer_recipient(text)`

It already enforces the privacy boundary and returns only the minimum recipient verification shape for an exact active Transfer ID.

Cube G must reuse it. It must not introduce fuzzy recipient search or a global party directory.

### 4.2 Contextual Roll QR

The existing Roll QR contract is implemented in:

`lib/rolls/roll-qr.ts`

Authenticated Scan Rolls must reuse `parseRollQrPayload(...)` to derive the canonical Roll serial from the existing contextual QR. Cube G must not introduce a second Roll QR identity.

### 4.3 Transfer mutation

The existing creation RPC is:

`public.create_roll_transfer(p_request_id uuid, p_recipient_transfer_code text, p_roll_ids uuid[]) returns uuid`

It remains the authoritative final guard for custody, reservation, recipient lifecycle, Production Order eligibility, idempotency and concurrency.

### 4.4 Sender inventory read gap

Current security boundaries intentionally hide `roll_transfer_reservations` from ordinary Data API browsing, and `production_lots` remains an Admin production surface.

Cube G nevertheless must show accurate sender-side availability and the approved Lot totals/available/elsewhere behavior.

Therefore Cube G may add only narrow read-only RPC projections scoped to the authenticated active sender party. Those projections may expose the minimum Roll/Lot availability information needed by the send flow, but must not expose:

- another party's inventory list;
- reservation recipient or unrelated Transfer details;
- a global operational-party directory;
- hidden Auth/profile data.

This is a Cube G read contract, not a change to Cube F's reservation ownership.

## 5. Current G/H boundary

Cube G stops when the sender has successfully created a valid **pending** Transfer and received clear confirmation.

Cube H remains responsible for:

- recipient pending-transfer inbox/detail;
- receipt scan/selection;
- partial receipt;
- discrepancy handling;
- sender cancellation rules after receipt capability exists;
- actual per-Roll confirmed custody transition;
- appending the next immutable `roll_custody_events` entry.

Cube G must not move custody early or add placeholder receipt controls.

## 6. Other boundaries that remain unchanged

- Management hierarchy does not become a transfer route matrix.
- Center network approval/location does not grant or block Transfer authority.
- Transfer ID remains stable/shareable but is not authentication or proof of custody.
- Roll QR possession never grants transfer authority.
- Pending Transfers do not auto-expire.
- Cube E's deferred physical print/cut/scan validation remains separate and does not block Cube G software work.
- Warranty/Activation/Claims remain outside the Transfer Send cube.

## 7. Implementation start rule

Cube G implementation must start from the then-current merged `main` **after** the Cube G specification is approved/merged. The documentation branch used to freeze the specification must not be reused as the implementation branch.

This preserves the repository rule that each implementation cube begins from an updated, reviewed baseline.