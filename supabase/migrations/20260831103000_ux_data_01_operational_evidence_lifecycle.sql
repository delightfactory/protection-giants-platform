-- UX-DATA-01 — Operational Evidence Lifecycle
-- Bounded server-owned staging for authenticated Inspection / Center Completion /
-- Admin Recovery evidence. Customer Claim draft evidence keeps its Cube P lifecycle.

create table private.operational_evidence_stages (
  id uuid primary key default gen_random_uuid(),
  flow_kind text not null,
  inspection_id uuid references public.warranty_claim_inspections(id) on delete restrict,
  resolution_id uuid references public.warranty_claim_resolutions(id) on delete restrict,
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  slot smallint not null,
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null,
  state text not null default 'staged',
  created_at timestamptz not null default clock_timestamp(),
  delete_reserved_at timestamptz,
  consumed_at timestamptz,

  constraint operational_evidence_stages_flow_allowed
    check (flow_kind in ('inspection', 'center_completion', 'admin_recovery')),
  constraint operational_evidence_stages_owner_shape
    check (
      (flow_kind = 'inspection' and inspection_id is not null and resolution_id is null)
      or (
        flow_kind in ('center_completion', 'admin_recovery')
        and inspection_id is null
        and resolution_id is not null
      )
    ),
  constraint operational_evidence_stages_slot_allowed
    check (slot between 1 and 5),
  constraint operational_evidence_stages_mime_allowed
    check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  constraint operational_evidence_stages_size_allowed
    check (size_bytes > 0 and size_bytes <= 8388608),
  constraint operational_evidence_stages_extension_matches_mime
    check (
      (mime_type = 'image/jpeg' and storage_path ~ '\.jpg$')
      or (mime_type = 'image/png' and storage_path ~ '\.png$')
      or (mime_type = 'image/webp' and storage_path ~ '\.webp$')
    ),
  constraint operational_evidence_stages_path_shape
    check (
      (
        flow_kind = 'inspection'
        and storage_path ~ (
          '^inspections/' || inspection_id::text || '/[1-5]-[0-9a-f]{64}\.(jpg|png|webp)$'
        )
      )
      or (
        flow_kind in ('center_completion', 'admin_recovery')
        and storage_path ~ (
          '^resolutions/' || resolution_id::text || '/completion/[1-5]-[0-9a-f]{64}\.(jpg|png|webp)$'
        )
      )
    ),
  constraint operational_evidence_stages_slot_matches_path
    check (
      substring(storage_path from '(?:/|completion/)([1-5])-[0-9a-f]{64}\.')::smallint = slot
    ),
  constraint operational_evidence_stages_state_allowed
    check (state in ('staged', 'delete_pending', 'consumed')),
  constraint operational_evidence_stages_state_shape
    check (
      (state = 'staged' and delete_reserved_at is null and consumed_at is null)
      or (state = 'delete_pending' and delete_reserved_at is not null and consumed_at is null)
      or (state = 'consumed' and delete_reserved_at is null and consumed_at is not null)
    )
);

create index operational_evidence_stages_cleanup_idx
  on private.operational_evidence_stages (state, created_at, id)
  where state in ('staged', 'delete_pending');

create unique index operational_evidence_stages_inspection_active_slot_idx
  on private.operational_evidence_stages (inspection_id, actor_profile_id, slot)
  where flow_kind = 'inspection' and state in ('staged', 'delete_pending');

create unique index operational_evidence_stages_resolution_active_slot_idx
  on private.operational_evidence_stages (flow_kind, resolution_id, actor_profile_id, slot)
  where flow_kind in ('center_completion', 'admin_recovery')
    and state in ('staged', 'delete_pending');

revoke all on table private.operational_evidence_stages
  from public, anon, authenticated, service_role;

comment on table private.operational_evidence_stages is
  'UX-DATA-01 transient server-owned registry for Inspection, assigned-Center completion, and Admin Recovery evidence. Consumed rows are tombstones proving that cleanup must never reclaim business-linked evidence.';

