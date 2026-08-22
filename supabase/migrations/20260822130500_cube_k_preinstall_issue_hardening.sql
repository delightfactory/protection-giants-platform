-- Cube K hardening after foundation self-review.
-- Preserve precise idempotency conflicts and surface pending issue state during Recovery preflight.

create or replace function public.create_roll_preinstall_issue(
  p_request_id uuid,
  p_issue_id uuid,
  p_roll_serial text,
  p_category text,
  p_description text,
  p_evidence_paths text[] default '{}'::text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor jsonb;
  v_actor_profile_id uuid;
  v_actor_role text;
  v_center_party_id uuid;
  v_serial text;
  v_category text;
  v_description text;
  v_roll_id uuid;
  v_production_order_id uuid;
  v_custodian_party_id uuid;
  v_existing public.roll_preinstall_issues%rowtype;
  v_existing_paths text[];
  v_input_paths text[];
  v_path text;
  v_object_metadata jsonb;
  v_mime text;
  v_size bigint;
begin
  if p_request_id is null or p_issue_id is null then
    raise exception using errcode = '22023', message = 'PG_ROLL_ISSUE_REQUEST_ID_REQUIRED';
  end if;

  v_serial := upper(btrim(coalesce(p_roll_serial, '')));
  if v_serial !~ '^PG-R-[0-9]{8}-[0-9]{8}-[0-9]{2}-[0-9]{4,5}$' then
    raise exception using errcode = '22023', message = 'PG_ROLL_ISSUE_SERIAL_INVALID';
  end if;

  v_category := btrim(coalesce(p_category, ''));
  if v_category not in ('manufacturing_defect', 'physical_damage', 'contamination_or_packaging', 'other') then
    raise exception using errcode = '22023', message = 'PG_ROLL_ISSUE_INVALID_CATEGORY';
  end if;

  v_description := btrim(coalesce(p_description, ''));
  if char_length(v_description) < 10 or char_length(v_description) > 2000 then
    raise exception using errcode = '22023', message = 'PG_ROLL_ISSUE_INVALID_DESCRIPTION';
  end if;

  if coalesce(cardinality(p_evidence_paths), 0) > 5 then
    raise exception using errcode = '22023', message = 'PG_ROLL_ISSUE_INVALID_EVIDENCE';
  end if;

  select coalesce(array_agg(path order by path), '{}'::text[])
    into v_input_paths
  from (
    select distinct path
    from unnest(coalesce(p_evidence_paths, '{}'::text[])) as evidence(path)
  ) deduped;

  if cardinality(v_input_paths) <> coalesce(cardinality(p_evidence_paths), 0) then
    raise exception using errcode = '22023', message = 'PG_ROLL_ISSUE_INVALID_EVIDENCE';
  end if;

  v_actor := private.lock_transfer_actor_context();
  v_actor_profile_id := (v_actor ->> 'profile_id')::uuid;
  v_actor_role := v_actor ->> 'role';
  v_center_party_id := (v_actor ->> 'party_id')::uuid;

  if v_actor_role <> 'center' then
    raise exception using errcode = '42501', message = 'PG_ROLL_ISSUE_CENTER_REQUIRED';
  end if;

  if not private.lock_transfer_party_lifecycle(v_center_party_id) then
    raise exception using errcode = '42501', message = 'PG_ROLL_ISSUE_CENTER_INACTIVE';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text, 0));

  select r.id, r.production_order_id
    into v_roll_id, v_production_order_id
  from public.rolls r
  where r.serial_number = v_serial;

  if not found then
    raise exception using errcode = '22023', message = 'PG_ROLL_ISSUE_ROLL_NOT_FOUND';
  end if;

  select * into v_existing
  from public.roll_preinstall_issues issue
  where issue.request_id = p_request_id;

  if found then
    select coalesce(array_agg(e.storage_path order by e.storage_path), '{}'::text[])
      into v_existing_paths
    from public.roll_preinstall_issue_evidence e
    where e.issue_id = v_existing.id;

    if v_existing.id <> p_issue_id
      or v_existing.roll_id <> v_roll_id
      or v_existing.reported_by_profile_id <> v_actor_profile_id
      or v_existing.reporting_center_party_id <> v_center_party_id
      or v_existing.category <> v_category
      or v_existing.description <> v_description
      or v_existing_paths is distinct from v_input_paths
    then
      raise exception using errcode = '23505', message = 'PG_ROLL_ISSUE_REQUEST_CONFLICT';
    end if;

    return v_existing.id;
  end if;

  perform 1
  from public.production_orders po
  where po.id = v_production_order_id
  for update;

  if not found then
    raise exception using errcode = '23514', message = 'PG_ROLL_ISSUE_PRODUCTION_MISSING';
  end if;

  if exists (
    select 1 from public.production_orders po
    where po.id = v_production_order_id and po.status <> 'generated'
  ) then
    raise exception using errcode = '23514', message = 'PG_ROLL_ISSUE_PRODUCTION_INVALID';
  end if;

  select custody.custodian_party_id
    into v_custodian_party_id
  from public.roll_custody_current custody
  where custody.roll_id = v_roll_id
  for update;

  if not found then
    raise exception using errcode = '23514', message = 'PG_ROLL_ISSUE_CUSTODY_MISSING';
  end if;

  if v_custodian_party_id <> v_center_party_id then
    raise exception using errcode = '42501', message = 'PG_ROLL_ISSUE_NOT_CURRENT_CUSTODIAN';
  end if;

  if not exists (select 1 from public.roll_openings opening where opening.roll_id = v_roll_id) then
    raise exception using errcode = '23514', message = 'PG_ROLL_ISSUE_ROLL_NOT_OPENED';
  end if;

  if exists (
    select 1 from public.roll_preinstall_issues issue
    where issue.roll_id = v_roll_id and issue.status = 'return_required'
  ) then
    raise exception using errcode = '23514', message = 'PG_ROLL_ISSUE_RETURN_REQUIRED_ALREADY';
  end if;

  if exists (
    select 1 from public.roll_preinstall_issues issue
    where issue.roll_id = v_roll_id and issue.status = 'submitted'
  ) then
    raise exception using errcode = '23514', message = 'PG_ROLL_ISSUE_ACTIVE_ISSUE_EXISTS';
  end if;

  foreach v_path in array v_input_paths loop
    if v_path !~ ('^' || p_issue_id::text || '/[0-9]+-[0-9a-f]{64}\.(jpg|png|webp)$') then
      raise exception using errcode = '22023', message = 'PG_ROLL_ISSUE_INVALID_EVIDENCE';
    end if;

    select object.metadata
      into v_object_metadata
    from storage.objects object
    where object.bucket_id = 'roll-preinstall-issue-evidence'
      and object.name = v_path;

    if not found then
      raise exception using errcode = '22023', message = 'PG_ROLL_ISSUE_INVALID_EVIDENCE';
    end if;

    v_mime := coalesce(v_object_metadata ->> 'mimetype', '');
    v_size := coalesce((v_object_metadata ->> 'size')::bigint, 0);

    if v_mime not in ('image/jpeg', 'image/png', 'image/webp')
      or v_size < 1
      or v_size > 8388608
    then
      raise exception using errcode = '22023', message = 'PG_ROLL_ISSUE_INVALID_EVIDENCE';
    end if;
  end loop;

  insert into public.roll_preinstall_issues (
    id,
    request_id,
    roll_id,
    reported_by_profile_id,
    reporting_center_party_id,
    category,
    description
  ) values (
    p_issue_id,
    p_request_id,
    v_roll_id,
    v_actor_profile_id,
    v_center_party_id,
    v_category,
    v_description
  );

  insert into public.roll_preinstall_issue_events (
    issue_id,
    action_request_id,
    event_kind,
    actor_profile_id
  ) values (
    p_issue_id,
    p_request_id,
    'submitted',
    v_actor_profile_id
  );

  foreach v_path in array v_input_paths loop
    select object.metadata
      into v_object_metadata
    from storage.objects object
    where object.bucket_id = 'roll-preinstall-issue-evidence'
      and object.name = v_path;

    insert into public.roll_preinstall_issue_evidence (
      issue_id,
      storage_path,
      mime_type,
      size_bytes,
      uploaded_by_profile_id
    ) values (
      p_issue_id,
      v_path,
      v_object_metadata ->> 'mimetype',
      (v_object_metadata ->> 'size')::bigint,
      v_actor_profile_id
    );
  end loop;

  return p_issue_id;
