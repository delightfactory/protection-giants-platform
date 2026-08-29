-- Cube R — Claim Resolution completion -> Cube L Inbox integration
-- Extend the one existing Resolution-event projector in place. Assignment and
-- reassignment semantics remain unchanged; completed Resolution events add one
-- informational Company/Admin Inbox projection only. No second trigger, Push
-- transport, customer notification, or workflow mutation is introduced here.

create or replace function private.materialize_warranty_claim_resolution_notification_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resolution public.warranty_claim_resolutions%rowtype;
  v_claim public.warranty_claims%rowtype;
  v_company_party_id uuid;
  v_target_party_id uuid;
  v_remedy_kind text;
  v_source_event_key text := 'warranty_claim_resolution_events:' || new.id::text;
  v_event_type text;
  v_title text;
  v_body text;
begin
  -- Completion is informational Company visibility only. The event table and
  -- completed Resolution/Claim rows are the authoritative facts; event_data is
  -- deliberately not trusted to choose recipients or completion state.
  if new.event_kind in ('resolution_completed', 'resolution_completed_admin_recovery') then
    select resolution.*
      into v_resolution
    from public.warranty_claim_resolutions resolution
    where resolution.id = new.resolution_id;

    if not found
      or v_resolution.status <> 'completed'
      or v_resolution.completed_by_profile_id is distinct from new.actor_profile_id
      or v_resolution.performing_center_party_id is null
      or v_resolution.remedy_kind not in ('service_reinstall', 'replacement_roll_reinstall')
    then
      raise exception using errcode = '23514', message = 'PG_NOTIFICATION_CLAIM_RESOLUTION_STATE_INVALID';
    end if;

    if (
      new.event_kind = 'resolution_completed'
      and (
        new.actor_kind <> 'center'
        or v_resolution.completion_actor_kind <> 'center'
      )
    ) or (
      new.event_kind = 'resolution_completed_admin_recovery'
      and (
        new.actor_kind <> 'admin'
        or v_resolution.completion_actor_kind <> 'admin_recovery'
      )
    ) then
      raise exception using errcode = '23514', message = 'PG_NOTIFICATION_CLAIM_RESOLUTION_EVENT_INVALID';
    end if;

    select claim.*
      into v_claim
    from public.warranty_claims claim
    where claim.id = v_resolution.claim_id;

    if not found
      or v_claim.status <> 'approved'
      or v_claim.closed_at is null
    then
      raise exception using errcode = '23514', message = 'PG_NOTIFICATION_CLAIM_RESOLUTION_STATE_INVALID';
    end if;

    select party.id
      into v_company_party_id
    from public.operational_parties party
    where party.party_type = 'company';

    if v_company_party_id is null then
      raise exception using errcode = '23514', message = 'PG_NOTIFICATION_COMPANY_PARTY_MISSING';
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
      'claim_resolution.completed',
      'warranty_claim_resolution',
      v_source_event_key,
      'info',
      'تم إكمال معالجة مطالبة ضمان',
      btrim(left(
        'اكتمل تنفيذ معالجة المطالبة ' || v_claim.claim_number || ' وتم إغلاقها.',
        300
      )),
      '/operations/claims/' || v_claim.id::text,
      false,
      new.created_at
    from private.notification_party_profile_ids(v_company_party_id) recipients
    where recipients.profile_id is distinct from new.actor_profile_id
    on conflict (recipient_profile_id, source_domain, source_event_key, event_type)
    do nothing;

    return new;
  end if;

  -- Preserve the previously qualified assigned/reassigned projection exactly.
  if new.event_kind not in ('resolution_assigned', 'resolution_reassigned') then
    return new;
  end if;

  begin
    v_target_party_id := nullif(new.event_data ->> 'performing_center_party_id', '')::uuid;
    v_remedy_kind := nullif(new.event_data ->> 'remedy_kind', '');
  exception when invalid_text_representation then
    raise exception using errcode = '23514', message = 'PG_NOTIFICATION_CLAIM_RESOLUTION_EVENT_INVALID';
  end;

  if v_target_party_id is null
    or v_remedy_kind not in ('service_reinstall', 'replacement_roll_reinstall')
  then
    raise exception using errcode = '23514', message = 'PG_NOTIFICATION_CLAIM_RESOLUTION_EVENT_INVALID';
  end if;

  select resolution.*
    into v_resolution
  from public.warranty_claim_resolutions resolution
  where resolution.id = new.resolution_id;

  if not found
    or v_resolution.status <> 'assigned'
    or v_resolution.performing_center_party_id <> v_target_party_id
    or v_resolution.remedy_kind <> v_remedy_kind
  then
    raise exception using errcode = '23514', message = 'PG_NOTIFICATION_CLAIM_RESOLUTION_STATE_INVALID';
  end if;

  select claim.*
    into v_claim
  from public.warranty_claims claim
  where claim.id = v_resolution.claim_id;

  if not found then
    raise exception using errcode = '23514', message = 'PG_NOTIFICATION_CLAIM_MISSING';
  end if;

  if new.event_kind = 'resolution_reassigned' then
    v_event_type := 'claim_resolution.reassigned';
    v_title := 'تم إعادة إسناد تنفيذ مطالبة ضمان إلى مركزك';
  else
    v_event_type := 'claim_resolution.assigned';
    v_title := 'تم إسناد تنفيذ مطالبة ضمان إلى مركزك';
  end if;

  v_body := btrim(left(
    case
      when v_remedy_kind = 'replacement_roll_reinstall' then
        'تم إسناد تنفيذ استبدال وإعادة تركيب للمطالبة ' || v_claim.claim_number || ' إلى مركزك.'
      else
        'تم إسناد تنفيذ إعادة تركيب للمطالبة ' || v_claim.claim_number || ' إلى مركزك.'
    end,
    300
  ));

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
    'warranty_claim_resolution',
    v_source_event_key,
    'action_required',
    v_title,
    v_body,
    null,
    true,
    new.created_at
  from private.notification_party_profile_ids(v_target_party_id) recipients
  on conflict (recipient_profile_id, source_domain, source_event_key, event_type)
  do nothing;

  return new;
end;
$$;

revoke all on function private.materialize_warranty_claim_resolution_notification_event()
  from public, anon, authenticated, service_role;

comment on function private.materialize_warranty_claim_resolution_notification_event() is
  'Cube R Resolution event -> Cube L durable Inbox projector. Assignment/reassignment semantics remain exact-Center actionable notifications; normal and Admin-recovery completion add Inbox-only Company visibility for other active Admins, with no Push/customer projection or workflow authority.';
