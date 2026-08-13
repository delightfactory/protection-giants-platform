-- Agent & Network Foundation — review hardening
-- Keep the operational party table scoped to the caller's own network.
-- Cross-network and Company recipient discovery remains available only through
-- the exact Transfer ID resolver, preventing this table from becoming a directory.

drop policy if exists "operational_parties_read_network_scope"
  on public.operational_parties;

create policy "operational_parties_read_network_scope"
on public.operational_parties
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
          and (
            operational_parties.country_agent_id = p.country_agent_id
            or operational_parties.dealer_id in (
              select d.id
              from public.dealers d
              where d.country_agent_id = p.country_agent_id
            )
            or operational_parties.installation_center_id in (
              select c.id
              from public.installation_centers c
              left join public.dealers d on d.id = c.dealer_id
              where c.country_agent_id = p.country_agent_id
                 or d.country_agent_id = p.country_agent_id
            )
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
          and (
            operational_parties.dealer_id = p.dealer_id
            or operational_parties.installation_center_id in (
              select c.id
              from public.installation_centers c
              where c.dealer_id = p.dealer_id
            )
          )
        )
        or (
          p.role = 'center'
          and p.country_agent_id is null
          and p.dealer_id is null
          and p.installation_center_id is not null
          and operational_parties.installation_center_id = p.installation_center_id
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
