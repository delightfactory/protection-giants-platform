-- Cube H — Receipt item state contains internal audit/support fields such as
-- resolution_reason. Do not expose the table itself through the Data API to
-- Transfer participants; all operational reads use the bounded SECURITY DEFINER
-- projections that return only the approved item/status fields.

revoke select
  on table public.roll_transfer_item_states
  from public, anon, authenticated, service_role;

comment on table public.roll_transfer_item_states is
  'Cube H database-owned per-Roll Transfer lifecycle projection. Not directly browsable through the Data API; use the bounded Transfer read RPCs.';
