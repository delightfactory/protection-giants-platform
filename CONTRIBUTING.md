# Contributing

## Change size

Keep changes small, domain-focused, and independently reviewable.

A pull request should normally represent one coherent block or one narrow correction. Avoid mixing refactors, new features, schema expansion, and visual redesign in the same pull request unless they are inseparable.

## Branch naming

Use domain-oriented names:

- `feature/products-list`
- `feature/roll-opening`
- `feature/warranty-activation`
- `fix/duplicate-activation`
- `fix/mobile-roll-card`
- `chore/database-baseline`
- `docs/warranty-decisions`

Do not use personal, temporary, tool-specific, or vendor-specific branch names.

## Commit messages

Use concise professional messages describing the actual change:

- `feat: add product specification model`
- `fix: prevent duplicate warranty activation`
- `refactor: isolate roll state transitions`
- `test: cover inactive center activation`
- `docs: record approved roll-opening flow`

## Pull request requirements

Before review:

- keep scope narrow;
- update migrations when schema changes;
- add or update tests for business-rule changes;
- verify affected mobile flows;
- confirm no unrelated module is broken;
- update product decisions when business behavior changes;
- remove temporary debug code and dead controls.

## Merge policy

Do not merge when:
- the block is only partially implemented;
- tests/checks are failing;
- required security/authorization behavior is deferred;
- a schema change has no safe migration path;
- the change expands scope without explicit approval;
- important regression risk remains unexplained.
