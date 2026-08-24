-- Cube L — Notification Foundation, increment 3B
-- Materialize the frozen Center location / network-approval notification catalog.
-- Push transport remains a later increment.

create function private.notification_center_profile_ids(p_center_id uuid)
returns table (profile_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select recipients.profile_id
  from public.operational_parties op
  cross join lateral private.notification_party_profile_ids(op.id) recipients
  where op.party_type = 'center'
    and op.installation_center_id = p_center_id;
$$;

revoke all on function private.notification_center_profile_ids(uuid)
  from public, anon, authenticated, service_role;

create function private.notification_center_approval_profile_ids(p_center_id uuid)
returns table (profile_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  with center_context as (
    select
      c.id,
      c.status,
      c.dealer_id,
      c.country_agent_id,
      coalesce(c.country_agent_id, d.country_agent_id) as responsible_agent_id
    from public.installation_centers c
    left join public.dealers d on d.id = c.dealer_id
    where c.id = p_center_id
  ), responsible_party as (
    select op.id as party_id
    from center_context context
    join public.operational_parties op
      on (
        context.responsible_agent_id is not null
        and op.party_type = 'agent'
        and op.country_agent_id = context.responsible_agent_id
      )
      or (
        context.responsible_agent_id is null
        and context.dealer_id is null
        and context.country_agent_id is null
        and op.party_type = 'company'
      )
    where context.status = 'active'
  )
  select recipients.profile_id
  from responsible_party party
  cross join lateral private.notification_party_profile_ids(party.party_id) recipients;
$$;

revoke all on function private.notification_center_approval_profile_ids(uuid)
  from public, anon, authenticated, service_role;

create function private.materialize_center_location_notification_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_center_name text;
  v_center_status text;
  v_approval_status text;
  v_source_event_key text := 'center_location_events:' || new.id::text;
  v_action_path text := '/operations/centers/' || new.installation_center_id::text || '/approval';
begin
  if new.source <> 'center_device' then
    return new;
  end if;

  select c.name, c.status, c.approval_status
    into v_center_name, v_center_status, v_approval_status
  from public.installation_centers c
  where c.id = new.installation_center_id;

  if not found then
    raise exception using errcode = '23514', message = 'PG_NOTIFICATION_CENTER_MISSING';
  end if;

  if v_center_status <> 'active' or v_approval_status = 'approved' then
    return new;
  end if;

  insert into public.notifications (
    recipient_profile_id,
    event_type,
    source_domain,
    source_event_key,
    attention_level,
    title,
    body,
    action_path,
    push_eligible,
    created_at
  )
  select
    recipients.profile_id,
    'center.location_approval_required',
    'center_location',
    v_source_event_key,
    'action_required',
    'موقع مركز بانتظار الاعتماد',
    'سجّل مركز ' || v_center_name || ' موقعه من الجهاز وأصبح جاهزًا لمراجعة الاعتماد.',
    v_action_path,
    true,
    new.captured_at
  from private.notification_center_approval_profile_ids(new.installation_center_id) recipients
  on conflict (recipient_profile_id, source_domain, source_event_key, event_type)
  do nothing;

  return new;
end;
$$;

revoke all on function private.materialize_center_location_notification_event()
  from public, anon, authenticated, service_role;

create trigger center_location_events_notification_materializer
  after insert on public.center_location_events
  for each row
  execute function private.materialize_center_location_notification_event();

create function private.materialize_center_network_approval_notification_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_event_key text := 'center_network_approval_events:' || new.id::text;
  v_event_type text;
  v_attention_level text;
  v_title text;
  v_body text;
begin
  if new.action = 'approved' then
    v_event_type := 'center.network_approved';
    v_attention_level := 'info';
    v_title := 'تم اعتماد المركز داخل الشبكة';
    v_body := 'تم اعتماد مركزك داخل شبكة Protection Giants. هذا الاعتماد يعبّر عن حالة الثقة بالمركز فقط.';
  elsif new.action = 'revoked' then
    v_event_type := 'center.network_approval_revoked';
    v_attention_level := 'warning';
    v_title := 'تم إلغاء اعتماد المركز';
    v_body := 'تم إلغاء اعتماد مركزك داخل شبكة Protection Giants. راجع حالة الموقع والاعتماد.';
  elsif new.action = 'location_changed' then
    v_event_type := 'center.network_approval_location_changed';
    v_attention_level := 'warning';
    v_title := 'الموقع تغيّر ويحتاج إعادة اعتماد';
    v_body := 'تغيّر الموقع المسجل للمركز، لذلك لم يعد الاعتماد السابق ساريًا ويلزم اعتماد الموقع من جديد.';
  else
    return new;
  end if;

  insert into public.notifications (
    recipient_profile_id,
    event_type,
    source_domain,
    source_event_key,
    attention_level,
    title,
    body,
    action_path,
    push_eligible,
    created_at
  )
  select
    recipients.profile_id,
    v_event_type,
    'center_network_approval',
    v_source_event_key,
    v_attention_level,
    v_title,
    v_body,
    '/operations/location',
    true,
    new.occurred_at
  from private.notification_center_profile_ids(new.installation_center_id) recipients
  on conflict (recipient_profile_id, source_domain, source_event_key, event_type)
  do nothing;

  return new;
end;
$$;

revoke all on function private.materialize_center_network_approval_notification_event()
  from public, anon, authenticated, service_role;

create trigger center_network_approval_events_notification_materializer
  after insert on public.center_network_approval_events
  for each row
  execute function private.materialize_center_network_approval_notification_event();

comment on function private.materialize_center_location_notification_event() is
  'Cube L explicit Center device-location approval notification projector. Admin location corrections remain silent here by catalog.';

comment on function private.materialize_center_network_approval_notification_event() is
  'Cube L explicit Center network-approval notification projector for approved, revoked and location_changed events.';
