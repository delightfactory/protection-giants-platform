grant update (code, name, dealer_id, country_code, city)
on table public.installation_centers
to authenticated;

create policy "installation_centers_admin_update_core"
on public.installation_centers
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.status = 'active'
      and profiles.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.status = 'active'
      and profiles.role = 'admin'
  )
);
