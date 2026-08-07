grant insert on table public.dealers to authenticated;

create policy "dealers_admin_insert"
on public.dealers
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
