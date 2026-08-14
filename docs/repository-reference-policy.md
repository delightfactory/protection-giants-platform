# Repository Reference Policy

## Authoritative development repository

All active development for the Protection Giants platform must be implemented in:

`delightfactory/protection-giants-platform`

This repository is the single authoritative source for the current architecture, database migrations, application code, tests, specifications, and future development branches.

## Canonical development context

`docs/canonical-project-context.md` is the required orientation document for a new development or review session.

It exists to preserve confirmed project context across conversations and development handoffs, especially where older documents contain historically valid but later-superseded wording.

It does not replace normative sources. When a business rule is being implemented, precedence remains:

1. latest explicitly approved Product Decisions and normative amendments;
2. current approved functional specifications and dependency roadmap;
3. merged implementation contracts plus actual code/migrations/tests on `main`;
4. confirmed business requirements not yet promoted into a normative document;
5. legacy material only as historical evidence.

The canonical context must record supersession/status explicitly rather than silently reconciling conflicting historical wording. It should be updated when a material business decision, dependency correction, or cube-closure state changes.

## Legacy reference repository

The repository:

`melsayedahmed/protection-gaints-system-tickets`

is a legacy reference repository only.

It may be inspected to understand historical workflows, previously implemented functions, screens, labels, warranty flows, serial generation behavior, and business requirements that existed or were attempted in the old system.

It must **not** be used as:

- a development base;
- a source branch for new work;
- an architectural template;
- a database/schema authority;
- a quality benchmark;
- a target for fixes or continued implementation.

Where legacy behavior conflicts with the approved specifications or the current platform architecture, the approved specifications and `delightfactory/protection-giants-platform` take precedence.

The old repository exists to answer only one question: **what functions and operational behaviors did the previous system try to provide?**
