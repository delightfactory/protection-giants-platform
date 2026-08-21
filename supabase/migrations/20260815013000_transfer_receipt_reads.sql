-- Cube H — Transfer hub/detail/item/Lot read projections
-- Pending recipients cannot rely on current-custody Roll RLS, so these narrow
-- SECURITY DEFINER reads expose only the Transfer context already authorized.

create function private.transfer_party_is_active_read(p_party_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when op.party_type = 'company' then true
      when op.party_type = 'agent' then ca.status = 'active'
      when op.party_type = 'dealer' then d.status = 'active'
      when op.party_type = 'center' then c.status = 'active'
      else false
    end
    from public.operational_parties op
    left join public.country_agents ca on ca.id = op.country_agent_id
    left join public.dealers d on d.id = op.dealer_id
    left join public.installation_centers c on c.id = op.installation_center_id
    where op.id = p_party_id
  ), false)
$$;

revoke all on function private.transfer_party_is_active_read(uuid)
  from public, anon, authenticated, service_role;

create function public.list_roll_transfers(
  p_direction text default 'incoming',
  p_scope text default 'active',
  p_search text default null,
  p_limit integer default 30,
  p_offset integer default 0
)
returns table (
  transfer_id uuid,
  transfer_number text,
  status text,
  created_at timestamptz,
  closed_at timestamptz,
  sender_party_type text,
  sender_name text,
  recipient_party_type text,
  recipient_name text,
  roll_count integer,
  received_count integer,
  pending_count integer,
  released_to_sender_count integer,
  closed_unreceived_count integer,
  needs_action boolean,
  matching_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid := auth.uid();
  v_is_admin boolean;
  v_actor_party_id uuid;
  v_direction text := lower(btrim(coalesce(p_direction, '')));
  v_scope text := lower(btrim(coalesce(p_scope, '')));
  v_search text := nullif(upper(btrim(coalesce(p_search, ''))), '');
begin
  if v_profile_id is null then
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

  if v_actor_party_id is null and not v_is_admin then
    raise exception using errcode = '42501', message = 'PG_TRANSFER_ACTOR_INACTIVE';
  end if;

  if v_direction not in ('incoming', 'outgoing', 'all')
    or (v_direction = 'all' and not v_is_admin)
  then
    raise exception using errcode = '22023', message = 'PG_TRANSFER_LIST_DIRECTION_INVALID';
  end if;

  if v_scope not in ('active', 'history', 'all') then
    raise exception using errcode = '22023', message = 'PG_TRANSFER_LIST_SCOPE_INVALID';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception using errcode = '22023', message = 'PG_TRANSFER_LIST_LIMIT_INVALID';
  end if;

  if p_offset is null or p_offset < 0 or p_offset > 1000000 then
    raise exception using errcode = '22023', message = 'PG_TRANSFER_LIST_OFFSET_INVALID';
  end if;

  if v_search is not null
    and (char_length(v_search) > 30 or v_search !~ '^PG-T-[0-9]{8}-[0-9]{8}$')
  then
    raise exception using errcode = '22023', message = 'PG_TRANSFER_LIST_SEARCH_INVALID';
  end if;

  return query
  with scoped as (
    select transfer.*
    from public.roll_transfers transfer
    where (
      (v_direction = 'incoming' and transfer.recipient_party_id = v_actor_party_id)
      or (v_direction = 'outgoing' and transfer.sender_party_id = v_actor_party_id)
      or (v_direction = 'all' and v_is_admin)
    )
      and (
        v_scope = 'all'
        or (v_scope = 'active' and transfer.status in ('pending', 'partially_received'))
        or (v_scope = 'history' and transfer.status in ('received', 'partially_completed', 'cancelled', 'rejected'))
      )
      and (v_search is null or transfer.transfer_number = v_search)
  ), counted as (
    select scoped.*, count(*) over() as matching_count
    from scoped
    order by scoped.created_at desc, scoped.id desc
    limit p_limit
    offset p_offset
  ), item_counts as (
    select
      state.transfer_id,
      count(*) filter (where state.status = 'received')::integer as received_count,
      count(*) filter (where state.status = 'pending')::integer as pending_count,
      count(*) filter (where state.status = 'released_to_sender')::integer as released_count,
      count(*) filter (where state.status = 'closed_unreceived')::integer as closed_count
    from public.roll_transfer_item_states state
    where state.transfer_id in (select counted.id from counted)
    group by state.transfer_id
  )
  select
    counted.id,
    counted.transfer_number,
    counted.status,
    counted.created_at,
    counted.closed_at,
    sender.party_type,
    case
      when sender.party_type = 'company' then 'Protection Giants'
      when sender.party_type = 'agent' then sender_agent.name
      when sender.party_type = 'dealer' then sender_dealer.name
      when sender.party_type = 'center' then sender_center.name
    end,
    recipient.party_type,
    case
      when recipient.party_type = 'company' then 'Protection Giants'
      when recipient.party_type = 'agent' then recipient_agent.name
      when recipient.party_type = 'dealer' then recipient_dealer.name
      when recipient.party_type = 'center' then recipient_center.name
    end,
    counted.roll_count,
    coalesce(item_counts.received_count, 0),
    coalesce(item_counts.pending_count, 0),
    coalesce(item_counts.released_count, 0),
    coalesce(item_counts.closed_count, 0),
    (
      counted.status in ('pending', 'partially_received')
      and (
        (v_direction = 'incoming' and counted.recipient_party_id = v_actor_party_id)
        or (v_direction = 'outgoing' and counted.sender_party_id = v_actor_party_id and counted.status = 'partially_received')
        or (v_direction = 'all' and v_is_admin and counted.status = 'partially_received')
      )
    ),
    counted.matching_count
  from counted
  join public.operational_parties sender on sender.id = counted.sender_party_id
  left join public.country_agents sender_agent on sender_agent.id = sender.country_agent_id
  left join public.dealers sender_dealer on sender_dealer.id = sender.dealer_id
  left join public.installation_centers sender_center on sender_center.id = sender.installation_center_id
  join public.operational_parties recipient on recipient.id = counted.recipient_party_id
  left join public.country_agents recipient_agent on recipient_agent.id = recipient.country_agent_id
  left join public.dealers recipient_dealer on recipient_dealer.id = recipient.dealer_id
  left join public.installation_centers recipient_center on recipient_center.id = recipient.installation_center_id
  left join item_counts on item_counts.transfer_id = counted.id
  order by counted.created_at desc, counted.id desc;
end;
$$;

revoke all on function public.list_roll_transfers(text, text, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_roll_transfers(text, text, text, integer, integer)
  to authenticated;

create function public.get_roll_transfer_detail(p_transfer_id uuid)
returns table (
  transfer_id uuid,
  transfer_number text,
  status text,
  created_at timestamptz,
  closed_at timestamptz,
  sender_party_type text,
  sender_name text,
  recipient_party_type text,
  recipient_name text,
  roll_count integer,
  received_count integer,
  pending_count integer,
  released_to_sender_count integer,
  closed_unreceived_count integer,
  viewer_is_sender boolean,
  viewer_is_recipient boolean,
  viewer_is_admin boolean,
  can_receive boolean,
  can_cancel boolean,
  can_reject boolean,
  can_resolve_unreceived boolean,
  can_admin_resolve_unreceived boolean,
  can_admin_recovery_cancel boolean,
  lot_groups jsonb,
  timeline jsonb
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
  v_recipient_party_id uuid;
begin
  if p_transfer_id is null then
    raise exception using errcode = '22023', message = 'PG_TRANSFER_ID_REQUIRED';
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

  if v_actor_party_id is null and not v_is_admin then
    raise exception using errcode = '42501', message = 'PG_TRANSFER_ACTOR_INACTIVE';
  end if;

  select transfer.sender_party_id, transfer.recipient_party_id
    into v_sender_party_id, v_recipient_party_id
  from public.roll_transfers transfer
  where transfer.id = p_transfer_id;

  if not found
    or not (
      v_is_admin
      or v_sender_party_id = v_actor_party_id
      or v_recipient_party_id = v_actor_party_id
    )
  then
    return;
  end if;

  return query
  with item_counts as (
    select
      count(*) filter (where state.status = 'received')::integer as received_count,
      count(*) filter (where state.status = 'pending')::integer as pending_count,
      count(*) filter (where state.status = 'released_to_sender')::integer as released_count,
      count(*) filter (where state.status = 'closed_unreceived')::integer as closed_count
    from public.roll_transfer_item_states state
    where state.transfer_id = p_transfer_id
  ), lot_summary as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'lot_id', grouped.lot_id,
      'lot_number', grouped.lot_number,
      'product_code', grouped.product_code,
      'product_name', grouped.product_name,
      'production_lot_total', grouped.production_lot_total,
      'transfer_count', grouped.transfer_count,
      'received_count', grouped.received_count,
      'pending_count', grouped.pending_count,
      'released_to_sender_count', grouped.released_count,
      'transfer_contains_full_lot', grouped.transfer_count = grouped.production_lot_total
    ) order by grouped.lot_number, grouped.lot_id), '[]'::jsonb) as groups
    from (
      select
        lot.id as lot_id,
        lot.lot_number,
        production.product_code_snapshot as product_code,
        production.product_name_snapshot as product_name,
        lot.roll_count::integer as production_lot_total,
        count(*)::integer as transfer_count,
        count(*) filter (where state.status = 'received')::integer as received_count,
        count(*) filter (where state.status = 'pending')::integer as pending_count,
        count(*) filter (where state.status = 'released_to_sender')::integer as released_count
      from public.roll_transfer_items item
      join public.rolls roll on roll.id = item.roll_id
      join public.production_lots lot on lot.id = roll.production_lot_id
      join public.production_orders production on production.id = roll.production_order_id
      join public.roll_transfer_item_states state
        on state.transfer_id = item.transfer_id and state.roll_id = item.roll_id
      where item.transfer_id = p_transfer_id
      group by lot.id, lot.lot_number, lot.roll_count, production.product_code_snapshot, production.product_name_snapshot
    ) grouped
  ), event_timeline as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'event_sequence', event.event_sequence,
      'event_type', event.event_type,
      'occurred_at', event.occurred_at,
      'affected_roll_count', event.affected_roll_count,
      'reason', case when v_is_admin then event.reason else null end
    ) order by event.event_sequence), '[]'::jsonb) as events
    from public.roll_transfer_events event
    where event.transfer_id = p_transfer_id
  )
  select
    transfer.id,
    transfer.transfer_number,
    transfer.status,
    transfer.created_at,
    transfer.closed_at,
    sender.party_type,
    case
      when sender.party_type = 'company' then 'Protection Giants'
      when sender.party_type = 'agent' then sender_agent.name
      when sender.party_type = 'dealer' then sender_dealer.name
      when sender.party_type = 'center' then sender_center.name
    end,
    recipient.party_type,
    case
      when recipient.party_type = 'company' then 'Protection Giants'
      when recipient.party_type = 'agent' then recipient_agent.name
      when recipient.party_type = 'dealer' then recipient_dealer.name
      when recipient.party_type = 'center' then recipient_center.name
    end,
    transfer.roll_count,
    item_counts.received_count,
    item_counts.pending_count,
    item_counts.released_count,
    item_counts.closed_count,
    transfer.sender_party_id = v_actor_party_id,
    transfer.recipient_party_id = v_actor_party_id,
    v_is_admin,
    transfer.recipient_party_id = v_actor_party_id and transfer.status in ('pending', 'partially_received') and item_counts.pending_count > 0,
    transfer.sender_party_id = v_actor_party_id and transfer.status = 'pending',
    transfer.recipient_party_id = v_actor_party_id and transfer.status = 'pending',
    transfer.sender_party_id = v_actor_party_id and transfer.status = 'partially_received' and item_counts.pending_count > 0,
    v_is_admin and transfer.status = 'partially_received' and item_counts.pending_count > 0,
    v_is_admin and transfer.status = 'pending' and (
      not private.transfer_party_is_active_read(transfer.sender_party_id)
      or not private.transfer_party_is_active_read(transfer.recipient_party_id)
    ),
    lot_summary.groups,
    event_timeline.events
  from public.roll_transfers transfer
  join public.operational_parties sender on sender.id = transfer.sender_party_id
  left join public.country_agents sender_agent on sender_agent.id = sender.country_agent_id
  left join public.dealers sender_dealer on sender_dealer.id = sender.dealer_id
  left join public.installation_centers sender_center on sender_center.id = sender.installation_center_id
  join public.operational_parties recipient on recipient.id = transfer.recipient_party_id
  left join public.country_agents recipient_agent on recipient_agent.id = recipient.country_agent_id
  left join public.dealers recipient_dealer on recipient_dealer.id = recipient.dealer_id
  left join public.installation_centers recipient_center on recipient_center.id = recipient.installation_center_id
  cross join item_counts
  cross join lot_summary
  cross join event_timeline
  where transfer.id = p_transfer_id;
