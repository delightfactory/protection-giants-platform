-- Cube R — Approved Claim Resolution / Replacement & Reinstall, increment 1
-- Centralized replacement Product eligibility policy only. This migration adds no
-- Resolution execution state, allocation persistence, Roll movement or public API.

create function private.resolve_claim_replacement_roll_eligibility(
  p_warranty_id uuid,
  p_candidate_roll_id uuid
)
returns table (
  eligible boolean,
  basis_code text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_warranty_product_id uuid;
  v_candidate_product_id uuid;
begin
  if p_warranty_id is null then
    raise exception using errcode = '22023', message = 'PG_CLAIM_REPLACEMENT_WARRANTY_REQUIRED';
  end if;

  if p_candidate_roll_id is null then
    raise exception using errcode = '22023', message = 'PG_CLAIM_REPLACEMENT_ROLL_REQUIRED';
  end if;

  select warranty.product_id
    into v_warranty_product_id
  from public.warranties warranty
  where warranty.id = p_warranty_id;

  if not found then
    raise exception using errcode = '22023', message = 'PG_CLAIM_REPLACEMENT_WARRANTY_NOT_FOUND';
  end if;

  select roll.product_id
    into v_candidate_product_id
  from public.rolls roll
  where roll.id = p_candidate_roll_id;

  if not found then
    raise exception using errcode = '22023', message = 'PG_CLAIM_REPLACEMENT_ROLL_NOT_FOUND';
  end if;

  -- V1 deliberately enables only the same canonical Product. The equality lives
  -- in this one policy seam so candidate reads and the later reservation mutation
  -- can consume the same authoritative decision without hard-coding equality into
  -- allocation schema or scattering Product comparisons across lifecycle code.
  return query
  select
    (v_candidate_product_id = v_warranty_product_id),
    'same_product_default'::text;
end;
$$;

revoke all on function private.resolve_claim_replacement_roll_eligibility(uuid, uuid)
  from public, anon, authenticated, service_role;

comment on function private.resolve_claim_replacement_roll_eligibility(uuid, uuid) is
  'Cube R authoritative replacement Product policy seam. Resolves canonical Warranty/Roll Product identities server-side; V1 same_product_default accepts only equality. Physical custody/opening/transfer/allocation eligibility remains outside this policy function.';
