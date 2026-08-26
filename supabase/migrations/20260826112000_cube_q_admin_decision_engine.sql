-- Cube Q — Claim Review, Inspection & Decision, increment 3
-- Company adjudication, bounded pre-execution approval cancellation and PD-078
-- wrong-decision reopen. No Cube R execution state is introduced here.

create function public.approve_warranty_claim(
  p_action_request_id uuid,
  p_claim_id uuid,
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
  v_reason text := btrim(coalesce(p_reason, ''));
  v_customer_message text := btrim(coalesce(p_customer_message, ''));
  v_existing_event public.warranty_claim_events%rowtype;
  v_warranty public.warranties%rowtype;
  v_claim public.warranty_claims%rowtype;
  v_resolution_id uuid := gen_random_uuid();
  v_decided_at timestamptz := clock_timestamp();
begin
  if p_action_request_id is null or p_claim_id is null then
    raise exception using errcode = '22023', message = 'PG_CLAIM_DECISION_REQUEST_INVALID';
  end if;

  if char_length(v_reason) < 5 or char_length(v_reason) > 1000
    or char_length(v_customer_message) < 5 or char_length(v_customer_message) > 1000
  then
    raise exception using errcode = '22023', message = 'PG_CLAIM_DECISION_TEXT_INVALID';
  end if;

  v_actor_profile_id := private.lock_warranty_admin_context();

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_action_request_id::text, 0)
  );

  select event.*
    into v_existing_event
  from public.warranty_claim_events event
  where event.action_request_id = p_action_request_id;

  if found then
    if v_existing_event.claim_id <> p_claim_id
      or v_existing_event.event_kind <> 'approved'
      or v_existing_event.actor_profile_id <> v_actor_profile_id
      or v_existing_event.reason <> v_reason
      or v_existing_event.event_data ->> 'customer_message' <> v_customer_message
    then
      raise exception using errcode = '23505', message = 'PG_CLAIM_ACTION_REQUEST_CONFLICT';
    end if;

    select resolution.id
      into v_resolution_id
    from public.warranty_claim_resolutions resolution
    where resolution.claim_id = p_claim_id;

    if not found then
      raise exception using errcode = '23514', message = 'PG_CLAIM_APPROVAL_RESOLUTION_MISSING';
    end if;

    return v_resolution_id;
  end if;

  select warranty.*
    into v_warranty
  from public.warranty_claims claim
  join public.warranties warranty on warranty.id = claim.warranty_id
  where claim.id = p_claim_id
  for update of warranty;

  if not found then
    raise exception using errcode = '22023', message = 'PG_CLAIM_NOT_FOUND';
  end if;

  if v_warranty.record_state <> 'issued' then
    raise exception using errcode = '23514', message = 'PG_CLAIM_WARRANTY_INVALID';
  end if;

  select claim.*
    into v_claim
  from public.warranty_claims claim
  where claim.id = p_claim_id
  for update;

  if v_claim.status <> 'under_review' or v_claim.closed_at is not null then
    raise exception using errcode = '23514', message = 'PG_CLAIM_DECISION_STATE_INVALID';
  end if;

  if exists (
    select 1
    from public.warranty_claim_inspections inspection
    where inspection.claim_id = v_claim.id
      and inspection.status = 'requested'
  ) then
    raise exception using errcode = '23514', message = 'PG_CLAIM_INSPECTION_PENDING';
  end if;

  if exists (
    select 1
    from public.warranty_claim_resolutions resolution
    where resolution.claim_id = v_claim.id
  ) then
    raise exception using errcode = '23505', message = 'PG_CLAIM_RESOLUTION_EXISTS';
  end if;

  update public.warranty_claims claim
  set
    status = 'approved',
    decided_by_profile_id = v_actor_profile_id,
    decision_reason = v_reason,
    customer_decision_message = v_customer_message,
    decided_at = v_decided_at,
    updated_at = v_decided_at
  where claim.id = v_claim.id;

  insert into public.warranty_claim_resolutions (
    id,
    claim_id,
    status,
    authorized_by_profile_id,
    authorized_at,
    created_at,
    updated_at
  ) values (
    v_resolution_id,
    v_claim.id,
    'authorized',
    v_actor_profile_id,
    v_decided_at,
    v_decided_at,
    v_decided_at
  );

  insert into public.warranty_claim_events (
    claim_id,
    action_request_id,
    event_kind,
    actor_profile_id,
    actor_kind,
    reason,
    event_data,
    created_at
  ) values (
    v_claim.id,
    p_action_request_id,
    'approved',
    v_actor_profile_id,
    'admin',
    v_reason,
    jsonb_build_object(
      'customer_message', v_customer_message,
      'resolution_id', v_resolution_id
    ),
    v_decided_at
  );

  return v_resolution_id;
