# Repository Reference Policy

## Authoritative development repository

All active development for the Protection Giants platform must be implemented in:

`delightfactory/protection-giants-platform`

This repository is the single authoritative source for the current architecture, database migrations, application code, tests, specifications, and future development branches.

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
