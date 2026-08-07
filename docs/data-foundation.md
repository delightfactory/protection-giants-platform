# Data Foundation

This document defines the minimum database integration rules for the platform.

## Scope of this block

Included:
- Supabase browser and server client factories.
- Environment variable contract.
- Database migration convention.
- Node.js 22 runtime alignment.
- Local database validation in GitHub Actions.
- Generated TypeScript database definitions.

Not included:
- Business tables beyond their own approved cubes.
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
- The shared clients use the generated `Database` type so queries are checked against the committed schema.
- Authentication session refresh is handled separately by the request Proxy.

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

Pull requests that change database migrations, the generated database type file, or the database-quality workflow run a separate database-quality check. The workflow:

1. Installs the pinned Supabase CLI.
2. Creates a fresh local Supabase project on the GitHub runner.
3. Starts a clean local database and applies every committed migration.
4. Generates TypeScript definitions from that local schema.
5. Compares the generated output with `lib/supabase/database.types.ts` and fails if they differ.
6. Removes the temporary local stack after validation.

This gives migrations a real PostgreSQL/Supabase execution check and keeps application types synchronized without consuming a hosted project.

## Generated database types

`lib/supabase/database.types.ts` is generated from the validated local schema using the Supabase CLI. It is committed to Git and must not be hand-maintained as an independent schema definition.

Whenever a migration changes the schema, regenerate this file from the local database before the pull request can pass Database Quality.
