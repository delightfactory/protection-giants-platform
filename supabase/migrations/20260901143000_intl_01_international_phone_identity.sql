-- INTL-01 — International Phone Identity
--
-- Freeze one country-code-explicit phone contract across Warranty Activation,
-- Admin correction and customer Claim verification. Formatting differences are
-- normalized, but an ambiguous local number is never assigned a country code.

create or replace function private.normalize_warranty_claim_phone(p_phone text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_phone text;
begin
  v_phone := translate(
    btrim(coalesce(p_phone, '')),
    '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
    '01234567890123456789'
  );

  v_phone := regexp_replace(v_phone, '[[:space:]()-]', '', 'g');

  if left(v_phone, 2) = '00' then
    v_phone := '+' || substr(v_phone, 3);
  end if;

  -- E.164-shaped canonical identity: explicit +country code, 5–15 digits.
  -- The lower bound preserves the previous bounded input floor without
  -- inventing country-specific numbering-plan rules.
  if v_phone !~ '^\+[1-9][0-9]{4,14}$' then
    return null;
  end if;

  return v_phone;
end;
$$;

revoke all on function private.normalize_warranty_claim_phone(text)
  from public, anon, authenticated, service_role;

comment on function private.normalize_warranty_claim_phone(text) is
  'INTL-01 canonical customer phone identity. Converts Arabic/Persian digits, removes harmless spacing/parentheses/hyphens, converts leading 00 to +, requires an explicit international country code and never guesses a country from a local number.';

-- Preserve the already-qualified Cube M activation engine intact. Move it
-- behind a private wrapper boundary so the mature locking/idempotency logic
-- always receives the canonical phone before it compares request retries.
alter function public.activate_roll_warranty(
  uuid, text, text, text, text, text, text, smallint, text, text, text
) set schema private;

alter function private.activate_roll_warranty(
  uuid, text, text, text, text, text, text, smallint, text, text, text
) rename to activate_roll_warranty_pre_intl01;

revoke all on function private.activate_roll_warranty_pre_intl01(
  uuid, text, text, text, text, text, text, smallint, text, text, text
) from public, anon, authenticated, service_role;

comment on function private.activate_roll_warranty_pre_intl01(
  uuid, text, text, text, text, text, text, smallint, text, text, text
) is
  'INTL-01 private continuation of the qualified Cube M activation engine. Call only through public.activate_roll_warranty so customer phone identity is canonical before idempotency comparison and persistence.';

create function public.activate_roll_warranty(
  p_request_id uuid,
  p_roll_serial text,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_vehicle_make text,
  p_vehicle_model text,
  p_vehicle_year smallint,
  p_vehicle_plate text,
  p_vehicle_color text,
  p_vehicle_vin text
)
returns table (
  warranty_id uuid,
  warranty_number text,
  record_state text,
  activated_at timestamptz,
  coverage_expires_at timestamptz,
  product_code text,
  product_name text,
  product_version text,
  activating_center_name text,
  customer_name text,
  customer_phone text,
  customer_email text,
  vehicle_make text,
  vehicle_model text,
  vehicle_year smallint,
  vehicle_plate text,
  vehicle_color text,
  vehicle_vin text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_phone text;
begin
  v_customer_phone := private.normalize_warranty_claim_phone(p_customer_phone);

  if v_customer_phone is null then
    raise exception using errcode = '22023', message = 'PG_WARRANTY_CUSTOMER_INVALID';
  end if;

  return query
  select *
  from private.activate_roll_warranty_pre_intl01(
    p_request_id,
    p_roll_serial,
    p_customer_name,
    v_customer_phone,
    p_customer_email,
    p_vehicle_make,
    p_vehicle_model,
    p_vehicle_year,
    p_vehicle_plate,
    p_vehicle_color,
    p_vehicle_vin
  );
end;
$$;

revoke all on function public.activate_roll_warranty(
  uuid, text, text, text, text, text, text, smallint, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.activate_roll_warranty(
  uuid, text, text, text, text, text, text, smallint, text, text, text
) to authenticated;

comment on function public.activate_roll_warranty(
  uuid, text, text, text, text, text, text, smallint, text, text, text
) is
  'INTL-01 Center Warranty Activation boundary. Requires explicit international customer phone identity, canonicalizes harmless formatting/00 prefix, then delegates to the previously qualified Cube M engine without changing its locking or lifecycle rules.';

-- Apply the same canonical boundary to Admin support correction. This is also
-- the deliberate repair path for pre-INTL-01 local-only staging records: Admin
-- corrects the phone to an explicit international value and the existing
-- immutable Before/After Warranty event records that repair.
alter function public.correct_warranty_details(
  uuid, uuid, text, text, text, text, text, smallint, text, text, text, text
) set schema private;

alter function private.correct_warranty_details(
  uuid, uuid, text, text, text, text, text, smallint, text, text, text, text
) rename to correct_warranty_details_pre_intl01;

revoke all on function private.correct_warranty_details_pre_intl01(
  uuid, uuid, text, text, text, text, text, smallint, text, text, text, text
) from public, anon, authenticated, service_role;

comment on function private.correct_warranty_details_pre_intl01(
  uuid, uuid, text, text, text, text, text, smallint, text, text, text, text
) is
  'INTL-01 private continuation of the qualified Cube M Admin correction engine. Call only through public.correct_warranty_details so phone repairs use the canonical international identity contract.';

create function public.correct_warranty_details(
  p_action_request_id uuid,
  p_warranty_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_vehicle_make text,
  p_vehicle_model text,
  p_vehicle_year smallint,
  p_vehicle_plate text,
  p_vehicle_color text,
  p_vehicle_vin text,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_phone text;
begin
  v_customer_phone := private.normalize_warranty_claim_phone(p_customer_phone);

  if v_customer_phone is null then
    raise exception using errcode = '22023', message = 'PG_WARRANTY_DETAILS_INVALID';
  end if;

  return private.correct_warranty_details_pre_intl01(
    p_action_request_id,
    p_warranty_id,
    p_customer_name,
    v_customer_phone,
    p_customer_email,
    p_vehicle_make,
    p_vehicle_model,
    p_vehicle_year,
    p_vehicle_plate,
    p_vehicle_color,
    p_vehicle_vin,
    p_reason
  );
end;
$$;

revoke all on function public.correct_warranty_details(
  uuid, uuid, text, text, text, text, text, smallint, text, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.correct_warranty_details(
  uuid, uuid, text, text, text, text, text, smallint, text, text, text, text
) to authenticated;

comment on function public.correct_warranty_details(
  uuid, uuid, text, text, text, text, text, smallint, text, text, text, text
) is
  'INTL-01 Admin Warranty correction boundary. Requires/canonicalizes explicit international customer phone identity before delegating to the existing audited Before/After correction engine.';
