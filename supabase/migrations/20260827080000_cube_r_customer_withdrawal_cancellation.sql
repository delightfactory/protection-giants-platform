-- Cube R — PD-079 customer withdrawal after Resolution assignment.
-- This is a narrow terminal fulfillment closure, not a Claim rejection/undo and not
-- a generic Resolution cancel operation. The approved Claim remains approved while
-- Resolution + Claim close atomically; Warranty/material/custody remain unchanged.

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
  v_customer_message text;
  v_source_event_key text := 'warranty_claim_resolution_events:' || new.id::text;
  v_event_type text;
  v_title text;
  v_body text;
begin
  -- Preserve the cumulative Increment-5 assignment/reassignment projector and add
  -- only the PD-079 terminal assigned-task cancellation event. Remedy correction
  -- intentionally remains audit/event-only, exactly as before this migration.
  if new.event_kind not in (
    'resolution_assigned',
    'resolution_reassigned',
    'resolution_cancelled_customer_withdrawal'
  ) then
    return new;
  end if;

  begin
    v_target_party_id := nullif(new.event_data ->> 'performing_center_party_id', '')::uuid;
    v_remedy_kind := nullif(new.event_data ->> 'remedy_kind', '');
    v_customer_message := nullif(new.event_data ->> 'customer_message', '');
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

  if new.event_kind in ('resolution_assigned', 'resolution_reassigned') then
    if v_resolution.status <> 'assigned' then
      raise exception using errcode = '23514', message = 'PG_NOTIFICATION_CLAIM_RESOLUTION_STATE_INVALID';
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
  end if;

  if v_resolution.status <> 'cancelled'
    or v_resolution.customer_cancellation_message is null
    or v_customer_message is null
    or v_resolution.customer_cancellation_message <> v_customer_message
    or v_claim.status <> 'approved'
    or v_claim.closed_at is null
  then
    raise exception using errcode = '23514', message = 'PG_NOTIFICATION_CLAIM_RESOLUTION_STATE_INVALID';
  end if;

  -- PD-079 removes an already-assigned physical task. Notify only the assigned
  -- Center's currently active recipients; never expose the Admin's internal reason.
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
    'claim_resolution.cancelled_customer_withdrawal',
    'warranty_claim_resolution',
    v_source_event_key,
    'info',
    'تم إغلاق تنفيذ مطالبة الضمان',
    btrim(left(
      'لم يعد تنفيذ المطالبة ' || v_claim.claim_number || ' مطلوبًا من مركزك بعد إغلاق المعالجة بناءً على رغبة العميل.',
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

comment on function private.materialize_warranty_claim_resolution_notification_event() is
  'Cube R Resolution event -> Cube L durable Inbox projector. Preserves assignment/reassignment materialization and adds PD-079 assigned-task cancellation. Remedy correction remains event-only; mutation RPCs never write notifications directly.';

create function public.cancel_assigned_claim_resolution_for_customer_withdrawal(
  p_action_request_id uuid,
  p_resolution_id uuid,
  p_reason text,
  p_customer_message text
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
  v_customer_message text := btrim(coalesce(p_customer_message, ''));
  v_cancelled_at timestamptz := clock_timestamp();
begin
  if p_action_request_id is null or p_resolution_id is null then
    raise exception using errcode = '22023', message = 'PG_CLAIM_RESOLUTION_WITHDRAWAL_REQUEST_INVALID';
  end if;

  if char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    raise exception using errcode = '22023', message = 'PG_CLAIM_RESOLUTION_WITHDRAWAL_REASON_INVALID';
  end if;

  if char_length(v_customer_message) < 5 or char_length(v_customer_message) > 1000 then
    raise exception using errcode = '22023', message = 'PG_CLAIM_RESOLUTION_WITHDRAWAL_CUSTOMER_MESSAGE_INVALID';
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
      or v_existing_event.event_kind <> 'resolution_cancelled_customer_withdrawal'
      or v_existing_event.actor_profile_id <> v_actor_profile_id
      or v_existing_event.actor_kind <> 'admin'
      or v_existing_event.reason <> v_reason
      or v_existing_event.event_data ->> 'customer_message' <> v_customer_message
    then
      raise exception using errcode = '23505', message = 'PG_CLAIM_RESOLUTION_ACTION_REQUEST_CONFLICT';
    end if;

    return v_existing_event.resolution_id;
  end if;

  -- Frozen family lock order: Warranty -> Claim -> Resolution. Reserve/release and
  -- completion also serialize on this Resolution before material mutation, so a
  -- concurrent completion/reservation and customer withdrawal cannot both commit.
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
    raise exception using errcode = '23514', message = 'PG_CLAIM_RESOLUTION_WITHDRAWAL_STATE_INVALID';
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
    raise exception using errcode = '23514', message = 'PG_CLAIM_RESOLUTION_WITHDRAWAL_STATE_INVALID';
  end if;

  if exists (
    select 1
    from public.warranty_claim_resolution_roll_allocations allocation
    where allocation.resolution_id = v_resolution.id
      and allocation.status = 'consumed'
  ) then
    raise exception using errcode = '23514', message = 'PG_CLAIM_RESOLUTION_WITHDRAWAL_MATERIAL_CONSUMED';
  end if;

  if exists (
    select 1
    from public.warranty_claim_resolution_roll_allocations allocation
    where allocation.resolution_id = v_resolution.id
      and allocation.status = 'reserved'
  ) then
    raise exception using errcode = '23514', message = 'PG_CLAIM_RESOLUTION_WITHDRAWAL_RELEASE_REQUIRED';
  end if;

  update public.warranty_claim_resolutions resolution
  set
    status = 'cancelled',
    cancelled_by_profile_id = v_actor_profile_id,
    cancellation_reason = v_reason,
    customer_cancellation_message = v_customer_message,
    cancelled_at = v_cancelled_at,
    updated_at = v_cancelled_at
  where resolution.id = v_resolution.id;

  update public.warranty_claims claim
  set
    closed_at = v_cancelled_at,
    updated_at = v_cancelled_at
  where claim.id = v_claim.id;

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
    'resolution_cancelled_customer_withdrawal',
    v_actor_profile_id,
    'admin',
    v_reason,
    jsonb_build_object(
      'claim_id', v_claim.id,
      'remedy_kind', v_resolution.remedy_kind,
      'performing_center_party_id', v_resolution.performing_center_party_id,
      'customer_message', v_customer_message
    ),
    v_cancelled_at
  );

  return v_resolution.id;
end;
$$;

revoke all on function public.cancel_assigned_claim_resolution_for_customer_withdrawal(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.cancel_assigned_claim_resolution_for_customer_withdrawal(uuid, uuid, text, text)
  to authenticated;

comment on function public.cancel_assigned_claim_resolution_for_customer_withdrawal(uuid, uuid, text, text) is
  'Cube R PD-079 Admin-only terminal closure after customer withdrawal post-assignment. Requires approved/open Claim, assigned Resolution, no consumed/reserved allocation, preserves Claim approval/Warranty, atomically cancels Resolution + closes Claim + appends the immutable notification-source event.';