grant insert on table public.products to authenticated;

create policy "products_admin_insert"
on public.products
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