end;
$$;

revoke all on function public.approve_warranty_claim(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.approve_warranty_claim(uuid, uuid, text, text)
  to authenticated;

create function public.reject_warranty_claim(
  p_action_request_id uuid,
  p_claim_id uuid,
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
  v_reason text := btrim(coalesce(p_reason, ''));
  v_customer_message text := btrim(coalesce(p_customer_message, ''));
  v_existing_event public.warranty_claim_events%rowtype;
  v_warranty public.warranties%rowtype;
  v_claim public.warranty_claims%rowtype;
  v_event_id uuid := gen_random_uuid();
  v_decided_at timestamptz := clock_timestamp();
begin
  if p_action_request_id is null or p_claim_id is null then
    raise exception using errcode = '22023', message = 'PG_CLAIM_DECISION_REQUEST_INVALID';
  end if;

  if char_length(v_reason) < 5 or char_length(v_reason) > 1000
    or char_length(v_customer_message) < 5 or char_length(v_customer_message) > 1000
  then
    raise exception using errcode = '22023', message = 'PG_CLAIM_DECISION_TEXT_INVALID';
  end if;

  v_actor_profile_id := private.lock_warranty_admin_context();

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_action_request_id::text, 0)
  );

  select event.*
    into v_existing_event
  from public.warranty_claim_events event
  where event.action_request_id = p_action_request_id;

  if found then
    if v_existing_event.claim_id <> p_claim_id
      or v_existing_event.event_kind <> 'rejected'
      or v_existing_event.actor_profile_id <> v_actor_profile_id
      or v_existing_event.reason <> v_reason
      or v_existing_event.event_data ->> 'customer_message' <> v_customer_message
    then
      raise exception using errcode = '23505', message = 'PG_CLAIM_ACTION_REQUEST_CONFLICT';
    end if;

    return v_existing_event.id;
  end if;

  select warranty.*
    into v_warranty
  from public.warranty_claims claim
  join public.warranties warranty on warranty.id = claim.warranty_id
  where claim.id = p_claim_id
  for update of warranty;

  if not found then
    raise exception using errcode = '22023', message = 'PG_CLAIM_NOT_FOUND';
  end if;

  if v_warranty.record_state <> 'issued' then
    raise exception using errcode = '23514', message = 'PG_CLAIM_WARRANTY_INVALID';
  end if;

  select claim.*
    into v_claim
  from public.warranty_claims claim
  where claim.id = p_claim_id
  for update;

  if v_claim.status <> 'under_review' or v_claim.closed_at is not null then
    raise exception using errcode = '23514', message = 'PG_CLAIM_DECISION_STATE_INVALID';
  end if;

  if exists (
    select 1
    from public.warranty_claim_inspections inspection
    where inspection.claim_id = v_claim.id
      and inspection.status = 'requested'
  ) then
    raise exception using errcode = '23514', message = 'PG_CLAIM_INSPECTION_PENDING';
  end if;

  if exists (
    select 1
    from public.warranty_claim_resolutions resolution
    where resolution.claim_id = v_claim.id
  ) then
    raise exception using errcode = '23505', message = 'PG_CLAIM_RESOLUTION_EXISTS';
  end if;

  update public.warranty_claims claim
  set
    status = 'rejected',
    closed_at = v_decided_at,
    decided_by_profile_id = v_actor_profile_id,
    decision_reason = v_reason,
    customer_decision_message = v_customer_message,
    decided_at = v_decided_at,
    updated_at = v_decided_at
  where claim.id = v_claim.id;

  insert into public.warranty_claim_events (
    id,
    claim_id,
    action_request_id,
    event_kind,
    actor_profile_id,
    actor_kind,
    reason,
    event_data,
    created_at
  ) values (
    v_event_id,
    v_claim.id,
    p_action_request_id,
    'rejected',
    v_actor_profile_id,
    'admin',
    v_reason,
    jsonb_build_object('customer_message', v_customer_message),
    v_decided_at
  );

  return v_event_id;
