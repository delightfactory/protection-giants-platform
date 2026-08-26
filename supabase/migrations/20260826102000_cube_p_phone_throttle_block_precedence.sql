-- Cube P — final phone-verification throttle precedence hardening
-- Surgical correction discovered during final merge review:
-- an active blocked_until must always win over the rolling failure-window expiry.
-- Otherwise an eighth failure near the end of the 15-minute window could produce
-- a block that is cleared seconds later when window_started_at ages out.

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

  -- Serialize attempts for one permanent QR identity so parallel failures cannot
  -- all pass the threshold test before the limiter update commits.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('cube-p-phone:' || v_public_code_hash, 0)
  );

  select limits.*
    into v_limit
  from private.warranty_claim_phone_verification_limits limits
  where limits.public_code_hash = v_public_code_hash
  for update;

  if found then
    -- A live block is authoritative even if the original rolling window has aged
    -- past 15 minutes. This preserves the promised full post-threshold block.
    if v_limit.blocked_until is not null and v_limit.blocked_until > v_now then
      return;
    elsif v_limit.window_started_at <= v_now - interval '15 minutes' then
      delete from private.warranty_claim_phone_verification_limits limits
      where limits.public_code_hash = v_public_code_hash;
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
  'Cube P service-only registered-phone verification for one exact Roll Public Code. Eight failed matches inside a 15-minute window trigger a full 15-minute block from threshold time; active block precedence survives rolling-window expiry. No attempted phone is persisted and browser roles have no execute grant.';
