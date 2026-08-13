# Production Supabase Readiness

## Purpose

This document is the production-operation checklist for Supabase settings that are **outside ordinary application code/migrations but are required by implemented platform functions**.

The committed local `supabase/config.toml` remains the development reference. A hosted production project must be checked explicitly; the presence of a local setting in this repository is not proof that the hosted Supabase project has the equivalent setting.

This checklist must be reviewed before the first production launch and again whenever the production Supabase project, domain, Auth delivery provider, or deployment environment changes.

---

## 1. Production project and database deployment — BLOCKING

Before application traffic is pointed at the production project:

- create/select the intended production Supabase project;
- apply the committed migration chain in repository order;
- do not recreate schema, RLS policies, functions, triggers, or grants manually from memory;
- confirm the production migration history matches the repository;
- run database lint/advisor checks supported by the production workflow;
- verify generated application database types still match the deployed public schema;
- perform the same database contract checks used by CI before production sign-off.

### Functions depending on this

All operational identity, Agent/Dealer/Center scope, products, production, Transfer ID, Center invitation audit, and later custody/warranty modules depend on the database invariants and RLS established by migrations.

---

## 2. Application environment variables — BLOCKING

The production application environment must contain:

- `NEXT_PUBLIC_SUPABASE_URL` = production project URL;
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = production publishable key;
- `SUPABASE_SECRET_KEY` = production server-only secret key.

`SUPABASE_SERVICE_ROLE_KEY` is only a local/legacy fallback in the current application contract and should not be preferred for a new hosted production project when the current secret key is available.

### Security rule

The secret/service-role value must never be placed in a `NEXT_PUBLIC_` variable, browser bundle, public log, repository file, client component, or email template.

### Functions depending on this

- normal authenticated Supabase server/browser access depends on the URL + publishable key;
- operational account administration;
- Center invitation issuance;
- Center onboarding provisioning/recovery;
- server-side Auth Admin operations depend on the server-only secret key.

---

## 3. Auth provider policy — BLOCKING

Production Auth must preserve the current identity decisions:

- email/password authentication enabled;
- global public/self-service signup disabled;
- anonymous sign-ins disabled;
- phone/SMS signup and OTP authentication remain disabled until an explicit future product decision activates them;
- operational roles must never be created from user-editable metadata;
- operational provisioning continues through protected `app_metadata.pg_provisioning` and the committed database trigger.

Do not enable public signup simply to make invitation testing easier. A Center invitation intentionally creates an Auth identity without granting an operational Profile until the controlled onboarding flow completes.

### Functions depending on this

- Admin/Agent/Dealer/Center sign-in;
- trusted operational account provisioning;
- prevention of public users creating operational identities;
- Center first-account onboarding.

---

## 4. Auth URL configuration — BLOCKING BEFORE EMAIL FLOWS

In Supabase Auth URL Configuration:

1. set **Site URL** to the final HTTPS production application origin;
2. remove localhost as the production Site URL;
3. add only required production/preview redirect origins to the allowed redirect list;
4. confirm the production URL reaches the application's `/auth/confirm` route;
5. after any domain change, retest every Auth email flow that constructs a link.

Current Center invitations intentionally use the project Site URL in the email template and then route through:

`/auth/confirm?token_hash=<token>&type=invite`

The application route verifies the invite token server-side and redirects to `/onboarding/center`. Do not replace this controlled path with a direct generic `ConfirmationURL` without a new security review.

### Functions depending on this

- Center invitation links;
- establishment of the invitation session;
- Center onboarding entry after email confirmation;
- future password-reset or email-confirmation flows if introduced.

---

## 5. Center invite email template — BLOCKING BEFORE CENTER INVITATIONS

The hosted project's **Invite user** template must remain functionally equivalent to:

`supabase/templates/invite.html`

Required behavior:

- use `{{ .SiteURL }}` as the application origin;
- use `{{ .TokenHash }}`;
- use `type=invite`;
- send the recipient to `/auth/confirm`;
- do not expose a role selector, Center ID selector, raw authorization metadata, or any server secret;
- do not silently revert to a direct generic `{{ .ConfirmationURL }}` flow.

The repository template and production hosted template must be compared during production setup and after any Auth-template change.

### Current platform dependency

Center onboarding is not production-ready if the hosted Invite template is missing or points to a different verification path, even when the application code and database are correct.

---

## 6. Custom SMTP — BLOCKING BEFORE REAL INVITATIONS

Configure a production-grade custom SMTP provider before real operational invitations are relied upon.

Required production values include the provider's:

- SMTP host;
- port;
- username;
- password/credential;
- authenticated sender / From address;
- sender display name where supported.

Also configure the sending domain's SPF, DKIM and DMARC records according to the selected provider and confirm delivery to external, non-team addresses.

### Why this is mandatory

Supabase's default SMTP is intended for development/testing, has delivery/rate restrictions, and is not a production delivery dependency for this platform. Center onboarding depends on reliable email delivery to real installation-center addresses.

For new Free-plan projects, Supabase also restricts Auth email-template customization when using the default SMTP; custom SMTP therefore removes an additional production blocker for the controlled invite template.

