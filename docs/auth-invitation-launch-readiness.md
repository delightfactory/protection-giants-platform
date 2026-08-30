# Protection Giants — Center Invitation & Auth Launch Readiness

**Date:** 2026-08-30  
**Baseline reviewed:** `829e716fc9d1c94177d85096fad326e519aba694`  
**Status:** planning / launch-readiness note only. No product code or hosted Supabase setting is changed by this document.

## 1. Accepted V1 credential decision

For ordinary Admin-created operational users, keep the current simple V1 model:

- Admin may create the account with an initial password;
- the user will receive a small authenticated "change my password" capability;
- Admin password reset remains an exceptional recovery path;
- do **not** introduce a generic invitation/reset subsystem, forced-first-login state machine, or custom recovery-token backend merely for architectural purity.

Center first-account onboarding remains different and already uses recipient-owned password selection through the invitation flow described below.

## 2. Center invitation source-path review

The current source path is coherent end-to-end:

1. An authorized Admin/Agent/Dealer sends the first-account invitation from Center administration.
2. The application creates a `center_onboarding_invitations` audit row and refuses simultaneous conflicting invitations / an already-onboarded Center.
3. The server calls Supabase Auth `inviteUserByEmail()` from the trusted server client and binds the generated Auth user id to the pending invitation.
4. The committed invite template does **not** use the default `ConfirmationURL`. It constructs:
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite`.
5. `/auth/confirm` accepts only `type=invite`, calls `verifyOtp(... type: "invite")`, establishes the Supabase session through the server client, then redirects to `/onboarding/center`.
6. `/onboarding/center` verifies that:
   - the authenticated Auth user is exactly the user bound to the invitation;
   - the email still matches the invited email;
   - the invitation is still usable and not review-blocked;
   - the Center still exists and is active;
   - no other Center profile was created concurrently.
7. The recipient enters their display name, optional phone, and **their own new password**.
8. The server stages the password/user metadata, claims the invitation, re-checks mutable conditions, then writes protected `app_metadata.pg_provisioning` for the exact Center.
9. The protected provisioning path creates the operational Center profile. The onboarding action re-reads and verifies the exact role, Center binding, status and personal fields before allowing success.
10. On success, the onboarding notification is materialized and the recipient is redirected directly to `/operations` in the authenticated session.
11. Future normal login is email + the password selected by the recipient through `signInWithPassword()`, then `/operations`.

The flow also contains cancellation/reissue and race/reconciliation paths so a stale invitation or concurrent first account does not silently create a second operational identity.

## 3. Source-level conclusion

**Application/source contract: PASS.**

No additional backend workflow is required to make the intended Center invitation end in a real account with a recipient-selected password and subsequent normal login.

However this source-level PASS is **not** a Hosted Supabase launch PASS. The email link deliberately depends on hosted Auth settings and the hosted email template.

## 4. Hosted Supabase settings required before launch

### A. Auth Site URL — REQUIRED

The hosted project's Authentication URL Configuration must set **Site URL** to the final application origin that actually hosts `/auth/confirm`.

The invite template uses `{{ .SiteURL }}` directly. If the Hosted Site URL remains `localhost`, the email will contain a localhost link and the real recipient cannot onboard.

If the final architecture uses a dedicated operations/portal subdomain, the Site URL must point to that application origin (or the invite template strategy must be deliberately changed). Do not guess the final hostname before launch DNS/domain architecture is frozen.

### B. Hosted Invite User email template — REQUIRED

The repository contains the correct local template at `supabase/templates/invite.html`, but `supabase/config.toml` is a local/CLI development configuration. For a Hosted Supabase project, the **Invite user** email template must be configured in the Dashboard to preserve the TokenHash SSR link:

`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite`

Do not leave the hosted invite template on the default direct `{{ .ConfirmationURL }}` path for this SSR flow.

### C. Custom SMTP — REQUIRED for real external Center invitations

Before production use, configure a real SMTP provider in Supabase Auth.

Supabase's built-in SMTP is intended for development/testing and is restricted; current Supabase guidance states that without custom SMTP, Auth email delivery is limited to pre-authorized/team addresses and is not appropriate for production invitations to arbitrary Center emails.

This is a launch configuration task, **not** a new application backend.

When custom SMTP is enabled, disable provider link-tracking for these Auth emails because rewriting the invitation URL can break single-use Auth links.

### D. Invitation / Email OTP expiration — REVIEW and freeze

Supabase invitation links use the Email OTP expiration setting; current documentation states the default is one hour.

For real Centers that may not open the email immediately, review this setting during launch preparation and choose a practical value. This is a configuration decision only. The application already handles an expired link safely and tells the user to request a reissued invitation.

### E. Public signup remains disabled — REQUIRED verification

The committed local contract has global public signup disabled and permanent verification checks that it remains disabled locally.

The Hosted project must be checked again during launch preparation to ensure public signup remains disabled. Center accounts must continue to enter through the controlled invitation path, not an unrestricted signup page.

### F. Redirect URL allow-list — configure for environment hygiene

The current Center invite link does not depend on `redirectTo`; `inviteUserByEmail()` is called without a redirect override and the custom template uses `SiteURL` directly.

Therefore the Redirect URL allow-list is **not the critical dependency for this exact Center invitation path**.

Still configure the approved staging/production origins deliberately during launch preparation so future/other Auth redirect flows do not fall back unpredictably. Do not use broad production wildcards unless explicitly justified.

## 5. What can and cannot be verified now

The repository/source path and its local contract tests can be reviewed now and are coherent.

The currently connected Supabase account visible to this session exposes only:

- `web-carcare`;
- `NEW-EDARA-SYS`.

The Protection Giants hosted Supabase project is not currently visible through the connected Supabase tooling. Therefore this review **does not claim** that the hosted PG Site URL, Invite template, SMTP, OTP expiry or public-signup settings are currently correct.

Do not modify either visible unrelated project in an attempt to validate PG.

## 6. Launch acceptance test — REQUIRED, not development

After the actual PG Hosted Supabase settings are configured, execute one real staging acceptance with a non-team external email address:

1. create/use an active Center with no operational profile;
2. send the first-account invitation from the real hosted UI;
3. prove the email is delivered to the external mailbox;
4. inspect that the button points to the intended PG application origin and `/auth/confirm`;
5. click the link;
6. prove `/onboarding/center` opens with the exact Center and invited email;
7. choose a new password and complete onboarding;
8. prove the user lands in `/operations` with Center scope;
9. log out;
10. log in again from `/login` using the invited email + chosen password;
11. prove the same Center-scoped operations access is restored;
12. separately prove an expired/cancelled invitation fails safely and a reissued invitation succeeds.

This hosted acceptance is the final evidence that email delivery + Supabase Auth configuration + SSR token exchange + application provisioning all work together.

## 7. Current disposition

- **Center invitation backend redesign:** NOT REQUIRED.
- **Recipient-selected Center password:** ALREADY IMPLEMENTED.
- **Future normal Center login:** ALREADY IMPLEMENTED.
- **Hosted Auth configuration:** REQUIRED during launch preparation.
- **Custom SMTP:** REQUIRED before inviting real external Centers in production.
- **Real hosted invitation acceptance test:** REQUIRED before launch sign-off.
