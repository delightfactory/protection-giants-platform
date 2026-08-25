-- Cube N / N2 — narrow anonymous Public Warranty resolver.
-- The Roll-owned bearer code resolves the current real Warranty lifecycle while
-- keeping Roll, Warranty, customer PII and private identity persistence closed.

create function public.resolve_public_warranty(p_public_code text)
returns table (
  public_state text,
  product_name text,
  warranty_number text,
  activated_at timestamptz,
  coverage_expires_at timestamptz,
  activating_center_name text,
  vehicle_make text,
  vehicle_model text,
  vehicle_year smallint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_roll_id uuid;
  v_production_status text;
  v_production_product_name text;
  v_issued_count integer;
  v_voided_count integer;
  v_warranty public.warranties%rowtype;
begin
  -- Malformed and unknown bearer codes intentionally share the same zero-row
  -- result. The code is exact and case-sensitive; QR payloads use lowercase.
  if p_public_code is null
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

  select
    po.status,
    po.product_name_snapshot
  into
    v_production_status,
    v_production_product_name
  from public.rolls r
  join public.production_orders po on po.id = r.production_order_id
  where r.id = v_roll_id;

  -- A valid identity with a missing authoritative Roll/Production source is an
  -- impossible persisted state under current FKs. Fail closed rather than
  -- guessing or exposing partial internals.
  if not found or v_production_product_name is null then
    return query
    select
      'temporarily_unavailable'::text,
      null::text,
      null::text,
      null::timestamptz,
      null::timestamptz,
      null::text,
      null::text,
      null::text,
      null::smallint;
    return;
  end if;

  select
    count(*) filter (where warranty.record_state = 'issued')::integer,
    count(*) filter (where warranty.record_state = 'voided_in_error')::integer
  into
    v_issued_count,
    v_voided_count
  from public.warranties warranty
  where warranty.roll_id = v_roll_id;

  -- The unique partial index currently guarantees at most one issued Warranty,
  -- but retain a fail-closed guard if a future defect or migration violates it.
  if v_issued_count > 1 then
    return query
    select
      'temporarily_unavailable'::text,
      null::text,
      null::text,
      null::timestamptz,
      null::timestamptz,
      null::text,
      null::text,
      null::text,
      null::smallint;
    return;
  end if;

  if v_issued_count = 1 then
    select warranty.*
      into v_warranty
    from public.warranties warranty
    where warranty.roll_id = v_roll_id
      and warranty.record_state = 'issued';

    if not found then
      return query
      select
        'temporarily_unavailable'::text,
        null::text,
        null::text,
        null::timestamptz,
        null::timestamptz,
        null::text,
        null::text,
        null::text,
        null::smallint;
      return;
    end if;

    return query
    select
      case
        when now() < v_warranty.coverage_expires_at then 'active'
        else 'expired'
      end::text,
      v_warranty.product_name_snapshot,
      v_warranty.warranty_number,
      v_warranty.activated_at,
      v_warranty.coverage_expires_at,
      v_warranty.activating_center_name_snapshot,
      v_warranty.vehicle_make,
      v_warranty.vehicle_model,
      v_warranty.vehicle_year;
    return;
  end if;

  -- With no effective Warranty, only terminal Roll conditions are public. A
  -- pending issue, transfer reservation, not-opened Roll or incomplete policy
  -- remains a recoverable internal condition and therefore presents simply as
  -- not activated.
  if v_production_status <> 'generated'
     or exists (
       select 1
       from public.roll_preinstall_issues issue
       where issue.roll_id = v_roll_id
         and issue.status = 'return_required'
     )
  then
    return query
    select
      'unavailable_for_warranty'::text,
      v_production_product_name,
      null::text,
      null::timestamptz,
      null::timestamptz,
      null::text,
      null::text,
      null::text,
      null::smallint;
    return;
  end if;

  if v_voided_count > 0 then
    return query
    select
      'no_current_warranty_after_void'::text,
      v_production_product_name,
      null::text,
      null::timestamptz,
      null::timestamptz,
      null::text,
      null::text,
      null::text,
      null::smallint;
    return;
  end if;

  return query
  select
    'not_activated'::text,
    v_production_product_name,
    null::text,
    null::timestamptz,
    null::timestamptz,
    null::text,
    null::text,
    null::text,
    null::smallint;
end;
$$;

revoke all on function public.resolve_public_warranty(text)
  from public, anon, authenticated, service_role;

grant execute on function public.resolve_public_warranty(text)
  to anon, authenticated;

comment on function public.resolve_public_warranty(text) is
  'Cube N exact bearer-code public resolver. Returns only the approved snapshot-based Warranty projection and lifecycle state; malformed/unknown codes return no rows.';