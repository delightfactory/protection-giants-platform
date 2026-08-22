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
