-- Cube L — Notification Foundation, increment 3A
-- Materialize the frozen Transfer/Recovery event catalog from immutable
-- roll_transfer_events. Push transport remains a later increment.

create function private.notification_party_profile_ids(p_party_id uuid)
returns table (profile_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.operational_parties op
  join public.profiles p
    on p.status = 'active'
   and (
     (op.party_type = 'company'
       and p.role = 'admin'
       and p.country_agent_id is null
       and p.dealer_id is null
       and p.installation_center_id is null)
     or
     (op.party_type = 'agent'
       and p.role = 'agent'
       and p.country_agent_id = op.country_agent_id)
     or
     (op.party_type = 'dealer'
       and p.role = 'dealer'
       and p.dealer_id = op.dealer_id)
     or
     (op.party_type = 'center'
       and p.role = 'center'
       and p.installation_center_id = op.installation_center_id)
   )
  left join public.country_agents ca
    on op.party_type = 'agent'
   and ca.id = op.country_agent_id
  left join public.dealers d
    on op.party_type = 'dealer'
   and d.id = op.dealer_id
  left join public.installation_centers c
    on op.party_type = 'center'
   and c.id = op.installation_center_id
  where op.id = p_party_id
    and (
      op.party_type = 'company'
      or (op.party_type = 'agent' and ca.status = 'active')
      or (op.party_type = 'dealer' and d.status = 'active')
      or (op.party_type = 'center' and c.status = 'active')
    );
$$;

revoke all on function private.notification_party_profile_ids(uuid)
  from public, anon, authenticated, service_role;

create function private.notification_party_display_name(p_party_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case op.party_type
    when 'company' then 'Protection Giants'
    when 'agent' then ca.name
    when 'dealer' then d.name
    when 'center' then c.name
    else null
  end
  from public.operational_parties op
  left join public.country_agents ca on ca.id = op.country_agent_id
  left join public.dealers d on d.id = op.dealer_id
  left join public.installation_centers c on c.id = op.installation_center_id
  where op.id = p_party_id;
$$;

revoke all on function private.notification_party_display_name(uuid)
  from public, anon, authenticated, service_role;

create function private.materialize_roll_transfer_notification_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transfer public.roll_transfers%rowtype;
  v_source_event_key text := 'roll_transfer_events:' || new.id::text;
  v_action_path text;
  v_sender_name text;
  v_event_type text;
  v_attention_level text;
  v_title text;
  v_body text;
  v_recipient_party_id uuid;
  v_second_party_id uuid;
  v_excluded_profile_id uuid;
begin
  select *
    into v_transfer
  from public.roll_transfers rt
  where rt.id = new.transfer_id;

  if not found then
    raise exception using errcode = '23514', message = 'PG_NOTIFICATION_TRANSFER_MISSING';
  end if;

  v_action_path := '/operations/transfers/' || v_transfer.id::text;

  -- Recovery has one dedicated terminal message. The generic standard receipt
  -- message must never be emitted for the same immutable receipt event.
  if new.event_type = 'received'
    and v_transfer.transfer_kind = 'opened_roll_recovery'
    and v_transfer.status = 'received'
  then
    v_event_type := 'transfer.recovery_completed';
    v_attention_level := 'info';
    v_title := 'اكتمل استرجاع الرول';
    v_body := 'تم استلام الرول وإخراجه من عهدة المركز. راجع التحويل للتفاصيل.';
    v_recipient_party_id := v_transfer.sender_party_id;

  elsif new.event_type = 'created'
    and v_transfer.transfer_kind = 'standard'
  then
    v_sender_name := private.notification_party_display_name(v_transfer.sender_party_id);
    v_event_type := 'transfer.incoming_created';
    v_attention_level := 'action_required';
    v_title := 'تحويل جديد بانتظار الاستلام';
    v_body := 'التحويل ' || v_transfer.transfer_number || ' مرسل من ' || coalesce(v_sender_name, 'جهة تشغيلية') || '. افتح التحويل لمراجعته.';
    v_recipient_party_id := v_transfer.recipient_party_id;
    v_excluded_profile_id := new.actor_profile_id;

  elsif new.event_type = 'rejected'
    and v_transfer.transfer_kind = 'standard'
  then
    v_event_type := 'transfer.rejected';
    v_attention_level := 'warning';
    v_title := 'تم رفض التحويل';
    v_body := 'تم رفض التحويل ' || v_transfer.transfer_number || '. راجع تفاصيل التحويل.';
    v_recipient_party_id := v_transfer.sender_party_id;

  elsif new.event_type = 'cancelled'
    and v_transfer.transfer_kind = 'standard'
  then
    v_event_type := 'transfer.sender_cancelled';
    v_attention_level := 'info';
    v_title := 'تم إلغاء التحويل';
    v_body := 'ألغى المرسل التحويل ' || v_transfer.transfer_number || '. لا يلزم استلامه.';
    v_recipient_party_id := v_transfer.recipient_party_id;

  elsif new.event_type = 'administrative_cancelled'
    and v_transfer.transfer_kind = 'standard'
  then
    v_event_type := 'transfer.administrative_cancelled';
    v_attention_level := 'warning';
    v_title := 'تم إلغاء التحويل إداريًا';
    v_body := 'تم إلغاء التحويل ' || v_transfer.transfer_number || ' إداريًا. راجع حالة التحويل.';
    v_recipient_party_id := v_transfer.sender_party_id;
    v_second_party_id := v_transfer.recipient_party_id;
    v_excluded_profile_id := new.actor_profile_id;

  elsif new.event_type = 'received'
    and v_transfer.transfer_kind = 'standard'
    and v_transfer.status = 'partially_received'
  then
    v_event_type := 'transfer.partially_received';
    v_attention_level := 'action_required';
    v_title := 'استلام جزئي للتحويل';
    v_body := 'تم استلام ' || coalesce(new.affected_roll_count, 0)::text || ' رول من التحويل ' || v_transfer.transfer_number || ' وما زالت هناك رولز معلقة.';
    v_recipient_party_id := v_transfer.sender_party_id;

  elsif new.event_type = 'received'
    and v_transfer.transfer_kind = 'standard'
    and v_transfer.status = 'received'
  then
    v_event_type := 'transfer.received';
    v_attention_level := 'info';
    v_title := 'تم استلام التحويل بالكامل';
    v_body := 'اكتمل استلام التحويل ' || v_transfer.transfer_number || ' وانتقلت العهدة المؤكدة.';
    v_recipient_party_id := v_transfer.sender_party_id;

  elsif new.event_type = 'unresolved_released'
    and v_transfer.transfer_kind = 'standard'
  then
    v_event_type := 'transfer.unresolved_released';
    v_attention_level := 'info';
    v_title := 'تم تحرير رولز معلقة';
    v_body := 'تم تحرير الرولز المعلقة في التحويل ' || v_transfer.transfer_number || '. راجع التحويل للحالة الحالية.';
    v_recipient_party_id := v_transfer.recipient_party_id;

  elsif new.event_type = 'administrative_unresolved_released'
    and v_transfer.transfer_kind = 'standard'
  then
    v_event_type := 'transfer.administrative_unresolved_released';
    v_attention_level := 'warning';
    v_title := 'تم تحرير رولز معلقة إداريًا';
    v_body := 'تم تحرير رولز معلقة في التحويل ' || v_transfer.transfer_number || ' بقرار إداري. راجع الحالة الحالية.';
    v_recipient_party_id := v_transfer.sender_party_id;
    v_second_party_id := v_transfer.recipient_party_id;
    v_excluded_profile_id := new.actor_profile_id;

  else
    -- Events outside the frozen Transfer notification catalog intentionally do
    -- not materialize notifications (for example opened_roll_recovery_created).
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
    'roll_transfer',
    v_source_event_key,
    v_attention_level,
    v_title,
    v_body,
    v_action_path,
    true,
    new.occurred_at
  from private.notification_party_profile_ids(v_recipient_party_id) recipients
  where recipients.profile_id is distinct from v_excluded_profile_id
  on conflict (recipient_profile_id, source_domain, source_event_key, event_type)
  do nothing;

  if v_second_party_id is not null and v_second_party_id <> v_recipient_party_id then
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
      'roll_transfer',
      v_source_event_key,
      v_attention_level,
      v_title,
      v_body,
      v_action_path,
      true,
      new.occurred_at
    from private.notification_party_profile_ids(v_second_party_id) recipients
    where recipients.profile_id is distinct from v_excluded_profile_id
    on conflict (recipient_profile_id, source_domain, source_event_key, event_type)
    do nothing;
  end if;

  return new;
end;
$$;

revoke all on function private.materialize_roll_transfer_notification_event()
  from public, anon, authenticated, service_role;

create trigger roll_transfer_events_notification_materializer
  after insert on public.roll_transfer_events
  for each row
  execute function private.materialize_roll_transfer_notification_event();

comment on function private.materialize_roll_transfer_notification_event() is
  'Cube L explicit Transfer/Recovery notification projector. It consumes only immutable roll_transfer_events and materializes the frozen catalog; it is not a generic notification rules engine.';
