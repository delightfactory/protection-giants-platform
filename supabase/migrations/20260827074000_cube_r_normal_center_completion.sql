-- Cube R — Approved Claim Resolution / Replacement & Reinstall, increment 9
-- Normal assigned-Center completion for both frozen remedies. Replacement material
-- is consumed only inside the same transaction that completes the Resolution and
-- closes the approved Claim. No Admin recovery or customer-withdrawal path here.

create table public.warranty_claim_resolution_evidence (
  id uuid primary key default gen_random_uuid(),
  resolution_id uuid not null references public.warranty_claim_resolutions(id) on delete restrict,
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null,
  uploaded_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),

  constraint warranty_claim_resolution_evidence_path_shape
    check (
      storage_path ~ (
        '^resolutions/' || resolution_id::text || '/completion/[1-5]-[0-9a-f]{64}\.(jpg|png|webp)$'
      )
    ),
  constraint warranty_claim_resolution_evidence_mime_allowed
    check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  constraint warranty_claim_resolution_evidence_size_allowed
    check (size_bytes > 0 and size_bytes <= 8388608),
  constraint warranty_claim_resolution_evidence_extension_matches_mime
    check (
      (mime_type = 'image/jpeg' and storage_path ~ '\.jpg$')
      or (mime_type = 'image/png' and storage_path ~ '\.png$')
      or (mime_type = 'image/webp' and storage_path ~ '\.webp$')
    )
);

create index warranty_claim_resolution_evidence_resolution_idx
  on public.warranty_claim_resolution_evidence (resolution_id, created_at, id);

create function private.reject_warranty_claim_resolution_evidence_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'PG_CLAIM_RESOLUTION_EVIDENCE_IMMUTABLE';
end;
$$;

revoke all on function private.reject_warranty_claim_resolution_evidence_mutation()
  from public, anon, authenticated, service_role;

create trigger warranty_claim_resolution_evidence_immutable
  before update or delete on public.warranty_claim_resolution_evidence
  for each row execute function private.reject_warranty_claim_resolution_evidence_mutation();

alter table public.warranty_claim_resolution_evidence enable row level security;
revoke all on table public.warranty_claim_resolution_evidence
  from public, anon, authenticated, service_role;

comment on table public.warranty_claim_resolution_evidence is
  'Cube R private completion-evidence metadata. Objects remain in the existing warranty-claim-evidence bucket; metadata is committed only by the authoritative completion transaction and is immutable afterward.';

create function public.complete_warranty_claim_resolution(
  p_action_request_id uuid,
  p_resolution_id uuid,
  p_completion_note text,
  p_evidence_paths text[],
  p_replacement_roll_serial text default null
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
  v_note text := btrim(coalesce(p_completion_note, ''));
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
  if p_action_request_id is null
    or p_resolution_id is null
    or v_actor_profile_id is null
  then
    raise exception using errcode = '22023', message = 'PG_CLAIM_RESOLUTION_COMPLETE_REQUEST_INVALID';
  end if;

  if char_length(v_note) < 10 or char_length(v_note) > 2000 then
    raise exception using errcode = '22023', message = 'PG_CLAIM_RESOLUTION_COMPLETION_NOTE_INVALID';
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

  -- Lightweight actor preflight only. Authoritative Profile/Center revalidation
  -- occurs after Warranty -> Claim -> Resolution locks so no reverse domain lock
  -- is introduced ahead of the Claims serialization anchor.
  select profile.installation_center_id
    into v_actor_center_id
  from public.profiles profile
  where profile.id = v_actor_profile_id
    and profile.role = 'center'
    and profile.status = 'active';

  if not found or v_actor_center_id is null then
    raise exception using errcode = '42501', message = 'PG_CLAIM_RESOLUTION_CENTER_REQUIRED';
  end if;

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
      or v_existing_event.event_kind <> 'resolution_completed'
      or v_existing_event.actor_profile_id <> v_actor_profile_id
      or v_existing_event.actor_kind <> 'center'
      or v_resolution.status <> 'completed'
      or v_resolution.completed_by_profile_id <> v_actor_profile_id
      or v_resolution.completion_actor_kind <> 'center'
      or v_resolution.completion_note <> v_note
      or v_existing_paths is distinct from v_input_paths
      or coalesce(v_existing_event.event_data ->> 'replacement_roll_serial', '')
           is distinct from coalesce(v_scan_serial, '')
    then
      raise exception using errcode = '23505', message = 'PG_CLAIM_RESOLUTION_ACTION_REQUEST_CONFLICT';
    end if;

    return p_resolution_id;
  end if;

  -- Canonical completion order begins Warranty -> Claim -> Resolution.
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

  -- Commit-time actor revalidation: exact assigned active Center and active bound
  -- Center Profile. Network approval remains intentionally irrelevant in V1.
  select profile.installation_center_id, party.id
    into v_actor_center_id, v_actor_center_party_id
  from public.profiles profile
  join public.installation_centers center on center.id = profile.installation_center_id
  join public.operational_parties party
    on party.installation_center_id = center.id
   and party.party_type = 'center'
  where profile.id = v_actor_profile_id
    and profile.role = 'center'
    and profile.status = 'active'
    and center.status = 'active'
  for share of profile, center, party;

  if not found then
    raise exception using errcode = '42501', message = 'PG_CLAIM_RESOLUTION_CENTER_INACTIVE';
  end if;

  if v_actor_center_party_id <> v_resolution.performing_center_party_id then
    raise exception using errcode = '42501', message = 'PG_CLAIM_RESOLUTION_NOT_ASSIGNED_CENTER';
  end if;

  -- Evidence objects are private and server-uploaded. The DB transaction verifies
  -- exact object identity/metadata and locks the metadata rows before committing
  -- durable evidence references.
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

    -- Resolution lock serializes release/reassignment/remedy changes. Read the one
    -- reserved allocation identity, then preserve the physical prefix:
    -- Production Order -> current custody -> allocation -> Opening/Issue facts.
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

    -- K uses the same Production -> custody prefix. Holding those rows here means
    -- a concurrent Issue either commits first and is observed below, or waits and
    -- later sees the consumed terminal guard after this completion commits.
    perform opening.id
    from public.roll_openings opening
    where opening.roll_id = v_roll_id
    for share;

    perform issue.id
    from public.roll_preinstall_issues issue
    where issue.roll_id = v_roll_id
    order by issue.created_at, issue.id
    for share;

    perform private.require_claim_replacement_roll_consumption_ready(v_resolution.id, v_roll_id);
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
      'center',
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
    completion_actor_kind = 'center',
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
    'resolution_completed',
    v_actor_profile_id,
    'center',
    null,
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

revoke all on function public.complete_warranty_claim_resolution(uuid, uuid, text, text[], text)
  from public, anon, authenticated, service_role;
grant execute on function public.complete_warranty_claim_resolution(uuid, uuid, text, text[], text)
  to authenticated;

comment on function public.complete_warranty_claim_resolution(uuid, uuid, text, text[], text) is
  'Cube R normal assigned-Center completion. Under Warranty -> Claim -> Resolution and, for replacement, Production -> custody -> allocation -> J/K facts, validates private completion evidence and exact Roll scan, atomically consumes reserved replacement material when applicable, completes the Resolution and closes the approved Claim. No Warranty renewal or standalone consume operation.';