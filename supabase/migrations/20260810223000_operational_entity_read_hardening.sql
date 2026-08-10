-- Keep direct Data API entity reads aligned with the application operational gate.
-- A suspended dealer blocks dealer-bound users; a suspended center blocks center-bound users.
-- Dealer suspension intentionally does not cascade to separately active center-bound users.

drop policy "dealers_read_operational_scope" on public.dealers;

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
          and dealers.status = 'active'
        )
      )
  )
);

drop policy "installation_centers_read_operational_scope" on public.installation_centers;

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
          and exists (
            select 1
            from public.dealers
            where dealers.id = profiles.dealer_id
              and dealers.status = 'active'
          )
        )
        or (
          profiles.role = 'center'
          and profiles.installation_center_id = installation_centers.id
          and installation_centers.status = 'active'
        )
      )
  )
);
