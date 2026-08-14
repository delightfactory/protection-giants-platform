# Protection Giants Platform

Official repository for the Protection Giants warranty, roll tracking, installation-center, and public product platform.

## Development approach

The platform is developed incrementally in small, complete, testable building blocks. Each block must be stable before the next layer is added.

Start every development/review session with:
- `docs/canonical-project-context.md` — current project context, decision precedence, superseded wording and implementation status;
- `docs/product-decisions.md` — approved business decisions;
- `docs/development-governance.md` — mandatory engineering/closure rules;
- `docs/gap-closure-roadmap.md` — dependency boundaries for the remaining cubes, with current status checked against the canonical context;
- the applicable current spec/amendment for the cube being changed;
- `CONTRIBUTING.md`.

Older documents such as `docs/scope-guardrails.md` remain useful for their high-level scope limits, but any wording superseded by a later Product Decision, normative amendment, roadmap correction, or canonical-context note must not be treated as current authority.

## Current implementation scope

The first production scope targets Protection Giants paint-protection film operations only. Additional brands or product families are not part of the initial implementation unless explicitly approved through the decision log.
