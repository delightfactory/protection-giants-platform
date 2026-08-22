# Protection Giants — Cube K Approved Product Decisions Amendment

**Status:** Approved product-decision amendment for the Cube K study  
**Date:** 2026-08-22  
**Applies to:** `docs/cube-k-pre-install-roll-issue-study.md`

## K-Q1 — Warranty Activation hold after Pre-install Issue submission

**Approved decision:**

Creating a valid Pre-install Roll Issue immediately places the Roll under a temporary Warranty Activation hold. Company confirmation is not required to start the hold.

The issue submission does **not** by itself mean that the Roll is defective or condemned. It means only that the Roll is temporarily not eligible for Warranty Activation until the quality decision is resolved.

The lifecycle contract is:

- no active Pre-install Issue → Warranty Activation may proceed if all other activation rules pass;
- active issue with status `submitted` → Warranty Activation is blocked;
- terminal decision `cleared_for_use` → the issue hold is removed and Warranty Activation may proceed if all other activation rules pass;
- terminal decision `return_required` → Warranty Activation remains blocked and any physical custody return must use the existing Cube J opened-Roll Recovery path.

The Pre-install Issue domain must not automatically move custody, create a Recovery transfer, create Warranty state, or erase the immutable Cube J Roll Opening fact.

The future Warranty Activation cube must revalidate this issue-state rule atomically at activation time rather than trusting UI state.

## K-Q2 — Final quality-decision authority in V1

**Approved decision:**

The final Pre-install Roll Issue quality decision in V1 is owned by **Admin / Company only**.

Country Agents, Dealers and Centers do not receive issue-review or quality-decision authority in this first release.

In particular, the separate Cube J capability that may allow an explicitly enabled Country Agent to perform opened-Roll Recovery does **not** grant that Agent any authority to clear a Roll for use or require its return. Recovery authority and quality-decision authority remain separate responsibilities.

Therefore:

- Center may report an eligible issue and read the issue information exposed to it;
- Admin / Company reviews the submitted issue and records the final quality outcome;
- Agent may participate later only in physical Recovery when its separate Cube J capability and scope rules allow it;
- Dealer has no review authority;
- no generic delegated quality-permission model is introduced in Cube K V1.

## K-Q3 — Final issue outcomes in V1

**Approved decision:**

Cube K V1 has exactly two normal terminal quality outcomes:

- `cleared_for_use` — Company has reviewed the issue and decided the Roll may continue toward installation and later Warranty Activation, subject to all other Activation rules;
- `return_required` — Company has reviewed the issue and decided the Roll must not continue toward installation/Activation and requires physical return/handling through the existing Cube J opened-Roll Recovery path when the Roll is actually received.

The non-terminal issue state remains `submitted` while no final Company decision exists.

No additional normal lifecycle states such as `under_review`, `approved`, `rejected`, `awaiting_assignment`, or generic workflow statuses are introduced in V1.

`cleared_for_use` removes the issue-specific Activation hold. `return_required` keeps the Roll blocked from Warranty Activation.

Neither terminal decision moves custody automatically, deletes the issue, reverses Roll Opening, creates Warranty state, or bypasses the Cube J Recovery rules.

## K-Q4 — Pre-install Issue category set in V1

**Approved decision:**

Cube K V1 uses exactly four report categories:

- `manufacturing_defect` — suspected defect in the film/material itself or its manufacturing layers;
- `physical_damage` — visible physical damage such as scratches, creases, deformation or other material damage to the Roll/film before installation;
- `contamination_or_packaging` — contamination, moisture, foreign material, packaging failure or packaging/handling condition that may affect usability;
- `other` — any relevant Pre-install issue not covered by the three named categories. A human description remains required.

The category identifies the type of issue being reported; it does **not** determine the quality outcome automatically.

No severity matrix, root-cause taxonomy, SLA classification or extended quality-code hierarchy is introduced in V1. The Center selects the closest category and provides the required description; Admin / Company remains responsible for the final quality decision under K-Q2 and K-Q3.
