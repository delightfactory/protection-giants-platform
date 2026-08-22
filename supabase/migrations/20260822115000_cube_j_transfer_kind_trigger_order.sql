-- Cube J — deterministic Transfer kind immutability.
-- PostgreSQL fires triggers with the same timing/event in name order. Ensure the
-- Cube J kind guard runs before the mature Cube H lifecycle guard so attempts to
-- rewrite transfer_kind fail with the specific immutable-kind business error.

drop trigger if exists roll_transfers_kind_immutable on public.roll_transfers;

create trigger a_roll_transfers_kind_immutable
  before update of transfer_kind on public.roll_transfers
  for each row
  execute function private.reject_roll_transfer_kind_mutation();
