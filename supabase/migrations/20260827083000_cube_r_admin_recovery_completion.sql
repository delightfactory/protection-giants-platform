-- Cube R — narrow Admin completion recovery after real fulfillment when the assigned Center
-- can no longer complete digitally. This is an exception path only: while the assigned
-- Center remains actionable, normal Center completion is mandatory. No new lifecycle,
-- material model, evidence model, or Warranty mutation is introduced.

create function private.lock_claim_center_unactionable_for_recovery(
  p_center_party_id uuid
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_center_id uuid;
  v_center_status text;
  v_profile record;
  v_has_active_profile boolean := false;
begin
  if p_center_party_id is null then
    raise exception using errcode = '22023', message = 'PG_CLAIM_RESOLUTION_CENTER_CONTEXT_INVALID';
  end if;

  select party.installation_center_id, center.status
    into v_center_id, v_center_status
  from public.operational_parties party
  join public.installation_centers center on center.id = party.installation_center_id
  where party.id = p_center_party_id
    and party.party_type = 'center'
  for share of party, center;

  if not found or v_center_id is null then
    raise exception using errcode = '23514', message = 'PG_CLAIM_RESOLUTION_CENTER_CONTEXT_INVALID';
  end if;

  for v_profile in
    select profile.status
    from public.profiles profile
    where profile.role = 'center'
      and profile.installation_center_id = v_center_id
    order by profile.id
    for share
  loop
    if v_profile.status = 'active' then
      v_has_active_profile := true;
    end if;
  end loop;

  if v_center_status = 'active' and v_has_active_profile then
    raise exception using errcode = '42501', message = 'PG_CLAIM_RESOLUTION_ADMIN_RECOVERY_NOT_ALLOWED';
  end if;

  return v_center_id;
end;
$$;

revoke all on function private.lock_claim_center_unactionable_for_recovery(uuid)
  from public, anon, authenticated, service_role;

comment on function private.lock_claim_center_unactionable_for_recovery(uuid) is
  'Cube R narrow recovery gate. Locks the assigned Center and bound Center Profiles and permits Admin completion recovery only when the Center is inactive or no active bound Center Profile remains.';

create function public.complete_warranty_claim_resolution_by_admin_recovery(
  p_action_request_id uuid,
  p_resolution_id uuid,
  p_completion_note text,
  p_evidence_paths text[],
  p_recovery_reason text,
  p_replacement_roll_serial text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_profile_id uuid;
  v_note text := btrim(coalesce(p_completion_note, ''));
  v_recovery_reason text := btrim(coalesce(p_recovery_reason, ''));
  v_scan_serial text := nullif(btrim(coalesce(p_replacement_roll_serial, '')), '');
  v_input_paths text[];
  v_existing_paths text[];
  v_existing_event public.warranty_claim_resolution_events%rowtype;
  v_claim_id uuid;
  v_warranty_state text;
  v_claim public.warranty_claims%rowtype;
  v_resolution public.warranty_claim_resolutions%rowtype;
  v_path text;
  v_slot integer;
  v_slots integer[] := '{}'::integer[];
  v_object_metadata jsonb;
  v_mime text;
  v_size bigint;
  v_allocation_id uuid;
  v_roll_id uuid;
  v_roll_serial text;
  v_production_order_id uuid;
  v_production_status text;
  v_custodian_party_id uuid;
  v_allocation public.warranty_claim_resolution_roll_allocations%rowtype;
  v_consumed_event_request_id uuid := gen_random_uuid();
  v_completed_at timestamptz := clock_timestamp();
begin
  if p_action_request_id is null or p_resolution_id is null then
    raise exception using errcode = '22023', message = 'PG_CLAIM_RESOLUTION_ADMIN_RECOVERY_REQUEST_INVALID';
  end if;

  if char_length(v_note) < 10 or char_length(v_note) > 2000 then
    raise exception using errcode = '22023', message = 'PG_CLAIM_RESOLUTION_COMPLETION_NOTE_INVALID';
  end if;

  if char_length(v_recovery_reason) < 5 or char_length(v_recovery_reason) > 500 then
    raise exception using errcode = '22023', message = 'PG_CLAIM_RESOLUTION_ADMIN_RECOVERY_REASON_INVALID';
  end if;

  if coalesce(cardinality(p_evidence_paths), 0) < 1
    or coalesce(cardinality(p_evidence_paths), 0) > 5
  then
    raise exception using errcode = '22023', message = 'PG_CLAIM_RESOLUTION_EVIDENCE_INVALID';
  end if;

  select coalesce(array_agg(path order by path), '{}'::text[])
    into v_input_paths
  from (
    select distinct path
    from unnest(coalesce(p_evidence_paths, '{}'::text[])) as evidence(path)
  ) deduped;

  if cardinality(v_input_paths) <> cardinality(p_evidence_paths) then
    raise exception using errcode = '22023', message = 'PG_CLAIM_RESOLUTION_EVIDENCE_INVALID';
  end if;

  foreach v_path in array v_input_paths loop
    if v_path !~ ('^resolutions/' || p_resolution_id::text || '/completion/[1-5]-[0-9a-f]{64}\.(jpg|png|webp)$') then
      raise exception using errcode = '22023', message = 'PG_CLAIM_RESOLUTION_EVIDENCE_INVALID';
    end if;

    begin
      v_slot := substring(v_path from '/completion/([1-5])-')::integer;
    exception when others then
      raise exception using errcode = '22023', message = 'PG_CLAIM_RESOLUTION_EVIDENCE_INVALID';
    end;

    if v_slot = any(v_slots) then
      raise exception using errcode = '22023', message = 'PG_CLAIM_RESOLUTION_EVIDENCE_INVALID';
    end if;
    v_slots := array_append(v_slots, v_slot);
  end loop;

  v_actor_profile_id := private.lock_warranty_admin_context();

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_action_request_id::text, 0)
  );

  select event.*
    into v_existing_event
  from public.warranty_claim_resolution_events event
  where event.action_request_id = p_action_request_id;

  if found then
    select resolution.*
      into v_resolution
    from public.warranty_claim_resolutions resolution
    where resolution.id = p_resolution_id;

    select coalesce(array_agg(evidence.storage_path order by evidence.storage_path), '{}'::text[])
      into v_existing_paths
    from public.warranty_claim_resolution_evidence evidence
    where evidence.resolution_id = p_resolution_id;

    if v_resolution.id is null
      or v_existing_event.resolution_id <> p_resolution_id
      or v_existing_event.event_kind <> 'resolution_completed_admin_recovery'
      or v_existing_event.actor_profile_id <> v_actor_profile_id
      or v_existing_event.actor_kind <> 'admin'
      or v_existing_event.reason <> v_recovery_reason
      or v_resolution.status <> 'completed'
      or v_resolution.completed_by_profile_id <> v_actor_profile_id
      or v_resolution.completion_actor_kind <> 'admin_recovery'
      or v_resolution.completion_note <> v_note
      or v_existing_paths is distinct from v_input_paths
      or coalesce(v_existing_event.event_data ->> 'replacement_roll_serial', '')
           is distinct from coalesce(v_scan_serial, '')
    then
      raise exception using errcode = '23505', message = 'PG_CLAIM_RESOLUTION_ACTION_REQUEST_CONFLICT';
    end if;

    return p_resolution_id;
  end if;

  select claim.id, warranty.record_state
    into v_claim_id, v_warranty_state
  from public.warranty_claim_resolutions resolution
  join public.warranty_claims claim on claim.id = resolution.claim_id
  join public.warranties warranty on warranty.id = claim.warranty_id
  where resolution.id = p_resolution_id
  for update of warranty;

  if not found then
    raise exception using errcode = '22023', message = 'PG_CLAIM_RESOLUTION_NOT_FOUND';
  end if;

  if v_warranty_state <> 'issued' then
    raise exception using errcode = '23514', message = 'PG_CLAIM_WARRANTY_INVALID';
  end if;

  select claim.*
    into v_claim
  from public.warranty_claims claim
  where claim.id = v_claim_id
  for update;

  if not found or v_claim.status <> 'approved' or v_claim.closed_at is not null then
    raise exception using errcode = '23514', message = 'PG_CLAIM_RESOLUTION_COMPLETE_STATE_INVALID';
  end if;

  select resolution.*
    into v_resolution
  from public.warranty_claim_resolutions resolution
  where resolution.id = p_resolution_id
  for update;

  if not found
    or v_resolution.claim_id <> v_claim.id
    or v_resolution.status <> 'assigned'
    or v_resolution.performing_center_party_id is null
    or v_resolution.remedy_kind not in ('service_reinstall', 'replacement_roll_reinstall')
  then
    raise exception using errcode = '23514', message = 'PG_CLAIM_RESOLUTION_COMPLETE_STATE_INVALID';
  end if;

  perform private.lock_claim_center_unactionable_for_recovery(
    v_resolution.performing_center_party_id
  );

  foreach v_path in array v_input_paths loop
    select object.metadata
      into v_object_metadata
    from storage.objects object
    where object.bucket_id = 'warranty-claim-evidence'
      and object.name = v_path
    for share;

    if not found then
      raise exception using errcode = '22023', message = 'PG_CLAIM_RESOLUTION_EVIDENCE_INVALID';
    end if;

    v_mime := coalesce(v_object_metadata ->> 'mimetype', '');
    begin
      v_size := coalesce((v_object_metadata ->> 'size')::bigint, 0);
    exception when others then
      raise exception using errcode = '22023', message = 'PG_CLAIM_RESOLUTION_EVIDENCE_INVALID';
    end;

    if v_mime not in ('image/jpeg', 'image/png', 'image/webp')
      or v_size < 1
      or v_size > 8388608
      or (v_mime = 'image/jpeg' and v_path !~ '\.jpg$')
      or (v_mime = 'image/png' and v_path !~ '\.png$')
      or (v_mime = 'image/webp' and v_path !~ '\.webp$')
    then
      raise exception using errcode = '22023', message = 'PG_CLAIM_RESOLUTION_EVIDENCE_INVALID';
    end if;
  end loop;

  if v_resolution.remedy_kind = 'service_reinstall' then
    if v_scan_serial is not null then
      raise exception using errcode = '22023', message = 'PG_CLAIM_RESOLUTION_REPLACEMENT_SCAN_INVALID';
    end if;

    if exists (
      select 1
      from public.warranty_claim_resolution_roll_allocations allocation
      where allocation.resolution_id = v_resolution.id
        and allocation.status in ('reserved', 'consumed')
    ) then
      raise exception using errcode = '23514', message = 'PG_CLAIM_RESOLUTION_SERVICE_MATERIAL_CONFLICT';
    end if;
  else
    if v_scan_serial is null then
      raise exception using errcode = '22023', message = 'PG_CLAIM_RESOLUTION_REPLACEMENT_SCAN_INVALID';
    end if;

    select allocation.id, allocation.roll_id, roll.serial_number, roll.production_order_id
      into v_allocation_id, v_roll_id, v_roll_serial, v_production_order_id
    from public.warranty_claim_resolution_roll_allocations allocation
    join public.rolls roll on roll.id = allocation.roll_id
    where allocation.resolution_id = v_resolution.id
      and allocation.status = 'reserved';

    if not found then
      raise exception using errcode = '23514', message = 'PG_CLAIM_CONSUMPTION_ALLOCATION_INVALID';
    end if;

    if v_scan_serial <> v_roll_serial then
      raise exception using errcode = '23514', message = 'PG_CLAIM_RESOLUTION_REPLACEMENT_SCAN_MISMATCH';
    end if;

    select production_order.status
      into v_production_status
    from public.production_orders production_order
    where production_order.id = v_production_order_id
    for update;

    if not found or v_production_status <> 'generated' then
      raise exception using errcode = '23514', message = 'PG_CLAIM_CONSUMPTION_PRODUCTION_INVALID';
    end if;

    select custody.custodian_party_id
      into v_custodian_party_id
    from public.roll_custody_current custody
    where custody.roll_id = v_roll_id
    for update;

    if not found then
      raise exception using errcode = '23514', message = 'PG_CLAIM_CONSUMPTION_CUSTODY_INVALID';
    end if;

    select allocation.*
      into v_allocation
    from public.warranty_claim_resolution_roll_allocations allocation
    where allocation.id = v_allocation_id
    for update;

    if not found or v_allocation.status <> 'reserved' then
      raise exception using errcode = '23514', message = 'PG_CLAIM_CONSUMPTION_ALLOCATION_INVALID';
    end if;

    perform opening.roll_id
    from public.roll_openings opening
    where opening.roll_id = v_roll_id
    for share;

    perform issue.id
    from public.roll_preinstall_issues issue
    where issue.roll_id = v_roll_id
    order by issue.created_at, issue.id
    for share;

    perform private.require_claim_replacement_roll_consumption_ready(
      v_resolution.id,
      v_roll_id
    );
  end if;

  foreach v_path in array v_input_paths loop
    select object.metadata
      into v_object_metadata
    from storage.objects object
    where object.bucket_id = 'warranty-claim-evidence'
      and object.name = v_path;

    insert into public.warranty_claim_resolution_evidence (
      resolution_id,
      storage_path,
      mime_type,
      size_bytes,
      uploaded_by_profile_id,
      created_at
    ) values (
      v_resolution.id,
      v_path,
      v_object_metadata ->> 'mimetype',
      (v_object_metadata ->> 'size')::bigint,
      v_actor_profile_id,
      v_completed_at
    );
  end loop;

  if v_resolution.remedy_kind = 'replacement_roll_reinstall' then
    update public.warranty_claim_resolution_roll_allocations allocation
    set
      status = 'consumed',
      consumed_by_profile_id = v_actor_profile_id,
      consumed_at = v_completed_at
    where allocation.id = v_allocation.id;

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
      v_consumed_event_request_id,
      'replacement_roll_consumed',
      v_actor_profile_id,
      'admin',
      null,
      jsonb_build_object(
        'claim_id', v_claim.id,
        'allocation_id', v_allocation.id,
        'roll_id', v_roll_id,
        'product_eligibility_basis', v_allocation.product_eligibility_basis,
        'completion_action_request_id', p_action_request_id
      ),
      v_completed_at
    );
  end if;

  update public.warranty_claim_resolutions resolution
  set
    status = 'completed',
    completed_by_profile_id = v_actor_profile_id,
    completion_actor_kind = 'admin_recovery',
    completion_note = v_note,
    completed_at = v_completed_at,
    updated_at = v_completed_at
  where resolution.id = v_resolution.id;

  update public.warranty_claims claim
  set
    closed_at = v_completed_at,
    updated_at = v_completed_at
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
    'resolution_completed_admin_recovery',
    v_actor_profile_id,
    'admin',
    v_recovery_reason,
    jsonb_build_object(
      'claim_id', v_claim.id,
      'remedy_kind', v_resolution.remedy_kind,
      'performing_center_party_id', v_resolution.performing_center_party_id,
      'evidence_count', cardinality(v_input_paths),
      'allocation_id', v_allocation_id,
      'roll_id', v_roll_id,
      'replacement_roll_serial', coalesce(v_scan_serial, '')
    ),
    v_completed_at
  );

  return v_resolution.id;
end;
$$;

revoke all on function public.complete_warranty_claim_resolution_by_admin_recovery(
  uuid, uuid, text, text[], text, text
) from public, anon, authenticated, service_role;

grant execute on function public.complete_warranty_claim_resolution_by_admin_recovery(
  uuid, uuid, text, text[], text, text
) to authenticated;

comment on function public.complete_warranty_claim_resolution_by_admin_recovery(
  uuid, uuid, text, text[], text, text
) is
  'Cube R narrow Admin recovery completion. Only when the assigned Center is inactive or has no active bound Center Profile, validates the same private evidence/material/J/K facts as normal completion, atomically consumes exact reserved replacement material when applicable, completes the Resolution as admin_recovery and closes the already-approved Claim without changing the original Warranty.';
