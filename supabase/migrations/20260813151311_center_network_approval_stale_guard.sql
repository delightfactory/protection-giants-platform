-- Center Network Approval stale-location guard (Review 1 hardening).
-- The operator must approve the same location snapshot that was reviewed in the UI.

drop function public.approve_center_network(uuid);

create function public.approve_center_network(
  p_center_id uuid,
  p_expected_location_captured_at timestamptz
)
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

  if target.status <> 'active' then
    raise exception using errcode = '55000', message = 'Center must be active before network approval';
  end if;

  if target.latitude is null
    or target.longitude is null
    or target.location_captured_at is null
    or target.location_source is null
    or target.location_updated_by_profile_id is null
  then
    raise exception using errcode = '55000', message = 'Center must have a valid current location before network approval';
  end if;

  if target.approval_status = 'approved' then
    return query
    select target.id, target.approval_status, target.approved_at, target.approved_by_profile_id, false;
    return;
  end if;

  if p_expected_location_captured_at is null
    or target.location_captured_at is distinct from p_expected_location_captured_at
  then
    raise exception using
      errcode = '55000',
      message = 'Center location changed; review the current location before network approval';
  end if;

  update public.installation_centers c
  set approval_status = 'approved',
      approved_at = event_time,
      approved_by_profile_id = caller_id
  where c.id = target.id;

  insert into public.center_network_approval_events (
    installation_center_id,
    action,
    actor_profile_id,
    occurred_at
  )
  values (
    target.id,
    'approved',
    caller_id,
    event_time
  );

  return query
  select target.id, 'approved'::text, event_time, caller_id, true;
end;
$$;

revoke all on function public.approve_center_network(uuid, timestamptz) from public;
revoke all on function public.approve_center_network(uuid, timestamptz) from anon;
revoke all on function public.approve_center_network(uuid, timestamptz) from service_role;
grant execute on function public.approve_center_network(uuid, timestamptz) to authenticated;
