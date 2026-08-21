-- Cube H — Preserve the participant status visibility used by the existing
-- Transfer RLS contract without exposing internal support/audit columns.
-- PostgreSQL column privileges mean a Data API query can read only these
-- fields; resolution_reason, actor/request identities and other internals remain
-- inaccessible to authenticated browser clients.

grant select (transfer_id, roll_id, status, acted_at)
  on table public.roll_transfer_item_states
  to authenticated;

comment on table public.roll_transfer_item_states is
  'Cube H database-owned per-Roll lifecycle projection. Data API participants may read only safe status columns under RLS; support/audit columns stay private and bounded read RPCs provide the normal UI projection.';
