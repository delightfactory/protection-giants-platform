-- Adopt Supabase's modern explicit Data API exposure model.
-- Existing authenticated grants remain governed by the earlier migrations and RLS policies.
-- Server-only service_role access is restricted to the tables and operations used by the Auth Admin workflows.

alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke execute on functions from public;

alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated, service_role;

revoke all on table public.profiles from service_role;
revoke all on table public.products from service_role;
revoke all on table public.dealers from service_role;
revoke all on table public.installation_centers from service_role;

grant select on table public.profiles to service_role;
grant update (display_name, phone, role, status, dealer_id, installation_center_id)
  on table public.profiles
  to service_role;

grant select on table public.dealers to service_role;
grant select on table public.installation_centers to service_role;
