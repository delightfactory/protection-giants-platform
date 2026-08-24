# Hosted Environment Deployment Runbook

## Purpose

This document is the operational reference for creating a hosted **staging** or **production** environment for Protection Giants.

It covers configuration that is not fully created by ordinary database migrations or application code: Supabase hosted settings, Auth delivery, Storage verification, Vercel environment variables, custom domains, Web Push runtime, scheduler wiring, and release gates.

This runbook must be reviewed before every new hosted environment and before the first production launch.

> Never store passwords, Supabase secret keys, VAPID private keys, SMTP credentials, scheduler bearer secrets, access tokens, or recovery codes in this document or anywhere in the repository.

---

## 1. Environment separation

Maintain separate hosted environments:

- **Staging**: used for live preview, device testing, Auth rehearsal, PWA/Web Push validation, and release qualification.
- **Production**: used only after release gates are closed.

Do not reuse the same Supabase project or server-only secrets between staging and production.

Recommended naming:

- Supabase staging: `protection-giants-staging`
- Supabase production: `protection-giants-production`

The current intended web topology is:

- `preview.protectiongiants.com` — staging / live preview.
- `protectiongiants.com` — public brand/customer pages in production.
- `portal.protectiongiants.com` — authenticated operational portal in production.

The public/portal hostname split must not be treated as complete until hostname routing/access rules are implemented and verified in the application.

---

## 2. Database deployment — BLOCKING

For every new hosted Supabase environment:

1. Create/select the intended Supabase project.
2. Apply the complete committed migration chain in repository order.
3. Do not recreate schema objects, grants, policies, triggers, or functions manually from memory.
4. Confirm migration history matches the repository.
5. Run the database verification/smoke checks used by the project.
6. Run Supabase Security Advisor / database lint checks.
7. Review any warning involving RLS, grants, `SECURITY DEFINER`, exposed schemas, or privileged functions before release.

A warning must not be changed automatically only to make the advisor green. Classify it first as:

- intentional and documented;
- safe but requiring follow-up;
- release-blocking.

Production is not approved while an unresolved release-blocking security warning remains.

See also: `docs/production-supabase-readiness.md`.

---

## 3. Supabase Data API baseline — BLOCKING

The hosted project must preserve the repository's explicit-access model.

Reference: `supabase/config.toml`.

Required baseline:

- Data API enabled when required by the application.
- Do not automatically expose newly created tables.
- Do not broaden `anon` or `authenticated` grants to work around an application error.
- Verify RLS and explicit grants for every exposed operational table.
- Preserve the server-only boundary around privileged tables and functions.

A hosted-dashboard default is not considered authoritative when it conflicts with the committed access model.

---

## 4. Supabase Auth configuration — BLOCKING

Reference: `supabase/config.toml`.

Required hosted configuration:

- Email/password Auth enabled.
- Public/self-service signup disabled.
- Anonymous sign-in disabled.
- Phone/SMS Auth disabled unless a future approved product decision enables it.
- Operational accounts are created only through the platform's controlled administration/onboarding flows.

Do not enable public signup for convenience during staging or production testing.

---

## 5. Auth URL configuration — BLOCKING BEFORE EMAIL FLOWS

### Staging

After the stable staging URL exists:

- set Supabase **Site URL** to the staging HTTPS origin, normally `https://preview.protectiongiants.com`;
- add the required staging redirect origin(s);
- keep localhost redirect URLs only when they are explicitly needed for local development.

### Production

Before launch:

- set **Site URL** to the final production application origin used by the Auth flow;
- add only the required production redirect origins;
- remove any staging-only or temporary preview URLs that are no longer required;
- verify `/auth/confirm` is reachable on the intended production host.

Any domain change requires retesting Auth email links.

---

## 6. Invite email template — BLOCKING BEFORE CENTER INVITATIONS

The hosted Supabase **Invite user** template must remain functionally equivalent to:

`supabase/templates/invite.html`

Required behavior:

- application origin comes from `{{ .SiteURL }}`;
- invite token uses `{{ .TokenHash }}`;
- link routes to `/auth/confirm`;
- query contains `type=invite`;
- the recipient is not allowed to choose role or Center binding.

The canonical flow is:

`/auth/confirm?token_hash=<token>&type=invite`

Do not silently replace it with a generic direct `ConfirmationURL` flow without a security review.

---

## 7. Custom SMTP — BLOCKING BEFORE REAL PRODUCTION INVITATIONS

