-- Cube R — Approved Claim Resolution / Replacement & Reinstall, increment 3
-- Initial Admin assignment only. This consumes the exact Q authorized handoff and
-- emits one immutable Resolution event; no Roll allocation, reassignment, remedy
-- correction, completion, cancellation or finance operation is introduced here.

create function private.materialize_warranty_claim_resolution_notification_event()
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
begin
  if new.event_kind <> 'resolution_assigned' then
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
    'claim_resolution.assigned',
    'warranty_claim_resolution',
    v_source_event_key,
    'action_required',
    'تم إسناد تنفيذ مطالبة ضمان إلى مركزك',
    btrim(left(
      case
        when v_remedy_kind = 'replacement_roll_reinstall' then
          'تم إسناد تنفيذ استبدال وإعادة تركيب للمطالبة ' || v_claim.claim_number || ' إلى مركزك.'
        else
          'تم إسناد تنفيذ إعادة تركيب للمطالبة ' || v_claim.claim_number || ' إلى مركزك.'
      end,
      300
    )),
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

create trigger warranty_claim_resolution_events_materialize_notification
  after insert on public.warranty_claim_resolution_events
  for each row execute function private.materialize_warranty_claim_resolution_notification_event();

comment on function private.materialize_warranty_claim_resolution_notification_event() is
  'Cube R Resolution event -> Cube L durable Inbox projector. Initial assignment notifies only the exact active assigned Center Profiles; no direct mutation RPC writes notification rows and Push never controls Resolution state.';

create function public.assign_warranty_claim_resolution(
  p_action_request_id uuid,
  p_resolution_id uuid,
  p_remedy_kind text,
  p_performing_center_party_id uuid
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
  v_assigned_at timestamptz := clock_timestamp();
begin
  if p_action_request_id is null
    or p_resolution_id is null
    or p_performing_center_party_id is null
    or p_remedy_kind is null
  then
    raise exception using errcode = '22023', message = 'PG_CLAIM_RESOLUTION_ASSIGN_REQUEST_INVALID';
  end if;

  if p_remedy_kind not in ('service_reinstall', 'replacement_roll_reinstall') then
    raise exception using errcode = '22023', message = 'PG_CLAIM_RESOLUTION_REMEDY_INVALID';
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
      or v_existing_event.event_kind <> 'resolution_assigned'
      or v_existing_event.actor_profile_id <> v_actor_profile_id
      or v_existing_event.actor_kind <> 'admin'
      or v_existing_event.event_data ->> 'remedy_kind' <> p_remedy_kind
      or v_existing_event.event_data ->> 'performing_center_party_id' <> p_performing_center_party_id::text
    then
      raise exception using errcode = '23505', message = 'PG_CLAIM_RESOLUTION_ACTION_REQUEST_CONFLICT';
    end if;

    return v_existing_event.resolution_id;
  end if;

  -- Follow Q's serialization order: Warranty -> Claim -> Resolution. Resolution
  -- identity is immutable, so reading Claim/Warranty identity before locking the
  -- Resolution cannot be redirected by a concurrent writer.
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
    raise exception using errcode = '23514', message = 'PG_CLAIM_RESOLUTION_ASSIGN_STATE_INVALID';
  end if;

  select resolution.*
    into v_resolution
  from public.warranty_claim_resolutions resolution
  where resolution.id = p_resolution_id
  for update;

  if not found
    or v_resolution.claim_id <> v_claim.id
    or v_resolution.status <> 'authorized'
  then
    raise exception using errcode = '23514', message = 'PG_CLAIM_RESOLUTION_ASSIGN_STATE_INVALID';
  end if;

  -- Reuse Q's commit-time destination boundary: a real active Center operational
  -- party plus at least one currently active Center Profile bound to that Center.
  perform private.lock_actionable_claim_center_party(p_performing_center_party_id);

  update public.warranty_claim_resolutions resolution
  set
    status = 'assigned',
    remedy_kind = p_remedy_kind,
    performing_center_party_id = p_performing_center_party_id,
    assigned_by_profile_id = v_actor_profile_id,
    assigned_at = v_assigned_at,
    updated_at = v_assigned_at
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
    'resolution_assigned',
    v_actor_profile_id,
    'admin',
    null,
    jsonb_build_object(
      'claim_id', v_claim.id,
      'remedy_kind', p_remedy_kind,
      'performing_center_party_id', p_performing_center_party_id
    ),
    v_assigned_at
  );

  return v_resolution.id;
end;
$$;

revoke all on function public.assign_warranty_claim_resolution(uuid, uuid, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.assign_warranty_claim_resolution(uuid, uuid, text, uuid)
  to authenticated;

comment on function public.assign_warranty_claim_resolution(uuid, uuid, text, uuid) is
  'Cube R initial Admin assignment. Consumes only an approved/open Claim plus authorized Resolution, rechecks issued Warranty and actionable Center at commit time, appends one immutable event, and relies on the Resolution-event projector for the same-transaction Center Inbox row. Creates no Roll allocation.';
