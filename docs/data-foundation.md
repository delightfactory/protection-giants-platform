# Data Foundation

This document defines the minimum database integration rules for the platform.

## Scope of this block

Included:
- Supabase browser and server client factories.
- Environment variable contract.
- Database migration convention.
- Node.js 22 runtime alignment.
- Local database validation in GitHub Actions.

Not included:
- Authentication flows.
- User profiles or roles.
- Business tables.
- Storage buckets.
- Edge Functions.
- Realtime subscriptions.
- A hosted Supabase project during the current development stage.

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
- Create migration files through the Supabase CLI before adding SQL.
- Never edit an already-applied migration to change production state.
- Never make manual production schema changes without an equivalent migration.
- Keep each migration focused on one coherent change.
- Add RLS and policies in the same block that introduces a sensitive exposed table.

## Database validation

The repository does not require a hosted Supabase project during normal development.

Pull requests that change `supabase/**` run a separate database-quality workflow. The workflow:

1. Installs the pinned Supabase CLI.
2. Creates a fresh local Supabase project on the GitHub runner.
3. Starts a clean local database and applies the committed migrations.
4. Fails the pull request if the local stack or migrations cannot start cleanly.
5. Removes the temporary local stack after validation.

This gives migrations a real PostgreSQL/Supabase execution check without consuming a hosted project.

## Generated database types

Database types should be generated from the validated local schema once the first real application table exists. They do not depend on creating the production Supabase project first.