### Functions depending on this

- Center invitation delivery;
- reissued Center invitations;
- any future password-reset/security notification flows that use Supabase Auth email.

---

## 7. Auth email/rate limits — REQUIRED OPERATING CHECK

After custom SMTP is configured:

- review the project's Auth email rate limits;
- set limits appropriate for the expected operational invitation volume rather than blindly increasing them;
- test repeated invite/reissue behavior without weakening the application's own invitation-state protections;
- keep public signup disabled so email capacity cannot be consumed by arbitrary public account creation.

Rate-limit changes are operational configuration, not a substitute for application authorization or invitation uniqueness rules.

---

## 8. Data API exposure and RLS — BLOCKING SECURITY CHECK

The local project intentionally uses explicit grants and RLS rather than relying on broad automatic exposure.

On the hosted production project:

- confirm the intended exposed schemas/Data API configuration;
- do not assume a newly created table is safely inaccessible merely because no UI points to it;
- do not grant `anon` or `authenticated` broad access to make a failing request work;
- verify every exposed table has the expected RLS state and explicit grants from migrations;
- preserve the server-only boundary of `center_onboarding_invitations`;
- preserve explicit function EXECUTE grants/revokes, especially for privileged/security-definer functions.

### Functions depending on this

Every role-scoped operational module depends on RLS remaining the final data-access boundary. Center invitation audit privacy specifically depends on the table not becoming an ordinary authenticated Data API resource.

---

## 9. Product asset Storage — REQUIRED BEFORE PRODUCTION FILE UPLOADS

The current local configuration defines a private `product-assets` bucket with:

- `public = false`;
- maximum file size `20MiB`;
- allowed MIME types: JPEG, PNG, WebP, AVIF and PDF.

Before production product-asset upload is enabled, confirm the hosted project has the required bucket/configuration and that Storage policies/grants match the application's product-asset access model.

Do not make the bucket public merely to solve a signed/authenticated upload or read error.

### Functions depending on this

Product image/document storage and any interface that renders or manages those protected assets.

---

## 10. First production administrator — BLOCKING BEFORE OPERATIONS

Bootstrap the first production administrator through a trusted one-time server/admin process after the production Auth project and migrations are ready.

Never place the administrator password, secret key, or reusable bootstrap credential in a migration, seed, committed script, documentation, or repository secret visible to client code.

After the first administrator is verified, normal operational user management should happen through the secured platform workflows.

---

## 11. Minimum production smoke test — REQUIRED BEFORE SIGN-OFF

Use dedicated test identities/Center data and verify, in order:

1. public signup is rejected;
2. administrator login succeeds;
3. Admin can access only expected administration modules;
4. Agent/Dealer/Center test users receive the expected scoped access;
5. a Center invitation is delivered to an external test mailbox;
6. the invite link opens the production `/auth/confirm` route;
7. the invite session reaches `/onboarding/center`;
8. recipient cannot choose role or Center binding;
9. onboarding creates exactly the expected Center Profile;
10. cancelled/superseded invitation cannot be reused;
11. Center invitation audit is not readable/writable through an ordinary authenticated Data API session;
12. a suspended profile/entity is denied operational access;
13. product-assets access remains private and follows its intended policies;
14. production logs contain no secret/service-role key or password.

Production should not be considered ready if a required external setting is merely assumed from local development behavior.

---

## 12. Production configuration sign-off record

When the production project is created, record the following **without recording secrets**:

- Supabase project reference/name;
- production application Site URL;
- allowed redirect origins reviewed: yes/no;
- public signup disabled: yes/no;
- anonymous sign-in disabled: yes/no;
- production Invite template verified against repository: yes/no;
- custom SMTP configured and external delivery tested: yes/no;
- SPF/DKIM/DMARC verified: yes/no;
- Auth rate limits reviewed: yes/no;
- migrations applied and verified: yes/no;
- Data API/RLS/grants verified: yes/no;
- `product-assets` bucket/policies verified when applicable: yes/no;
- first production administrator bootstrapped and tested: yes/no;
- production smoke test completed: yes/no;
- date and person responsible for sign-off.

This record is a deployment checklist, not a place to store credentials.

---

## Repository references

- `supabase/config.toml` — committed local Supabase configuration baseline.
- `supabase/templates/invite.html` — canonical Center invitation template behavior.
- `app/auth/confirm/route.ts` — controlled server-side invite confirmation route.
- `scripts/verify-auth-config.mjs` — automated local contract for disabled public signup and controlled invite confirmation.
- `docs/center-onboarding-deferred-cube.md` — implemented Center onboarding flow and security boundary.
- `docs/identity-foundation.md` — operational identity/provisioning contract.
- `docs/development-governance.md` — production/review rules.

## External reference points

Current production setup must be rechecked against Supabase's official documentation/changelog at deployment time, especially Auth URL Configuration, Email Templates, Custom SMTP, Data API/RLS behavior, and any breaking Auth changes. Supabase platform behavior is not assumed to remain static between development and production launch.
