-- Cube D — keep confirmed custody audit evidence outside the exposed Data API schema.

alter table public.roll_custody_events set schema private;
alter table public.roll_custody_current set schema private;
alter table private.roll_custody_current rename to roll_custody_bootstrap_snapshot;

revoke all on table private.roll_custody_events
  from public, anon, authenticated, service_role;
revoke all on table private.roll_custody_bootstrap_snapshot
  from public, anon, authenticated, service_role;

comment on table private.roll_custody_bootstrap_snapshot is
  'Private immutable snapshot retained to prove the Cube D backfill from the original public projection. It is not current operational state.';
comment on table private.roll_custody_events is
  'Private immutable append-only confirmed custody history. Sequence 1 records initial Company custody.';

create trigger roll_custody_bootstrap_snapshot_immutable
  before update or delete on private.roll_custody_bootstrap_snapshot
  for each row
  execute function private.reject_roll_custody_event_mutation();

-- The existing AFTER INSERT trigger remains, but its function now records only
-- the private initial history event. Current custody is populated by Roll defaults.
create or replace function private.initialize_roll_company_custody()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.roll_custody_events (
    roll_id,
    custody_sequence,
    custodian_party_id,
    confirmed_at
  ) values (
    new.id,
    1,
    new.custodian_party_id,
    new.custody_confirmed_at
  );

  return new;
end;
$$;

alter trigger rolls_initialize_company_custody
  on public.rolls
  rename to rolls_record_initial_custody_event;
