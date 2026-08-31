-- UX-DATA-01 follow-up: preserve registration behavior while removing two
-- unused-variable warnings from the initial migration. The authority probes only
-- need FOUND; no Center-party value is consumed after the query.

create or replace function public.register_warranty_claim_inspection_evidence_stage(
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

  perform party.id
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

create or replace function public.register_warranty_claim_resolution_completion_evidence_stage(
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

  perform party.id
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
