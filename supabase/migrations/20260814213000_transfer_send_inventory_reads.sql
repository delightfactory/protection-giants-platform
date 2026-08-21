-- Cube G — Transfer Send UX read foundation
-- Expose only the authenticated sender's transfer-eligible inventory context.
-- These helpers never move custody, create reservations, or reveal other holders.

create function public.list_transfer_send_rolls(
  p_search text default null,
  p_lot_id uuid default null,
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
  availability text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor jsonb;
  v_sender_party_id uuid;
  v_search text;
begin
  v_actor := private.lock_transfer_actor_context();
  v_sender_party_id := (v_actor ->> 'party_id')::uuid;

  if not private.lock_transfer_party_lifecycle(v_sender_party_id) then
    raise exception using errcode = '42501', message = 'PG_TRANSFER_ACTOR_INACTIVE';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception using errcode = '22023', message = 'PG_TRANSFER_SEND_LIMIT_INVALID';
  end if;

  if p_offset is null or p_offset < 0 or p_offset > 1000000 then
    raise exception using errcode = '22023', message = 'PG_TRANSFER_SEND_OFFSET_INVALID';
  end if;

  v_search := nullif(upper(btrim(coalesce(p_search, ''))), '');
  if v_search is not null
    and (char_length(v_search) > 80 or v_search !~ '^[A-Z0-9-]+$')
  then
    raise exception using errcode = '22023', message = 'PG_TRANSFER_SEND_SEARCH_INVALID';
  end if;

  return query
  select
    r.id,
    r.serial_number,
    r.erp_serial,
    pl.id,
    pl.lot_number,
    po.product_code_snapshot,
    po.product_name_snapshot,
    case when reservation.roll_id is null then 'available' else 'reserved' end::text
  from public.roll_custody_current custody
  join public.rolls r
    on r.id = custody.roll_id
  join public.production_orders po
    on po.id = r.production_order_id
  join public.production_lots pl
    on pl.id = r.production_lot_id
  left join public.roll_transfer_reservations reservation
    on reservation.roll_id = r.id
  where custody.custodian_party_id = v_sender_party_id
    and po.status = 'generated'
    and (p_lot_id is null or pl.id = p_lot_id)
    and (
      v_search is null
      or r.serial_number like v_search || '%'
      or r.erp_serial like v_search || '%'
      or pl.lot_number like v_search || '%'
    )
  order by pl.lot_number desc, r.roll_index asc, r.id
  limit p_limit
  offset p_offset;
end;
$$;

revoke all on function public.list_transfer_send_rolls(text, uuid, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_transfer_send_rolls(text, uuid, integer, integer)
  to authenticated;

comment on function public.list_transfer_send_rolls(text, uuid, integer, integer) is
  'Cube G sender-only interactive Roll list. Reserved status is exposed without Transfer/recipient identity.';

create function public.list_transfer_send_lots(
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  lot_id uuid,
  lot_number text,
  product_code text,
  product_name text,
  total_count integer,
  held_count integer,
  available_count integer,
  reserved_count integer,
  elsewhere_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor jsonb;
  v_sender_party_id uuid;
  v_search text;
begin
  v_actor := private.lock_transfer_actor_context();
  v_sender_party_id := (v_actor ->> 'party_id')::uuid;

  if not private.lock_transfer_party_lifecycle(v_sender_party_id) then
    raise exception using errcode = '42501', message = 'PG_TRANSFER_ACTOR_INACTIVE';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception using errcode = '22023', message = 'PG_TRANSFER_SEND_LIMIT_INVALID';
  end if;

  if p_offset is null or p_offset < 0 or p_offset > 1000000 then
    raise exception using errcode = '22023', message = 'PG_TRANSFER_SEND_OFFSET_INVALID';
  end if;

  v_search := nullif(upper(btrim(coalesce(p_search, ''))), '');
  if v_search is not null
    and (char_length(v_search) > 80 or v_search !~ '^[A-Z0-9-]+$')
  then
    raise exception using errcode = '22023', message = 'PG_TRANSFER_SEND_SEARCH_INVALID';
  end if;

  return query
  with sender_lots as materialized (
    select distinct r.production_lot_id as lot_id
    from public.roll_custody_current custody
    join public.rolls r
      on r.id = custody.roll_id
    join public.production_orders po
      on po.id = r.production_order_id
    join public.production_lots pl
      on pl.id = r.production_lot_id
    where custody.custodian_party_id = v_sender_party_id
      and po.status = 'generated'
      and (
        v_search is null
        or pl.lot_number like v_search || '%'
        or upper(po.product_code_snapshot) like v_search || '%'
      )
  ), lot_counts as (
    select
      pl.id as lot_id,
      pl.lot_number,
      po.product_code_snapshot as product_code,
      po.product_name_snapshot as product_name,
      count(r.id)::integer as total_count,
      count(r.id) filter (
        where custody.custodian_party_id = v_sender_party_id
      )::integer as held_count,
      count(r.id) filter (
        where custody.custodian_party_id = v_sender_party_id
          and reservation.roll_id is not null
      )::integer as reserved_count
    from sender_lots sender_lot
    join public.production_lots pl
      on pl.id = sender_lot.lot_id
    join public.production_orders po
      on po.id = pl.production_order_id
    join public.rolls r
      on r.production_lot_id = pl.id
    join public.roll_custody_current custody
      on custody.roll_id = r.id
    left join public.roll_transfer_reservations reservation
      on reservation.roll_id = r.id
    group by pl.id, pl.lot_number, po.product_code_snapshot, po.product_name_snapshot
  )
  select
    counts.lot_id,
    counts.lot_number,
    counts.product_code,
    counts.product_name,
    counts.total_count,
    counts.held_count,
    (counts.held_count - counts.reserved_count)::integer,
    counts.reserved_count,
    (counts.total_count - counts.held_count)::integer
  from lot_counts counts
  order by counts.lot_number desc, counts.lot_id
  limit p_limit
  offset p_offset;
end;
$$;

revoke all on function public.list_transfer_send_lots(text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_transfer_send_lots(text, integer, integer)
  to authenticated;

comment on function public.list_transfer_send_lots(text, integer, integer) is
  'Cube G sender-only Lot summaries. Elsewhere count is numeric only and never reveals another custodian.';

create function public.expand_transfer_send_lot(p_lot_id uuid)
returns table (
  lot_id uuid,
  lot_number text,
  product_code text,
  product_name text,
  total_count integer,
  held_count integer,
  available_count integer,
  reserved_count integer,
  elsewhere_count integer,
  available_roll_ids uuid[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor jsonb;
  v_sender_party_id uuid;
begin
  if p_lot_id is null then
    raise exception using errcode = '22023', message = 'PG_TRANSFER_SEND_LOT_ID_REQUIRED';
  end if;

  v_actor := private.lock_transfer_actor_context();
  v_sender_party_id := (v_actor ->> 'party_id')::uuid;

  if not private.lock_transfer_party_lifecycle(v_sender_party_id) then
    raise exception using errcode = '42501', message = 'PG_TRANSFER_ACTOR_INACTIVE';
  end if;

  return query
  with lot_rows as (
    select
      pl.id as lot_id,
      pl.lot_number,
      po.product_code_snapshot as product_code,
      po.product_name_snapshot as product_name,
      r.id as roll_id,
      r.roll_index,
      custody.custodian_party_id,
      reservation.roll_id as reserved_roll_id
    from public.production_lots pl
    join public.production_orders po
      on po.id = pl.production_order_id
    join public.rolls r
      on r.production_lot_id = pl.id
    join public.roll_custody_current custody
      on custody.roll_id = r.id
    left join public.roll_transfer_reservations reservation
      on reservation.roll_id = r.id
    where pl.id = p_lot_id
      and po.status = 'generated'
  ), lot_summary as (
    select
      rows.lot_id,
      rows.lot_number,
      rows.product_code,
      rows.product_name,
      count(rows.roll_id)::integer as total_count,
      count(rows.roll_id) filter (
        where rows.custodian_party_id = v_sender_party_id
      )::integer as held_count,
      count(rows.roll_id) filter (
        where rows.custodian_party_id = v_sender_party_id
          and rows.reserved_roll_id is not null
      )::integer as reserved_count,
      coalesce(
        array_agg(rows.roll_id order by rows.roll_index, rows.roll_id) filter (
          where rows.custodian_party_id = v_sender_party_id
            and rows.reserved_roll_id is null
        ),
        '{}'::uuid[]
      ) as available_roll_ids
    from lot_rows rows
    group by rows.lot_id, rows.lot_number, rows.product_code, rows.product_name
  )
  select
    summary.lot_id,
    summary.lot_number,
    summary.product_code,
    summary.product_name,
    summary.total_count,
    summary.held_count,
    (summary.held_count - summary.reserved_count)::integer,
    summary.reserved_count,
    (summary.total_count - summary.held_count)::integer,
    summary.available_roll_ids
  from lot_summary summary
  where summary.held_count > 0;
end;
$$;

revoke all on function public.expand_transfer_send_lot(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.expand_transfer_send_lot(uuid)
  to authenticated;

comment on function public.expand_transfer_send_lot(uuid) is
  'Cube G preview helper that expands only currently available sender-held Rolls. It creates no reservation.';
