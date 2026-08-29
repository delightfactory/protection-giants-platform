-- Cube R — Approved Claim Resolution / Replacement & Reinstall, increment 12A2.
-- Adds only the assigned performing-Center operational read boundary: a bounded
-- task queue, one exact unresolved task detail, and Claim/inspection evidence
-- metadata for that exact task. Customer contact PII, Admin reasons/audit,
-- allocation identifiers/Product-policy basis and global inventory remain private.

create function public.list_center_assigned_warranty_claim_resolution_tasks(
  p_limit integer default 30,
  p_offset integer default 0
)
returns table (
  resolution_id uuid,
  claim_number text,
  assigned_at timestamptz,
  remedy_kind text,
  product_name text,
  product_version text,
  vehicle_make text,
  vehicle_model text,
  vehicle_year smallint,
  affected_area text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor jsonb;
  v_party_id uuid;
begin
  if p_limit is null or p_limit < 1 or p_limit > 100
    or p_offset is null or p_offset < 0 or p_offset > 10000
  then
    raise exception using errcode = '22023', message = 'PG_CLAIM_RESOLUTION_TASK_LIST_PAGING_INVALID';
  end if;

  v_actor := private.lock_claim_read_context();
  if v_actor ->> 'role' <> 'center' then
    raise exception using errcode = '42501', message = 'PG_CLAIM_RESOLUTION_CENTER_REQUIRED';
  end if;
  v_party_id := nullif(v_actor ->> 'party_id', '')::uuid;

  return query
  select
    resolution.id,
    claim.claim_number,
    resolution.assigned_at,
    resolution.remedy_kind,
    warranty.product_name_snapshot,
    warranty.product_version_snapshot,
    warranty.vehicle_make,
    warranty.vehicle_model,
    warranty.vehicle_year,
    claim.affected_area
  from public.warranty_claim_resolutions resolution
  join public.warranty_claims claim on claim.id = resolution.claim_id
  join public.warranties warranty on warranty.id = claim.warranty_id
  where resolution.performing_center_party_id = v_party_id
    and resolution.status = 'assigned'
    and claim.status = 'approved'
    and claim.closed_at is null
    and warranty.record_state = 'issued'
  order by resolution.assigned_at, resolution.id
  limit p_limit
  offset p_offset;
end;
$$;

revoke all on function public.list_center_assigned_warranty_claim_resolution_tasks(integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_center_assigned_warranty_claim_resolution_tasks(integer, integer)
  to authenticated;

comment on function public.list_center_assigned_warranty_claim_resolution_tasks(integer, integer) is
  'Cube R assigned-Center task queue. Only the caller Center''s currently assigned unresolved approved Claim Resolutions are exposed; no customer contact PII, Admin audit/reasons, material allocation internals or inventory browsing is included.';

create function public.get_center_warranty_claim_resolution_task(p_resolution_id uuid)
returns table (
  resolution_id uuid,
  claim_number text,
  assigned_at timestamptz,
  remedy_kind text,
  claim_category text,
  affected_area text,
  description text,
  product_code text,
  product_name text,
  product_version text,
  warranty_coverage text,
  care_instructions text,
  vehicle_make text,
  vehicle_model text,
  vehicle_year smallint,
  vehicle_plate text,
  vehicle_color text,
  vehicle_vin text,
  inspection_status text,
  inspection_technical_observation text,
  inspection_suspected_cause text,
  replacement_roll_serial text,
  replacement_roll_product_code text,
  replacement_roll_product_name text,
  replacement_roll_product_version text,
  replacement_roll_opened_at timestamptz,
  replacement_quality_state text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor jsonb;
  v_party_id uuid;
begin
  if p_resolution_id is null then
    raise exception using errcode = '22023', message = 'PG_CLAIM_RESOLUTION_TASK_NOT_FOUND';
  end if;

  v_actor := private.lock_claim_read_context();
  if v_actor ->> 'role' <> 'center' then
    raise exception using errcode = '42501', message = 'PG_CLAIM_RESOLUTION_CENTER_REQUIRED';
  end if;
  v_party_id := nullif(v_actor ->> 'party_id', '')::uuid;

  if not exists (
    select 1
    from public.warranty_claim_resolutions resolution
    join public.warranty_claims claim on claim.id = resolution.claim_id
    join public.warranties warranty on warranty.id = claim.warranty_id
    where resolution.id = p_resolution_id
      and resolution.performing_center_party_id = v_party_id
      and resolution.status = 'assigned'
      and claim.status = 'approved'
      and claim.closed_at is null
      and warranty.record_state = 'issued'
  ) then
    raise exception using errcode = '42501', message = 'PG_CLAIM_RESOLUTION_TASK_NOT_FOUND';
  end if;

  return query
  select
    resolution.id,
    claim.claim_number,
    resolution.assigned_at,
    resolution.remedy_kind,
    claim.category,
    claim.affected_area,
    claim.description,
    warranty.product_code_snapshot,
    warranty.product_name_snapshot,
    warranty.product_version_snapshot,
    warranty.warranty_coverage_snapshot,
    warranty.care_instructions_snapshot,
    warranty.vehicle_make,
    warranty.vehicle_model,
    warranty.vehicle_year,
    warranty.vehicle_plate,
    warranty.vehicle_color,
    warranty.vehicle_vin,
    inspection.status,
    inspection.technical_observation,
    inspection.suspected_cause,
    replacement_roll.serial_number,
    replacement_product.code,
    replacement_product.name,
    replacement_product.version_name,
    opening.opened_at,
    case
      when allocation.id is null then null::text
      when exists (
        select 1
        from public.roll_preinstall_issues issue
        where issue.roll_id = allocation.roll_id
          and issue.status = 'submitted'
      ) then 'pending'
      when exists (
        select 1
        from public.roll_preinstall_issues issue
        where issue.roll_id = allocation.roll_id
          and issue.status = 'return_required'
      ) then 'return_required'
      when exists (
        select 1
        from public.roll_preinstall_issues issue
        where issue.roll_id = allocation.roll_id
      ) then 'clear_history'
      else 'none'
    end
  from public.warranty_claim_resolutions resolution
  join public.warranty_claims claim on claim.id = resolution.claim_id
  join public.warranties warranty on warranty.id = claim.warranty_id
  left join public.warranty_claim_inspections inspection on inspection.claim_id = claim.id
  left join public.warranty_claim_resolution_roll_allocations allocation
    on allocation.resolution_id = resolution.id
   and allocation.status = 'reserved'
  left join public.rolls replacement_roll on replacement_roll.id = allocation.roll_id
  left join public.products replacement_product on replacement_product.id = replacement_roll.product_id
  left join public.roll_openings opening on opening.roll_id = replacement_roll.id
  where resolution.id = p_resolution_id
    and resolution.performing_center_party_id = v_party_id
    and resolution.status = 'assigned'
    and claim.status = 'approved'
    and claim.closed_at is null
    and warranty.record_state = 'issued';
end;
$$;

revoke all on function public.get_center_warranty_claim_resolution_task(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_center_warranty_claim_resolution_task(uuid)
  to authenticated;

comment on function public.get_center_warranty_claim_resolution_task(uuid) is
  'Cube R exact assigned-Center fulfillment task. Exposes only customer-safe work context, relevant inspection findings and the exact reserved replacement Roll operational identity/state when present. Customer contact PII, Admin reasons/audit, allocation UUID/basis and unrelated inventory stay private.';

create function public.list_center_warranty_claim_resolution_evidence(p_resolution_id uuid)
returns table (
  evidence_scope text,
  storage_path text,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor jsonb;
  v_party_id uuid;
  v_claim_id uuid;
begin
  if p_resolution_id is null then
    raise exception using errcode = '22023', message = 'PG_CLAIM_RESOLUTION_TASK_NOT_FOUND';
  end if;

  v_actor := private.lock_claim_read_context();
  if v_actor ->> 'role' <> 'center' then
    raise exception using errcode = '42501', message = 'PG_CLAIM_RESOLUTION_CENTER_REQUIRED';
  end if;
  v_party_id := nullif(v_actor ->> 'party_id', '')::uuid;

  select claim.id
    into v_claim_id
  from public.warranty_claim_resolutions resolution
  join public.warranty_claims claim on claim.id = resolution.claim_id
  join public.warranties warranty on warranty.id = claim.warranty_id
  where resolution.id = p_resolution_id
    and resolution.performing_center_party_id = v_party_id
    and resolution.status = 'assigned'
    and claim.status = 'approved'
    and claim.closed_at is null
    and warranty.record_state = 'issued';

  if not found then
    raise exception using errcode = '42501', message = 'PG_CLAIM_RESOLUTION_TASK_NOT_FOUND';
  end if;

  return query
  select
    'customer_submission'::text,
    evidence.storage_path,
    evidence.mime_type,
    evidence.size_bytes,
    evidence.created_at
  from public.warranty_claim_evidence evidence
  where evidence.claim_id = v_claim_id

  union all

  select
    'inspection'::text,
    inspection_evidence.storage_path,
    inspection_evidence.mime_type,
    inspection_evidence.size_bytes,
    inspection_evidence.created_at
  from public.warranty_claim_inspection_evidence inspection_evidence
  join public.warranty_claim_inspections inspection
    on inspection.id = inspection_evidence.inspection_id
  where inspection.claim_id = v_claim_id
    and inspection.status = 'submitted'
  order by 5, 2;
end;
$$;

revoke all on function public.list_center_warranty_claim_resolution_evidence(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.list_center_warranty_claim_resolution_evidence(uuid)
  to authenticated;

comment on function public.list_center_warranty_claim_resolution_evidence(uuid) is
  'Cube R exact-task evidence metadata boundary. The assigned active performing Center may see only Claim customer-submission and submitted-inspection image metadata for its currently unresolved Resolution; no completion evidence, uploader identity, Admin audit or unrelated Claim evidence is exposed.';
