-- Supabase's hosted `authenticated` role has a short default statement timeout.
-- Production generation is intentionally bounded at 10,000 Rolls, but that
-- single atomic REST RPC can legitimately require more time than the role
-- default on small hosted compute. Scope the exemption to this function only;
-- do not broaden the timeout for the authenticated role or the whole database.

alter function public.create_production_order(uuid, uuid, date, jsonb, text, text)
  set statement_timeout to '60s';

comment on function public.create_production_order(uuid, uuid, date, jsonb, text, text) is
  'Atomic/idempotent Production Order generator. Function-local 60s timeout supports the bounded 10,000-Roll contract through the hosted Data REST API without changing global role timeouts.';
