# Protection Giants — Pre-Launch Product Owner Decision Amendment

**Status:** APPROVED / FROZEN  
**Decision date:** 2026-08-31  
**Applies to baseline plan:** `docs/final-pre-launch-improvement-master-plan.md`  
**Scope:** decision reconciliation only. This document does not change Product code, database state, hosted configuration, or Production data.

## Purpose

The frozen master plan intentionally raised several pre-launch decision gates conservatively. The Product Owner subsequently reviewed those decisions one by one under the project rule of avoiding backend complexity that does not buy proportionate launch value.

This amendment records the approved V1 decisions. Where it conflicts with an earlier proposed implementation direction in the master plan or audit reconciliation, this amendment controls the V1 implementation scope while the original finding remains historical evidence.

## D-01 — Account creation, password ownership, and recovery

**Approved V1 contract:**

- Preserve the existing Center invitation/onboarding flow: invited Center user receives the Supabase Auth invitation, completes onboarding, chooses their own password, and then signs in normally.
- Hosted Supabase launch configuration (Site URL, hosted Invite template, SMTP, signup policy, and one real hosted invitation acceptance test) is launch-readiness configuration, not a new application backend.
- Preserve the existing trusted Admin-created operational account path for other operational roles. Admin may issue an initial credential.
- Add a small authenticated self-service **Change Password** capability so an operational user can replace the initial credential after login.
- Preserve bounded Admin password reset as an emergency/recovery path for V1.
- Do not build a generic invitation engine, custom reset-token system, forced-first-login state machine, or SMTP workflow in the application merely for V1.

**Residual-risk disposition:** the Product Owner accepts the bounded V1 governance trade-off of retaining Admin emergency password reset rather than introducing a broader identity lifecycle subsystem before launch.

## D-02 — Sensitive operational account changes

**Approved V1 contract:**

- Preserve current Admin authority and current server-side authorization safeguards.
- Add explicit confirmation before sensitive changes such as role/entity binding, login email, and Admin password reset.
- Preserve the existing confirmation for suspension/reactivation behavior.
- Do not add a new immutable account-audit table/event subsystem solely for these changes in V1.
- Do not require a mandatory reason field solely to create audit data that is not otherwise consumed.
- Preserve existing self-demotion/self-suspension protections.

**Residual-risk disposition:** the original governance/audit concern remains known, but the Product Owner accepts it for the controlled V1 operator model. A durable privileged-change audit trail becomes a future requirement if administrator count, compliance needs, or repudiation risk materially increases.

This decision supersedes the broader `ID-01` proposal for a new credential-ownership/audit subsystem. V1 `ID-01` implementation is therefore reduced to the bounded UI/account-safety changes above plus the self-service password change.

## D-03 — International customer phone identity

The separately frozen `docs/intl-phone-identity-decision.md` remains authoritative.

In summary:

- full international phone format is required at Warranty Activation;
- reuse the existing `warranties.customer_phone` field;
- normalize safe formatting differences, Arabic/Persian digits, separators, and leading `00` to the canonical international representation;
- never infer a country from the Center, browser, operator, or ambiguous local number;
- local-only numbers must fail with professional guidance rather than being guessed;
- the same contract applies to Warranty Activation, Admin correction, Claim verification, and customer-facing guidance;
- no phone identity table, country-dialing mapping subsystem, or third-party phone library is approved unless later evidence requires it.

## D-04 — Time, timezone, business dates, and Warranty coverage

**Approved V1 contract:**

- Absolute operational events remain exact timestamps (`timestamptz`/equivalent authoritative instant).
- Operational instants are displayed in the viewer/device local timezone through one consistent presentation contract.
- Remove accidental one-off hardcoding such as `Africa/Cairo` where the value is an operational instant intended for viewer-local display.
- Business calendar dates remain date-only values and must not shift due to timezone conversion.
- Warranty coverage remains anchored to the exact successful activation instant and its calculated expiry instant; do not introduce a Center-local coverage-date engine.
- Do not add a timezone field to Centers, country-to-timezone mapping, or a general timezone subsystem in V1.
- Tests must cover midnight-boundary presentation sufficiently to prevent date-shift regressions.

This decision supersedes the earlier proposal to require a Center/business timezone strategy for V1 where no business rule actually needs it.

## D-05 — Invalid/damaged public Warranty QR recovery

**Approved V1 contract:**

- Provide one branded, generic, safe recovery experience for malformed, invalid, damaged, expired-path, or otherwise unusable public Warranty links/QR entry points.
- Do not reveal whether a queried Warranty/QR identity exists.
- Provide re-scan/retry guidance and a governed Protection Giants support path.
- Do not introduce public lookup by phone, VIN, Warranty number, Roll serial, or other enumerable identity.
- Do not build customer accounts or OTP recovery solely for this requirement.
- Support/contact data is centrally configured launch content; it does not require a support-management database subsystem.
- The actual approved phone/WhatsApp/email values remain a Production Launch Readiness configuration/content item.

## D-06 — V1 language

**Approved V1 contract:**

- V1 launches in **Arabic** with the current RTL interface model.
- The English trade name `Protection Giants` may remain where appropriate to brand identity.
- Do not add an i18n framework, language selector, translation dictionaries, or English operational/public UI in the current pre-launch improvement program.
- English/multilingual support becomes a separate bounded Product/UX cube only when a concrete launch market requires it.

International operation remains supported through neutral phone/time/country data contracts and is not conditional on multilingual UI.

## Decision-gate status after this amendment

The product/security decisions previously called out before implementation of `ID-01`, `INTL-01`, and `INTL-02` are now frozen for V1.

No further Product Owner architecture decision is required before starting the approved implementation sequence.

Items that remain intentionally deferred to the formal Production Launch Readiness stage are configuration/content/acceptance rather than backend architecture decisions, including:

- final hosted Supabase Auth/Site URL/SMTP values and real invitation acceptance;
- final Protection Giants support/contact values;
- approved legal/privacy/trust copy and public Product content;
- final brand assets where still intentionally pending;
- browser/mobile/accessibility acceptance;
- physical printer/media/RIP/cut/scan acceptance.

The next implementation item remains `SEC-01 — Dependency Security Acceptance`, followed by the frozen bounded sequence from the master plan, with the reduced scopes above applied when `ID-01` and `INTL-02` are reached.