end;
$$;

revoke all on function public.reject_warranty_claim(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.reject_warranty_claim(uuid, uuid, text, text)
  to authenticated;

create function public.cancel_warranty_claim(
  p_action_request_id uuid,
  p_claim_id uuid,
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
  v_reason text := btrim(coalesce(p_reason, ''));
  v_customer_message text := btrim(coalesce(p_customer_message, ''));
  v_existing_event public.warranty_claim_events%rowtype;
  v_warranty public.warranties%rowtype;
  v_claim public.warranty_claims%rowtype;
  v_resolution public.warranty_claim_resolutions%rowtype;
  v_prior_approval_event public.warranty_claim_events%rowtype;
  v_event_kind text;
  v_event_data jsonb;
  v_event_id uuid := gen_random_uuid();
  v_decided_at timestamptz := clock_timestamp();
begin
  if p_action_request_id is null or p_claim_id is null then
    raise exception using errcode = '22023', message = 'PG_CLAIM_CANCEL_REQUEST_INVALID';
  end if;

  if char_length(v_reason) < 5 or char_length(v_reason) > 1000
    or char_length(v_customer_message) < 5 or char_length(v_customer_message) > 1000
  then
    raise exception using errcode = '22023', message = 'PG_CLAIM_DECISION_TEXT_INVALID';
  end if;

  v_actor_profile_id := private.lock_warranty_admin_context();

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_action_request_id::text, 0)
  );

  select event.*
    into v_existing_event
  from public.warranty_claim_events event
  where event.action_request_id = p_action_request_id;

  if found then
    if v_existing_event.claim_id <> p_claim_id
      or v_existing_event.event_kind not in ('cancelled', 'approval_cancelled_before_execution')
      or v_existing_event.actor_profile_id <> v_actor_profile_id
      or v_existing_event.reason <> v_reason
      or v_existing_event.event_data ->> 'customer_message' <> v_customer_message
    then
      raise exception using errcode = '23505', message = 'PG_CLAIM_ACTION_REQUEST_CONFLICT';
    end if;

    return v_existing_event.id;
  end if;

  select warranty.*
    into v_warranty
  from public.warranty_claims claim
  join public.warranties warranty on warranty.id = claim.warranty_id
  where claim.id = p_claim_id
  for update of warranty;

  if not found then
    raise exception using errcode = '22023', message = 'PG_CLAIM_NOT_FOUND';
  end if;

  if v_warranty.record_state <> 'issued' then
    raise exception using errcode = '23514', message = 'PG_CLAIM_WARRANTY_INVALID';
  end if;

  select claim.*
    into v_claim
  from public.warranty_claims claim
  where claim.id = p_claim_id
  for update;

  if v_claim.closed_at is not null
    or v_claim.status not in ('under_review', 'awaiting_inspection', 'approved')
  then
    raise exception using errcode = '23514', message = 'PG_CLAIM_CANCEL_STATE_INVALID';
  end if;

  if v_claim.status = 'approved' then
    select resolution.*
      into v_resolution
    from public.warranty_claim_resolutions resolution
    where resolution.claim_id = v_claim.id
    for update;

    if not found or v_resolution.status <> 'authorized' then
      raise exception using errcode = '23514', message = 'PG_CLAIM_APPROVAL_ALREADY_IN_EXECUTION';
    end if;

    select event.*
      into v_prior_approval_event
    from public.warranty_claim_events event
    where event.claim_id = v_claim.id
      and event.event_kind = 'approved'
    order by event.created_at desc, event.id desc
    limit 1;

    if not found then
      raise exception using errcode = '23514', message = 'PG_CLAIM_APPROVAL_EVENT_MISSING';
    end if;

    v_event_kind := 'approval_cancelled_before_execution';
    v_event_data := jsonb_build_object(
      'customer_message', v_customer_message,
      'superseded_approval_event_id', v_prior_approval_event.id,
      'superseded_approved_at', v_prior_approval_event.created_at,
      'resolution_id', v_resolution.id
    );
  else
    if exists (
      select 1
      from public.warranty_claim_resolutions resolution
      where resolution.claim_id = v_claim.id
    ) then
      raise exception using errcode = '23514', message = 'PG_CLAIM_RESOLUTION_UNEXPECTED';
    end if;

    v_event_kind := 'cancelled';
    v_event_data := jsonb_build_object('customer_message', v_customer_message);
  end if;

  update public.warranty_claims claim
  set
    status = 'cancelled',
    closed_at = v_decided_at,
    decided_by_profile_id = v_actor_profile_id,
    decision_reason = v_reason,
    customer_decision_message = v_customer_message,
    decided_at = v_decided_at,
    updated_at = v_decided_at
  where claim.id = v_claim.id;

  insert into public.warranty_claim_events (
    id,
    claim_id,
    action_request_id,
    event_kind,
    actor_profile_id,
    actor_kind,
    reason,
    event_data,
    created_at
  ) values (
    v_event_id,
    v_claim.id,
    p_action_request_id,
    v_event_kind,
    v_actor_profile_id,
    'admin',
    v_reason,
    v_event_data,
    v_decided_at
  );

  return v_event_id;
