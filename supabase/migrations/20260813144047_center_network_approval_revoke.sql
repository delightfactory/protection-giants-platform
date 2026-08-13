-- Center Network Approval Foundation (Cube B)
-- Explicit revoke transition kept separate to keep the CLI-generated migrations reviewable.

create or replace function public.revoke_center_network_approval(p_center_id uuid)
returns table (
  installation_center_id uuid,
  approval_status text,
  approved_at timestamptz,
  approved_by_profile_id uuid,
  changed boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  caller_role text;
  caller_agent_id uuid;
  target public.installation_centers%rowtype;
  event_time timestamptz := clock_timestamp();
begin
  if caller_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  select p.role, p.country_agent_id
    into caller_role, caller_agent_id
  from public.profiles p
  where p.id = caller_id
    and p.status = 'active'
    and (
      (p.role = 'admin' and p.country_agent_id is null and p.dealer_id is null and p.installation_center_id is null)
      or
      (p.role = 'agent' and p.country_agent_id is not null and p.dealer_id is null and p.installation_center_id is null)
    );

  if caller_role = 'admin' then
    select c.* into target
    from public.installation_centers c
    where c.id = p_center_id
    for update;
  elsif caller_role = 'agent' and caller_agent_id is not null then
    if not exists (
      select 1
      from public.country_agents ca
      where ca.id = caller_agent_id
        and ca.status = 'active'
    ) then
      raise exception using errcode = '42501', message = 'active Country Agent required';
    end if;

    select c.* into target
    from public.installation_centers c
    left join public.dealers d on d.id = c.dealer_id
    where c.id = p_center_id
      and (
        c.country_agent_id = caller_agent_id
        or d.country_agent_id = caller_agent_id
      )
    for update of c;
  else
    raise exception using errcode = '42501', message = 'Admin or responsible Country Agent required';
  end if;

  if target.id is null then
    raise exception using errcode = 'P0002', message = 'Center not found in approval scope';
  end if;

  if target.approval_status = 'unapproved' then
    return query
    select target.id, target.approval_status, null::timestamptz, null::uuid, false;
    return;
  end if;

  update public.installation_centers c
  set approval_status = 'unapproved',
      approved_at = null,
      approved_by_profile_id = null
  where c.id = target.id;

  insert into public.center_network_approval_events (
    installation_center_id,
    action,
    actor_profile_id,
    occurred_at
  )
  values (
    target.id,
    'revoked',
    caller_id,
    event_time
  );

  return query
  select target.id, 'unapproved'::text, null::timestamptz, null::uuid, true;
end;
$$;

revoke all on function public.revoke_center_network_approval(uuid) from public;
revoke all on function public.revoke_center_network_approval(uuid) from anon;
revoke all on function public.revoke_center_network_approval(uuid) from service_role;
grant execute on function public.revoke_center_network_approval(uuid) to authenticated;