end;
$$;

revoke all on function public.get_roll_transfer_detail(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_roll_transfer_detail(uuid)
  to authenticated;

create function public.list_roll_transfer_items(
  p_transfer_id uuid,
  p_search text default null,
  p_status text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  roll_id uuid,
  serial_number text,
  erp_serial text,
  lot_id uuid,
  lot_number text,
  product_code text,
  product_name text,
  item_status text,
  acted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_search text := nullif(upper(btrim(coalesce(p_search, ''))), '');
  v_status text := nullif(lower(btrim(coalesce(p_status, ''))), '');
begin
  if p_transfer_id is null then
    raise exception using errcode = '22023', message = 'PG_TRANSFER_ID_REQUIRED';
  end if;

  if not private.can_read_roll_transfer(p_transfer_id) then
    return;
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception using errcode = '22023', message = 'PG_TRANSFER_ITEMS_LIMIT_INVALID';
  end if;

  if p_offset is null or p_offset < 0 or p_offset > 1000000 then
    raise exception using errcode = '22023', message = 'PG_TRANSFER_ITEMS_OFFSET_INVALID';
  end if;

  if v_status is not null and v_status not in ('pending', 'received', 'released_to_sender', 'closed_unreceived') then
    raise exception using errcode = '22023', message = 'PG_TRANSFER_ITEMS_STATUS_INVALID';
  end if;

  if v_search is not null
    and (char_length(v_search) > 80 or v_search !~ '^[A-Z0-9-]+$')
  then
    raise exception using errcode = '22023', message = 'PG_TRANSFER_ITEMS_SEARCH_INVALID';
  end if;

  return query
  select
    roll.id,
    roll.serial_number,
    roll.erp_serial,
    lot.id,
    lot.lot_number,
    production.product_code_snapshot,
    production.product_name_snapshot,
    state.status,
    state.acted_at
  from public.roll_transfer_items item
  join public.roll_transfer_item_states state
    on state.transfer_id = item.transfer_id and state.roll_id = item.roll_id
  join public.rolls roll on roll.id = item.roll_id
  join public.production_lots lot on lot.id = roll.production_lot_id
  join public.production_orders production on production.id = roll.production_order_id
  where item.transfer_id = p_transfer_id
    and (v_status is null or state.status = v_status)
    and (
      v_search is null
      or roll.serial_number like v_search || '%'
      or roll.erp_serial like v_search || '%'
      or lot.lot_number like v_search || '%'
    )
  order by lot.lot_number, roll.roll_index, roll.id
  limit p_limit
  offset p_offset;
end;
$$;

revoke all on function public.list_roll_transfer_items(uuid, text, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_roll_transfer_items(uuid, text, text, integer, integer)
  to authenticated;

create function public.expand_roll_transfer_receipt_lot(
  p_transfer_id uuid,
  p_lot_id uuid
)
returns table (
  lot_id uuid,
  lot_number text,
  product_code text,
  product_name text,
  production_lot_total integer,
  transfer_count integer,
  received_count integer,
  pending_count integer,
  released_to_sender_count integer,
  transfer_contains_full_lot boolean,
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
  v_recipient_party_id uuid;
  v_transfer_status text;
begin
  if p_transfer_id is null or p_lot_id is null then
    raise exception using errcode = '22023', message = 'PG_TRANSFER_RECEIPT_LOT_ID_REQUIRED';
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

  select transfer.recipient_party_id, transfer.status
    into v_recipient_party_id, v_transfer_status
  from public.roll_transfers transfer
  where transfer.id = p_transfer_id;

  if not found or v_actor_party_id is null or v_actor_party_id <> v_recipient_party_id then
    return;
  end if;

  if v_transfer_status not in ('pending', 'partially_received') then
    return;
  end if;

  return query
  select
    lot.id,
    lot.lot_number,
    production.product_code_snapshot,
    production.product_name_snapshot,
    lot.roll_count::integer,
    count(*)::integer,
    count(*) filter (where state.status = 'received')::integer,
    count(*) filter (where state.status = 'pending')::integer,
    count(*) filter (where state.status = 'released_to_sender')::integer,
    count(*)::integer = lot.roll_count::integer,
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
  group by lot.id, lot.lot_number, lot.roll_count, production.product_code_snapshot, production.product_name_snapshot;
end;
$$;

revoke all on function public.expand_roll_transfer_receipt_lot(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.expand_roll_transfer_receipt_lot(uuid, uuid)
  to authenticated;

comment on function public.list_roll_transfers(text, text, text, integer, integer) is
  'Cube H bounded Transfer hub projection. Ordinary users see only their own incoming/outgoing Transfers; Admin may request audit scope.';
comment on function public.get_roll_transfer_detail(uuid) is
  'Cube H participant/Admin Transfer detail with server-derived action availability, Lot groups and immutable timeline.';
comment on function public.list_roll_transfer_items(uuid, text, text, integer, integer) is
  'Cube H authorized paginated Transfer item projection for field receipt and history.';
comment on function public.expand_roll_transfer_receipt_lot(uuid, uuid) is
  'Cube H recipient-only Lot expansion returning only unresolved item IDs inside the addressed Transfer.';
