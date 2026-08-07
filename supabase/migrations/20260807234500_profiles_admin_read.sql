create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
grant usage on schema private to authenticated;

create function private.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.status = 'active'
      and profiles.role = 'admin'
  );
$$;

revoke all on function private.is_active_admin() from public;
revoke all on function private.is_active_admin() from anon;
grant execute on function private.is_active_admin() to authenticated;

create policy "profiles_admin_read"
on public.profiles
for select
to authenticated
using ((select private.is_active_admin()));
