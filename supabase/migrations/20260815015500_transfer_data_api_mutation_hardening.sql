-- Cube H — Reassert the closed Data API mutation boundary after extending the
-- Transfer lifecycle. Transfer header, membership, reservations and immutable
-- events remain RPC/database-owned structures; browser and service-role Data API
-- access must never mutate them directly.

revoke insert, update, delete, truncate, references, trigger
  on table public.roll_transfers
  from public, anon, authenticated, service_role;

revoke insert, update, delete, truncate, references, trigger
  on table public.roll_transfer_items
  from public, anon, authenticated, service_role;

revoke insert, update, delete, truncate, references, trigger
  on table public.roll_transfer_reservations
  from public, anon, authenticated, service_role;

revoke insert, update, delete, truncate, references, trigger
  on table public.roll_transfer_events
  from public, anon, authenticated, service_role;

-- H's item-state projection is also database-owned. Keep SELECT for authorized
-- authenticated participants through RLS, but no direct lifecycle mutation.
revoke insert, update, delete, truncate, references, trigger
  on table public.roll_transfer_item_states
  from public, anon, authenticated, service_role;
