-- Cube D — ordinary operational users see only eligible Rolls in their own confirmed custody.

create function private.current_active_operational_party_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select op.id
  from public.profiles p
  join public.operational_parties op
    on (
      (p.role = 'agent' and op.party_type = 'agent' and op.country_agent_id = p.country_agent_id)
      or (p.role = 'dealer' and op.party_type = 'dealer' and op.dealer_id = p.dealer_id)
      or (p.role = 'center' and op.party_type = 'center' and op.installation_center_id = p.installation_center_id)
    )
  where p.id = (select auth.uid())
    and p.status = 'active'
    and (
      (p.role = 'agent' and exists (
        select 1 from public.country_agents ca
        where ca.id = p.country_agent_id and ca.status = 'active'
      ))
      or (p.role = 'dealer' and exists (
        select 1 from public.dealers d
        where d.id = p.dealer_id and d.status = 'active'
      ))
      or (p.role = 'center' and exists (
        select 1 from public.installation_centers c
        where c.id = p.installation_center_id and c.status = 'active'
      ))
    )
  limit 1
$$;

revoke all on function private.current_active_operational_party_id()
  from public, anon, service_role;
grant execute on function private.current_active_operational_party_id()
  to authenticated;

create function private.production_order_is_generated(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.production_orders po
    where po.id = p_order_id
      and po.status = 'generated'
  )
$$;

revoke all on function private.production_order_is_generated(uuid)
  from public, anon, service_role;
grant execute on function private.production_order_is_generated(uuid)
  to authenticated;

create policy "rolls_current_holder_read"
on public.rolls
for select
to authenticated
using (
  custodian_party_id = (select private.current_active_operational_party_id())
  and (select private.production_order_is_generated(production_order_id))
);
