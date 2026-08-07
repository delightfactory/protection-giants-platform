grant select on table public.products to authenticated;

create policy "products_admin_read"
on public.products
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.status = 'active'
      and profiles.role = 'admin'
  )
);
