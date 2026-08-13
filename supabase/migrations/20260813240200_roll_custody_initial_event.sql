-- Cube D — every future Roll records its initial confirmed Company custody.

create function private.record_initial_roll_custody_event()
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

revoke all on function private.record_initial_roll_custody_event()
  from public, anon, authenticated, service_role;

create trigger rolls_record_initial_custody_event
  after insert on public.rolls
  for each row
  execute function private.record_initial_roll_custody_event();
