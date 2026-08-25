-- Cube N / N1 — permanent Roll-owned public Warranty identity.
-- Every Roll receives one cryptographically strong non-enumerable public code.
-- Existing Rolls are backfilled once by this migration; future Rolls are
-- provisioned automatically inside the Roll insert transaction.

create table private.roll_public_identities (
  roll_id uuid primary key
    references public.rolls(id) on delete restrict,
  public_code text not null unique,
  created_at timestamptz not null default now(),
  constraint roll_public_identities_code_format_check
    check (public_code ~ '^[0-9a-f]{64}$')
);

comment on table private.roll_public_identities is
  'Private one-to-one permanent customer Warranty access identity for each physical Roll. Not a Data API browse surface.';
comment on column private.roll_public_identities.public_code is
  'Permanent high-entropy bearer code used by the future /w/<public-code> Warranty route. Never derive from business identifiers or rotate during normal lifecycle.';

revoke all on table private.roll_public_identities
  from public, anon, authenticated, service_role;

-- Two independent random UUIDv4 values provide 244 random bits while reusing
-- the cryptographic primitive already relied on throughout the database.
-- Removing dashes yields a compact URL/path-safe lowercase hexadecimal code.
create function private.generate_roll_public_warranty_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select lower(
    replace(gen_random_uuid()::text, '-', '')
    || replace(gen_random_uuid()::text, '-', '')
  )
$$;

revoke all on function private.generate_roll_public_warranty_code()
  from public, anon, authenticated, service_role;

-- One-time completeness migration for Rolls that already exist when Cube N is
-- installed. This is intentionally not an ongoing repair/backfill subsystem.
insert into private.roll_public_identities (
  roll_id,
  public_code
)
select
  r.id,
  private.generate_roll_public_warranty_code()
from public.rolls r
left join private.roll_public_identities identity
  on identity.roll_id = r.id
where identity.roll_id is null;

-- Once allocated, a Roll public identity is permanent. Ordinary SQL/Data API
-- mutation, including service-role paths, must not rotate or delete it.
create function private.reject_roll_public_identity_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = '42501',
    message = 'PG_ROLL_PUBLIC_IDENTITY_IMMUTABLE';
end;
$$;

revoke all on function private.reject_roll_public_identity_mutation()
  from public, anon, authenticated, service_role;

create trigger roll_public_identities_immutable
  before update or delete on private.roll_public_identities
  for each row
  execute function private.reject_roll_public_identity_mutation();

-- Future Roll provisioning is attached to the Roll insert itself. If this
-- identity insert fails, PostgreSQL rolls back the Roll insert and every other
-- effect in the surrounding production transaction.
create function private.initialize_roll_public_warranty_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.roll_public_identities (
    roll_id,
    public_code
  ) values (
    new.id,
    private.generate_roll_public_warranty_code()
  );

  return new;
end;
$$;

revoke all on function private.initialize_roll_public_warranty_identity()
  from public, anon, authenticated, service_role;

create trigger rolls_initialize_public_warranty_identity
  after insert on public.rolls
  for each row
  execute function private.initialize_roll_public_warranty_identity();

-- Migration must leave the database in the global one-Roll/one-identity state.
do $$
begin
  if exists (
    select 1
    from public.rolls r
    left join private.roll_public_identities identity
      on identity.roll_id = r.id
    where identity.roll_id is null
  ) then
    raise exception using
      errcode = '23514',
      message = 'PG_ROLL_PUBLIC_IDENTITY_BACKFILL_INCOMPLETE';
  end if;
end;
$$;