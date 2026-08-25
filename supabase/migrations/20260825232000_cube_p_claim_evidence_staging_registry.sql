-- Cube P — Customer Warranty Claim Intake, increment 3
-- Serialize staged evidence upload/remove/finalize through one private draft
-- registry so a successful Claim can never race a second tab that deletes an
-- image after final validation but before the Claim transaction commits.

create table private.warranty_claim_drafts (
  id uuid primary key,
  warranty_id uuid not null references public.warranties(id) on delete restrict,
  state text not null default 'open',
  expires_at timestamptz not null,
  submitted_claim_id uuid unique references public.warranty_claims(id) on delete restrict,
  created_at timestamptz not null default now(),

  constraint warranty_claim_drafts_state_allowed
    check (state in ('open', 'submitted', 'cleanup_pending')),
  constraint warranty_claim_drafts_expiry_shape
    check (expires_at > created_at),
  constraint warranty_claim_drafts_state_shape
    check (
      (state in ('open', 'cleanup_pending') and submitted_claim_id is null)
      or (state = 'submitted' and submitted_claim_id is not null)
    )
);

create index warranty_claim_drafts_expiry_idx
  on private.warranty_claim_drafts (expires_at, id)
  where state in ('open', 'cleanup_pending');

create table private.warranty_claim_draft_evidence (
  draft_id uuid not null references private.warranty_claim_drafts(id) on delete cascade,
  storage_path text primary key,
  mime_type text not null,
  size_bytes bigint not null,
  created_at timestamptz not null default now(),

  constraint warranty_claim_draft_evidence_path_shape
    check (
      storage_path ~ (
        '^' || draft_id::text || '/[0-9a-f]{64}\.(jpg|png|webp)$'
      )
    ),
  constraint warranty_claim_draft_evidence_mime_allowed
    check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  constraint warranty_claim_draft_evidence_size_allowed
    check (size_bytes > 0 and size_bytes <= 8388608),
  constraint warranty_claim_draft_evidence_extension_matches_mime
    check (
      (mime_type = 'image/jpeg' and storage_path ~ '\.jpg$')
      or (mime_type = 'image/png' and storage_path ~ '\.png$')
      or (mime_type = 'image/webp' and storage_path ~ '\.webp$')
    )
);

create index warranty_claim_draft_evidence_draft_idx
  on private.warranty_claim_draft_evidence (draft_id, created_at, storage_path);

revoke all on table private.warranty_claim_drafts
  from public, anon, authenticated, service_role;
revoke all on table private.warranty_claim_draft_evidence
  from public, anon, authenticated, service_role;

comment on table private.warranty_claim_drafts is
  'Cube P transient server-only evidence orchestration registry. A draft row is the serialization anchor for upload/remove/final-submit races; submitted rows remain as a tombstone so a stale remove can never delete committed Claim evidence.';
comment on table private.warranty_claim_draft_evidence is
  'Cube P server-only staged evidence registry. Rows are registered only after Storage upload succeeds and become the authoritative evidence set consumed by Claim submit.';

