-- Cube P — Customer Warranty Claim Intake, increment 2
-- Service-role-only customer verification/context, authoritative Claim creation,
-- Cube L notification projection and the narrow Cube M open-Claim void guard.

create function private.normalize_warranty_claim_phone(p_phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    regexp_replace(
      translate(
        btrim(coalesce(p_phone, '')),
        '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
        '01234567890123456789'
      ),
      '[[:space:]()-]',
      '',
      'g'
    ),
    ''
  )
$$;

revoke all on function private.normalize_warranty_claim_phone(text)
  from public, anon, authenticated, service_role;

comment on function private.normalize_warranty_claim_phone(text) is
  'Cube P format-only phone normalization: converts common Arabic/Persian digits and removes whitespace, parentheses and hyphens. It never guesses or rewrites country codes.';

create function private.next_warranty_claim_number()
returns text
language sql
volatile
set search_path = ''
as $$
  select 'PG-C-' || lpad(nextval('private.warranty_claim_number_seq')::text, 8, '0')
$$;

revoke all on function private.next_warranty_claim_number()
  from public, anon, authenticated, service_role;

-- Server-only verification. Zero rows intentionally covers malformed/unknown
-- Public Code, no effective Warranty and phone mismatch so the application can
-- return one generic verification failure without becoming an identity oracle.
create function public.verify_customer_warranty_claim_phone(
  p_public_code text,
  p_phone text
)
returns table (
  warranty_id uuid,
  normalized_phone text,
  public_state text,
  coverage_expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_roll_id uuid;
  v_warranty public.warranties%rowtype;
  v_input_phone text;
  v_current_phone text;
begin
  if p_public_code is null or p_public_code !~ '^[0-9a-f]{64}$' then
    return;
  end if;

  v_input_phone := private.normalize_warranty_claim_phone(p_phone);
  if v_input_phone is null then
    return;
  end if;

  select identity.roll_id
    into v_roll_id
  from private.roll_public_identities identity
  where identity.public_code = p_public_code;

  if not found then
    return;
  end if;

  select warranty.*
    into v_warranty
  from public.warranties warranty
  where warranty.roll_id = v_roll_id
    and warranty.record_state = 'issued';

  if not found then
    return;
  end if;

  v_current_phone := private.normalize_warranty_claim_phone(v_warranty.customer_phone);
  if v_current_phone is null or v_current_phone <> v_input_phone then
    return;
  end if;

  return query
  select
    v_warranty.id,
    v_current_phone,
    case when now() < v_warranty.coverage_expires_at then 'active' else 'expired' end::text,
    v_warranty.coverage_expires_at;
end;
$$;

revoke all on function public.verify_customer_warranty_claim_phone(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.verify_customer_warranty_claim_phone(text, text)
  to service_role;

comment on function public.verify_customer_warranty_claim_phone(text, text) is
  'Cube P service-only registered-phone verification for the effective issued Warranty behind one exact Roll Public Code. Never granted to browser roles.';

-- Server-only current context. The normalized phone is deliberately returned
-- only to the trusted server so it can verify the keyed fingerprint embedded in
-- the short-lived HttpOnly customer context after any Cube M phone correction.
create function public.get_customer_warranty_claim_context(
  p_public_code text,
  p_warranty_id uuid
)
returns table (
  warranty_id uuid,
  current_phone_normalized text,
  public_state text,
  can_submit_new_claim boolean,
  product_name text,
  warranty_number text,
  activated_at timestamptz,
  coverage_expires_at timestamptz,
  activating_center_name text,
  vehicle_make text,
  vehicle_model text,
  vehicle_year smallint,
  current_open_claim jsonb,
  recent_closed_claims jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_roll_id uuid;
  v_warranty public.warranties%rowtype;
  v_open_claim jsonb;
  v_closed_claims jsonb;
begin
  if p_warranty_id is null
     or p_public_code is null
     or p_public_code !~ '^[0-9a-f]{64}$'
  then
    return;
  end if;

  select identity.roll_id
    into v_roll_id
  from private.roll_public_identities identity
  where identity.public_code = p_public_code;

  if not found then
    return;
  end if;

  select warranty.*
    into v_warranty
  from public.warranties warranty
  where warranty.id = p_warranty_id
    and warranty.roll_id = v_roll_id
    and warranty.record_state = 'issued';

  if not found then
    return;
  end if;

  select jsonb_build_object(
      'claim_number', claim.claim_number,
      'status', claim.status,
      'submitted_at', claim.submitted_at,
      'category', claim.category,
      'affected_area', claim.affected_area,
      'description', claim.description,
      'evidence_count', (
        select count(*)
        from public.warranty_claim_evidence evidence
        where evidence.claim_id = claim.id
      )
    )
    into v_open_claim
  from public.warranty_claims claim
  where claim.warranty_id = v_warranty.id
    and claim.closed_at is null
  order by claim.submitted_at desc, claim.id desc
  limit 1;

  select coalesce(jsonb_agg(history.item order by history.submitted_at desc), '[]'::jsonb)
    into v_closed_claims
  from (
    select
      claim.submitted_at,
      jsonb_build_object(
        'claim_number', claim.claim_number,
        'status', claim.status,
        'submitted_at', claim.submitted_at,
        'category', claim.category,
        'affected_area', claim.affected_area,
        'description', claim.description,
        'closed_at', claim.closed_at,
        'evidence_count', (
          select count(*)
          from public.warranty_claim_evidence evidence
          where evidence.claim_id = claim.id
        )
      ) as item
    from public.warranty_claims claim
    where claim.warranty_id = v_warranty.id
      and claim.closed_at is not null
    order by claim.submitted_at desc, claim.id desc
    limit 10
  ) history;

  return query
  select
    v_warranty.id,
    private.normalize_warranty_claim_phone(v_warranty.customer_phone),
    case when now() < v_warranty.coverage_expires_at then 'active' else 'expired' end::text,
    (
      now() < v_warranty.coverage_expires_at
      and v_open_claim is null
    ),
    v_warranty.product_name_snapshot,
    v_warranty.warranty_number,
    v_warranty.activated_at,
    v_warranty.coverage_expires_at,
    v_warranty.activating_center_name_snapshot,
    v_warranty.vehicle_make,
    v_warranty.vehicle_model,
    v_warranty.vehicle_year,
    v_open_claim,
    v_closed_claims;
end;
$$;

revoke all on function public.get_customer_warranty_claim_context(text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_customer_warranty_claim_context(text, uuid)
  to service_role;

comment on function public.get_customer_warranty_claim_context(text, uuid) is
  'Cube P service-only Warranty-scoped Claim management envelope plus current normalized phone for short-lived context freshness validation. Browser roles have no execute grant.';

create function public.get_customer_warranty_claim_by_request(
  p_request_id uuid,
  p_warranty_id uuid
)
returns table (
  claim_id uuid,
  claim_number text
)
language sql
stable
security definer
set search_path = ''
as $$
  select claim.id, claim.claim_number
  from public.warranty_claims claim
  where claim.request_id = p_request_id
    and claim.warranty_id = p_warranty_id
  limit 1
$$;

revoke all on function public.get_customer_warranty_claim_by_request(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_customer_warranty_claim_by_request(uuid, uuid)
  to service_role;

-- Authoritative customer Claim transaction. The browser never calls this RPC;
-- the trusted application server supplies the Warranty ID and current normalized
-- phone only after validating its signed customer context.
create function public.create_customer_warranty_claim(
  p_request_id uuid,
  p_warranty_id uuid,
  p_public_code text,
  p_verified_phone_normalized text,
  p_draft_id uuid,
  p_category text,
  p_affected_area text,
  p_description text,
  p_evidence jsonb
)
returns table (
  claim_id uuid,
  claim_number text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.warranty_claims%rowtype;
  v_warranty public.warranties%rowtype;
  v_roll_id uuid;
  v_claim_id uuid := gen_random_uuid();
  v_claim_number text;
  v_submitted_at timestamptz := clock_timestamp();
  v_category text := btrim(coalesce(p_category, ''));
  v_affected_area text := btrim(coalesce(p_affected_area, ''));
  v_description text := btrim(coalesce(p_description, ''));
  v_verified_phone text := nullif(btrim(coalesce(p_verified_phone_normalized, '')), '');
  v_evidence_count integer;
  v_distinct_path_count integer;
  v_item jsonb;
  v_path text;
  v_mime text;
  v_size bigint;
  v_extension text;
  v_existing_evidence_count integer;
begin
  if p_request_id is null
    or p_warranty_id is null
    or p_draft_id is null
  then
    raise exception using errcode = '22023', message = 'PG_CLAIM_REQUEST_INVALID';
  end if;

  if p_public_code is null or p_public_code !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'PG_CLAIM_WARRANTY_UNAVAILABLE';
  end if;

  if v_category not in (
    'cracking', 'yellowing', 'discoloration', 'peeling',
    'delamination', 'adhesive_issue', 'bubbling', 'other'
  ) then
    raise exception using errcode = '22023', message = 'PG_CLAIM_CATEGORY_INVALID';
  end if;

  if char_length(v_affected_area) < 2 or char_length(v_affected_area) > 160 then
    raise exception using errcode = '22023', message = 'PG_CLAIM_AFFECTED_AREA_INVALID';
  end if;

  if char_length(v_description) < 10 or char_length(v_description) > 3000 then
    raise exception using errcode = '22023', message = 'PG_CLAIM_DESCRIPTION_INVALID';
  end if;

  if p_evidence is null or jsonb_typeof(p_evidence) <> 'array' then
    raise exception using errcode = '22023', message = 'PG_CLAIM_EVIDENCE_INVALID';
  end if;

  v_evidence_count := jsonb_array_length(p_evidence);
  if v_evidence_count < 1 or v_evidence_count > 5 then
    raise exception using errcode = '22023', message = 'PG_CLAIM_EVIDENCE_INVALID';
  end if;

  select count(distinct item ->> 'storage_path')
    into v_distinct_path_count
  from jsonb_array_elements(p_evidence) item;

  if v_distinct_path_count <> v_evidence_count then
    raise exception using errcode = '22023', message = 'PG_CLAIM_EVIDENCE_INVALID';
  end if;

  for v_item in select value from jsonb_array_elements(p_evidence)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception using errcode = '22023', message = 'PG_CLAIM_EVIDENCE_INVALID';
    end if;

    v_path := btrim(coalesce(v_item ->> 'storage_path', ''));
    v_mime := btrim(coalesce(v_item ->> 'mime_type', ''));

    begin
      v_size := (v_item ->> 'size_bytes')::bigint;
    exception when others then
      raise exception using errcode = '22023', message = 'PG_CLAIM_EVIDENCE_INVALID';
    end;

    if v_path !~ ('^' || p_draft_id::text || '/[0-9a-f]{64}\.(jpg|png|webp)$')
      or v_mime not in ('image/jpeg', 'image/png', 'image/webp')
      or v_size < 1
      or v_size > 8388608
    then
      raise exception using errcode = '22023', message = 'PG_CLAIM_EVIDENCE_INVALID';
    end if;

    v_extension := lower(split_part(v_path, '.', 2));
    if (v_mime = 'image/jpeg' and v_extension <> 'jpg')
      or (v_mime = 'image/png' and v_extension <> 'png')
      or (v_mime = 'image/webp' and v_extension <> 'webp')
    then
      raise exception using errcode = '22023', message = 'PG_CLAIM_EVIDENCE_INVALID';
    end if;
  end loop;

  -- Lost-response retries are resolved before re-evaluating current coverage.
  -- Therefore a request that committed immediately before expiry remains safely
  -- idempotent even when its response was lost and the retry arrives later.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_request_id::text, 0)
  );

  select claim.*
    into v_existing
  from public.warranty_claims claim
  where claim.request_id = p_request_id;

  if found then
    if v_existing.warranty_id <> p_warranty_id
      or v_existing.category <> v_category
      or v_existing.affected_area <> v_affected_area
      or v_existing.description <> v_description
    then
      raise exception using errcode = '23505', message = 'PG_CLAIM_REQUEST_CONFLICT';
    end if;

    select count(*)
      into v_existing_evidence_count
    from public.warranty_claim_evidence evidence
    where evidence.claim_id = v_existing.id;

    if v_existing_evidence_count <> v_evidence_count
      or exists (
        select 1
        from jsonb_array_elements(p_evidence) input_item
        where not exists (
          select 1
          from public.warranty_claim_evidence evidence
          where evidence.claim_id = v_existing.id
            and evidence.storage_path = input_item ->> 'storage_path'
            and evidence.mime_type = input_item ->> 'mime_type'
            and evidence.size_bytes = (input_item ->> 'size_bytes')::bigint
        )
      )
    then
      raise exception using errcode = '23505', message = 'PG_CLAIM_REQUEST_CONFLICT';
    end if;

    return query select v_existing.id, v_existing.claim_number;
    return;
  end if;

  select identity.roll_id
    into v_roll_id
  from private.roll_public_identities identity
  where identity.public_code = p_public_code;

  if not found then
    raise exception using errcode = '22023', message = 'PG_CLAIM_WARRANTY_UNAVAILABLE';
  end if;

  -- Warranty is the shared serialization anchor with Cube M correction/void.
  select warranty.*
    into v_warranty
  from public.warranties warranty
  where warranty.id = p_warranty_id
    and warranty.roll_id = v_roll_id
  for update;

  if not found or v_warranty.record_state <> 'issued' then
    raise exception using errcode = '23514', message = 'PG_CLAIM_WARRANTY_UNAVAILABLE';
  end if;

  if v_verified_phone is null
    or private.normalize_warranty_claim_phone(v_warranty.customer_phone) <> v_verified_phone
  then
    raise exception using errcode = '42501', message = 'PG_CLAIM_VERIFICATION_STALE';
  end if;

  if clock_timestamp() >= v_warranty.coverage_expires_at then
    raise exception using errcode = '23514', message = 'PG_CLAIM_WARRANTY_EXPIRED';
  end if;

  if exists (
    select 1
    from public.warranty_claims claim
    where claim.warranty_id = v_warranty.id
      and claim.closed_at is null
  ) then
    raise exception using errcode = '23505', message = 'PG_CLAIM_OPEN_EXISTS';
  end if;

  v_claim_number := private.next_warranty_claim_number();

  insert into public.warranty_claims (
    id,
    request_id,
    warranty_id,
    claim_number,
    category,
    affected_area,
    description,
    status,
    submitted_at
  ) values (
    v_claim_id,
    p_request_id,
    v_warranty.id,
    v_claim_number,
    v_category,
    v_affected_area,
    v_description,
    'submitted',
    v_submitted_at
  );

  insert into public.warranty_claim_evidence (
    claim_id,
    evidence_kind,
    storage_path,
    mime_type,
    size_bytes,
    created_at
  )
  select
    v_claim_id,
    'customer_submission',
    evidence.storage_path,
    evidence.mime_type,
    evidence.size_bytes,
    v_submitted_at
  from jsonb_to_recordset(p_evidence) as evidence(
    storage_path text,
    mime_type text,
    size_bytes bigint
  );

  -- The immutable submitted event is also the Cube L materialization source.
  -- No Public Code, phone or other customer PII is copied into event_data.
  insert into public.warranty_claim_events (
    claim_id,
    action_request_id,
    event_kind,
    actor_profile_id,
    actor_kind,
    reason,
    event_data,
    created_at
  ) values (
    v_claim_id,
    p_request_id,
    'submitted',
    null,
    'customer_verified_phone',
    null,
    jsonb_build_object('evidence_count', v_evidence_count),
    v_submitted_at
  );

  return query select v_claim_id, v_claim_number;
end;
$$;

revoke all on function public.create_customer_warranty_claim(uuid, uuid, text, text, uuid, text, text, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.create_customer_warranty_claim(uuid, uuid, text, text, uuid, text, text, text, jsonb)
  to service_role;

comment on function public.create_customer_warranty_claim(uuid, uuid, text, text, uuid, text, text, text, jsonb) is
  'Cube P authoritative service-only Claim intake transaction. Re-resolves permanent Roll identity, locks/revalidates the issued Warranty, current phone, active coverage, one-open-case invariant and evidence metadata before Claim/event commit.';

-- Cube L projector: customer submission notifies active Protection Giants Admin
-- Profiles only. action_path intentionally remains null until Cube Q provides a
-- real authorized professional Claim-detail destination.
create function private.materialize_warranty_claim_notification_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim public.warranty_claims%rowtype;
  v_warranty public.warranties%rowtype;
  v_company_party_id uuid;
  v_source_event_key text := 'warranty_claim_events:' || new.id::text;
  v_body text;
begin
  if new.event_kind <> 'submitted' then
    return new;
  end if;

  select claim.*
    into v_claim
  from public.warranty_claims claim
  where claim.id = new.claim_id;

  if not found then
    raise exception using errcode = '23514', message = 'PG_NOTIFICATION_CLAIM_MISSING';
  end if;

  select warranty.*
    into v_warranty
  from public.warranties warranty
  where warranty.id = v_claim.warranty_id;

  if not found then
    raise exception using errcode = '23514', message = 'PG_NOTIFICATION_CLAIM_WARRANTY_MISSING';
  end if;

  select op.id
    into v_company_party_id
  from public.operational_parties op
  where op.party_type = 'company';

  if v_company_party_id is null then
    raise exception using errcode = '23514', message = 'PG_NOTIFICATION_COMPANY_PARTY_MISSING';
  end if;

  v_body := 'تم استلام المطالبة ' || v_claim.claim_number
    || ' على ' || v_warranty.product_name_snapshot
    || ' — ' || v_warranty.vehicle_make || ' ' || v_warranty.vehicle_model || '.';

  insert into public.notifications (
    recipient_profile_id,
    event_type,
    source_domain,
    source_event_key,
    attention_level,
    title,
    body,
    action_path,
    push_eligible,
    created_at
  )
  select
    recipients.profile_id,
    'warranty.claim_submitted',
    'warranty_claim',
    v_source_event_key,
    'action_required',
    'مطالبة ضمان جديدة تحتاج مراجعة',
    v_body,
    null,
    true,
    new.created_at
  from private.notification_party_profile_ids(v_company_party_id) recipients
  on conflict (recipient_profile_id, source_domain, source_event_key, event_type)
  do nothing;

  return new;
end;
$$;

revoke all on function private.materialize_warranty_claim_notification_event()
  from public, anon, authenticated, service_role;

create trigger warranty_claim_events_notification_materializer
  after insert on public.warranty_claim_events
  for each row
  execute function private.materialize_warranty_claim_notification_event();

comment on function private.materialize_warranty_claim_notification_event() is
  'Cube P bounded Cube L projector. submitted Claim events create privacy-safe action-required Inbox rows for active Protection Giants Admin Profiles; Push remains best effort and no Q deep link is emitted yet.';

-- Narrow compatibility hardening for Cube M: an open end-to-end Claim cannot be
-- invalidated by voided_in_error. This guard is independent of the existing M
-- support RPC and catches every future SQL path that attempts that state change.
create function private.guard_warranty_open_claim_void()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.record_state = 'issued'
    and new.record_state = 'voided_in_error'
    and exists (
      select 1
      from public.warranty_claims claim
      where claim.warranty_id = old.id
        and claim.closed_at is null
    )
  then
    raise exception using errcode = '23514', message = 'PG_WARRANTY_OPEN_CLAIM_EXISTS';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_warranty_open_claim_void()
  from public, anon, authenticated, service_role;

create trigger warranties_claim_void_guard
  before update of record_state on public.warranties
  for each row
  execute function private.guard_warranty_open_claim_void();
