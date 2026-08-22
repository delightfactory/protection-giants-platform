# Protection Giants — Post-Cube-J Canonical Status Amendment

**Status:** Authoritative status amendment — 2026-08-22

**Applies after:** Cube J merge commit `e4554be58cac3f0fb1add40ef4a3448d65333d55` on `main`.

## 1. Purpose and precedence

This amendment records the repository state after completion of **Cube J — Roll Opening / Claiming**.

Where older README, roadmap, post-Transfer status, or Cube J pre-implementation wording still describes Roll Opening / Claiming as the current or next software step, this amendment controls current implementation status.

The frozen business rules in `docs/cube-j-roll-opening-claiming-spec.md` remain authoritative for Cube J behavior. This amendment changes status only; it does not redefine the approved lifecycle.

## 2. Cube J is complete on `main`

Cube J is software-complete on `main` and closes the operational boundary between confirmed Roll custody at a Center and the later installation/warranty lifecycle.

The merged implementation includes:

- immutable one-row-per-Roll Opening evidence;
- Center-only idempotent Roll Opening;
- active Center, confirmed current custody, generated Production Order, and no-active-Transfer-reservation eligibility checks;
- no normal Undo for the physical Opening fact;
- Opening remaining separate from custody movement and Warranty Activation;
- database-enforced exclusion of opened Rolls from ordinary/standard Transfer;
- explicit opened-Roll visibility in Transfer Send, including separate opened counts in Lot workflows;
- Production Order void protection after any child Roll has been opened;
- narrow opened-Roll Recovery for Admin and explicitly enabled Country Agents;
- Agent Recovery constrained to opened Rolls held by Centers inside that Agent network;
- mandatory physical-receipt confirmation and reason for Recovery;
- Recovery implemented as a real Transfer that reuses the existing Cube H receipt/custody engine, preserving one confirmed-custody history;
- permanent preservation of the original Opening evidence after Recovery;
- mobile-first QR/manual Opening and Recovery flows;
- custody-page discoverability and Opening status visibility;
- separate Admin control of the Agent Recovery capability, default OFF;
- explicit Recovery event labeling in Transfer history;
- contextual Roll QR validation against the canonical public-site origin.

No customer identity, VIN, Warranty Activation, public warranty token/URL, claim, replacement, reinstall, or speculative consumption/accounting model was pulled into Cube J.

## 3. Validation evidence

PR #58 was merged only after both permanent quality gates succeeded on its final reviewed head:

- **PR Quality:** contextual QR contracts, independent QR decoding, Transfer Send client contracts, Transfer Receipt retry/component contracts, outer-Roll print/QR regressions, TypeScript, production build, and tracked-configuration integrity;
- **Database Quality:** fresh local Supabase start, historical custody backfill verification, complete migration rebuild, DB lint, explicit public-function grant checks, every prior database contract through Cube H, Cube J Opening/Recovery contracts, and generated database-type synchronization.

The final review used two separate passes:

1. domain invariants / authorization / concurrency / custody integrity;
2. mobile UX / QR integration / discoverability / Transfer integration.

The UX/integration review found and corrected two issues before merge: Opening/Recovery QR parsing now uses the canonical public origin rather than the browser preview origin, and opened-Roll Recovery is explicitly labeled in the Transfer timeline instead of falling through to a generic event label.

Cube J introduces no new camera/scanner primitive; it reuses the same contextual Roll QR scanner and parser already validated in the completed Transfer stage. Production-environment deployment validation remains a launch/environment concern and is not implied by this repository-status amendment.

## 4. Current operational path

The merged software path now reaches:

`Product → Production Order → Lot → Roll → confirmed custody → Transfer → recipient receipt/partial receipt → confirmed custody movement → Center Roll Opening`

An opened Roll is a permanent historical state. It is no longer ordinary intact Transfer inventory.

If an opened Roll must physically return from a Center, the dedicated Recovery path changes confirmed custody without deleting or reversing the Opening fact.

## 5. Current next lifecycle gap

The next critical software design/specification step is now:

**Pre-install Roll Issue Reporting**

Its bounded responsibility is to handle a manufacturing/physical problem discovered after the Roll has been legitimately opened but before customer Warranty Activation.

The next cube must be specified before implementation and should reuse the Cube J Opening fact as its lifecycle prerequisite rather than reopening or extending Cube J.

It must not automatically pull forward:

- customer/VIN Warranty Activation;
- public Warranty access/token strategy;
- customer claims;
- replacement/reinstall lifecycle;
- generic inventory/accounting engines.

## 6. Later sequence

The approved high-level lifecycle sequence after Cube J remains:

1. Pre-install Roll Issue Reporting;
2. Warranty Activation;
3. public Warranty access/verification and customer QR strategy;
4. claims and later replacement/reinstall flows.

Network approval remains a trust/public designation and is not retroactively made an Opening or Warranty Activation gate.

## 7. Parallel/deferred print work

Cube I — Remaining Production-owned Label Package remains valid later/parallel work and is not the next critical lifecycle cube.

Activation/Warranty labels remain behind their own identity/lifecycle decision gate and must not be pulled into Pre-install Roll Issue Reporting by default.

## 8. Status boundary

Cube J should now be treated as closed software scope. Future work may consume its Opening and Recovery facts, but must not rebuild the same lifecycle responsibility inside later cubes.
