-- Agent & Network Foundation — complete the operational reference-data gate.
-- Product remains read-only for non-Admin operational roles.

drop policy if exists "products_operational_read" on public.products;

create policy "products_operational_read"
on public.products
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.status = 'active'
      and (
        (
          p.role = 'admin'
          and p.country_agent_id is null
          and p.dealer_id is null
          and p.installation_center_id is null
        )
        or (
          p.role = 'agent'
          and p.country_agent_id is not null
          and p.dealer_id is null
          and p.installation_center_id is null
          and exists (
            select 1
            from public.country_agents ca
            where ca.id = p.country_agent_id
              and ca.status = 'active'
          )
        )
        or (
          p.role = 'dealer'
          and p.country_agent_id is null
          and p.dealer_id is not null
          and p.installation_center_id is null
          and exists (
            select 1
            from public.dealers d
            where d.id = p.dealer_id
              and d.status = 'active'
          )
        )
        or (
          p.role = 'center'
          and p.country_agent_id is null
          and p.dealer_id is null
          and p.installation_center_id is not null
          and exists (
            select 1
            from public.installation_centers c
            where c.id = p.installation_center_id
              and c.status = 'active'
          )
        )
      )
  )
);
