-- Agent & Network Foundation — increment 3
-- Expand entity visibility and child management to the approved Admin/Agent/Dealer/Center scopes.

-- Country Agents are deliberately exposed only through authenticated RLS paths.
grant select, insert on table public.country_agents to authenticated;
grant update (code, name, country_code, status)
  on table public.country_agents
  to authenticated;

grant update (country_agent_id)
  on table public.dealers
  to authenticated;

grant update (country_agent_id)
  on table public.installation_centers
  to authenticated;

-- Replace the previous Admin/Dealer/Center-only policies with the complete
-- network model. Suspended children remain visible to an active authorized
-- parent so they can be reactivated; suspension never cascades to children.
drop policy if exists "dealers_read_operational_scope" on public.dealers;
drop policy if exists "dealers_admin_insert" on public.dealers;
drop policy if exists "dealers_admin_update_core" on public.dealers;
drop policy if exists "installation_centers_read_operational_scope" on public.installation_centers;
drop policy if exists "installation_centers_admin_insert" on public.installation_centers;
drop policy if exists "installation_centers_admin_update_core" on public.installation_centers;

create policy "country_agents_read_operational_scope"
on public.country_agents
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.status = 'active'
      and (
        p.role = 'admin'
        or (
          p.role = 'agent'
          and p.country_agent_id = country_agents.id
          and country_agents.status = 'active'
        )
      )
  )
);

create policy "country_agents_admin_insert"
on public.country_agents
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.status = 'active'
      and p.role = 'admin'
  )
);

create policy "country_agents_admin_update"
on public.country_agents
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.status = 'active'
      and p.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.status = 'active'
      and p.role = 'admin'
  )
);

create policy "dealers_read_operational_scope"
on public.dealers
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.status = 'active'
      and (
        p.role = 'admin'
        or (
          p.role = 'agent'
          and p.country_agent_id = dealers.country_agent_id
          and exists (
            select 1
            from public.country_agents ca
            where ca.id = p.country_agent_id
              and ca.status = 'active'
          )
        )
        or (
          p.role = 'dealer'
          and p.dealer_id = dealers.id
          and dealers.status = 'active'
        )
      )
  )
);

create policy "dealers_network_insert"
on public.dealers
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.status = 'active'
      and (
        p.role = 'admin'
        or (
          p.role = 'agent'
          and p.country_agent_id = dealers.country_agent_id
          and exists (
            select 1
            from public.country_agents ca
            where ca.id = p.country_agent_id
              and ca.status = 'active'
          )
        )
      )
  )
);

create policy "dealers_network_update"
on public.dealers
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.status = 'active'
      and (
        p.role = 'admin'
        or (
          p.role = 'agent'
          and p.country_agent_id = dealers.country_agent_id
          and exists (
            select 1
            from public.country_agents ca
            where ca.id = p.country_agent_id
              and ca.status = 'active'
          )
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.status = 'active'
      and (
        p.role = 'admin'
        or (
          p.role = 'agent'
          and p.country_agent_id = dealers.country_agent_id
          and exists (
            select 1
            from public.country_agents ca
            where ca.id = p.country_agent_id
              and ca.status = 'active'
          )
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
    from public.profiles p
    where p.id = (select auth.uid())
      and p.status = 'active'
      and (
        p.role = 'admin'
        or (
          p.role = 'agent'
          and exists (
            select 1
            from public.country_agents ca
            where ca.id = p.country_agent_id
              and ca.status = 'active'
          )
          and (
            installation_centers.country_agent_id = p.country_agent_id
            or installation_centers.dealer_id in (
              select d.id
              from public.dealers d
              where d.country_agent_id = p.country_agent_id
            )
          )
        )
        or (
          p.role = 'dealer'
          and installation_centers.dealer_id = p.dealer_id
          and exists (
            select 1
            from public.dealers d
            where d.id = p.dealer_id
              and d.status = 'active'
          )
        )
        or (
          p.role = 'center'
          and p.installation_center_id = installation_centers.id
          and installation_centers.status = 'active'
        )
      )
  )
);

create policy "installation_centers_network_insert"
on public.installation_centers
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.status = 'active'
      and (
        p.role = 'admin'
        or (
          p.role = 'agent'
          and exists (
            select 1
            from public.country_agents ca
            where ca.id = p.country_agent_id
              and ca.status = 'active'
          )
          and (
            (
              installation_centers.country_agent_id = p.country_agent_id
              and installation_centers.dealer_id is null
            )
            or (
              installation_centers.country_agent_id is null
              and installation_centers.dealer_id in (
                select d.id
                from public.dealers d
                where d.country_agent_id = p.country_agent_id
              )
            )
          )
        )
        or (
          p.role = 'dealer'
          and installation_centers.country_agent_id is null
          and installation_centers.dealer_id = p.dealer_id
          and exists (
            select 1
            from public.dealers d
            where d.id = p.dealer_id
              and d.status = 'active'
          )
        )
      )
  )
);

create policy "installation_centers_network_update"
on public.installation_centers
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.status = 'active'
      and (
        p.role = 'admin'
        or (
          p.role = 'agent'
          and exists (
            select 1
            from public.country_agents ca
            where ca.id = p.country_agent_id
              and ca.status = 'active'
          )
          and (
            installation_centers.country_agent_id = p.country_agent_id
            or installation_centers.dealer_id in (
              select d.id
              from public.dealers d
              where d.country_agent_id = p.country_agent_id
            )
          )
        )
        or (
          p.role = 'dealer'
          and installation_centers.dealer_id = p.dealer_id
          and exists (
            select 1
            from public.dealers d
            where d.id = p.dealer_id
              and d.status = 'active'
          )
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.status = 'active'
      and (
        p.role = 'admin'
        or (
          p.role = 'agent'
          and exists (
            select 1
            from public.country_agents ca
            where ca.id = p.country_agent_id
              and ca.status = 'active'
          )
          and (
            (
              installation_centers.country_agent_id = p.country_agent_id
              and installation_centers.dealer_id is null
            )
            or (
              installation_centers.country_agent_id is null
              and installation_centers.dealer_id in (
                select d.id
                from public.dealers d
                where d.country_agent_id = p.country_agent_id
              )
            )
          )
        )
        or (
          p.role = 'dealer'
          and installation_centers.country_agent_id is null
          and installation_centers.dealer_id = p.dealer_id
          and exists (
            select 1
            from public.dealers d
            where d.id = p.dealer_id
              and d.status = 'active'
          )
        )
      )
  )
);
