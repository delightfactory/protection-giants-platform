# Legacy Functional Reference Repository

## Status

The repository `melsayedahmed/protection-gaints-system-tickets` is a **superseded legacy implementation** and is retained only as a **functional reference**.

Its purpose is to help the team understand previously attempted or previously exposed product functions, workflows, screens, fields, labels, serial-generation behavior, warranty activation behavior, and other business-flow clues that may be useful while specifying the new Protection Giants platform.

## What it is allowed to inform

The legacy repository may be inspected to:

- discover existing or previously requested functions;
- understand historical user journeys and operational flows;
- identify data fields, labels, documents, stickers, serials, and warranty interactions that need to be considered;
- detect requirements that may otherwise be missed during functional analysis;
- compare the approved new platform behavior against the old implementation.

## What it is NOT

The legacy repository is **not**:

- the technical foundation of the new platform;
- an approved architecture reference;
- a source of truth for database design, authorization, security, validation, or deployment patterns;
- a codebase that should be copied or extended by default;
- evidence that an old behavior is automatically an approved requirement.

No schema, code pattern, permission model, UI implementation, workflow decision, or architectural choice from the legacy repository is inherited automatically.

## Source-of-truth order

When implementing the new platform, the authority order is:

1. explicitly approved product decisions and current specs in this repository;
2. current domain and lifecycle documentation in `docs/`;
3. verified business requirements confirmed during development;
4. the legacy repository only as a historical functional reference.

If the legacy repository conflicts with an approved current specification, **the current specification wins**.

If the legacy repository contains a function that is not covered by the current specs, it must be treated as a candidate requirement to review — not as permission to implement it automatically.

## Engineering rule

Developers must use the legacy repository to understand **what the old system attempted to do**, while designing and implementing **how the new platform should correctly do it** inside `delightfactory/protection-giants-platform`.