Supabase default email delivery may be used only for limited development/rehearsal where its restrictions are acceptable.

Before real production invitations are relied upon, configure a dedicated SMTP provider such as a selected transactional email service.

Verify:

- SMTP host;
- port;
- username;
- credential/password;
- sender address;
- sender display name where supported;
- SPF;
- DKIM;
- DMARC;
- delivery to an external mailbox;
- Auth email rate limits appropriate for expected operational volume.

SMTP credentials must remain outside the repository.

---

## 8. Storage configuration — BLOCKING FOR FILE FEATURES

### `product-assets`

A hosted environment must contain a private bucket matching the repository baseline:

- bucket: `product-assets`
- public: **false**
- max file size: **20 MiB**
- allowed MIME types:
  - `image/jpeg`
  - `image/png`
  - `image/webp`
  - `image/avif`
  - `application/pdf`

Do not make this bucket public to solve upload/read issues. Fix policies or signed/authenticated access instead.

### `roll-preinstall-issue-evidence`

Verify that the environment contains the committed evidence bucket and that it remains private with its migration-defined policies.

If a bucket is expected to be migration-created, verify migration state first instead of creating a divergent manual copy.

---

## 9. Vercel project and Git integration

The current application is a Next.js project and the intended managed host is Vercel.

For staging:

1. Connect Vercel to `delightfactory/protection-giants-platform`.
2. Deploy the approved staging/development branch as a Preview environment.
3. Scope staging values to the **Preview** environment.
4. Validate the generated Vercel URL before attaching the custom staging domain.
5. Attach `preview.protectiongiants.com` only after the deployment is healthy.

For production:

1. Do not promote/deploy until release qualification is complete.
2. Use production-only environment values.
3. Attach the final public/portal domains only after hostname routing and access boundaries are verified.
4. Verify TLS/HTTPS and redirects after DNS propagation.

A Vercel Preview deployment is not the same thing as production merely because it has a custom domain.

---

## 10. Required application environment variables

Reference: `.env.example`.

Every hosted environment requires the correct environment-specific values for:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
NEXT_PUBLIC_SITE_URL=

NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY=
WEB_PUSH_VAPID_PRIVATE_KEY=
WEB_PUSH_VAPID_SUBJECT=
PUSH_WORKER_SECRET=
```

Rules:

- `NEXT_PUBLIC_SUPABASE_URL` and the publishable key may be exposed to the browser as designed.
- `SUPABASE_SECRET_KEY` is server-only.
- `WEB_PUSH_VAPID_PRIVATE_KEY` is server-only.
- `PUSH_WORKER_SECRET` is server-only and must be a strong random value of at least 32 characters.
- Never place any server-only secret in a `NEXT_PUBLIC_` variable.
- Do not copy staging secrets into production.

`SUPABASE_SERVICE_ROLE_KEY` remains only a local/legacy fallback where the application explicitly supports it; prefer the current hosted secret-key contract for new environments.

---

## 11. Web Push runtime — BLOCKING FOR LIVE PUSH DELIVERY

Cube L Web Push uses the Next.js application runtime, not a Supabase Edge Function.

Internal worker endpoint:

`POST /api/internal/push-worker`

A hosted environment that needs live push delivery requires:

- one VAPID key pair;
- `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY`;
- server-only `WEB_PUSH_VAPID_PRIVATE_KEY`;
- `WEB_PUSH_VAPID_SUBJECT`;
- server-only `PUSH_WORKER_SECRET`;
- an authenticated scheduled caller for the worker endpoint.

The scheduler must call the internal endpoint using the agreed Bearer secret.

Until a scheduler is configured, queued Web Push work may remain in the database without being delivered.

Do not expose the worker secret to client code.

---

## 12. Scheduler / Cron — REQUIRED FOR AUTOMATIC PUSH DISPATCH

The repository currently treats scheduling as deployment infrastructure rather than a Supabase Edge Function.

An approved scheduler may be implemented using Vercel Cron, GitHub Actions, or another controlled external scheduler.

Before enabling it:

1. choose and document the scheduler provider;
2. choose the execution cadence based on the final notification SLA;
3. store the bearer secret in the scheduler's secure secret store;
4. call only the HTTPS worker endpoint;
5. verify unauthorized calls are rejected;
6. verify one scheduled invocation processes work safely;
7. verify retries do not create duplicate user-visible notifications;
8. add monitoring for repeated failures.

Do not hard-code a production cadence in this runbook until the product/runtime decision is approved.

---

## 13. DNS / GoDaddy

The authoritative domain is managed in GoDaddy.

For any Vercel custom domain:

1. add the domain to the Vercel project first;
2. use the exact DNS record Vercel requests;
3. add/update the required DNS record in GoDaddy;
4. do not replace unrelated existing DNS records;
5. wait for Vercel domain verification;
6. verify HTTPS certificate issuance;
7. verify the intended host reaches the intended environment.

Typical subdomains such as `preview` or `portal` are normally connected using a CNAME, but the exact target must always come from the current Vercel domain configuration rather than being hard-coded in repository documentation.

---

## 14. Staging rehearsal checklist

Before staging is considered useful for live testing:

- [ ] full migration chain applied;
- [ ] database verification/smoke checks pass;
- [ ] Security Advisor findings reviewed;
- [ ] public signup disabled;
- [ ] anonymous and phone Auth disabled;
- [ ] staging Site URL configured;
- [ ] staging redirect URLs configured;
- [ ] Invite template matches repository;
- [ ] `product-assets` exists and is private;
- [ ] evidence bucket exists and is private where required;
- [ ] Vercel Preview deployment is healthy;
- [ ] all Preview environment variables configured;
- [ ] stable staging domain resolves over HTTPS;
- [ ] login tested from desktop and real mobile devices;
- [ ] role/RLS boundaries tested with more than one role;
- [ ] invitation flow tested when email delivery is available;
- [ ] product asset upload/read path tested;
- [ ] PWA install/update path tested;
- [ ] Web Push subscription tested;
- [ ] scheduled push delivery tested once scheduler is enabled;
- [ ] logs reviewed for leaked secrets or unexpected authorization errors.

---

## 15. Production launch order

Use this order to avoid circular configuration mistakes:

1. Create the production Supabase project.
2. Apply and verify the complete migration chain.
3. Review Security Advisor findings.
4. Verify Data API/RLS/grants.
5. Configure Auth provider policy.
6. Verify/create required private Storage buckets.
7. Create/configure the Vercel production environment.
8. Add production Supabase and application environment variables.
9. Establish final production hostname routing.
10. Attach production domains and complete DNS verification.
11. Set Supabase Site URL and allowed redirects to the final HTTPS origins.
12. Apply/verify the canonical Invite template.
13. Configure custom SMTP and validate external delivery.
14. Configure VAPID keys and Push Worker secret.
15. Configure and test the approved scheduler.
16. Bootstrap the first production administrator through the trusted process.
17. Run the production smoke test and multi-role authorization checks.
18. Record deployment sign-off.
19. Only then consider the production environment released.

---

## 16. Production sign-off record

Record the following without secrets:

- environment name;
- Supabase project name/reference;
- Vercel project name;
- deployed Git commit SHA;
- public domain;
- portal domain;
- migration chain verified: yes/no;
- Security Advisor reviewed: yes/no;
- public signup disabled: yes/no;
- anonymous sign-in disabled: yes/no;
- phone Auth disabled: yes/no;
- Site URL verified: yes/no;
- redirect URLs reviewed: yes/no;
- Invite template verified: yes/no;
- custom SMTP configured: yes/no;
- external invite delivery tested: yes/no;
- SPF/DKIM/DMARC verified: yes/no;
- `product-assets` verified private: yes/no;
- evidence bucket verified private: yes/no;
- Vercel environment variables verified: yes/no;
- Web Push VAPID configuration verified: yes/no;
- scheduler configured and tested: yes/no;
- first production administrator verified: yes/no;
- production smoke test passed: yes/no;
- release date;
- responsible reviewer.

---

## Repository references

- `supabase/config.toml` — local Supabase configuration baseline.
- `supabase/templates/invite.html` — canonical Center invite template.
- `.env.example` — hosted runtime variable contract.
- `docs/production-supabase-readiness.md` — deeper Supabase production checklist.
- `app/auth/confirm/route.ts` — controlled Auth invite confirmation route.
- `/api/internal/push-worker` — hosted Web Push worker endpoint.

## Maintenance rule

Whenever a new feature introduces a hosted dependency that cannot be reproduced solely by migrations/application code, update this runbook in the same development cube or release-hardening increment.

Do not rely on memory or an old staging dashboard when configuring production.