end;
$$;

revoke all on function public.cancel_warranty_claim(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.cancel_warranty_claim(uuid, uuid, text, text)
  to authenticated;

create function public.reopen_warranty_claim_decision_for_correction(
  p_action_request_id uuid,
  p_claim_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_profile_id uuid;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_existing_event public.warranty_claim_events%rowtype;
  v_warranty public.warranties%rowtype;
  v_claim public.warranty_claims%rowtype;
  v_superseded_event public.warranty_claim_events%rowtype;
  v_event_id uuid := gen_random_uuid();
  v_reopened_at timestamptz := clock_timestamp();
begin
  if p_action_request_id is null or p_claim_id is null then
    raise exception using errcode = '22023', message = 'PG_CLAIM_REOPEN_REQUEST_INVALID';
  end if;

  if char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    raise exception using errcode = '22023', message = 'PG_CLAIM_REOPEN_REASON_INVALID';
  end if;

  v_actor_profile_id := private.lock_warranty_admin_context();

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_action_request_id::text, 0)
  );

  select event.*
    into v_existing_event
  from public.warranty_claim_events event
  where event.action_request_id = p_action_request_id;

  if found then
    if v_existing_event.claim_id <> p_claim_id
      or v_existing_event.event_kind <> 'decision_reopened_for_correction'
      or v_existing_event.actor_profile_id <> v_actor_profile_id
      or v_existing_event.reason <> v_reason
    then
      raise exception using errcode = '23505', message = 'PG_CLAIM_ACTION_REQUEST_CONFLICT';
    end if;

    return v_existing_event.id;
  end if;

  -- Reopen is Warranty-sensitive because the Claim is currently closed and the
  -- Warranty void path may otherwise become eligible. Warranty therefore locks first.
  select warranty.*
    into v_warranty
  from public.warranty_claims claim
  join public.warranties warranty on warranty.id = claim.warranty_id
  where claim.id = p_claim_id
  for update of warranty;

  if not found then
    raise exception using errcode = '22023', message = 'PG_CLAIM_NOT_FOUND';
  end if;

  if v_warranty.record_state <> 'issued' then
    raise exception using errcode = '23514', message = 'PG_CLAIM_WARRANTY_INVALID';
  end if;

  select claim.*
    into v_claim
  from public.warranty_claims claim
  where claim.id = p_claim_id
  for update;

  if v_claim.status not in ('rejected', 'cancelled')
    or v_claim.closed_at is null
    or v_claim.decided_at is null
  then
    raise exception using errcode = '23514', message = 'PG_CLAIM_REOPEN_STATE_INVALID';
  end if;

  if exists (
    select 1
    from public.warranty_claim_resolutions resolution
    where resolution.claim_id = v_claim.id
  ) then
    raise exception using errcode = '23514', message = 'PG_CLAIM_REOPEN_RESOLUTION_EXISTS';
  end if;

  if exists (
    select 1
    from public.warranty_claims later_claim
    where later_claim.warranty_id = v_claim.warranty_id
      and later_claim.id <> v_claim.id
      and (
        later_claim.submitted_at > v_claim.submitted_at
        or (
          later_claim.submitted_at = v_claim.submitted_at
          and later_claim.id > v_claim.id
        )
      )
  ) then
    raise exception using errcode = '23514', message = 'PG_CLAIM_REOPEN_LATER_CLAIM_EXISTS';
  end if;

  select event.*
    into v_superseded_event
  from public.warranty_claim_events event
  where event.claim_id = v_claim.id
    and event.event_kind in ('rejected', 'cancelled')
  order by event.created_at desc, event.id desc
  limit 1;

  if not found then
    raise exception using errcode = '23514', message = 'PG_CLAIM_REOPEN_DECISION_EVENT_MISSING';
  end if;

  update public.warranty_claims claim
  set
    status = 'under_review',
    closed_at = null,
    decided_by_profile_id = null,
    decision_reason = null,
    customer_decision_message = null,
    decided_at = null,
    updated_at = v_reopened_at
  where claim.id = v_claim.id;

  insert into public.warranty_claim_events (
    id,
    claim_id,
    action_request_id,
    event_kind,
    actor_profile_id,
    actor_kind,
    reason,
    event_data,
    created_at
  ) values (
    v_event_id,
    v_claim.id,
    p_action_request_id,
    'decision_reopened_for_correction',
    v_actor_profile_id,
    'admin',
    v_reason,
    jsonb_build_object(
      'superseded_event_id', v_superseded_event.id,
      'superseded_status', v_claim.status,
      'superseded_decided_at', v_claim.decided_at
    ),
    v_reopened_at
  );

  return v_event_id;
end;
$$;

revoke all on function public.reopen_warranty_claim_decision_for_correction(uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.reopen_warranty_claim_decision_for_correction(uuid, uuid, text)
  to authenticated;

comment on function public.approve_warranty_claim(uuid, uuid, text, text) is
  'Cube Q authoritative active-Admin approval. Leaves the Claim open and atomically creates exactly one untouched authorized Resolution header for Cube R.';
comment on function public.reject_warranty_claim(uuid, uuid, text, text) is
  'Cube Q authoritative active-Admin rejection. Closes the Claim without a Resolution while preserving immutable decision audit.';
comment on function public.cancel_warranty_claim(uuid, uuid, text, text) is
  'Cube Q bounded active-Admin cancellation. Ordinary pre-approval closure is allowed from review/inspection; approved closure is allowed only while the one Resolution remains untouched authorized.';
comment on function public.reopen_warranty_claim_decision_for_correction(uuid, uuid, text) is
  'Cube Q PD-078 correction. Reopens only the latest rejected/ordinary-cancelled Claim with no Resolution, preserving the superseded immutable decision event and ignoring natural Warranty expiry.';