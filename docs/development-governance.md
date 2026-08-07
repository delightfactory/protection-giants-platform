# Development Governance

## Purpose

These rules govern all planning, implementation, review, and release work in this repository. They are mandatory unless an explicit product decision records an approved exception.

## 1. Incremental delivery

- Development proceeds in small, complete, testable blocks.
- A block must have one clear responsibility and a clear Definition of Done.
- Do not combine unrelated features into the same implementation step.
- Prefer the smallest correct change that creates stable forward progress.

## 2. Foundation before features

For every module, establish the foundation before adding higher-level workflows:

1. domain model and invariants;
2. persistence/data contract;
3. service/business logic;
4. authorization and validation;
5. UI flow;
6. error and empty states;
7. tests;
8. integration with existing modules.

Do not start advanced workflows before the foundation of the module is stable.

## 3. Available need over speculative expansion

- Build for confirmed business requirements first.
- Keep future change possible, but do not implement future complexity in advance.
- No generic workflow engines, multi-tenant abstractions, generalized ERP features, or cross-product logic without a confirmed current need.
- Reuse an abstraction only after repeated real use justifies it.

## 4. Low coupling

- Each module owns its own business logic.
- Cross-module communication uses explicit contracts and identifiers.
- UI components do not contain persistence logic.
- Database access does not contain presentation logic.
- Warranty logic must not embed production-order logic.
- Roll lifecycle logic must remain independently testable.

## 5. Business rules are explicit

- Important business rules must exist in named service/domain functions or database constraints, not only in UI behavior.
- Critical rules must be documented in `docs/product-decisions.md`.
- A business-rule change must update the decision record and relevant tests in the same change.

## 6. State discipline

- Use a status only when it changes allowed behavior of the entity.
- Historical facts that do not alter current behavior should be recorded as events.
- Avoid status proliferation.
- State transitions must be validated centrally.

## 7. Database discipline

- Schema changes use versioned migrations.
- No destructive schema change without an explicit migration plan.
- Critical consistency rules belong in database constraints or atomic transactions where appropriate.
- No production data deletion to simplify a migration.
- Do not create tables for speculative future features.

## 8. Security is part of the feature

A feature is incomplete until its security path is implemented.

At minimum, review:
- authentication requirement;
- role/ownership authorization;
- input validation;
- public data exposure;
- duplicate/race-condition protection;
- auditability of sensitive actions.

## 9. Mobile-first operational UX

Operational flows used by dealers, installation centers, scanning, transfer, and warranty activation are designed for mobile first.

- avoid desktop-only tables for core field operations;
- keep actions short and explicit;
- support camera/scanner-friendly entry where relevant;
- validation and errors must be understandable in Arabic;
- do not hide required operational information behind hover-only interactions.

## 10. Complete vertical slices

A feature is not complete because its page renders.

A production-ready block should include, as applicable:
- data model;
- business logic;
- permissions;
- API/service path;
- UI;
- validation;
- loading/empty/error states;
- tests;
- audit/event recording;
- documentation update.

## 11. Failure paths are designed up front

Every workflow must define both its happy path and realistic failure paths before implementation.

Examples:
- roll already used;
- roll voided;
- center inactive;
- invalid transfer ownership;
- duplicate submission;
- invalid VIN;
- lost connectivity before final confirmation.

## 12. Changes remain locally contained

When a customer or product decision changes:
- identify the smallest affected layer;
- modify only the necessary contracts and logic;
- preserve unaffected module interfaces where possible;
- add regression coverage for the changed behavior.

Avoid whole-module rewrites for narrow business-rule changes.

## 13. Integration is continuous

- Finish and verify one block before stacking the next.
- New work must not leave earlier flows broken.
- Run regression checks for affected modules before merge.
- Keep pull requests focused and reviewable.

## 14. No dead or misleading functionality

- Do not expose a button, action, report, or status as functional unless its full path works.
- Prototype-only elements must be clearly marked and must not enter production as if complete.
- Avoid placeholder data in production-facing screens.

## 15. Build and deploy intentionally

- Do not create deployment churn for cosmetic or incomplete work.
- Group closely related, low-risk changes when appropriate.
- Preview and smoke-test meaningful integrated states.
- Production merge requires completed review gates.

## 16. Documentation follows the code

- Approved business rules are updated when changed.
- Module contracts and important lifecycle transitions must stay current.
- Do not rely on chat history as the source of truth for implemented behavior.

## 17. Professional naming

- Names must describe product, domain, or engineering intent.
- Branches, files, commits, comments, and documentation must not use irrelevant tool/vendor names or implementation provenance.
- Prefer stable domain terminology: `products`, `rolls`, `warranties`, `installation-centers`, `transfers`, `claims`.

## 18. Definition of Done

A block is `Done` only when all applicable items are true:

- scope is satisfied without unrelated expansion;
- business rules are explicit;
- data model and migrations are correct;
- permissions and public exposure are reviewed;
- happy path works;
- important failure paths work;
- mobile behavior is acceptable;
- automated checks pass;
- affected existing flows still pass smoke/regression checks;
- no dead controls or temporary hidden shortcuts remain;
- documentation and decision records are current.
