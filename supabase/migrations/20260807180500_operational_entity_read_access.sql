grant select on table public.dealers to authenticated;
grant select on table public.installation_centers to authenticated;

create policy "dealers_read_operational_scope"
on public.dealers
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.status = 'active'
      and (
        profiles.role = 'admin'
        or (
          profiles.role = 'dealer'
          and profiles.dealer_id = dealers.id
        )
      )
  )
);

create policy "installation_centers_read_operational_scope"
on public.installation_centers
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.status = 'active'
      and (
        profiles.role = 'admin'
        or (
          profiles.role = 'dealer'
          and profiles.dealer_id = installation_centers.dealer_id
        )
        or (
          profiles.role = 'center'
          and profiles.installation_center_id = installation_centers.id
        )
      )
  )
);
