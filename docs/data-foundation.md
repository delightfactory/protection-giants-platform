# Data Foundation

This document defines the minimum database integration rules for the platform.

## Scope of this block

Included:
- Supabase browser and server client factories.
- Environment variable contract.
- Database migration convention.
- Node.js 22 runtime alignment.

Not included:
- Authentication flows.
- User profiles or roles.
- Business tables.
- Storage buckets.
- Edge Functions.
- Realtime subscriptions.

## Environment variables

The application uses only the project URL and the Supabase publishable key in application code:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

The publishable key is intended for client applications and must still be protected by database RLS policies once business tables exist.

Service-role keys, database passwords, access tokens, and other privileged credentials must never be committed to Git. They belong only in secured environment settings for the runtime that needs them.

## Client boundaries

- Browser components use `getSupabaseBrowserClient()` from `lib/supabase/client.ts`.
- Server Components, Route Handlers, and Server Actions use `createSupabaseServerClient()` from `lib/supabase/server.ts`.
- Application modules must not create ad-hoc Supabase clients.
- Authentication cookie refresh is intentionally deferred to the authentication block.

## Migrations

Every schema change must be represented by an append-only migration under `supabase/migrations/`.

Naming convention:

`YYYYMMDDHHMMSS_short_description.sql`

Rules:
- Never edit an already-applied migration to change production state.
- Never make manual production schema changes without an equivalent migration.
- Keep each migration focused on one coherent change.
- Add RLS and policies in the same block that introduces a sensitive business table.

## Generated database types

Database types will be generated after the new Supabase project is created and the first schema migration exists. We do not maintain speculative database types before the schema is real.