create function public.open_customer_warranty_claim_draft(
  p_draft_id uuid,
  p_warranty_id uuid,
  p_verified_phone_normalized text,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_warranty public.warranties%rowtype;
  v_existing private.warranty_claim_drafts%rowtype;
  v_now timestamptz := clock_timestamp();
  v_phone text := nullif(btrim(coalesce(p_verified_phone_normalized, '')), '');
begin
  if p_draft_id is null
    or p_warranty_id is null
    or p_expires_at is null
    or v_phone is null
  then
    raise exception using errcode = '22023', message = 'PG_CLAIM_DRAFT_INVALID';
  end if;

  if p_expires_at <= v_now
    or p_expires_at > v_now + interval '25 minutes'
  then
    raise exception using errcode = '22023', message = 'PG_CLAIM_DRAFT_EXPIRY_INVALID';
  end if;

  select warranty.*
    into v_warranty
  from public.warranties warranty
  where warranty.id = p_warranty_id;

  if not found
    or v_warranty.record_state <> 'issued'
    or clock_timestamp() >= v_warranty.coverage_expires_at
  then
    raise exception using errcode = '23514', message = 'PG_CLAIM_WARRANTY_UNAVAILABLE';
  end if;

  if private.normalize_warranty_claim_phone(v_warranty.customer_phone) <> v_phone then
    raise exception using errcode = '42501', message = 'PG_CLAIM_VERIFICATION_STALE';
  end if;

  select draft.*
    into v_existing
  from private.warranty_claim_drafts draft
  where draft.id = p_draft_id;

  if found then
    if v_existing.warranty_id <> p_warranty_id
      or v_existing.state <> 'open'
      or v_existing.expires_at <> p_expires_at
    then
      raise exception using errcode = '23505', message = 'PG_CLAIM_DRAFT_CONFLICT';
    end if;
    return v_existing.id;
  end if;

  insert into private.warranty_claim_drafts (
    id,
    warranty_id,
    state,
    expires_at
  ) values (
    p_draft_id,
    p_warranty_id,
    'open',
    p_expires_at
  );

  return p_draft_id;
end;
$$;

revoke all on function public.open_customer_warranty_claim_draft(uuid, uuid, text, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.open_customer_warranty_claim_draft(uuid, uuid, text, timestamptz)
  to service_role;

create function public.register_customer_warranty_claim_draft_evidence(
  p_draft_id uuid,
  p_warranty_id uuid,
  p_storage_path text,
  p_mime_type text,
  p_size_bytes bigint
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft private.warranty_claim_drafts%rowtype;
  v_existing private.warranty_claim_draft_evidence%rowtype;
  v_path text := btrim(coalesce(p_storage_path, ''));
  v_mime text := btrim(coalesce(p_mime_type, ''));
  v_count integer;
begin
  if p_draft_id is null or p_warranty_id is null then
    raise exception using errcode = '22023', message = 'PG_CLAIM_DRAFT_INVALID';
  end if;

  select draft.*
    into v_draft
  from private.warranty_claim_drafts draft
  where draft.id = p_draft_id
  for update;

  if not found or v_draft.warranty_id <> p_warranty_id then
    raise exception using errcode = '22023', message = 'PG_CLAIM_DRAFT_INVALID';
  end if;

  if v_draft.state <> 'open' then
    raise exception using errcode = '23514', message = 'PG_CLAIM_DRAFT_CLOSED';
  end if;

  if clock_timestamp() >= v_draft.expires_at then
    raise exception using errcode = '42501', message = 'PG_CLAIM_VERIFICATION_STALE';
  end if;

  if v_path !~ ('^' || p_draft_id::text || '/[0-9a-f]{64}\.(jpg|png|webp)$')
    or v_mime not in ('image/jpeg', 'image/png', 'image/webp')
    or p_size_bytes is null
    or p_size_bytes < 1
    or p_size_bytes > 8388608
    or (v_mime = 'image/jpeg' and v_path !~ '\.jpg$')
    or (v_mime = 'image/png' and v_path !~ '\.png$')
    or (v_mime = 'image/webp' and v_path !~ '\.webp$')
  then
    raise exception using errcode = '22023', message = 'PG_CLAIM_EVIDENCE_INVALID';
  end if;

  select evidence.*
    into v_existing
  from private.warranty_claim_draft_evidence evidence
  where evidence.storage_path = v_path;

  if found then
    if v_existing.draft_id <> p_draft_id
      or v_existing.mime_type <> v_mime
      or v_existing.size_bytes <> p_size_bytes
    then
      raise exception using errcode = '23505', message = 'PG_CLAIM_DRAFT_EVIDENCE_CONFLICT';
    end if;
    return true;
  end if;

  select count(*)
    into v_count
  from private.warranty_claim_draft_evidence evidence
  where evidence.draft_id = p_draft_id;

  if v_count >= 5 then
    raise exception using errcode = '23514', message = 'PG_CLAIM_DRAFT_EVIDENCE_LIMIT';
  end if;

  insert into private.warranty_claim_draft_evidence (
    draft_id,
    storage_path,
    mime_type,
    size_bytes
  ) values (
    p_draft_id,
    v_path,
    v_mime,
    p_size_bytes
  );

  return true;
end;
$$;

revoke all on function public.register_customer_warranty_claim_draft_evidence(uuid, uuid, text, text, bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.register_customer_warranty_claim_draft_evidence(uuid, uuid, text, text, bigint)
  to service_role;

create function public.unregister_customer_warranty_claim_draft_evidence(
  p_draft_id uuid,
  p_warranty_id uuid,
  p_storage_path text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft private.warranty_claim_drafts%rowtype;
  v_path text := btrim(coalesce(p_storage_path, ''));
begin
  if p_draft_id is null
    or p_warranty_id is null
    or v_path !~ ('^' || p_draft_id::text || '/[0-9a-f]{64}\.(jpg|png|webp)$')
  then
    raise exception using errcode = '22023', message = 'PG_CLAIM_DRAFT_INVALID';
  end if;

  select draft.*
    into v_draft
  from private.warranty_claim_drafts draft
  where draft.id = p_draft_id
  for update;

  if not found or v_draft.warranty_id <> p_warranty_id then
    raise exception using errcode = '22023', message = 'PG_CLAIM_DRAFT_INVALID';
  end if;

  if v_draft.state <> 'open' then
    raise exception using errcode = '23514', message = 'PG_CLAIM_DRAFT_CLOSED';
  end if;

  if clock_timestamp() >= v_draft.expires_at then
    raise exception using errcode = '42501', message = 'PG_CLAIM_VERIFICATION_STALE';
  end if;

  delete from private.warranty_claim_draft_evidence evidence
  where evidence.draft_id = p_draft_id
    and evidence.storage_path = v_path;

  -- Idempotent true also lets the server retry cleanup of an object whose draft
  -- metadata was already removed but whose previous Storage delete failed.
  return true;
end;
$$;

revoke all on function public.unregister_customer_warranty_claim_draft_evidence(uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.unregister_customer_warranty_claim_draft_evidence(uuid, uuid, text)
  to service_role;

create function public.claim_expired_warranty_claim_draft_cleanup_candidates(
  p_limit integer default 10
)
returns table (
  draft_id uuid,
  storage_paths text[]
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception using errcode = '22023', message = 'PG_CLAIM_DRAFT_CLEANUP_LIMIT_INVALID';
  end if;

  return query
  with selected as (
    select draft.id
    from private.warranty_claim_drafts draft
    where draft.state in ('open', 'cleanup_pending')
      and draft.expires_at <= clock_timestamp()
    order by draft.expires_at, draft.id
    for update skip locked
    limit p_limit
  ),
  marked as (
    update private.warranty_claim_drafts draft
    set state = 'cleanup_pending'
    from selected
    where draft.id = selected.id
    returning draft.id
  )
  select
    marked.id,
    coalesce(
      array_agg(evidence.storage_path order by evidence.storage_path)
        filter (where evidence.storage_path is not null),
      array[]::text[]
    )
  from marked
  left join private.warranty_claim_draft_evidence evidence
    on evidence.draft_id = marked.id
  group by marked.id
  order by marked.id;
end;
$$;

revoke all on function public.claim_expired_warranty_claim_draft_cleanup_candidates(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_expired_warranty_claim_draft_cleanup_candidates(integer)
  to service_role;

create function public.finalize_expired_warranty_claim_draft_cleanup(
  p_draft_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft private.warranty_claim_drafts%rowtype;
begin
  if p_draft_id is null then
    raise exception using errcode = '22023', message = 'PG_CLAIM_DRAFT_INVALID';
  end if;

  select draft.*
    into v_draft
  from private.warranty_claim_drafts draft
  where draft.id = p_draft_id
  for update;

  if not found then
    return true;
  end if;

  if v_draft.state <> 'cleanup_pending'
    or v_draft.expires_at > clock_timestamp()
  then
    raise exception using errcode = '23514', message = 'PG_CLAIM_DRAFT_CLEANUP_STATE_INVALID';
  end if;

  delete from private.warranty_claim_drafts draft
  where draft.id = p_draft_id;

  return true;
end;
$$;

revoke all on function public.finalize_expired_warranty_claim_draft_cleanup(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.finalize_expired_warranty_claim_draft_cleanup(uuid)
  to service_role;

-- Replace the P submit body without widening its public signature. The trusted
-- server still supplies its validated evidence envelope, but the database now
-- requires that envelope to match exactly the locked private draft registry.
create or replace function public.create_customer_warranty_claim(
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
  v_draft private.warranty_claim_drafts%rowtype;
  v_roll_id uuid;
  v_claim_id uuid := gen_random_uuid();
  v_claim_number text;
  v_submitted_at timestamptz;
  v_category text := btrim(coalesce(p_category, ''));
  v_affected_area text := btrim(coalesce(p_affected_area, ''));
  v_description text := btrim(coalesce(p_description, ''));
  v_verified_phone text := nullif(btrim(coalesce(p_verified_phone_normalized, '')), '');
  v_evidence_count integer;
  v_distinct_path_count integer;
  v_registered_count integer;
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

  -- Warranty remains the first domain serialization anchor shared with Cube M.
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

  -- The draft row serializes final submit against every registered remove.
  select draft.*
    into v_draft
  from private.warranty_claim_drafts draft
  where draft.id = p_draft_id
  for update;

  if not found or v_draft.warranty_id <> v_warranty.id then
    raise exception using errcode = '22023', message = 'PG_CLAIM_EVIDENCE_INVALID';
  end if;

  if v_draft.state <> 'open' then
    raise exception using errcode = '23514', message = 'PG_CLAIM_DRAFT_CLOSED';
  end if;

  if clock_timestamp() >= v_draft.expires_at then
    raise exception using errcode = '42501', message = 'PG_CLAIM_VERIFICATION_STALE';
  end if;

  select count(*)
    into v_registered_count
  from private.warranty_claim_draft_evidence evidence
  where evidence.draft_id = p_draft_id;

  if v_registered_count <> v_evidence_count
    or exists (
      select 1
      from jsonb_array_elements(p_evidence) input_item
      where not exists (
        select 1
        from private.warranty_claim_draft_evidence evidence
        where evidence.draft_id = p_draft_id
          and evidence.storage_path = input_item ->> 'storage_path'
          and evidence.mime_type = input_item ->> 'mime_type'
          and evidence.size_bytes = (input_item ->> 'size_bytes')::bigint
      )
    )
  then
    raise exception using errcode = '22023', message = 'PG_CLAIM_EVIDENCE_INVALID';
  end if;

  v_submitted_at := clock_timestamp();
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
  from private.warranty_claim_draft_evidence evidence
  where evidence.draft_id = p_draft_id
  order by evidence.created_at, evidence.storage_path;

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

  update private.warranty_claim_drafts draft
  set
    state = 'submitted',
    submitted_claim_id = v_claim_id
  where draft.id = p_draft_id;

  return query select v_claim_id, v_claim_number;
end;
$$;

revoke all on function public.create_customer_warranty_claim(uuid, uuid, text, text, uuid, text, text, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.create_customer_warranty_claim(uuid, uuid, text, text, uuid, text, text, text, jsonb)
  to service_role;

comment on function public.open_customer_warranty_claim_draft(uuid, uuid, text, timestamptz) is
  'Cube P service-only creation of a short-lived evidence draft after current registered-phone verification. No browser role may create or browse drafts.';
comment on function public.register_customer_warranty_claim_draft_evidence(uuid, uuid, text, text, bigint) is
  'Cube P service-only staged evidence registration after Storage upload succeeds. Draft-row locking enforces the five-image cap and serializes against final submit.';
comment on function public.unregister_customer_warranty_claim_draft_evidence(uuid, uuid, text) is
  'Cube P service-only pre-Storage-delete reservation. It refuses submitted/cleanup drafts so a stale tab cannot delete evidence already committed to a Claim.';
comment on function public.claim_expired_warranty_claim_draft_cleanup_candidates(integer) is
  'Cube P bounded stale-draft cleanup claim. Expired open drafts become cleanup_pending and return only private Storage paths for server-side deletion.';
comment on function public.finalize_expired_warranty_claim_draft_cleanup(uuid) is
  'Cube P finalizes stale draft cleanup only after the server confirms Storage deletion; failed Storage cleanup remains retryable.';
comment on function public.create_customer_warranty_claim(uuid, uuid, text, text, uuid, text, text, text, jsonb) is
  'Cube P authoritative service-only Claim intake transaction. Warranty and draft locks revalidate current phone, active coverage, one-open-case and the exact registered evidence set before immutable Claim/event commit.';
