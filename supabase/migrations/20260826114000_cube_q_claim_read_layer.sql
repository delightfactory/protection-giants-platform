-- Cube Q — Claim Review, Inspection & Decision, increment 5
-- Bounded professional read models. Underlying Claim/inspection/evidence/Resolution
-- tables remain closed to direct Data API reads and writes.

create function private.lock_claim_read_context()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor jsonb;
begin
  v_actor := private.lock_warranty_read_context();

  if v_actor ->> 'role' not in ('admin', 'center') then
    raise exception using errcode = '42501', message = 'PG_CLAIM_FORBIDDEN';
  end if;

  return v_actor;
end;
$$;

revoke all on function private.lock_claim_read_context()
  from public, anon, authenticated, service_role;

create function public.list_admin_warranty_claims(
  p_limit integer default 50,
  p_offset integer default 0,
  p_scope text default 'open',
  p_status text default null
)
returns table (
  claim_id uuid,
  claim_number text,
  status text,
  submitted_at timestamptz,
  closed_at timestamptz,
  product_code text,
  product_name text,
  product_version text,
  vehicle_make text,
  vehicle_model text,
  activating_center_name text,
  inspection_status text,
  inspection_center_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor jsonb;
  v_scope text := btrim(coalesce(p_scope, ''));
  v_status text := nullif(btrim(coalesce(p_status, '')), '');
begin
  if p_limit is null or p_limit < 1 or p_limit > 100
    or p_offset is null or p_offset < 0 or p_offset > 10000
  then
    raise exception using errcode = '22023', message = 'PG_CLAIM_LIST_PAGING_INVALID';
  end if;

  if v_scope not in ('open', 'closed', 'all') then
    raise exception using errcode = '22023', message = 'PG_CLAIM_LIST_SCOPE_INVALID';
  end if;

  if v_status is not null
    and v_status not in ('submitted', 'under_review', 'awaiting_inspection', 'approved', 'rejected', 'cancelled')
  then
    raise exception using errcode = '22023', message = 'PG_CLAIM_LIST_STATUS_INVALID';
  end if;

  v_actor := private.lock_claim_read_context();
  if v_actor ->> 'role' <> 'admin' then
    raise exception using errcode = '42501', message = 'PG_CLAIM_ADMIN_REQUIRED';
  end if;

  return query
  select
    claim.id,
    claim.claim_number,
    claim.status,
    claim.submitted_at,
    claim.closed_at,
    warranty.product_code_snapshot,
    warranty.product_name_snapshot,
    warranty.product_version_snapshot,
    warranty.vehicle_make,
    warranty.vehicle_model,
    warranty.activating_center_name_snapshot,
    inspection.status,
    inspection_center.name
  from public.warranty_claims claim
  join public.warranties warranty on warranty.id = claim.warranty_id
  left join public.warranty_claim_inspections inspection on inspection.claim_id = claim.id
  left join public.operational_parties inspection_party on inspection_party.id = inspection.assigned_center_party_id
  left join public.installation_centers inspection_center on inspection_center.id = inspection_party.installation_center_id
  where (v_status is null or claim.status = v_status)
    and (
      v_scope = 'all'
      or (v_scope = 'open' and claim.closed_at is null)
      or (v_scope = 'closed' and claim.closed_at is not null)
    )
  order by claim.submitted_at desc, claim.id desc
  limit p_limit
  offset p_offset;
end;
$$;

revoke all on function public.list_admin_warranty_claims(integer, integer, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.list_admin_warranty_claims(integer, integer, text, text)
  to authenticated;

create function public.get_admin_warranty_claim_detail(p_claim_id uuid)
returns table (
  claim_id uuid,
  claim_number text,
  claim_status text,
  category text,
  affected_area text,
  description text,
  submitted_at timestamptz,
  closed_at timestamptz,
  decided_by_profile_id uuid,
  decision_reason text,
  customer_decision_message text,
  decided_at timestamptz,
  warranty_id uuid,
  warranty_number text,
  warranty_record_state text,
  activated_at timestamptz,
  coverage_expires_at timestamptz,
  product_code text,
  product_name text,
  product_version text,
  warranty_months smallint,
  warranty_coverage text,
  care_instructions text,
  activating_center_party_id uuid,
  activating_center_name text,
  customer_name text,
  customer_phone text,
  customer_email text,
  vehicle_make text,
  vehicle_model text,
  vehicle_year smallint,
  vehicle_plate text,
  vehicle_color text,
  vehicle_vin text,
  inspection_id uuid,
  inspection_status text,
  inspection_center_party_id uuid,
  inspection_center_name text,
  inspection_requested_at timestamptz,
  inspection_submitted_at timestamptz,
  technical_observation text,
  suspected_cause text,
  resolution_id uuid,
  resolution_status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor jsonb;
begin
  if p_claim_id is null then
    raise exception using errcode = '22023', message = 'PG_CLAIM_NOT_FOUND';
  end if;

  v_actor := private.lock_claim_read_context();
  if v_actor ->> 'role' <> 'admin' then
    raise exception using errcode = '42501', message = 'PG_CLAIM_ADMIN_REQUIRED';
  end if;

  if not exists (
    select 1 from public.warranty_claims claim where claim.id = p_claim_id
  ) then
    raise exception using errcode = '22023', message = 'PG_CLAIM_NOT_FOUND';
  end if;

  return query
  select
    claim.id,
    claim.claim_number,
    claim.status,
    claim.category,
    claim.affected_area,
    claim.description,
    claim.submitted_at,
    claim.closed_at,
    claim.decided_by_profile_id,
    claim.decision_reason,
    claim.customer_decision_message,
    claim.decided_at,
    warranty.id,
    warranty.warranty_number,
    warranty.record_state,
    warranty.activated_at,
    warranty.coverage_expires_at,
    warranty.product_code_snapshot,
    warranty.product_name_snapshot,
    warranty.product_version_snapshot,
    warranty.warranty_months_snapshot,
    warranty.warranty_coverage_snapshot,
    warranty.care_instructions_snapshot,
    warranty.activating_center_party_id,
    warranty.activating_center_name_snapshot,
    warranty.customer_name,
    warranty.customer_phone,
    warranty.customer_email,
    warranty.vehicle_make,
    warranty.vehicle_model,
    warranty.vehicle_year,
    warranty.vehicle_plate,
    warranty.vehicle_color,
    warranty.vehicle_vin,
    inspection.id,
    inspection.status,
    inspection.assigned_center_party_id,
    inspection_center.name,
    inspection.requested_at,
    inspection.submitted_at,
    inspection.technical_observation,
    inspection.suspected_cause,
    resolution.id,
    resolution.status
  from public.warranty_claims claim
  join public.warranties warranty on warranty.id = claim.warranty_id
  left join public.warranty_claim_inspections inspection on inspection.claim_id = claim.id
  left join public.operational_parties inspection_party on inspection_party.id = inspection.assigned_center_party_id
  left join public.installation_centers inspection_center on inspection_center.id = inspection_party.installation_center_id
  left join public.warranty_claim_resolutions resolution on resolution.claim_id = claim.id
  where claim.id = p_claim_id;
end;
$$;

revoke all on function public.get_admin_warranty_claim_detail(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_admin_warranty_claim_detail(uuid)
  to authenticated;

create function public.list_admin_warranty_claim_timeline(p_claim_id uuid)
returns table (
  event_id uuid,
  event_kind text,
  actor_profile_id uuid,
  actor_kind text,
  reason text,
  event_data jsonb,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor jsonb;
begin
  v_actor := private.lock_claim_read_context();
  if v_actor ->> 'role' <> 'admin' then
    raise exception using errcode = '42501', message = 'PG_CLAIM_ADMIN_REQUIRED';
  end if;

  if p_claim_id is null or not exists (
    select 1 from public.warranty_claims claim where claim.id = p_claim_id
  ) then
    raise exception using errcode = '22023', message = 'PG_CLAIM_NOT_FOUND';
  end if;

  return query
  select
    event.id,
    event.event_kind,
    event.actor_profile_id,
    event.actor_kind,
    event.reason,
    event.event_data,
    event.created_at
  from public.warranty_claim_events event
  where event.claim_id = p_claim_id
  order by event.created_at, event.id;
end;
$$;

revoke all on function public.list_admin_warranty_claim_timeline(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.list_admin_warranty_claim_timeline(uuid)
  to authenticated;

create function public.list_admin_warranty_claim_history(
  p_warranty_id uuid,
  p_exclude_claim_id uuid default null,
  p_limit integer default 10
)
returns table (
  claim_id uuid,
  claim_number text,
  status text,
  submitted_at timestamptz,
  closed_at timestamptz,
  customer_decision_message text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor jsonb;
begin
  if p_warranty_id is null or p_limit is null or p_limit < 1 or p_limit > 25 then
    raise exception using errcode = '22023', message = 'PG_CLAIM_HISTORY_REQUEST_INVALID';
  end if;

  v_actor := private.lock_claim_read_context();
  if v_actor ->> 'role' <> 'admin' then
    raise exception using errcode = '42501', message = 'PG_CLAIM_ADMIN_REQUIRED';
  end if;

  if not exists (select 1 from public.warranties warranty where warranty.id = p_warranty_id) then
    raise exception using errcode = '22023', message = 'PG_CLAIM_WARRANTY_NOT_FOUND';
  end if;

  return query
  select
    claim.id,
    claim.claim_number,
    claim.status,
    claim.submitted_at,
    claim.closed_at,
    claim.customer_decision_message
  from public.warranty_claims claim
  where claim.warranty_id = p_warranty_id
    and claim.closed_at is not null
    and (p_exclude_claim_id is null or claim.id <> p_exclude_claim_id)
  order by claim.submitted_at desc, claim.id desc
  limit p_limit;
end;
$$;

revoke all on function public.list_admin_warranty_claim_history(uuid, uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_admin_warranty_claim_history(uuid, uuid, integer)
  to authenticated;

create function public.list_actionable_claim_inspection_centers()
returns table (
  center_party_id uuid,
  installation_center_id uuid,
  center_name text,
  country_code text,
  city text,
  approval_status text,
  active_operator_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor jsonb;
begin
  v_actor := private.lock_claim_read_context();
  if v_actor ->> 'role' <> 'admin' then
    raise exception using errcode = '42501', message = 'PG_CLAIM_ADMIN_REQUIRED';
  end if;

  return query
  select
    party.id,
    center.id,
    center.name,
    center.country_code,
    center.city,
    center.approval_status,
    count(profile.id)::bigint
  from public.installation_centers center
  join public.operational_parties party
    on party.party_type = 'center'
   and party.installation_center_id = center.id
  join public.profiles profile
    on profile.role = 'center'
   and profile.status = 'active'
   and profile.installation_center_id = center.id
  where center.status = 'active'
  group by party.id, center.id, center.name, center.country_code, center.city, center.approval_status
  order by center.name, center.id;
end;
$$;

revoke all on function public.list_actionable_claim_inspection_centers()
  from public, anon, authenticated, service_role;
grant execute on function public.list_actionable_claim_inspection_centers()
  to authenticated;

create function public.list_center_pending_claim_inspections(
  p_limit integer default 30,
  p_offset integer default 0
)
returns table (
  inspection_id uuid,
  claim_number text,
  requested_at timestamptz,
  product_code text,
  product_name text,
  vehicle_make text,
  vehicle_model text,
  vehicle_year smallint,
  affected_area text,
  description text
)
language plpgsql
stable
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
    raise exception using errcode = '22023', message = 'PG_CLAIM_INSPECTION_LIST_PAGING_INVALID';
  end if;

  v_actor := private.lock_claim_read_context();
  if v_actor ->> 'role' <> 'center' then
    raise exception using errcode = '42501', message = 'PG_CLAIM_INSPECTION_CENTER_REQUIRED';
  end if;
  v_party_id := nullif(v_actor ->> 'party_id', '')::uuid;

  return query
  select
    inspection.id,
    claim.claim_number,
    inspection.requested_at,
    warranty.product_code_snapshot,
    warranty.product_name_snapshot,
    warranty.vehicle_make,
    warranty.vehicle_model,
    warranty.vehicle_year,
    claim.affected_area,
    claim.description
  from public.warranty_claim_inspections inspection
  join public.warranty_claims claim on claim.id = inspection.claim_id
  join public.warranties warranty on warranty.id = claim.warranty_id
  where inspection.assigned_center_party_id = v_party_id
    and inspection.status = 'requested'
    and claim.status = 'awaiting_inspection'
    and claim.closed_at is null
  order by inspection.requested_at, inspection.id
  limit p_limit
  offset p_offset;
end;
$$;

revoke all on function public.list_center_pending_claim_inspections(integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_center_pending_claim_inspections(integer, integer)
  to authenticated;

create function public.get_center_claim_inspection_detail(p_inspection_id uuid)
returns table (
  inspection_id uuid,
  claim_id uuid,
  claim_number text,
  requested_at timestamptz,
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
  affected_area text,
  description text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor jsonb;
  v_party_id uuid;
begin
  if p_inspection_id is null then
    raise exception using errcode = '22023', message = 'PG_CLAIM_INSPECTION_NOT_FOUND';
  end if;

  v_actor := private.lock_claim_read_context();
  if v_actor ->> 'role' <> 'center' then
    raise exception using errcode = '42501', message = 'PG_CLAIM_INSPECTION_CENTER_REQUIRED';
  end if;
  v_party_id := nullif(v_actor ->> 'party_id', '')::uuid;

  if not exists (
    select 1
    from public.warranty_claim_inspections inspection
    join public.warranty_claims claim on claim.id = inspection.claim_id
    where inspection.id = p_inspection_id
      and inspection.assigned_center_party_id = v_party_id
      and inspection.status = 'requested'
      and claim.status = 'awaiting_inspection'
      and claim.closed_at is null
  ) then
    raise exception using errcode = '42501', message = 'PG_CLAIM_INSPECTION_NOT_FOUND';
  end if;

  return query
  select
    inspection.id,
    claim.id,
    claim.claim_number,
    inspection.requested_at,
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
    claim.affected_area,
    claim.description
  from public.warranty_claim_inspections inspection
  join public.warranty_claims claim on claim.id = inspection.claim_id
  join public.warranties warranty on warranty.id = claim.warranty_id
  where inspection.id = p_inspection_id;
end;
$$;

revoke all on function public.get_center_claim_inspection_detail(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_center_claim_inspection_detail(uuid)
  to authenticated;

create function public.list_warranty_claim_evidence_for_role(
  p_claim_id uuid,
  p_inspection_id uuid default null
)
returns table (
  evidence_scope text,
  storage_path text,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor jsonb;
  v_role text;
  v_party_id uuid;
begin
  if p_claim_id is null then
    raise exception using errcode = '22023', message = 'PG_CLAIM_NOT_FOUND';
  end if;

  v_actor := private.lock_claim_read_context();
  v_role := v_actor ->> 'role';
  v_party_id := nullif(v_actor ->> 'party_id', '')::uuid;

  if v_role = 'center' then
    if p_inspection_id is null or not exists (
      select 1
      from public.warranty_claim_inspections inspection
      join public.warranty_claims claim on claim.id = inspection.claim_id
      where inspection.id = p_inspection_id
        and inspection.claim_id = p_claim_id
        and inspection.assigned_center_party_id = v_party_id
        and inspection.status = 'requested'
        and claim.status = 'awaiting_inspection'
        and claim.closed_at is null
    ) then
      raise exception using errcode = '42501', message = 'PG_CLAIM_INSPECTION_NOT_FOUND';
    end if;
  elsif v_role <> 'admin' then
    raise exception using errcode = '42501', message = 'PG_CLAIM_FORBIDDEN';
  end if;

  return query
  select
    'customer_submission'::text,
    evidence.storage_path,
    evidence.mime_type,
    evidence.size_bytes,
    evidence.created_at
  from public.warranty_claim_evidence evidence
  where evidence.claim_id = p_claim_id

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
  where v_role = 'admin'
    and inspection.claim_id = p_claim_id
  order by 5, 2;
end;
$$;

revoke all on function public.list_warranty_claim_evidence_for_role(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.list_warranty_claim_evidence_for_role(uuid, uuid)
  to authenticated;

comment on function public.list_admin_warranty_claims(integer, integer, text, text) is
  'Cube Q Admin-only mobile queue projection. No direct Claim table read grant is introduced.';
comment on function public.get_admin_warranty_claim_detail(uuid) is
  'Cube Q Admin-only bounded adjudication context using immutable Warranty issuance snapshots plus current audited support corrections.';
comment on function public.list_center_pending_claim_inspections(integer, integer) is
  'Cube Q Center task queue. Only currently assigned requested inspections whose parent Claim remains open/awaiting are actionable.';
comment on function public.get_center_claim_inspection_detail(uuid) is
  'Cube Q narrow Center inspection context. It omits customer contact, prior Claim history, Admin decision reasons and Resolution data.';
comment on function public.list_warranty_claim_evidence_for_role(uuid, uuid) is
  'Cube Q private evidence metadata boundary. Admin may inspect Claim/inspection evidence; Center may receive only customer evidence for its currently actionable assigned inspection.';