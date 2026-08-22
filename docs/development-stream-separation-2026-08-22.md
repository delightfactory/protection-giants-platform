# Protection Giants — Development Stream Separation

**Date:** 2026-08-22  
**Status:** Governance boundary for ongoing product development and platform-experience harmonization.

## 1. Purpose

Protection Giants now has two different kinds of work happening in parallel:

1. continued implementation of the approved product roadmap through real functional Cubes;
2. a platform-wide UI/UX audit and harmonization program covering the experience already built across those Cubes.

These two streams must remain explicitly separate so UX refinement does not silently rewrite the product roadmap, renumber Cubes, remove valid capabilities, or introduce business behavior without the normal Cube process.

---

## 2. Stream A — Product Development Roadmap

This is the existing authoritative Cube-based development track.

A work item belongs to Stream A when it introduces or materially changes any of the following:

- a business capability;
- persistent business state or lifecycle;
- database schema or domain event contract;
- authorization/RLS/security capability;
- business invariant;
- cross-role operational behavior;
- external integration or delivery capability;
- a new workflow that users could not previously perform.

Examples include:

- Roll Custody;
- Transfers and Receipt;
- Roll Opening;
- Pre-install Issue Reporting;
- future Warranty Activation;
- future public Warranty access;
- future Claims;
- a role-aware Notification Engine.

### Rules

- Stream A continues to use the established Cube naming/sequencing discipline.
- Every Cube remains a bounded, functionally complete, testable vertical slice.
- Existing completed Cubes are not reopened merely to simplify later implementation.
- Product decisions, frozen specs, schema/RLS/contracts, CI and double review remain mandatory.
- UX work cannot assign itself a Cube letter or change this sequence.

---

## 3. Stream B — Platform Experience Harmonization

This is a parallel quality program, not a second Cube roadmap.

Its purpose is to review and improve how already-authorized capabilities are discovered, understood and completed by each role.

It may improve:

- role-specific Home/workbench composition;
- navigation and information architecture;
- discoverability;
- continuity between already-existing screens;
- terminology and copy;
- visual hierarchy;
- mobile ergonomics;
- empty/loading/error/success states;
- consistent dates/statuses/actions;
- reuse and refinement of shared UI components;
- rendered/browser/device quality.

It must **not** silently:

- remove a capability a role is authorized to use;
- hide a required step so it becomes practically unreachable;
- grant a role a capability it does not own;
- change business rules merely to simplify a screen;
- introduce new persistent workflow state;
- invent a generic engine or new operational subsystem;
- renumber or replace the Product Cube roadmap.

### Naming rule

UX work is never called a Cube.

Use terms such as:

- Audit;
- UX Harmonization;
- Experience Improvement;
- Navigation Improvement;
- Role Experience Slice;
- UI Consistency Fix.

Branches should use an explicit non-Cube prefix such as `audit/` or `ux/`.

---

## 4. The escalation rule

If Stream B discovers that a good user experience requires a business capability that does not yet exist, that item must be **escalated out of UX** and studied under Stream A.

Examples:

- “Admin should see pending work” may be solved in UX if the underlying data/queues already exist.
- “Every relevant role needs durable notifications when another party acts” is not a navigation tweak; it requires new persisted state, routing, security, read/unread behavior and cross-domain event integration. It therefore belongs to Stream A as a Product Capability.

UX may later consume that capability, but it does not own or implement the engine as a cosmetic change.

---

## 5. Non-regression contract between the streams

Before any UX harmonization change, record for every affected role:

1. current authorized capability;
2. current route(s) and entry point(s);
3. whether the capability is primary, contextual, reference/settings, or an attention queue;
4. required upstream/downstream journey links.

After the change, prove:

- the role retains every valid authorized capability;
- required routes remain reachable;
- contextual task entry still exists at the point of need;
- no unauthorized role gains access;
- RLS/business rules remain unchanged unless a separate Product Cube explicitly changes them;
- browser/mobile rendered QA is performed for affected flows.

A visually cleaner interface that makes a legitimate task hard to find is a regression.

---

## 6. Current working separation

### Product Development Track

Current product work remains governed by the canonical roadmap and latest status amendments. Cube K — Pre-install Roll Issue Reporting — is the current implementation under review and remains unmerged until closure approval.

After Cube K, the canonical roadmap previously pointed toward Warranty Activation, public Warranty access and Claims. On 2026-08-22 the Product Owner approved a planning amendment to insert a **role-aware in-app Notification Foundation** after Cube K and before Warranty Activation, subject to a frozen implementation spec after Cube K closes.

The Notification capability is therefore no longer a UX-audit candidate. It is an approved Product-capability direction in Stream A. Its study and planning amendment are maintained on `study/notification-foundation`, and its engine must not be implemented from the UX audit branch.

### Platform Experience Harmonization Track

Current audit branch:

`audit/platform-role-experience`

Current documents:

- `docs/platform-role-experience-inventory-2026-08-22.md`
- `docs/platform-experience-improvement-guardrails-2026-08-22.md`
- this stream-separation document

This track may produce a prioritized UX backlog and rendered role walkthrough findings, but those items remain non-Cube improvements unless they cross the escalation boundary above.

---

## 7. Decision boundary

A simple test determines the owner:

> **Can this improvement be implemented while preserving the existing business/data/security capability exactly as-is?**

- **Yes** → Stream B, Platform Experience Harmonization.
- **No** → Stream A, Product Development Cube/study.

When uncertain, treat the item as Stream A until its domain impact is understood. This prevents UX cleanup from becoming accidental product redesign.
