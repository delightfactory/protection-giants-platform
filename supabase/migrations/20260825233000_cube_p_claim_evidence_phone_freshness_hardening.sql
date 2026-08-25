-- Cube P — Customer Warranty Claim Intake, increment 4
-- PD-077 hardening: evidence register/remove are sensitive customer actions.
-- Serialize them against Cube M phone correction/void by taking the Warranty
-- row lock first, revalidating the current registered phone, then taking the
-- existing Claim draft row lock. This keeps one lock order with final submit:
-- Warranty -> Draft.

-- Replace the earlier service-only registration signature so the authoritative
-- current normalized phone participates in the DB boundary itself.
drop function public.register_customer_warranty_claim_draft_evidence(uuid, uuid, text, text, bigint);

create function public.register_customer_warranty_claim_draft_evidence(
  p_draft_id uuid,
  p_warranty_id uuid,
  p_verified_phone_normalized text,
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
  v_warranty public.warranties%rowtype;
  v_draft private.warranty_claim_drafts%rowtype;
  v_existing private.warranty_claim_draft_evidence%rowtype;
  v_phone text := nullif(btrim(coalesce(p_verified_phone_normalized, '')), '');
  v_path text := btrim(coalesce(p_storage_path, ''));
  v_mime text := btrim(coalesce(p_mime_type, ''));
  v_count integer;
begin
  if p_draft_id is null
    or p_warranty_id is null
    or v_phone is null
  then
    raise exception using errcode = '22023', message = 'PG_CLAIM_DRAFT_INVALID';
  end if;

  -- Warranty is always the first lock for customer actions that depend on the
  -- current registered phone. Cube M correction/void and final Claim submit use
  -- the same serialization anchor, preventing a stale-phone registration win.
  select warranty.*
    into v_warranty
  from public.warranties warranty
  where warranty.id = p_warranty_id
  for update;

  if not found or v_warranty.record_state <> 'issued' then
    raise exception using errcode = '23514', message = 'PG_CLAIM_WARRANTY_UNAVAILABLE';
  end if;

  if private.normalize_warranty_claim_phone(v_warranty.customer_phone) <> v_phone then
    raise exception using errcode = '42501', message = 'PG_CLAIM_VERIFICATION_STALE';
  end if;

  if clock_timestamp() >= v_warranty.coverage_expires_at then
    raise exception using errcode = '23514', message = 'PG_CLAIM_WARRANTY_EXPIRED';
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

    if v_existing.state = 'delete_pending' then
      raise exception using errcode = '23514', message = 'PG_CLAIM_DRAFT_EVIDENCE_DELETING';
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
    size_bytes,
    state
  ) values (
    p_draft_id,
    v_path,
    v_mime,
    p_size_bytes,
    'staged'
  );

  return true;
end;
$$;

revoke all on function public.register_customer_warranty_claim_draft_evidence(uuid, uuid, text, text, text, bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.register_customer_warranty_claim_draft_evidence(uuid, uuid, text, text, text, bigint)
  to service_role;

comment on function public.register_customer_warranty_claim_draft_evidence(uuid, uuid, text, text, text, bigint) is
  'Cube P service-only staged evidence registration. Locks/revalidates current issued Warranty phone and active coverage before locking the draft, so PD-077 invalidates stale upload authorization deterministically.';

-- Replace removal reservation with the same Warranty-first phone freshness
-- boundary. Finalize remains server-only and does not need to reacquire Warranty:
-- once reservation committed, physical deletion is completing that authorized
-- action; if reservation did not commit, Storage is never touched.
drop function public.unregister_customer_warranty_claim_draft_evidence(uuid, uuid, text);

create function public.unregister_customer_warranty_claim_draft_evidence(
  p_draft_id uuid,
  p_warranty_id uuid,
  p_verified_phone_normalized text,
  p_storage_path text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_warranty public.warranties%rowtype;
  v_draft private.warranty_claim_drafts%rowtype;
  v_evidence private.warranty_claim_draft_evidence%rowtype;
  v_phone text := nullif(btrim(coalesce(p_verified_phone_normalized, '')), '');
  v_path text := btrim(coalesce(p_storage_path, ''));
begin
  if p_draft_id is null
    or p_warranty_id is null
    or v_phone is null
    or v_path !~ ('^' || p_draft_id::text || '/[0-9a-f]{64}\.(jpg|png|webp)$')
  then
    raise exception using errcode = '22023', message = 'PG_CLAIM_DRAFT_INVALID';
  end if;

  select warranty.*
    into v_warranty
  from public.warranties warranty
  where warranty.id = p_warranty_id
  for update;

  if not found or v_warranty.record_state <> 'issued' then
    raise exception using errcode = '23514', message = 'PG_CLAIM_WARRANTY_UNAVAILABLE';
  end if;

  if private.normalize_warranty_claim_phone(v_warranty.customer_phone) <> v_phone then
    raise exception using errcode = '42501', message = 'PG_CLAIM_VERIFICATION_STALE';
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

  select evidence.*
    into v_evidence
  from private.warranty_claim_draft_evidence evidence
  where evidence.draft_id = p_draft_id
    and evidence.storage_path = v_path;

  if not found then
    return true;
  end if;

  if v_evidence.state = 'staged' then
    update private.warranty_claim_draft_evidence evidence
    set state = 'delete_pending'
    where evidence.draft_id = p_draft_id
      and evidence.storage_path = v_path;
  end if;

  return true;
end;
$$;

revoke all on function public.unregister_customer_warranty_claim_draft_evidence(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.unregister_customer_warranty_claim_draft_evidence(uuid, uuid, text, text)
  to service_role;

comment on function public.unregister_customer_warranty_claim_draft_evidence(uuid, uuid, text, text) is
  'Cube P service-only evidence-removal reservation. Current issued Warranty phone is revalidated under the Warranty lock before the draft lock, closing stale-phone remove races without changing physical Storage until reservation commits.';
