# Authentication Session Foundation

This block establishes session handling for the operational portal without adding role-specific authorization yet.

## Included

- Email/password sign-in for provisioned operational users.
- Sign-out.
- Cookie-based Supabase Auth sessions.
- Session refresh through the Next.js root `proxy.ts`.
- Authentication protection for `/operations` routes.

## Security rules

- The Proxy validates identity with `supabase.auth.getClaims()`.
- Server authorization must not trust the user object returned by `getSession()`.
- Login errors are deliberately generic and do not reveal whether an email address exists.
- No self-signup route is exposed.
- No service-role key is used by the application.
- Public website routes do not pass through the authentication Proxy.

## Current boundary

A valid Supabase Auth session is enough to pass this block's route gate.

Profile status (`active` / `suspended`) and role authorization (`admin`, `dealer`, `center`) are intentionally deferred to the next authorization cube. Keeping that logic separate prevents authentication and business authorization from becoming one coupled layer.

## Environment

The code can compile without a hosted Supabase project. Runtime sign-in and protected-route testing will require either a local Supabase environment or the future hosted project credentials.