create function private.register_operational_evidence_stage(
  p_flow_kind text,
  p_inspection_id uuid,
  p_resolution_id uuid,
  p_actor_profile_id uuid,
  p_slot integer,
  p_storage_path text,
  p_mime_type text,
  p_size_bytes bigint
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_existing private.operational_evidence_stages%rowtype;
  v_count integer;
  v_path text := btrim(coalesce(p_storage_path, ''));
  v_mime text := btrim(coalesce(p_mime_type, ''));
begin
  if p_flow_kind not in ('inspection', 'center_completion', 'admin_recovery')
    or p_actor_profile_id is null
    or p_slot is null
    or p_slot < 1
    or p_slot > 5
    or v_mime not in ('image/jpeg', 'image/png', 'image/webp')
    or p_size_bytes is null
    or p_size_bytes < 1
    or p_size_bytes > 8388608
    or (v_mime = 'image/jpeg' and v_path !~ '\.jpg$')
    or (v_mime = 'image/png' and v_path !~ '\.png$')
    or (v_mime = 'image/webp' and v_path !~ '\.webp$')
  then
    raise exception using errcode = '22023', message = 'PG_OPERATIONAL_EVIDENCE_STAGE_INVALID';
  end if;

  if (p_flow_kind = 'inspection' and (p_inspection_id is null or p_resolution_id is not null))
    or (
      p_flow_kind in ('center_completion', 'admin_recovery')
      and (p_resolution_id is null or p_inspection_id is not null)
    )
  then
    raise exception using errcode = '22023', message = 'PG_OPERATIONAL_EVIDENCE_STAGE_INVALID';
  end if;

  select stage.*
    into v_existing
  from private.operational_evidence_stages stage
  where stage.storage_path = v_path
  for update;

  if found then
    if v_existing.flow_kind <> p_flow_kind
      or v_existing.inspection_id is distinct from p_inspection_id
      or v_existing.resolution_id is distinct from p_resolution_id
      or v_existing.actor_profile_id <> p_actor_profile_id
      or v_existing.slot <> p_slot
      or v_existing.mime_type <> v_mime
      or v_existing.size_bytes <> p_size_bytes
    then
      raise exception using errcode = '23505', message = 'PG_OPERATIONAL_EVIDENCE_STAGE_CONFLICT';
    end if;

    if v_existing.state = 'delete_pending' then
      raise exception using errcode = '23514', message = 'PG_OPERATIONAL_EVIDENCE_STAGE_DELETING';
    end if;

    if v_existing.state = 'consumed' then
      raise exception using errcode = '23514', message = 'PG_OPERATIONAL_EVIDENCE_STAGE_CONSUMED';
    end if;

    return v_existing.id;
  end if;

  if exists (
    select 1
    from private.operational_evidence_stages stage
    where stage.flow_kind = p_flow_kind
      and stage.inspection_id is not distinct from p_inspection_id
      and stage.resolution_id is not distinct from p_resolution_id
      and stage.actor_profile_id = p_actor_profile_id
      and stage.slot = p_slot
      and stage.state in ('staged', 'delete_pending')
  ) then
    raise exception using errcode = '23505', message = 'PG_OPERATIONAL_EVIDENCE_STAGE_SLOT_CONFLICT';
  end if;

  select count(*)
    into v_count
  from private.operational_evidence_stages stage
  where stage.flow_kind = p_flow_kind
    and stage.inspection_id is not distinct from p_inspection_id
    and stage.resolution_id is not distinct from p_resolution_id
    and stage.actor_profile_id = p_actor_profile_id
    and stage.state in ('staged', 'delete_pending');

  if v_count >= 5 then
    raise exception using errcode = '23514', message = 'PG_OPERATIONAL_EVIDENCE_STAGE_LIMIT';
  end if;

  insert into private.operational_evidence_stages (
    flow_kind,
    inspection_id,
    resolution_id,
    actor_profile_id,
    slot,
    storage_path,
    mime_type,
    size_bytes
  ) values (
    p_flow_kind,
    p_inspection_id,
    p_resolution_id,
    p_actor_profile_id,
    p_slot,
    v_path,
    v_mime,
    p_size_bytes
  )
  returning id into v_existing.id;

  return v_existing.id;
end;
$$;

revoke all on function private.register_operational_evidence_stage(text, uuid, uuid, uuid, integer, text, text, bigint)
  from public, anon, authenticated, service_role;

create function public.register_warranty_claim_inspection_evidence_stage(
  p_inspection_id uuid,
  p_slot integer,
  p_storage_path text,
  p_mime_type text,
  p_size_bytes bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_profile_id uuid := auth.uid();
  v_actor_center_party_id uuid;
  v_path text := btrim(coalesce(p_storage_path, ''));
begin
  if v_actor_profile_id is null
    or p_inspection_id is null
    or p_slot is null
    or p_slot < 1
    or p_slot > 5
    or v_path !~ (
      '^inspections/' || p_inspection_id::text || '/' || p_slot::text || '-[0-9a-f]{64}\.(jpg|png|webp)$'
    )
  then
    raise exception using errcode = '22023', message = 'PG_CLAIM_INSPECTION_EVIDENCE_INVALID';
  end if;

  select party.id
    into v_actor_center_party_id
  from public.profiles profile
  join public.installation_centers center
    on center.id = profile.installation_center_id
  join public.operational_parties party
    on party.installation_center_id = center.id
   and party.party_type = 'center'
  join public.warranty_claim_inspections inspection
    on inspection.id = p_inspection_id
   and inspection.assigned_center_party_id = party.id
  join public.warranty_claims claim on claim.id = inspection.claim_id
  join public.warranties warranty on warranty.id = claim.warranty_id
  where profile.id = v_actor_profile_id
    and profile.role = 'center'
    and profile.status = 'active'
    and center.status = 'active'
    and inspection.status = 'requested'
    and claim.status = 'awaiting_inspection'
    and claim.closed_at is null
    and warranty.record_state = 'issued';

  if not found then
    raise exception using errcode = '42501', message = 'PG_CLAIM_INSPECTION_NOT_ASSIGNED_CENTER';
  end if;

  return private.register_operational_evidence_stage(
    'inspection',
    p_inspection_id,
    null,
    v_actor_profile_id,
    p_slot,
    v_path,
    p_mime_type,
    p_size_bytes
  );
exception
  when sqlstate '22023' then
    if sqlerrm = 'PG_OPERATIONAL_EVIDENCE_STAGE_INVALID' then
      raise exception using errcode = '22023', message = 'PG_CLAIM_INSPECTION_EVIDENCE_INVALID';
    end if;
    raise;
end;
$$;

revoke all on function public.register_warranty_claim_inspection_evidence_stage(uuid, integer, text, text, bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.register_warranty_claim_inspection_evidence_stage(uuid, integer, text, text, bigint)
  to authenticated;

create function public.register_warranty_claim_resolution_completion_evidence_stage(
  p_resolution_id uuid,
  p_slot integer,
  p_storage_path text,
  p_mime_type text,
  p_size_bytes bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_profile_id uuid := auth.uid();
  v_actor_center_party_id uuid;
  v_path text := btrim(coalesce(p_storage_path, ''));
begin
  if v_actor_profile_id is null
    or p_resolution_id is null
    or p_slot is null
    or p_slot < 1
    or p_slot > 5
    or v_path !~ (
      '^resolutions/' || p_resolution_id::text || '/completion/' || p_slot::text || '-[0-9a-f]{64}\.(jpg|png|webp)$'
    )
  then
    raise exception using errcode = '22023', message = 'PG_CLAIM_RESOLUTION_EVIDENCE_INVALID';
  end if;

  select party.id
    into v_actor_center_party_id
  from public.profiles profile
  join public.installation_centers center
    on center.id = profile.installation_center_id
  join public.operational_parties party
    on party.installation_center_id = center.id
   and party.party_type = 'center'
  join public.warranty_claim_resolutions resolution
    on resolution.id = p_resolution_id
   and resolution.performing_center_party_id = party.id
  join public.warranty_claims claim on claim.id = resolution.claim_id
  join public.warranties warranty on warranty.id = claim.warranty_id
  where profile.id = v_actor_profile_id
    and profile.role = 'center'
    and profile.status = 'active'
    and center.status = 'active'
    and resolution.status = 'assigned'
    and resolution.remedy_kind in ('service_reinstall', 'replacement_roll_reinstall')
    and claim.status = 'approved'
    and claim.closed_at is null
    and warranty.record_state = 'issued';

  if not found then
    raise exception using errcode = '42501', message = 'PG_CLAIM_RESOLUTION_NOT_ASSIGNED_CENTER';
  end if;

  return private.register_operational_evidence_stage(
    'center_completion',
    null,
    p_resolution_id,
    v_actor_profile_id,
    p_slot,
    v_path,
    p_mime_type,
    p_size_bytes
  );
exception
  when sqlstate '22023' then
    if sqlerrm = 'PG_OPERATIONAL_EVIDENCE_STAGE_INVALID' then
      raise exception using errcode = '22023', message = 'PG_CLAIM_RESOLUTION_EVIDENCE_INVALID';
    end if;
    raise;
end;
$$;

revoke all on function public.register_warranty_claim_resolution_completion_evidence_stage(uuid, integer, text, text, bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.register_warranty_claim_resolution_completion_evidence_stage(uuid, integer, text, text, bigint)
  to authenticated;

create function public.register_warranty_claim_admin_recovery_evidence_stage(
  p_resolution_id uuid,
  p_slot integer,
  p_storage_path text,
  p_mime_type text,
  p_size_bytes bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_profile_id uuid;
  v_center_party_id uuid;
  v_path text := btrim(coalesce(p_storage_path, ''));
begin
  if p_resolution_id is null
    or p_slot is null
    or p_slot < 1
    or p_slot > 5
    or v_path !~ (
      '^resolutions/' || p_resolution_id::text || '/completion/' || p_slot::text || '-[0-9a-f]{64}\.(jpg|png|webp)$'
    )
  then
    raise exception using errcode = '22023', message = 'PG_CLAIM_RESOLUTION_EVIDENCE_INVALID';
  end if;

  v_actor_profile_id := private.lock_warranty_admin_context();

  select resolution.performing_center_party_id
    into v_center_party_id
  from public.warranty_claim_resolutions resolution
  join public.warranty_claims claim on claim.id = resolution.claim_id
  join public.warranties warranty on warranty.id = claim.warranty_id
  where resolution.id = p_resolution_id
    and resolution.status = 'assigned'
    and resolution.performing_center_party_id is not null
    and resolution.remedy_kind in ('service_reinstall', 'replacement_roll_reinstall')
    and claim.status = 'approved'
    and claim.closed_at is null
    and warranty.record_state = 'issued';

  if not found then
    raise exception using errcode = '42501', message = 'PG_CLAIM_RESOLUTION_ADMIN_RECOVERY_NOT_ALLOWED';
  end if;

  perform private.lock_claim_center_unactionable_for_recovery(v_center_party_id);

  return private.register_operational_evidence_stage(
    'admin_recovery',
    null,
    p_resolution_id,
    v_actor_profile_id,
    p_slot,
    v_path,
    p_mime_type,
    p_size_bytes
  );
exception
  when sqlstate '22023' then
    if sqlerrm = 'PG_OPERATIONAL_EVIDENCE_STAGE_INVALID' then
      raise exception using errcode = '22023', message = 'PG_CLAIM_RESOLUTION_EVIDENCE_INVALID';
    end if;
    raise;
end;
$$;

revoke all on function public.register_warranty_claim_admin_recovery_evidence_stage(uuid, integer, text, text, bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.register_warranty_claim_admin_recovery_evidence_stage(uuid, integer, text, text, bigint)
  to authenticated;

create function private.require_operational_evidence_stage_actor_authority(
  p_stage_id uuid
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_stage private.operational_evidence_stages%rowtype;
  v_actor_profile_id uuid := auth.uid();
  v_center_party_id uuid;
begin
  select stage.*
    into v_stage
  from private.operational_evidence_stages stage
  where stage.id = p_stage_id;

  if not found or v_actor_profile_id is null or v_stage.actor_profile_id <> v_actor_profile_id then
    raise exception using errcode = '42501', message = 'PG_OPERATIONAL_EVIDENCE_STAGE_FORBIDDEN';
  end if;

  if v_stage.flow_kind = 'inspection' then
    select party.id
      into v_center_party_id
    from public.profiles profile
    join public.installation_centers center
      on center.id = profile.installation_center_id
    join public.operational_parties party
      on party.installation_center_id = center.id
     and party.party_type = 'center'
    join public.warranty_claim_inspections inspection
      on inspection.id = v_stage.inspection_id
     and inspection.assigned_center_party_id = party.id
    join public.warranty_claims claim on claim.id = inspection.claim_id
    where profile.id = v_actor_profile_id
      and profile.role = 'center'
      and profile.status = 'active'
      and center.status = 'active'
      and inspection.status = 'requested'
      and claim.status = 'awaiting_inspection'
      and claim.closed_at is null;

    if not found then
      raise exception using errcode = '42501', message = 'PG_CLAIM_INSPECTION_NOT_ASSIGNED_CENTER';
    end if;

    return;
  end if;

  if v_stage.flow_kind = 'center_completion' then
    select party.id
      into v_center_party_id
    from public.profiles profile
    join public.installation_centers center
      on center.id = profile.installation_center_id
    join public.operational_parties party
      on party.installation_center_id = center.id
     and party.party_type = 'center'
    join public.warranty_claim_resolutions resolution
      on resolution.id = v_stage.resolution_id
     and resolution.performing_center_party_id = party.id
    join public.warranty_claims claim on claim.id = resolution.claim_id
    where profile.id = v_actor_profile_id
      and profile.role = 'center'
      and profile.status = 'active'
      and center.status = 'active'
      and resolution.status = 'assigned'
      and claim.status = 'approved'
      and claim.closed_at is null;

    if not found then
      raise exception using errcode = '42501', message = 'PG_CLAIM_RESOLUTION_NOT_ASSIGNED_CENTER';
    end if;

    return;
  end if;

  if v_stage.flow_kind = 'admin_recovery' then
    if private.lock_warranty_admin_context() <> v_actor_profile_id then
      raise exception using errcode = '42501', message = 'PG_OPERATIONAL_EVIDENCE_STAGE_FORBIDDEN';
    end if;

    select resolution.performing_center_party_id
      into v_center_party_id
    from public.warranty_claim_resolutions resolution
    join public.warranty_claims claim on claim.id = resolution.claim_id
    where resolution.id = v_stage.resolution_id
      and resolution.status = 'assigned'
      and resolution.performing_center_party_id is not null
      and claim.status = 'approved'
      and claim.closed_at is null;

    if not found then
      raise exception using errcode = '42501', message = 'PG_CLAIM_RESOLUTION_ADMIN_RECOVERY_NOT_ALLOWED';
    end if;

    perform private.lock_claim_center_unactionable_for_recovery(v_center_party_id);
    return;
  end if;

  raise exception using errcode = '42501', message = 'PG_OPERATIONAL_EVIDENCE_STAGE_FORBIDDEN';
end;
$$;

revoke all on function private.require_operational_evidence_stage_actor_authority(uuid)
  from public, anon, authenticated, service_role;

create function public.reserve_operational_evidence_stage_delete(
  p_storage_path text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stage private.operational_evidence_stages%rowtype;
  v_path text := btrim(coalesce(p_storage_path, ''));
begin
  select stage.*
    into v_stage
  from private.operational_evidence_stages stage
  where stage.storage_path = v_path
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'PG_OPERATIONAL_EVIDENCE_STAGE_NOT_FOUND';
  end if;

  if auth.uid() is null or v_stage.actor_profile_id <> auth.uid() then
    raise exception using errcode = '42501', message = 'PG_OPERATIONAL_EVIDENCE_STAGE_FORBIDDEN';
  end if;

  if v_stage.state = 'consumed' then
    raise exception using errcode = '42501', message = 'PG_OPERATIONAL_EVIDENCE_STAGE_CONSUMED';
  end if;

  if v_stage.state = 'delete_pending' then
    return v_stage.id;
  end if;

  perform private.require_operational_evidence_stage_actor_authority(v_stage.id);

  update private.operational_evidence_stages stage
  set
    state = 'delete_pending',
    delete_reserved_at = clock_timestamp()
  where stage.id = v_stage.id;

  return v_stage.id;
end;
$$;

revoke all on function public.reserve_operational_evidence_stage_delete(text)
  from public, anon, authenticated, service_role;
grant execute on function public.reserve_operational_evidence_stage_delete(text)
  to authenticated;

create function public.finalize_operational_evidence_stage_delete(
  p_storage_path text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stage private.operational_evidence_stages%rowtype;
  v_path text := btrim(coalesce(p_storage_path, ''));
begin
  select stage.*
    into v_stage
  from private.operational_evidence_stages stage
  where stage.storage_path = v_path
  for update;

  if not found then
    return true;
  end if;

  if auth.uid() is null or v_stage.actor_profile_id <> auth.uid() then
    raise exception using errcode = '42501', message = 'PG_OPERATIONAL_EVIDENCE_STAGE_FORBIDDEN';
  end if;

  if v_stage.state = 'consumed'
    or exists (
      select 1 from public.warranty_claim_inspection_evidence evidence
      where evidence.storage_path = v_path
    )
    or exists (
      select 1 from public.warranty_claim_resolution_evidence evidence
      where evidence.storage_path = v_path
    )
  then
    raise exception using errcode = '42501', message = 'PG_OPERATIONAL_EVIDENCE_STAGE_CONSUMED';
  end if;

  if v_stage.state <> 'delete_pending' then
    raise exception using errcode = '23514', message = 'PG_OPERATIONAL_EVIDENCE_STAGE_DELETE_NOT_RESERVED';
  end if;

  delete from private.operational_evidence_stages stage
  where stage.id = v_stage.id;

  return true;
end;
$$;

revoke all on function public.finalize_operational_evidence_stage_delete(text)
  from public, anon, authenticated, service_role;
grant execute on function public.finalize_operational_evidence_stage_delete(text)
  to authenticated;

create function private.consume_warranty_claim_inspection_evidence_stage()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_stage private.operational_evidence_stages%rowtype;
begin
  select stage.*
    into v_stage
  from private.operational_evidence_stages stage
  where stage.storage_path = new.storage_path
  for update;

  if not found
    or v_stage.state <> 'staged'
    or v_stage.flow_kind <> 'inspection'
    or v_stage.inspection_id <> new.inspection_id
    or v_stage.resolution_id is not null
    or v_stage.actor_profile_id <> new.uploaded_by_profile_id
    or v_stage.mime_type <> new.mime_type
    or v_stage.size_bytes <> new.size_bytes
  then
    raise exception using errcode = '23514', message = 'PG_OPERATIONAL_EVIDENCE_STAGE_REQUIRED';
  end if;

  update private.operational_evidence_stages stage
  set
    state = 'consumed',
    delete_reserved_at = null,
    consumed_at = clock_timestamp()
  where stage.id = v_stage.id;

  return new;
end;
$$;

revoke all on function private.consume_warranty_claim_inspection_evidence_stage()
  from public, anon, authenticated, service_role;

create trigger warranty_claim_inspection_evidence_require_stage
  before insert on public.warranty_claim_inspection_evidence
  for each row execute function private.consume_warranty_claim_inspection_evidence_stage();

create function private.consume_warranty_claim_resolution_evidence_stage()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_stage private.operational_evidence_stages%rowtype;
begin
  select stage.*
    into v_stage
  from private.operational_evidence_stages stage
  where stage.storage_path = new.storage_path
  for update;

  if not found
    or v_stage.state <> 'staged'
    or v_stage.flow_kind not in ('center_completion', 'admin_recovery')
    or v_stage.inspection_id is not null
    or v_stage.resolution_id <> new.resolution_id
    or v_stage.actor_profile_id <> new.uploaded_by_profile_id
    or v_stage.mime_type <> new.mime_type
    or v_stage.size_bytes <> new.size_bytes
  then
    raise exception using errcode = '23514', message = 'PG_OPERATIONAL_EVIDENCE_STAGE_REQUIRED';
  end if;

  update private.operational_evidence_stages stage
  set
    state = 'consumed',
    delete_reserved_at = null,
    consumed_at = clock_timestamp()
  where stage.id = v_stage.id;

  return new;
end;
$$;

revoke all on function private.consume_warranty_claim_resolution_evidence_stage()
  from public, anon, authenticated, service_role;

create trigger warranty_claim_resolution_evidence_require_stage
  before insert on public.warranty_claim_resolution_evidence
  for each row execute function private.consume_warranty_claim_resolution_evidence_stage();

create function public.claim_stale_operational_evidence_cleanup_candidates(
  p_stale_before timestamptz,
  p_limit integer default 10
)
returns table (
  stage_id uuid,
  storage_path text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_stale_before is null or p_stale_before > clock_timestamp() then
    raise exception using errcode = '22023', message = 'PG_OPERATIONAL_EVIDENCE_CLEANUP_CUTOFF_INVALID';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception using errcode = '22023', message = 'PG_OPERATIONAL_EVIDENCE_CLEANUP_LIMIT_INVALID';
  end if;

  return query
  with selected as (
    select stage.id
    from private.operational_evidence_stages stage
    where (
        stage.state = 'delete_pending'
        or (stage.state = 'staged' and stage.created_at <= p_stale_before)
      )
      and not exists (
        select 1
        from public.warranty_claim_inspection_evidence evidence
        where evidence.storage_path = stage.storage_path
      )
      and not exists (
        select 1
        from public.warranty_claim_resolution_evidence evidence
        where evidence.storage_path = stage.storage_path
      )
    order by
      case when stage.state = 'delete_pending' then 0 else 1 end,
      stage.created_at,
      stage.id
    limit p_limit
    for update of stage skip locked
  ),
  marked as (
    update private.operational_evidence_stages stage
    set
      state = 'delete_pending',
      delete_reserved_at = coalesce(stage.delete_reserved_at, clock_timestamp())
    from selected
    where stage.id = selected.id
    returning stage.id, stage.storage_path
  )
  select marked.id, marked.storage_path
  from marked
  order by marked.id;
end;
$$;

revoke all on function public.claim_stale_operational_evidence_cleanup_candidates(timestamptz, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_stale_operational_evidence_cleanup_candidates(timestamptz, integer)
  to service_role;

create function public.finalize_operational_evidence_cleanup(
  p_stage_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stage private.operational_evidence_stages%rowtype;
begin
  if p_stage_id is null then
    raise exception using errcode = '22023', message = 'PG_OPERATIONAL_EVIDENCE_CLEANUP_STAGE_INVALID';
  end if;

  select stage.*
    into v_stage
  from private.operational_evidence_stages stage
  where stage.id = p_stage_id
  for update;

  if not found then
    return true;
  end if;

  if v_stage.state = 'consumed'
    or exists (
      select 1 from public.warranty_claim_inspection_evidence evidence
      where evidence.storage_path = v_stage.storage_path
    )
    or exists (
      select 1 from public.warranty_claim_resolution_evidence evidence
      where evidence.storage_path = v_stage.storage_path
    )
  then
    raise exception using errcode = '42501', message = 'PG_OPERATIONAL_EVIDENCE_CLEANUP_LINKED';
  end if;

  if v_stage.state <> 'delete_pending' then
    raise exception using errcode = '23514', message = 'PG_OPERATIONAL_EVIDENCE_CLEANUP_NOT_RESERVED';
  end if;

  delete from private.operational_evidence_stages stage
  where stage.id = v_stage.id;

  return true;
end;
$$;

revoke all on function public.finalize_operational_evidence_cleanup(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.finalize_operational_evidence_cleanup(uuid)
  to service_role;

comment on function public.claim_stale_operational_evidence_cleanup_candidates(timestamptz, integer) is
  'UX-DATA-01 service-role bounded cleanup claim. Marks only unconsumed/unlinked stages delete_pending using SKIP LOCKED; no Storage deletion occurs inside the transaction.';

comment on function public.finalize_operational_evidence_cleanup(uuid) is
  'UX-DATA-01 service-role cleanup finalizer called only after Storage deletion succeeds. Refuses any path linked to durable Inspection or Resolution evidence.';
