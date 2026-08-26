-- Cube Q — Claim Review, Inspection & Decision, increment 2
-- Admin review start plus one actionable formal inspection assignment/reassignment.
-- Center submission and final adjudication remain separate bounded increments.

create function private.lock_actionable_claim_center_party(p_center_party_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_center_id uuid;
  v_operator_profile_id uuid;
begin
  if p_center_party_id is null then
    raise exception using errcode = '22023', message = 'PG_CLAIM_CENTER_REQUIRED';
  end if;

  select center.id
    into v_center_id
  from public.operational_parties party
  join public.installation_centers center
    on center.id = party.installation_center_id
  where party.id = p_center_party_id
    and party.party_type = 'center'
    and center.status = 'active'
  for share of party, center;

  if not found then
    raise exception using errcode = '23514', message = 'PG_CLAIM_CENTER_INACTIVE';
  end if;

  select profile.id
    into v_operator_profile_id
  from public.profiles profile
  where profile.role = 'center'
    and profile.status = 'active'
    and profile.installation_center_id = v_center_id
  order by profile.id
  limit 1
  for share;

  if not found then
    raise exception using errcode = '23514', message = 'PG_CLAIM_CENTER_UNACTIONABLE';
  end if;

  return v_center_id;
end;
$$;

revoke all on function private.lock_actionable_claim_center_party(uuid)
  from public, anon, authenticated, service_role;

comment on function private.lock_actionable_claim_center_party(uuid) is
  'Cube Q commit-time inspection destination guard. Requires a real active Center operational party plus at least one currently active bound Center Profile; network approval is deliberately not an inspection-authority requirement.';

create function public.start_warranty_claim_review(
  p_action_request_id uuid,
  p_claim_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_profile_id uuid;
  v_existing_event public.warranty_claim_events%rowtype;
  v_warranty public.warranties%rowtype;
  v_claim public.warranty_claims%rowtype;
  v_event_id uuid := gen_random_uuid();
  v_event_at timestamptz := clock_timestamp();
begin
  if p_action_request_id is null or p_claim_id is null then
    raise exception using errcode = '22023', message = 'PG_CLAIM_REVIEW_REQUEST_INVALID';
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
      or v_existing_event.event_kind <> 'review_started'
      or v_existing_event.actor_profile_id <> v_actor_profile_id
    then
      raise exception using errcode = '23505', message = 'PG_CLAIM_ACTION_REQUEST_CONFLICT';
    end if;

    return v_existing_event.id;
  end if;

  -- Warranty precedes Claim in the Q serialization order. Claim -> Warranty identity
  -- is immutable, so this first lookup cannot be redirected by a concurrent writer.
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

  if v_claim.status <> 'submitted' or v_claim.closed_at is not null then
    raise exception using errcode = '23514', message = 'PG_CLAIM_REVIEW_STATE_INVALID';
  end if;

  update public.warranty_claims claim
  set
    status = 'under_review',
    updated_at = v_event_at
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
    'review_started',
    v_actor_profile_id,
    'admin',
    null,
    null,
    v_event_at
  );

  return v_event_id;
end;
$$;

revoke all on function public.start_warranty_claim_review(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.start_warranty_claim_review(uuid, uuid)
  to authenticated;

create function public.request_warranty_claim_inspection(
  p_action_request_id uuid,
  p_claim_id uuid,
  p_center_party_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_profile_id uuid;
  v_existing_event public.warranty_claim_events%rowtype;
  v_warranty public.warranties%rowtype;
  v_claim public.warranty_claims%rowtype;
  v_inspection_id uuid := gen_random_uuid();
  v_event_id uuid := gen_random_uuid();
  v_event_at timestamptz := clock_timestamp();
begin
  if p_action_request_id is null
    or p_claim_id is null
    or p_center_party_id is null
  then
    raise exception using errcode = '22023', message = 'PG_CLAIM_INSPECTION_REQUEST_INVALID';
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
      or v_existing_event.event_kind <> 'inspection_requested'
      or v_existing_event.actor_profile_id <> v_actor_profile_id
      or v_existing_event.event_data ->> 'assigned_center_party_id' <> p_center_party_id::text
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
    raise exception using errcode = '23514', message = 'PG_CLAIM_INSPECTION_STATE_INVALID';
  end if;

  if exists (
    select 1
    from public.warranty_claim_inspections inspection
    where inspection.claim_id = v_claim.id
  ) then
    raise exception using errcode = '23505', message = 'PG_CLAIM_INSPECTION_EXISTS';
  end if;

  perform private.lock_actionable_claim_center_party(p_center_party_id);

  insert into public.warranty_claim_inspections (
    id,
    claim_id,
    status,
    assigned_center_party_id,
    requested_by_profile_id,
    requested_at,
    created_at,
    updated_at
  ) values (
    v_inspection_id,
    v_claim.id,
    'requested',
    p_center_party_id,
    v_actor_profile_id,
    v_event_at,
    v_event_at,
    v_event_at
  );

  update public.warranty_claims claim
  set
    status = 'awaiting_inspection',
    updated_at = v_event_at
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
    'inspection_requested',
    v_actor_profile_id,
    'admin',
    null,
    jsonb_build_object(
      'inspection_id', v_inspection_id,
      'assigned_center_party_id', p_center_party_id
    ),
    v_event_at
  );

  return v_event_id;
end;
$$;

revoke all on function public.request_warranty_claim_inspection(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.request_warranty_claim_inspection(uuid, uuid, uuid)
  to authenticated;

create function public.reassign_warranty_claim_inspection(
  p_action_request_id uuid,
  p_claim_id uuid,
  p_center_party_id uuid,
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
  v_inspection public.warranty_claim_inspections%rowtype;
  v_old_center_party_id uuid;
  v_event_id uuid := gen_random_uuid();
  v_event_at timestamptz := clock_timestamp();
begin
  if p_action_request_id is null
    or p_claim_id is null
    or p_center_party_id is null
  then
    raise exception using errcode = '22023', message = 'PG_CLAIM_INSPECTION_REASSIGN_REQUEST_INVALID';
  end if;

  if char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    raise exception using errcode = '22023', message = 'PG_CLAIM_INSPECTION_REASSIGN_REASON_INVALID';
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
      or v_existing_event.event_kind <> 'inspection_reassigned'
      or v_existing_event.actor_profile_id <> v_actor_profile_id
      or v_existing_event.reason <> v_reason
      or v_existing_event.event_data ->> 'new_center_party_id' <> p_center_party_id::text
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

  if v_claim.status <> 'awaiting_inspection' or v_claim.closed_at is not null then
    raise exception using errcode = '23514', message = 'PG_CLAIM_INSPECTION_REASSIGN_STATE_INVALID';
  end if;

  select inspection.*
    into v_inspection
  from public.warranty_claim_inspections inspection
  where inspection.claim_id = v_claim.id
  for update;

  if not found or v_inspection.status <> 'requested' then
    raise exception using errcode = '23514', message = 'PG_CLAIM_INSPECTION_REASSIGN_STATE_INVALID';
  end if;

  if v_inspection.assigned_center_party_id = p_center_party_id then
    raise exception using errcode = '22023', message = 'PG_CLAIM_INSPECTION_REASSIGN_SAME_CENTER';
  end if;

  perform private.lock_actionable_claim_center_party(p_center_party_id);

  v_old_center_party_id := v_inspection.assigned_center_party_id;

  update public.warranty_claim_inspections inspection
  set
    assigned_center_party_id = p_center_party_id,
    updated_at = v_event_at
  where inspection.id = v_inspection.id;

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
    'inspection_reassigned',
    v_actor_profile_id,
    'admin',
    v_reason,
    jsonb_build_object(
      'inspection_id', v_inspection.id,
      'old_center_party_id', v_old_center_party_id,
      'new_center_party_id', p_center_party_id
    ),
    v_event_at
  );

  return v_event_id;
end;
$$;

revoke all on function public.reassign_warranty_claim_inspection(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.reassign_warranty_claim_inspection(uuid, uuid, uuid, text)
  to authenticated;

comment on function public.start_warranty_claim_review(uuid, uuid) is
  'Cube Q active-Admin idempotent submitted -> under_review transition. Natural Warranty expiry is intentionally not re-evaluated after a valid Claim submission.';
comment on function public.request_warranty_claim_inspection(uuid, uuid, uuid) is
  'Cube Q active-Admin idempotent under_review -> awaiting_inspection transition. Creates the single formal inspection only after commit-time actionable-Center validation.';
comment on function public.reassign_warranty_claim_inspection(uuid, uuid, uuid, text) is
  'Cube Q active-Admin idempotent pending-inspection reassignment. Parent Claim and inspection locks serialize reassignment against later Center submission/cancellation.';