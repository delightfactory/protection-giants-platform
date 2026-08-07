grant insert on table public.installation_centers to authenticated;

create policy "installation_centers_admin_insert"
on public.installation_centers
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.status = 'active'
      and profiles.role = 'admin'
  )
);
