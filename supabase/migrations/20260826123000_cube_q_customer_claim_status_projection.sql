-- Cube Q — customer-safe Claim status projection
-- Extends the existing verified Customer Claim context only. Internal adjudication
-- reason/actor/audit metadata remain excluded; only the explicit customer message
-- and decision timestamp are added to the Claim JSON projection.

create or replace function public.get_customer_warranty_claim_context(
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
      'customer_decision_message', claim.customer_decision_message,
      'decided_at', claim.decided_at,
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
        'customer_decision_message', claim.customer_decision_message,
        'decided_at', claim.decided_at,
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
  'Cube Q verified customer-safe Warranty Claim context. Claim status may include the explicit customer decision message and decided_at timestamp; internal decision reason, actor identity and audit event metadata are never projected. Browser roles have no execute grant.';
