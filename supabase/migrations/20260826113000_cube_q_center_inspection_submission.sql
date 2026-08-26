-- Cube Q — Claim Review, Inspection & Decision, increment 4
-- Exact assigned Center submits the one formal technical inspection with private
-- evidence. The Center never receives adjudication authority.

create function public.submit_warranty_claim_inspection(
  p_action_request_id uuid,
  p_inspection_id uuid,
  p_technical_observation text,
  p_suspected_cause text,
  p_evidence_paths text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_profile_id uuid := auth.uid();
  v_actor_center_id uuid;
  v_actor_center_party_id uuid;
  v_observation text := btrim(coalesce(p_technical_observation, ''));
  v_suspected_cause text := nullif(btrim(coalesce(p_suspected_cause, '')), '');
  v_input_paths text[];
  v_existing_paths text[];
  v_existing_event public.warranty_claim_events%rowtype;
  v_warranty public.warranties%rowtype;
  v_claim public.warranty_claims%rowtype;
  v_inspection public.warranty_claim_inspections%rowtype;
  v_path text;
  v_object_metadata jsonb;
  v_mime text;
  v_size bigint;
  v_event_id uuid := gen_random_uuid();
  v_submitted_at timestamptz := clock_timestamp();
begin
  if p_action_request_id is null
    or p_inspection_id is null
    or v_actor_profile_id is null
  then
    raise exception using errcode = '22023', message = 'PG_CLAIM_INSPECTION_SUBMIT_REQUEST_INVALID';
  end if;

  if char_length(v_observation) < 10 or char_length(v_observation) > 3000 then
    raise exception using errcode = '22023', message = 'PG_CLAIM_INSPECTION_OBSERVATION_INVALID';
  end if;

  if v_suspected_cause is not null
    and (char_length(v_suspected_cause) < 2 or char_length(v_suspected_cause) > 1000)
  then
    raise exception using errcode = '22023', message = 'PG_CLAIM_INSPECTION_CAUSE_INVALID';
  end if;

  if coalesce(cardinality(p_evidence_paths), 0) < 1
    or coalesce(cardinality(p_evidence_paths), 0) > 5
  then
    raise exception using errcode = '22023', message = 'PG_CLAIM_INSPECTION_EVIDENCE_INVALID';
  end if;

  select coalesce(array_agg(path order by path), '{}'::text[])
    into v_input_paths
  from (
    select distinct path
    from unnest(coalesce(p_evidence_paths, '{}'::text[])) as evidence(path)
  ) deduped;

  if cardinality(v_input_paths) <> cardinality(p_evidence_paths) then
    raise exception using errcode = '22023', message = 'PG_CLAIM_INSPECTION_EVIDENCE_INVALID';
  end if;

  -- Lightweight identity preflight only. We deliberately avoid a Profile/Center
  -- row lock here; Q's domain rows lock first so reassignment/submission cannot
  -- deadlock through opposite Center-profile lock ordering.
  select profile.installation_center_id
    into v_actor_center_id
  from public.profiles profile
  where profile.id = v_actor_profile_id
    and profile.role = 'center'
    and profile.status = 'active';

  if not found or v_actor_center_id is null then
    raise exception using errcode = '42501', message = 'PG_CLAIM_INSPECTION_CENTER_REQUIRED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_action_request_id::text, 0)
  );

  select event.*
    into v_existing_event
  from public.warranty_claim_events event
  where event.action_request_id = p_action_request_id;

  if found then
    select inspection.*
      into v_inspection
    from public.warranty_claim_inspections inspection
    where inspection.id = p_inspection_id;

    if not found then
      raise exception using errcode = '23514', message = 'PG_CLAIM_INSPECTION_NOT_FOUND';
    end if;

    select coalesce(array_agg(evidence.storage_path order by evidence.storage_path), '{}'::text[])
      into v_existing_paths
    from public.warranty_claim_inspection_evidence evidence
    where evidence.inspection_id = v_inspection.id;

    if v_existing_event.claim_id <> v_inspection.claim_id
      or v_existing_event.event_kind <> 'inspection_submitted'
      or v_existing_event.actor_profile_id <> v_actor_profile_id
      or v_inspection.status <> 'submitted'
      or v_inspection.submitted_by_profile_id <> v_actor_profile_id
      or v_inspection.technical_observation <> v_observation
      or v_inspection.suspected_cause is distinct from v_suspected_cause
      or v_existing_paths is distinct from v_input_paths
    then
      raise exception using errcode = '23505', message = 'PG_CLAIM_ACTION_REQUEST_CONFLICT';
    end if;

    return v_inspection.id;
  end if;

  -- Same Q serialization order as Admin inspection mutations: Warranty -> Claim ->
  -- Inspection. Reassignment/cancellation/submission therefore have one winner.
  select warranty.*
    into v_warranty
  from public.warranty_claim_inspections inspection
  join public.warranty_claims claim on claim.id = inspection.claim_id
  join public.warranties warranty on warranty.id = claim.warranty_id
  where inspection.id = p_inspection_id
  for update of warranty;

  if not found then
    raise exception using errcode = '22023', message = 'PG_CLAIM_INSPECTION_NOT_FOUND';
  end if;

  if v_warranty.record_state <> 'issued' then
    raise exception using errcode = '23514', message = 'PG_CLAIM_WARRANTY_INVALID';
  end if;

  select claim.*
    into v_claim
  from public.warranty_claim_inspections inspection
  join public.warranty_claims claim on claim.id = inspection.claim_id
  where inspection.id = p_inspection_id
  for update of claim;

  if not found
    or v_claim.status <> 'awaiting_inspection'
    or v_claim.closed_at is not null
  then
    raise exception using errcode = '23514', message = 'PG_CLAIM_INSPECTION_PARENT_STATE_INVALID';
  end if;

  select inspection.*
    into v_inspection
  from public.warranty_claim_inspections inspection
  where inspection.id = p_inspection_id
  for update;

  if not found or v_inspection.status <> 'requested' then
    raise exception using errcode = '23514', message = 'PG_CLAIM_INSPECTION_SUBMIT_STATE_INVALID';
  end if;

  -- Commit-time actor revalidation after the Claim/inspection locks. The exact
  -- assigned Center must still be active and the submitting Profile must still be
  -- an active bound operator. Network approval is intentionally irrelevant here.
  select profile.installation_center_id, party.id
    into v_actor_center_id, v_actor_center_party_id
  from public.profiles profile
  join public.installation_centers center
    on center.id = profile.installation_center_id
  join public.operational_parties party
    on party.installation_center_id = center.id
   and party.party_type = 'center'
  where profile.id = v_actor_profile_id
    and profile.role = 'center'
    and profile.status = 'active'
    and center.status = 'active'
  for share of profile, center, party;

  if not found then
    raise exception using errcode = '42501', message = 'PG_CLAIM_INSPECTION_CENTER_INACTIVE';
  end if;

  if v_actor_center_party_id <> v_inspection.assigned_center_party_id then
    raise exception using errcode = '42501', message = 'PG_CLAIM_INSPECTION_NOT_ASSIGNED_CENTER';
  end if;

  foreach v_path in array v_input_paths loop
    if v_path !~ ('^inspections/' || p_inspection_id::text || '/[0-9]+-[0-9a-f]{64}\.(jpg|png|webp)$') then
      raise exception using errcode = '22023', message = 'PG_CLAIM_INSPECTION_EVIDENCE_INVALID';
    end if;

    select object.metadata
      into v_object_metadata
    from storage.objects object
    where object.bucket_id = 'warranty-claim-evidence'
      and object.name = v_path;

    if not found then
      raise exception using errcode = '22023', message = 'PG_CLAIM_INSPECTION_EVIDENCE_INVALID';
    end if;

    v_mime := coalesce(v_object_metadata ->> 'mimetype', '');
    begin
      v_size := coalesce((v_object_metadata ->> 'size')::bigint, 0);
    exception when others then
      raise exception using errcode = '22023', message = 'PG_CLAIM_INSPECTION_EVIDENCE_INVALID';
    end;

    if v_mime not in ('image/jpeg', 'image/png', 'image/webp')
      or v_size < 1
      or v_size > 8388608
    then
      raise exception using errcode = '22023', message = 'PG_CLAIM_INSPECTION_EVIDENCE_INVALID';
    end if;
  end loop;

  update public.warranty_claim_inspections inspection
  set
    status = 'submitted',
    submitted_by_profile_id = v_actor_profile_id,
    technical_observation = v_observation,
    suspected_cause = v_suspected_cause,
    submitted_at = v_submitted_at,
    updated_at = v_submitted_at
  where inspection.id = v_inspection.id;

  foreach v_path in array v_input_paths loop
    select object.metadata
      into v_object_metadata
    from storage.objects object
    where object.bucket_id = 'warranty-claim-evidence'
      and object.name = v_path;

    insert into public.warranty_claim_inspection_evidence (
      inspection_id,
      storage_path,
      mime_type,
      size_bytes,
      uploaded_by_profile_id,
      created_at
    ) values (
      v_inspection.id,
      v_path,
      v_object_metadata ->> 'mimetype',
      (v_object_metadata ->> 'size')::bigint,
      v_actor_profile_id,
      v_submitted_at
    );
  end loop;

  update public.warranty_claims claim
  set
    status = 'under_review',
    updated_at = v_submitted_at
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
    'inspection_submitted',
    v_actor_profile_id,
    'center',
    null,
    jsonb_build_object(
      'inspection_id', v_inspection.id,
      'assigned_center_party_id', v_actor_center_party_id,
      'evidence_count', cardinality(v_input_paths)
    ),
    v_submitted_at
  );

  return v_inspection.id;
end;
$$;

revoke all on function public.submit_warranty_claim_inspection(uuid, uuid, text, text, text[])
  from public, anon, authenticated, service_role;
grant execute on function public.submit_warranty_claim_inspection(uuid, uuid, text, text, text[])
  to authenticated;

comment on function public.submit_warranty_claim_inspection(uuid, uuid, text, text, text[]) is
  'Cube Q exact-assigned-Center inspection submission. Revalidates active Center/Profile, parent Claim, immutable evidence objects and assignment under Warranty -> Claim -> Inspection locks, then returns the Claim to under_review atomically.';