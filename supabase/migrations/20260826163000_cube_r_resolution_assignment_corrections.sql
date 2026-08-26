-- Cube R — Approved Claim Resolution / Replacement & Reinstall, increment 5
-- Bounded Admin reassignment and remedy correction only.
-- These operations never move/release material, never change Claim adjudication,
-- and remain blocked while reserved/consumed Claim material exists.

create or replace function private.materialize_warranty_claim_resolution_notification_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resolution public.warranty_claim_resolutions%rowtype;
  v_claim public.warranty_claims%rowtype;
  v_target_party_id uuid;
  v_remedy_kind text;
  v_source_event_key text := 'warranty_claim_resolution_events:' || new.id::text;
  v_event_type text;
  v_title text;
  v_body text;
begin
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
  'Cube R Resolution event -> Cube L durable Inbox projector. Assignment/reassignment notify only the exact current performing Center Profiles. Remedy correction remains event-only; Push never controls Resolution state.';

create function public.reassign_warranty_claim_resolution(
  p_action_request_id uuid,
  p_resolution_id uuid,
  p_performing_center_party_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_profile_id uuid;
  v_existing_event public.warranty_claim_resolution_events%rowtype;
  v_claim public.warranty_claims%rowtype;
  v_resolution public.warranty_claim_resolutions%rowtype;
  v_claim_id uuid;
  v_warranty_record_state text;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_reassigned_at timestamptz;
begin
  if p_action_request_id is null
    or p_resolution_id is null
    or p_performing_center_party_id is null
    or char_length(v_reason) not between 5 and 500
  then
    raise exception using errcode = '22023', message = 'PG_CLAIM_RESOLUTION_REASSIGN_REQUEST_INVALID';
  end if;

  v_actor_profile_id := private.lock_warranty_admin_context();

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_action_request_id::text, 0)
  );

  select event.*
    into v_existing_event
  from public.warranty_claim_resolution_events event
  where event.action_request_id = p_action_request_id;

  if found then
    if v_existing_event.resolution_id <> p_resolution_id
      or v_existing_event.event_kind <> 'resolution_reassigned'
      or v_existing_event.actor_profile_id <> v_actor_profile_id
      or v_existing_event.actor_kind <> 'admin'
      or v_existing_event.reason <> v_reason
      or v_existing_event.event_data ->> 'performing_center_party_id' <> p_performing_center_party_id::text
    then
      raise exception using errcode = '23505', message = 'PG_CLAIM_RESOLUTION_ACTION_REQUEST_CONFLICT';
    end if;

    return v_existing_event.resolution_id;
  end if;

  -- Preserve the Warranty -> Claim -> Resolution order used by Q and initial R assignment.
  select claim.id, warranty.record_state
    into v_claim_id, v_warranty_record_state
  from public.warranty_claim_resolutions resolution
  join public.warranty_claims claim on claim.id = resolution.claim_id
  join public.warranties warranty on warranty.id = claim.warranty_id
  where resolution.id = p_resolution_id
  for update of warranty;

  if not found then
    raise exception using errcode = '22023', message = 'PG_CLAIM_RESOLUTION_NOT_FOUND';
  end if;

  if v_warranty_record_state <> 'issued' then
    raise exception using errcode = '23514', message = 'PG_CLAIM_WARRANTY_INVALID';
  end if;

  select claim.*
    into v_claim
  from public.warranty_claims claim
  where claim.id = v_claim_id
  for update;

  if not found
    or v_claim.status <> 'approved'
    or v_claim.closed_at is not null
  then
    raise exception using errcode = '23514', message = 'PG_CLAIM_RESOLUTION_REASSIGN_STATE_INVALID';
  end if;

  select resolution.*
    into v_resolution
  from public.warranty_claim_resolutions resolution
  where resolution.id = p_resolution_id
  for update;

  if not found
    or v_resolution.claim_id <> v_claim.id
    or v_resolution.status <> 'assigned'
  then
    raise exception using errcode = '23514', message = 'PG_CLAIM_RESOLUTION_REASSIGN_STATE_INVALID';
  end if;

  if v_resolution.performing_center_party_id = p_performing_center_party_id then
    raise exception using errcode = '23514', message = 'PG_CLAIM_RESOLUTION_CENTER_UNCHANGED';
  end if;

  if exists (
    select 1
    from public.warranty_claim_resolution_roll_allocations allocation
    where allocation.resolution_id = v_resolution.id
      and allocation.status in ('reserved', 'consumed')
  ) then
    raise exception using errcode = '23514', message = 'PG_CLAIM_RESOLUTION_MATERIAL_ACTIVE';
  end if;

  perform private.lock_actionable_claim_center_party(p_performing_center_party_id);

  v_reassigned_at := greatest(
    clock_timestamp(),
    v_resolution.assigned_at + interval '1 microsecond'
  );

  update public.warranty_claim_resolutions resolution
  set
    performing_center_party_id = p_performing_center_party_id,
    assigned_by_profile_id = v_actor_profile_id,
    assigned_at = v_reassigned_at,
    updated_at = v_reassigned_at
  where resolution.id = v_resolution.id;

  insert into public.warranty_claim_resolution_events (
    resolution_id,
    action_request_id,
    event_kind,
    actor_profile_id,
    actor_kind,
    reason,
    event_data,
    created_at
  ) values (
    v_resolution.id,
    p_action_request_id,
    'resolution_reassigned',
    v_actor_profile_id,
    'admin',
    v_reason,
    jsonb_build_object(
      'claim_id', v_claim.id,
      'remedy_kind', v_resolution.remedy_kind,
      'old_performing_center_party_id', v_resolution.performing_center_party_id,
      'performing_center_party_id', p_performing_center_party_id
    ),
    v_reassigned_at
  );

  return v_resolution.id;
