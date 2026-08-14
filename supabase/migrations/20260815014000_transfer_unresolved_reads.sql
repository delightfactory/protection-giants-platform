-- Cube H — Sender/Admin unresolved Lot expansion
-- This is a convenience read only. The resolution mutation still revalidates
-- every physical Roll, reservation and confirmed sender custody atomically.

create function public.expand_roll_transfer_unresolved_lot(
  p_transfer_id uuid,
  p_lot_id uuid
)
returns table (
  lot_id uuid,
  lot_number text,
  product_code text,
  product_name text,
  transfer_count integer,
  received_count integer,
  pending_count integer,
  released_to_sender_count integer,
  pending_roll_ids uuid[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_is_admin boolean;
  v_actor_party_id uuid;
  v_sender_party_id uuid;
  v_transfer_status text;
begin
  if p_transfer_id is null or p_lot_id is null then
    raise exception using errcode = '22023', message = 'PG_TRANSFER_RESOLUTION_LOT_ID_REQUIRED';
  end if;

  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'PG_TRANSFER_UNAUTHENTICATED';
  end if;

  v_is_admin := private.is_active_admin();
  if v_is_admin then
    select op.id into v_actor_party_id
    from public.operational_parties op
    where op.party_type = 'company';
  else
    v_actor_party_id := private.current_active_operational_party_id();
  end if;

  select transfer.sender_party_id, transfer.status
    into v_sender_party_id, v_transfer_status
  from public.roll_transfers transfer
  where transfer.id = p_transfer_id;

  if not found
    or v_transfer_status <> 'partially_received'
    or not (v_is_admin or v_actor_party_id = v_sender_party_id)
  then
    return;
  end if;

  return query
  select
    lot.id,
    lot.lot_number,
    production.product_code_snapshot,
    production.product_name_snapshot,
    count(*)::integer,
    count(*) filter (where state.status = 'received')::integer,
    count(*) filter (where state.status = 'pending')::integer,
    count(*) filter (where state.status = 'released_to_sender')::integer,
    coalesce(
      array_agg(roll.id order by roll.roll_index, roll.id) filter (where state.status = 'pending'),
      '{}'::uuid[]
    )
  from public.roll_transfer_items item
  join public.roll_transfer_item_states state
    on state.transfer_id = item.transfer_id and state.roll_id = item.roll_id
  join public.rolls roll on roll.id = item.roll_id
  join public.production_lots lot on lot.id = roll.production_lot_id
  join public.production_orders production on production.id = roll.production_order_id
  where item.transfer_id = p_transfer_id
    and lot.id = p_lot_id
  group by lot.id, lot.lot_number, production.product_code_snapshot, production.product_name_snapshot;
end;
$$;

revoke all on function public.expand_roll_transfer_unresolved_lot(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.expand_roll_transfer_unresolved_lot(uuid, uuid)
  to authenticated;

comment on function public.expand_roll_transfer_unresolved_lot(uuid, uuid) is
  'Cube H sender/Admin bounded bulk resolution helper for one Lot inside a partially received Transfer.';
