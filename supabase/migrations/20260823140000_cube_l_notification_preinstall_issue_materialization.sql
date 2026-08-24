-- Cube L — Notification Foundation, increment 3D
-- Materialize the frozen Cube K Pre-install Issue notification catalog from
-- immutable roll_preinstall_issue_events. Push transport remains a later increment.

create function private.materialize_roll_preinstall_issue_notification_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_issue public.roll_preinstall_issues%rowtype;
  v_roll_serial text;
  v_center_name text;
  v_company_party_id uuid;
  v_source_event_key text := 'roll_preinstall_issue_events:' || new.id::text;
  v_event_type text;
  v_attention_level text;
  v_title text;
  v_body text;
  v_action_path text;
begin
  select issue.*
    into v_issue
  from public.roll_preinstall_issues issue
  where issue.id = new.issue_id;

  if not found then
    raise exception using errcode = '23514', message = 'PG_NOTIFICATION_PREINSTALL_ISSUE_MISSING';
  end if;

  select r.serial_number
    into v_roll_serial
  from public.rolls r
  where r.id = v_issue.roll_id;

  if not found then
    raise exception using errcode = '23514', message = 'PG_NOTIFICATION_PREINSTALL_ROLL_MISSING';
  end if;

  v_action_path := '/operations/rolls/issues/' || v_issue.id::text;

  if new.event_kind = 'submitted' then
    select op.id
      into v_company_party_id
    from public.operational_parties op
    where op.party_type = 'company';

    if v_company_party_id is null then
      raise exception using errcode = '23514', message = 'PG_NOTIFICATION_COMPANY_PARTY_MISSING';
    end if;

    v_center_name := private.notification_party_display_name(v_issue.reporting_center_party_id);
    v_event_type := 'roll.preinstall_issue_submitted';
    v_attention_level := 'action_required';
    v_title := 'بلاغ فحص قبل التركيب يحتاج مراجعة';
    v_body := 'أرسل مركز ' || coalesce(v_center_name, 'تركيب') || ' بلاغًا على الرول ' || v_roll_serial || '. افتح البلاغ لمراجعته.';

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
      'roll_preinstall_issue',
      v_source_event_key,
      v_attention_level,
      v_title,
      v_body,
      v_action_path,
      true,
      new.created_at
    from private.notification_party_profile_ids(v_company_party_id) recipients
    on conflict (recipient_profile_id, source_domain, source_event_key, event_type)
    do nothing;

    return new;
  end if;

  if new.event_kind = 'cleared_for_use' then
    v_event_type := 'roll.preinstall_issue_cleared_for_use';
    v_attention_level := 'info';
    v_title := 'تم السماح باستخدام الرول';
    v_body := 'تمت مراجعة بلاغ الرول ' || v_roll_serial || ' وأصبح الرول متاحًا للاستخدام.';
  elsif new.event_kind = 'return_required' then
    v_event_type := 'roll.preinstall_issue_return_required';
    v_attention_level := 'action_required';
    v_title := 'يلزم إرجاع الرول';
    v_body := 'تمت مراجعة بلاغ الرول ' || v_roll_serial || ' ويلزم إرجاع الرول. افتح البلاغ للتفاصيل.';
  elsif new.event_kind = 'reported_in_error' then
    v_event_type := 'roll.preinstall_issue_reported_in_error';
    v_attention_level := 'info';
    v_title := 'تم إلغاء البلاغ المسجل بالخطأ';
    v_body := 'تم إغلاق بلاغ الرول ' || v_roll_serial || ' باعتباره مسجلًا بالخطأ.';
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
    'roll_preinstall_issue',
    v_source_event_key,
    v_attention_level,
    v_title,
    v_body,
    v_action_path,
    true,
    new.created_at
  from private.notification_party_profile_ids(v_issue.reporting_center_party_id) recipients
  on conflict (recipient_profile_id, source_domain, source_event_key, event_type)
  do nothing;

  return new;
end;
$$;

revoke all on function private.materialize_roll_preinstall_issue_notification_event()
  from public, anon, authenticated, service_role;

create trigger roll_preinstall_issue_events_notification_materializer
  after insert on public.roll_preinstall_issue_events
  for each row
  execute function private.materialize_roll_preinstall_issue_notification_event();

comment on function private.materialize_roll_preinstall_issue_notification_event() is
  'Cube L explicit Cube K Pre-install Issue notification projector. It consumes immutable issue events, routes submitted only to active Admin Profiles and outcomes only to active Profiles of the reporting Center; Agent/Dealer network membership is not a recipient rule.';
