-- Cube M — Warranty Activation, increment 6
-- Materialize only material Admin support events into the existing Cube L Inbox.
-- Successful activation itself is intentionally silent. Public Warranty access,
-- customer messaging and Claims remain outside Cube M.

create function private.materialize_warranty_support_notification_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_warranty public.warranties%rowtype;
  v_source_event_key text := 'warranty_events:' || new.id::text;
  v_event_type text;
  v_attention_level text;
  v_title text;
  v_body text;
  v_action_path text;
  v_push_eligible boolean;
begin
  -- M-D10: normal successful Activation is deliberately low-noise.
  if new.event_kind = 'activated' then
    return new;
  end if;

  if new.event_kind not in ('details_corrected', 'voided_in_error') then
    return new;
  end if;

  select warranty.*
    into v_warranty
  from public.warranties warranty
  where warranty.id = new.warranty_id;

  if not found then
    raise exception using errcode = '23514', message = 'PG_NOTIFICATION_WARRANTY_MISSING';
  end if;

  v_action_path := '/operations/warranties/' || v_warranty.id::text;

  if new.event_kind = 'details_corrected' then
    v_event_type := 'warranty.details_corrected';
    v_attention_level := 'info';
    v_title := 'تم تحديث بيانات الضمان';
    v_body := 'قامت الإدارة بتصحيح بيانات الضمان ' || v_warranty.warranty_number || '. افتح الضمان لمراجعة البيانات الحالية.';
    v_push_eligible := false;
  else
    v_event_type := 'warranty.voided_in_error';
    v_attention_level := 'warning';
    v_title := 'تم إلغاء تفعيل ضمان مسجل بالخطأ';
    v_body := 'ألغت الإدارة تفعيل الضمان ' || v_warranty.warranty_number || ' باعتباره مسجلًا بالخطأ. افتح السجل للتفاصيل.';
    v_push_eligible := true;
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
    'warranty',
    v_source_event_key,
    v_attention_level,
    v_title,
    v_body,
    v_action_path,
    v_push_eligible,
    new.created_at
  from private.notification_party_profile_ids(v_warranty.activating_center_party_id) recipients
  on conflict (recipient_profile_id, source_domain, source_event_key, event_type)
  do nothing;

  return new;
end;
$$;

revoke all on function private.materialize_warranty_support_notification_event()
  from public, anon, authenticated, service_role;

create trigger warranty_events_notification_materializer
  after insert on public.warranty_events
  for each row
  execute function private.materialize_warranty_support_notification_event();

comment on function private.materialize_warranty_support_notification_event() is
  'Cube M bounded Cube L projector. Activation is silent; Admin detail correction creates Inbox-only info and void-in-error creates privacy-safe warning Push eligibility for active Profiles of the activating Center only.';