end;
$$;

revoke all on function public.create_roll_preinstall_issue(uuid, uuid, text, text, text, text[])
  from public, anon, authenticated, service_role;
grant execute on function public.create_roll_preinstall_issue(uuid, uuid, text, text, text, text[])
  to authenticated;

create or replace function public.resolve_opened_roll_recovery_candidate(p_roll_serial text)
returns table (
  roll_id uuid,
  serial_number text,
  lot_number text,
  product_code text,
  product_name text,
  opened_at timestamptz,
  opening_center_name text,
  current_custodian_type text,
  current_custodian_name text,
  recovery_destination_name text,
  eligibility text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor jsonb;
  v_actor_role text;
  v_recipient_party_id uuid;
  v_agent_id uuid;
  v_serial text;
  v_roll_id uuid;
  v_production_status text;
  v_sender_party_id uuid;
  v_sender_party_type text;
  v_sender_center_id uuid;
  v_destination_name text;
begin
  v_serial := upper(btrim(coalesce(p_roll_serial, '')));
  if v_serial !~ '^PG-R-[0-9]{8}-[0-9]{8}-[0-9]{2}-[0-9]{4,5}$' then
    raise exception using errcode = '22023', message = 'PG_ROLL_RECOVERY_SERIAL_INVALID';
  end if;

  v_actor := private.lock_transfer_actor_context();
  v_actor_role := v_actor ->> 'role';
  v_recipient_party_id := (v_actor ->> 'party_id')::uuid;

  if v_actor_role not in ('admin', 'agent') then
    raise exception using errcode = '42501', message = 'PG_ROLL_RECOVERY_NOT_AUTHORIZED';
  end if;

  if not private.lock_transfer_party_lifecycle(v_recipient_party_id) then
    raise exception using errcode = '42501', message = 'PG_ROLL_RECOVERY_ACTOR_INACTIVE';
  end if;

  if v_actor_role = 'agent' then
    select op.country_agent_id, ca.name
      into v_agent_id, v_destination_name
    from public.operational_parties op
    join public.country_agents ca on ca.id = op.country_agent_id
    where op.id = v_recipient_party_id
      and op.party_type = 'agent'
      and ca.status = 'active'
      and ca.opened_roll_recovery_enabled = true;

    if not found or v_agent_id is null then
      raise exception using errcode = '42501', message = 'PG_ROLL_RECOVERY_AGENT_NOT_ENABLED';
    end if;
  else
    v_destination_name := 'Protection Giants';
  end if;

  select
    r.id,
    po.status,
    custody.custodian_party_id,
    current_party.party_type,
    current_party.installation_center_id
  into
    v_roll_id,
    v_production_status,
    v_sender_party_id,
    v_sender_party_type,
    v_sender_center_id
  from public.rolls r
  join public.production_orders po on po.id = r.production_order_id
  join public.roll_custody_current custody on custody.roll_id = r.id
  join public.operational_parties current_party on current_party.id = custody.custodian_party_id
  where r.serial_number = v_serial;

  if not found then
    raise exception using errcode = '22023', message = 'PG_ROLL_RECOVERY_ROLL_NOT_FOUND';
  end if;

  if v_production_status <> 'generated' then
    raise exception using errcode = '23514', message = 'PG_ROLL_RECOVERY_PRODUCTION_INVALID';
  end if;

  if not exists (
    select 1 from public.roll_openings opening where opening.roll_id = v_roll_id
  ) then
    raise exception using errcode = '23514', message = 'PG_ROLL_RECOVERY_NOT_OPENED';
  end if;

  if v_actor_role = 'agent' then
    if v_sender_party_type <> 'center' or v_sender_center_id is null then
      raise exception using errcode = '42501', message = 'PG_ROLL_RECOVERY_AGENT_CENTER_REQUIRED';
    end if;

    if not exists (
      select 1
      from public.installation_centers center_entity
      left join public.dealers dealer_entity on dealer_entity.id = center_entity.dealer_id
      where center_entity.id = v_sender_center_id
        and (
          center_entity.country_agent_id = v_agent_id
          or dealer_entity.country_agent_id = v_agent_id
        )
    ) then
      raise exception using errcode = '42501', message = 'PG_ROLL_RECOVERY_OUTSIDE_AGENT_SCOPE';
    end if;
  end if;

  return query
  select
    r.id,
    r.serial_number,
    lot.lot_number,
    po.product_code_snapshot,
    po.product_name_snapshot,
    opening.opened_at,
    coalesce(opening_center.name, 'مركز تركيب')::text,
    current_party.party_type,
    case current_party.party_type
      when 'company' then 'Protection Giants'
      when 'agent' then coalesce(current_agent.name, 'وكيل دولة')
      when 'dealer' then coalesce(current_dealer.name, 'موزع')
      when 'center' then coalesce(current_center.name, 'مركز تركيب')
      else 'جهة تشغيلية'
    end::text,
    v_destination_name,
    case
      when current_party.id = v_recipient_party_id then 'already_at_destination'
      when exists (
        select 1
        from public.roll_preinstall_issues issue
        where issue.roll_id = r.id and issue.status = 'submitted'
      ) then 'issue_pending'
      when reservation.roll_id is not null then 'transfer_reserved'
      else 'eligible'
    end::text
  from public.rolls r
  join public.production_orders po on po.id = r.production_order_id
  join public.production_lots lot on lot.id = r.production_lot_id
  join public.roll_openings opening on opening.roll_id = r.id
  join public.operational_parties opening_party on opening_party.id = opening.opened_by_center_party_id
  left join public.installation_centers opening_center on opening_center.id = opening_party.installation_center_id
  join public.roll_custody_current custody on custody.roll_id = r.id
  join public.operational_parties current_party on current_party.id = custody.custodian_party_id
  left join public.country_agents current_agent on current_agent.id = current_party.country_agent_id
  left join public.dealers current_dealer on current_dealer.id = current_party.dealer_id
  left join public.installation_centers current_center on current_center.id = current_party.installation_center_id
  left join public.roll_transfer_reservations reservation on reservation.roll_id = r.id
  where r.id = v_roll_id;
end;
$$;

revoke all on function public.resolve_opened_roll_recovery_candidate(text)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_opened_roll_recovery_candidate(text)
  to authenticated;

comment on function public.resolve_opened_roll_recovery_candidate(text) is
  'Cube J Recovery preflight hardened by Cube K: active submitted Pre-install Issue is visible as issue_pending and must be resolved before physical Recovery.';
