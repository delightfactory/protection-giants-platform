-- Cube R — Approved Claim Resolution / Replacement & Reinstall, increment 4
-- Replacement Roll allocation persistence/history only. Named reserve/release/consume
-- operations and cross-domain Roll guards follow in later bounded increments.

create table public.warranty_claim_resolution_roll_allocations (
  id uuid primary key default gen_random_uuid(),
  resolution_id uuid not null references public.warranty_claim_resolutions(id) on delete restrict,
  roll_id uuid not null references public.rolls(id) on delete restrict,
  product_eligibility_basis text not null,
  status text not null default 'reserved',
  reserved_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  reserved_at timestamptz not null,
  released_by_profile_id uuid references public.profiles(id) on delete restrict,
  release_reason text,
  released_at timestamptz,
  consumed_by_profile_id uuid references public.profiles(id) on delete restrict,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),

  constraint warranty_claim_resolution_roll_allocations_basis_shape
    check (
      product_eligibility_basis = btrim(product_eligibility_basis)
      and char_length(product_eligibility_basis) between 2 and 80
    ),
  constraint warranty_claim_resolution_roll_allocations_status_allowed
    check (status in ('reserved', 'released', 'consumed')),
  constraint warranty_claim_resolution_roll_allocations_release_reason_shape
    check (
      release_reason is null
      or (
        release_reason = btrim(release_reason)
        and char_length(release_reason) between 5 and 500
      )
    ),
  constraint warranty_claim_resolution_roll_allocations_state_shape
    check (
      (
        status = 'reserved'
        and released_by_profile_id is null
        and release_reason is null
        and released_at is null
        and consumed_by_profile_id is null
        and consumed_at is null
      )
      or (
        status = 'released'
        and released_by_profile_id is not null
        and release_reason is not null
        and released_at is not null
        and consumed_by_profile_id is null
        and consumed_at is null
      )
      or (
        status = 'consumed'
        and released_by_profile_id is null
        and release_reason is null
        and released_at is null
        and consumed_by_profile_id is not null
        and consumed_at is not null
      )
    ),
  constraint warranty_claim_resolution_roll_allocations_timestamp_shape
    check (
      reserved_at >= created_at
      and (released_at is null or released_at >= reserved_at)
      and (consumed_at is null or consumed_at >= reserved_at)
    )
);

-- A released row is immutable history and permits a later new reservation. A
-- reserved/consumed row remains exclusive for both its Resolution and physical Roll.
-- Keep explicit index identifiers below PostgreSQL's 63-byte identifier limit so
-- qualification never depends on server-side name truncation.
create unique index claim_resolution_roll_alloc_resolution_active_uniq
  on public.warranty_claim_resolution_roll_allocations (resolution_id)
  where status in ('reserved', 'consumed');

create unique index claim_resolution_roll_alloc_roll_active_uniq
  on public.warranty_claim_resolution_roll_allocations (roll_id)
  where status in ('reserved', 'consumed');

create index claim_resolution_roll_alloc_resolution_timeline_idx
  on public.warranty_claim_resolution_roll_allocations (resolution_id, reserved_at, id);

create index claim_resolution_roll_alloc_roll_timeline_idx
  on public.warranty_claim_resolution_roll_allocations (roll_id, reserved_at, id);

create function private.guard_warranty_claim_resolution_roll_allocation_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '42501', message = 'PG_CLAIM_ROLL_ALLOCATION_IMMUTABLE';
  end if;

  if new.id is distinct from old.id
    or new.resolution_id is distinct from old.resolution_id
    or new.roll_id is distinct from old.roll_id
    or new.product_eligibility_basis is distinct from old.product_eligibility_basis
    or new.reserved_by_profile_id is distinct from old.reserved_by_profile_id
    or new.reserved_at is distinct from old.reserved_at
    or new.created_at is distinct from old.created_at
  then
    raise exception using errcode = '42501', message = 'PG_CLAIM_ROLL_ALLOCATION_IDENTITY_IMMUTABLE';
  end if;

  if old.status in ('released', 'consumed') then
    raise exception using errcode = '42501', message = 'PG_CLAIM_ROLL_ALLOCATION_TERMINAL';
  end if;

  if old.status = 'reserved' and new.status in ('released', 'consumed') then
    return new;
  end if;

  raise exception using errcode = '42501', message = 'PG_CLAIM_ROLL_ALLOCATION_TRANSITION_INVALID';
end;
$$;

revoke all on function private.guard_warranty_claim_resolution_roll_allocation_mutation()
  from public, anon, authenticated, service_role;

create trigger warranty_claim_resolution_roll_allocations_guard_mutation
  before update or delete on public.warranty_claim_resolution_roll_allocations
  for each row execute function private.guard_warranty_claim_resolution_roll_allocation_mutation();

alter table public.warranty_claim_resolution_roll_allocations enable row level security;

revoke all on table public.warranty_claim_resolution_roll_allocations
  from public, anon, authenticated, service_role;

comment on table public.warranty_claim_resolution_roll_allocations is
  'Cube R immutable replacement Roll allocation history. released rows remain evidence; reserved/consumed rows are exclusive physical-material holds. Product eligibility basis is server-derived historical evidence, never client input.';
