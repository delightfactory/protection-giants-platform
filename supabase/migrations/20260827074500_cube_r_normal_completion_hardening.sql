-- Cube R — normal Center completion hardening.
-- Keep the already-published increment-9 migration immutable while correcting its
-- Cube J row-lock column reference and extending the latest Cube Q Claim structural
-- guard only for the exact R terminal projection: approved/open -> approved/closed.

-- The increment-9 function intentionally locks the one Cube J opening row before
-- consulting K quality facts. Cube J is keyed by roll_id (there is no synthetic id).
-- Rebuild the stored function definition deterministically with that exact repair
-- so the final schema is lint-clean without duplicating the large completion body.
do $repair_completion$
declare
  v_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.complete_warranty_claim_resolution(uuid,uuid,text,text[],text)'::regprocedure
  )
  into v_definition;

  if v_definition is null
    or pg_catalog.strpos(v_definition, 'perform opening.id') = 0
  then
    raise exception using errcode = '23514', message = 'PG_CLAIM_COMPLETION_REPAIR_SOURCE_MISMATCH';
  end if;

  v_definition := pg_catalog.replace(
    v_definition,
    'perform opening.id',
    'perform opening.roll_id'
  );

  execute v_definition;
end;
$repair_completion$;

create or replace function private.guard_warranty_claim_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_r_completion_shape boolean;
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '42501', message = 'PG_CLAIM_IMMUTABLE';
  end if;

  if new.id is distinct from old.id
    or new.request_id is distinct from old.request_id
    or new.warranty_id is distinct from old.warranty_id
    or new.claim_number is distinct from old.claim_number
    or new.category is distinct from old.category
    or new.affected_area is distinct from old.affected_area
    or new.description is distinct from old.description
    or new.submitted_at is distinct from old.submitted_at
    or new.created_at is distinct from old.created_at
  then
    raise exception using errcode = '42501', message = 'PG_CLAIM_IDENTITY_IMMUTABLE';
  end if;

  -- A fulfilled approved Claim is R-terminal. Check this before the transition
  -- allowlist so future accidental writes fail with the precise terminal code.
  if old.status = 'approved' and old.closed_at is not null then
    raise exception using errcode = '42501', message = 'PG_CLAIM_R_TERMINAL';
  end if;

  -- R completion keeps adjudication immutable. Only closed_at/updated_at may move,
  -- and only once from an approved open Claim to the same approved terminal Claim.
  v_r_completion_shape :=
    old.status = 'approved'
    and new.status = 'approved'
    and old.closed_at is null
    and new.closed_at is not null
    and new.decided_by_profile_id is not distinct from old.decided_by_profile_id
    and new.decision_reason is not distinct from old.decision_reason
    and new.customer_decision_message is not distinct from old.customer_decision_message
    and new.decided_at is not distinct from old.decided_at;

  -- Preserve the final Cube Q / PD-078 transition matrix exactly, then add only
  -- the R completion shape above. In particular cancelled -> awaiting_inspection
  -- must remain available when the same requested formal inspection is resumed.
  if not (
    v_r_completion_shape
    or (old.status = 'submitted' and new.status = 'under_review')
    or (old.status = 'under_review' and new.status in ('awaiting_inspection', 'approved', 'rejected', 'cancelled'))
    or (old.status = 'awaiting_inspection' and new.status in ('under_review', 'cancelled'))
    or (old.status = 'approved' and new.status = 'cancelled')
    or (old.status = 'rejected' and new.status = 'under_review')
    or (old.status = 'cancelled' and new.status in ('under_review', 'awaiting_inspection'))
  ) then
    raise exception using errcode = '42501', message = 'PG_CLAIM_INVALID_TRANSITION';
  end if;

  if new.updated_at < old.updated_at then
    raise exception using errcode = '42501', message = 'PG_CLAIM_UPDATED_AT_INVALID';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_warranty_claim_mutation()
  from public, anon, authenticated, service_role;

comment on function private.guard_warranty_claim_mutation() is
  'Final Cube Q/PD-078 Claim lifecycle guard extended by Cube R only for approved/open -> approved/closed fulfillment completion. Q correction transitions remain unchanged; adjudication fields stay immutable and a closed approved Claim is terminal.';
