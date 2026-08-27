-- Cube R — Approved Claim Resolution / Replacement & Reinstall, increment 7
-- Cross-domain material guards only. Keep the mature Production, Cube J Recovery
-- and Cube K Issue engines authoritative; do not create parallel material flows.
-- Consumption/completion engines and their wider terminal guards remain separate.

-- Production Order void is a parent-level lifecycle mutation. Once any child Roll
-- is actively allocated to a Claim Resolution, voiding the parent would invalidate
-- material lineage underneath an in-flight or consumed fulfillment record.
create function private.prevent_production_void_with_claim_allocated_roll()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'generated'
    and new.status = 'voided'
    and exists (
      select 1
      from public.rolls roll
      join public.warranty_claim_resolution_roll_allocations allocation
        on allocation.roll_id = roll.id
      where roll.production_order_id = old.id
        and allocation.status in ('reserved', 'consumed')
    )
  then
    raise exception using
      errcode = '23514',
      message = 'PG_CLAIM_ROLL_PRODUCTION_VOID_BLOCKED';
  end if;

  return new;
end;
$$;

revoke all on function private.prevent_production_void_with_claim_allocated_roll()
  from public, anon, authenticated, service_role;

create trigger production_orders_claim_allocation_void_guard
  before update of status on public.production_orders
  for each row
  execute function private.prevent_production_void_with_claim_allocated_roll();

comment on function private.prevent_production_void_with_claim_allocated_roll() is
  'Cube R parent-lineage guard: Production Order void is blocked while any child Roll allocation is reserved or consumed; released allocation history does not block normal Production lifecycle rules.';

-- Cube K remains the one pre-install issue subsystem. A reserved replacement Roll
-- is intentionally allowed to use Cube K after the exact assigned Center opens it.
-- A consumed Roll is terminal material and cannot start another pre-install issue.
create function private.prevent_preinstall_issue_for_consumed_claim_roll()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.warranty_claim_resolution_roll_allocations allocation
    where allocation.roll_id = new.roll_id
      and allocation.status = 'consumed'
  ) then
    raise exception using
      errcode = '23514',
      message = 'PG_ROLL_ISSUE_CLAIM_CONSUMED';
  end if;

  return new;
end;
$$;

revoke all on function private.prevent_preinstall_issue_for_consumed_claim_roll()
  from public, anon, authenticated, service_role;

create trigger roll_preinstall_issues_claim_consumed_guard
  before insert on public.roll_preinstall_issues
  for each row
  execute function private.prevent_preinstall_issue_for_consumed_claim_roll();

comment on function private.prevent_preinstall_issue_for_consumed_claim_roll() is
  'Cube R compatibility guard for Cube K: reserved replacement material may report a pre-install issue; consumed material is terminal and cannot create a new issue.';

-- Opened Roll Recovery needs no duplicate Cube R trigger here. The mature Recovery
-- engine creates a roll_transfer_reservation, and Increment 6 already rejects that
-- reservation for both reserved and consumed Claim allocations. This preserves one
-- physical-transfer gate and avoids competing reverse-lock mechanisms.