end;
$$;

revoke all on function public.reassign_warranty_claim_resolution(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.reassign_warranty_claim_resolution(uuid, uuid, uuid, text)
  to authenticated;

comment on function public.reassign_warranty_claim_resolution(uuid, uuid, uuid, text) is
  'Cube R bounded Admin reassignment. Requires approved/open Claim, assigned Resolution, actionable different Center and no reserved/consumed Claim material. It changes no remedy, custody or allocation state.';

create function public.change_warranty_claim_resolution_remedy(
  p_action_request_id uuid,
  p_resolution_id uuid,
  p_remedy_kind text,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_profile_id uuid;
  v_existing_event public.warranty_claim_resolution_events%rowtype;
  v_claim public.warranty_claims%rowtype;
  v_resolution public.warranty_claim_resolutions%rowtype;
  v_claim_id uuid;
  v_warranty_record_state text;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_changed_at timestamptz := clock_timestamp();
begin
  if p_action_request_id is null
    or p_resolution_id is null
    or p_remedy_kind not in ('service_reinstall', 'replacement_roll_reinstall')
    or char_length(v_reason) not between 5 and 500
  then
    raise exception using errcode = '22023', message = 'PG_CLAIM_RESOLUTION_REMEDY_CHANGE_REQUEST_INVALID';
  end if;

  v_actor_profile_id := private.lock_warranty_admin_context();

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_action_request_id::text, 0)
  );

  select event.*
    into v_existing_event
  from public.warranty_claim_resolution_events event
  where event.action_request_id = p_action_request_id;

  if found then
    if v_existing_event.resolution_id <> p_resolution_id
      or v_existing_event.event_kind <> 'resolution_remedy_changed'
      or v_existing_event.actor_profile_id <> v_actor_profile_id
      or v_existing_event.actor_kind <> 'admin'
      or v_existing_event.reason <> v_reason
      or v_existing_event.event_data ->> 'remedy_kind' <> p_remedy_kind
    then
      raise exception using errcode = '23505', message = 'PG_CLAIM_RESOLUTION_ACTION_REQUEST_CONFLICT';
    end if;

    return v_existing_event.resolution_id;
  end if;

  select claim.id, warranty.record_state
    into v_claim_id, v_warranty_record_state
  from public.warranty_claim_resolutions resolution
  join public.warranty_claims claim on claim.id = resolution.claim_id
  join public.warranties warranty on warranty.id = claim.warranty_id
  where resolution.id = p_resolution_id
  for update of warranty;

  if not found then
    raise exception using errcode = '22023', message = 'PG_CLAIM_RESOLUTION_NOT_FOUND';
  end if;

  if v_warranty_record_state <> 'issued' then
    raise exception using errcode = '23514', message = 'PG_CLAIM_WARRANTY_INVALID';
  end if;

  select claim.*
    into v_claim
  from public.warranty_claims claim
  where claim.id = v_claim_id
  for update;

  if not found
    or v_claim.status <> 'approved'
    or v_claim.closed_at is not null
  then
    raise exception using errcode = '23514', message = 'PG_CLAIM_RESOLUTION_REMEDY_CHANGE_STATE_INVALID';
  end if;

  select resolution.*
    into v_resolution
  from public.warranty_claim_resolutions resolution
  where resolution.id = p_resolution_id
  for update;

  if not found
    or v_resolution.claim_id <> v_claim.id
    or v_resolution.status <> 'assigned'
  then
    raise exception using errcode = '23514', message = 'PG_CLAIM_RESOLUTION_REMEDY_CHANGE_STATE_INVALID';
  end if;

  if v_resolution.remedy_kind = p_remedy_kind then
    raise exception using errcode = '23514', message = 'PG_CLAIM_RESOLUTION_REMEDY_UNCHANGED';
  end if;

  if exists (
    select 1
    from public.warranty_claim_resolution_roll_allocations allocation
    where allocation.resolution_id = v_resolution.id
      and allocation.status in ('reserved', 'consumed')
  ) then
    raise exception using errcode = '23514', message = 'PG_CLAIM_RESOLUTION_MATERIAL_ACTIVE';
  end if;

  update public.warranty_claim_resolutions resolution
  set
    remedy_kind = p_remedy_kind,
    updated_at = v_changed_at
  where resolution.id = v_resolution.id;

  insert into public.warranty_claim_resolution_events (
    resolution_id,
    action_request_id,
    event_kind,
    actor_profile_id,
    actor_kind,
    reason,
    event_data,
    created_at
  ) values (
    v_resolution.id,
    p_action_request_id,
    'resolution_remedy_changed',
    v_actor_profile_id,
    'admin',
    v_reason,
    jsonb_build_object(
      'claim_id', v_claim.id,
      'old_remedy_kind', v_resolution.remedy_kind,
      'remedy_kind', p_remedy_kind,
      'performing_center_party_id', v_resolution.performing_center_party_id
    ),
    v_changed_at
  );

  return v_resolution.id;
end;
$$;

revoke all on function public.change_warranty_claim_resolution_remedy(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.change_warranty_claim_resolution_remedy(uuid, uuid, text, text)
  to authenticated;

comment on function public.change_warranty_claim_resolution_remedy(uuid, uuid, text, text) is
  'Cube R bounded Admin remedy correction. Keeps the Resolution assigned and performing Center unchanged, requires a different frozen V1 remedy and no reserved/consumed Claim material, and appends immutable audit history.';
