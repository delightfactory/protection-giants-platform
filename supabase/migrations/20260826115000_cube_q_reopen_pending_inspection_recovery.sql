-- Cube Q — PD-078 pending-inspection reopen recovery
-- Bounded dead-end correction: an ordinary cancellation made while the one formal
-- inspection is still requested must reopen to that same actionable stage rather
-- than under_review, where the surviving requested inspection would block every
-- decision and no second inspection may be created.

create or replace function private.guard_warranty_claim_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '42501', message = 'PG_CLAIM_IMMUTABLE';
  end if;

  if new.id is distinct from old.id
    or new.request_id is distinct from old.request_id
    or new.warranty_id is distinct from old.warranty_id
    or new.claim_number is distinct from old.claim_number
    or new.category is distinct from old.category
    or new.affected_area is distinct from old.affected_area
    or new.description is distinct from old.description
    or new.submitted_at is distinct from old.submitted_at
    or new.created_at is distinct from old.created_at
  then
    raise exception using errcode = '42501', message = 'PG_CLAIM_IDENTITY_IMMUTABLE';
  end if;

  if not (
    (old.status = 'submitted' and new.status = 'under_review')
    or (old.status = 'under_review' and new.status in ('awaiting_inspection', 'approved', 'rejected', 'cancelled'))
    or (old.status = 'awaiting_inspection' and new.status in ('under_review', 'cancelled'))
    or (old.status = 'approved' and new.status = 'cancelled')
    or (old.status = 'rejected' and new.status = 'under_review')
    or (old.status = 'cancelled' and new.status in ('under_review', 'awaiting_inspection'))
  ) then
    raise exception using errcode = '42501', message = 'PG_CLAIM_INVALID_TRANSITION';
  end if;

  if new.updated_at < old.updated_at then
    raise exception using errcode = '42501', message = 'PG_CLAIM_UPDATED_AT_INVALID';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_warranty_claim_mutation()
  from public, anon, authenticated, service_role;

create or replace function public.reopen_warranty_claim_decision_for_correction(
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
  v_pending_inspection_id uuid;
  v_resume_status text := 'under_review';
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

  select inspection.id
    into v_pending_inspection_id
  from public.warranty_claim_inspections inspection
  where inspection.claim_id = v_claim.id
    and inspection.status = 'requested';

  if found then
    if v_claim.status <> 'cancelled' then
      raise exception using errcode = '23514', message = 'PG_CLAIM_REOPEN_INSPECTION_STATE_INVALID';
    end if;
    v_resume_status := 'awaiting_inspection';
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
    status = v_resume_status,
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
      'superseded_decided_at', v_claim.decided_at,
      'resumed_status', v_resume_status,
      'resumed_inspection_id', v_pending_inspection_id
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

comment on function public.reopen_warranty_claim_decision_for_correction(uuid, uuid, text) is
  'Cube Q PD-078 correction. Normally reopens the latest rejected/ordinary-cancelled Claim to under_review; if an ordinary cancellation preserved the one requested inspection, resumes awaiting_inspection with that same row so the lifecycle has no dead end.';
