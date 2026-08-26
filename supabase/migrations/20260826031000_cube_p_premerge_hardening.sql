-- Cube P — pre-merge hardening after independent double audit
-- Surgical fixes only:
-- 1) bound Claim notification body to Cube L schema contract;
-- 2) add narrow failed-phone verification throttling for one valid Roll Public Code.

create table private.warranty_claim_phone_verification_limits (
  public_code_hash text primary key,
  window_started_at timestamptz not null,
  failed_attempts integer not null default 0,
  blocked_until timestamptz,
  updated_at timestamptz not null default now(),

  constraint warranty_claim_phone_verification_limits_hash_shape
    check (public_code_hash ~ '^[0-9a-f]{32}$'),
  constraint warranty_claim_phone_verification_limits_failed_attempts_shape
    check (failed_attempts between 0 and 100000),
  constraint warranty_claim_phone_verification_limits_window_shape
    check (updated_at >= window_started_at),
  constraint warranty_claim_phone_verification_limits_block_shape
    check (blocked_until is null or blocked_until >= window_started_at)
);

revoke all on table private.warranty_claim_phone_verification_limits
  from public, anon, authenticated, service_role;

comment on table private.warranty_claim_phone_verification_limits is
  'Cube P server-only abuse guard for repeated wrong registered-phone guesses against one real permanent Roll Public Code. Stores only a one-way hash of the high-entropy Public Code; never stores attempted phones.';

create or replace function public.verify_customer_warranty_claim_phone(
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
volatile
security definer
set search_path = ''
as $$
declare
  v_roll_id uuid;
  v_warranty public.warranties%rowtype;
  v_input_phone text;
  v_current_phone text;
  v_now timestamptz := clock_timestamp();
  v_public_code_hash text;
  v_limit private.warranty_claim_phone_verification_limits%rowtype;
begin
  if p_public_code is null or p_public_code !~ '^[0-9a-f]{64}$' then
    return;
  end if;

  v_input_phone := private.normalize_warranty_claim_phone(p_phone);
  if v_input_phone is null then
    return;
  end if;

  -- Resolve a real permanent Roll identity before creating any limiter state so
  -- random invalid Public Codes cannot grow the private limiter table.
  select identity.roll_id
    into v_roll_id
  from private.roll_public_identities identity
  where identity.public_code = p_public_code;

  if not found then
    return;
  end if;

  v_public_code_hash := md5(p_public_code);

  -- One advisory lock serializes attempts for the same permanent QR identity so
  -- parallel requests cannot all pass the threshold check before increments land.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('cube-p-phone:' || v_public_code_hash, 0)
  );

  select limits.*
    into v_limit
  from private.warranty_claim_phone_verification_limits limits
  where limits.public_code_hash = v_public_code_hash
  for update;

  if found then
    if v_limit.window_started_at <= v_now - interval '15 minutes' then
      delete from private.warranty_claim_phone_verification_limits limits
      where limits.public_code_hash = v_public_code_hash;
    elsif v_limit.blocked_until is not null and v_limit.blocked_until > v_now then
      return;
    end if;
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
    insert into private.warranty_claim_phone_verification_limits as limits (
      public_code_hash,
      window_started_at,
      failed_attempts,
      blocked_until,
      updated_at
    ) values (
      v_public_code_hash,
      v_now,
      1,
      null,
      v_now
    )
    on conflict (public_code_hash)
    do update set
      failed_attempts = limits.failed_attempts + 1,
      blocked_until = case
        when limits.failed_attempts + 1 >= 8
          then v_now + interval '15 minutes'
        else limits.blocked_until
      end,
      updated_at = v_now;

    return;
  end if;

  -- A legitimate successful verification clears earlier mistakes for this QR so
  -- normal customers are not penalized after entering the correct stored phone.
  delete from private.warranty_claim_phone_verification_limits limits
  where limits.public_code_hash = v_public_code_hash;

  return query
  select
    v_warranty.id,
    v_current_phone,
    case when v_now < v_warranty.coverage_expires_at then 'active' else 'expired' end::text,
    v_warranty.coverage_expires_at;
end;
$$;

revoke all on function public.verify_customer_warranty_claim_phone(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.verify_customer_warranty_claim_phone(text, text)
  to service_role;

comment on function public.verify_customer_warranty_claim_phone(text, text) is
  'Cube P service-only registered-phone verification for one exact Roll Public Code. Eight failed matches inside a 15-minute window temporarily fail closed for that QR identity; no attempted phone is persisted and browser roles still have no execute grant.';

create or replace function private.materialize_warranty_claim_notification_event()
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

  -- Cube L enforces body <= 300 characters and requires body=btrim(body).
  -- Warranty metadata is legitimately wider, so P must bound and normalize the
  -- projector output rather than allow a valid Claim to roll back merely because
  -- truncation lands on an internal whitespace character.
  v_body := btrim(left(
    'تم استلام المطالبة ' || v_claim.claim_number
      || ' على ' || v_warranty.product_name_snapshot
      || ' — ' || v_warranty.vehicle_make || ' ' || v_warranty.vehicle_model || '.',
    300
  ));

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

comment on function private.materialize_warranty_claim_notification_event() is
  'Cube P bounded Cube L projector. submitted Claim events create privacy-safe action-required Inbox rows for active Protection Giants Admin Profiles; body is trimmed/capped to Cube L schema limits and action_path remains null until Cube Q.';
