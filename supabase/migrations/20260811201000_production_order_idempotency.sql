-- Protect irreversible production generation from duplicate browser submits,
-- mobile double-taps, and safe network retries.

alter table public.production_orders
  add column request_id uuid;

update public.production_orders
set request_id = gen_random_uuid()
where request_id is null;

alter table public.production_orders
  alter column request_id set not null,
  add constraint production_orders_request_id_unique unique (request_id);

drop function public.create_production_order(uuid, date, jsonb, text, text);

create function public.create_production_order(
  p_request_id uuid,
  p_product_id uuid,
  p_production_date date,
  p_lots jsonb,
  p_source_reference text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid := gen_random_uuid();
  v_existing_order_id uuid;
  v_existing_created_by uuid;
  v_order_sequence bigint;
  v_order_sequence_text text;
  v_date_text text;
  v_order_number text;
  v_total_rolls integer;
  v_lot jsonb;
  v_lot_ordinal bigint;
  v_lot_id uuid;
  v_lot_number text;
  v_lot_quantity integer;
  v_source_lot_reference text;
  v_product_code text;
  v_product_name text;
  v_product_version text;
  v_product_width_mm numeric(10, 2);
  v_product_length_m numeric(10, 2);
  v_product_thickness_mil numeric(8, 3);
  v_product_weight_kg numeric(10, 3);
  v_product_origin_country text;
begin
  if not (select private.is_active_admin()) then
    raise exception 'Only an active administrator can create production orders.' using errcode = '42501';
  end if;

  if p_request_id is null then
    raise exception 'Production request id is required.' using errcode = '22023';
  end if;

  -- Serialize only requests sharing the same idempotency key. Different
  -- production orders remain fully concurrent.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text, 0));

  select production_order.id, production_order.created_by
    into v_existing_order_id, v_existing_created_by
  from public.production_orders as production_order
  where production_order.request_id = p_request_id;

  if found then
    if v_existing_created_by = auth.uid() then
      return v_existing_order_id;
    end if;

    raise exception 'Production request id is already owned by another administrator.' using errcode = '42501';
  end if;

  if p_product_id is null or p_production_date is null then
    raise exception 'Product and production date are required.' using errcode = '22023';
  end if;

  select
    product.code,
    product.name,
    product.version_name,
    product.width_mm,
    product.length_m,
    product.thickness_mil,
    product.weight_kg,
    product.origin_country
  into
    v_product_code,
    v_product_name,
    v_product_version,
    v_product_width_mm,
    v_product_length_m,
    v_product_thickness_mil,
    v_product_weight_kg,
    v_product_origin_country
  from public.products as product
  where product.id = p_product_id
    and product.status = 'active'
    and product.product_type = 'PPF';

  if not found then
    raise exception 'Production orders require an active PPF product.' using errcode = '22023';
  end if;

  if v_product_width_mm is null
     or v_product_length_m is null
     or v_product_thickness_mil is null
     or v_product_weight_kg is null
     or v_product_origin_country is null
     or char_length(btrim(v_product_origin_country)) < 2 then
    raise exception 'Product definition is incomplete for production.' using errcode = '22023';
  end if;

  if p_source_reference is not null
     and (char_length(btrim(p_source_reference)) < 1 or char_length(btrim(p_source_reference)) > 120) then
    raise exception 'Source reference must contain 1 to 120 characters.' using errcode = '22023';
  end if;

  if p_notes is not null and char_length(p_notes) > 2000 then
    raise exception 'Notes cannot exceed 2000 characters.' using errcode = '22023';
  end if;

  if p_lots is null
     or jsonb_typeof(p_lots) <> 'array'
     or jsonb_array_length(p_lots) < 1
     or jsonb_array_length(p_lots) > 50 then
    raise exception 'Production order must contain between 1 and 50 lots.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_lots) as lot(value)
    where jsonb_typeof(lot.value) <> 'object'
       or case
         when jsonb_typeof(lot.value -> 'quantity') = 'number'
              and coalesce(lot.value ->> 'quantity', '') ~ '^[1-9][0-9]{0,4}$'
           then (lot.value ->> 'quantity')::integer > 10000
         else true
       end
       or (
         lot.value ? 'source_reference'
         and jsonb_typeof(lot.value -> 'source_reference') not in ('string', 'null')
       )
       or (
         jsonb_typeof(lot.value -> 'source_reference') = 'string'
         and nullif(btrim(lot.value ->> 'source_reference'), '') is not null
         and char_length(btrim(lot.value ->> 'source_reference')) > 120
       )
  ) then
    raise exception 'Every lot requires a valid quantity and optional source reference.' using errcode = '22023';
  end if;

  select sum((lot.value ->> 'quantity')::integer)::integer
    into v_total_rolls
  from jsonb_array_elements(p_lots) as lot(value);

  if v_total_rolls is null or v_total_rolls < 1 or v_total_rolls > 10000 then
    raise exception 'A production order can contain between 1 and 10000 rolls.' using errcode = '22023';
  end if;

  v_order_sequence := nextval('public.production_order_sequence'::regclass);
  if v_order_sequence > 99999999 then
    raise exception 'Production order sequence exceeded the supported range.' using errcode = '54000';
  end if;

  v_order_sequence_text := lpad(v_order_sequence::text, 8, '0');
  v_date_text := to_char(p_production_date, 'YYYYMMDD');
  v_order_number := format('PG-PO-%s-%s', v_date_text, v_order_sequence_text);

  insert into public.production_orders (
    id,
    request_id,
    order_number,
    product_id,
    production_date,
    source_reference,
    notes,
    total_rolls,
    created_by,
    product_code_snapshot,
    product_name_snapshot,
    product_version_snapshot,
    width_mm_snapshot,
    length_m_snapshot,
    thickness_mil_snapshot,
    weight_kg_snapshot,
    origin_country_snapshot
  ) values (
    v_order_id,
    p_request_id,
    v_order_number,
    p_product_id,
    p_production_date,
    nullif(btrim(p_source_reference), ''),
    nullif(btrim(p_notes), ''),
    v_total_rolls,
    auth.uid(),
    v_product_code,
    v_product_name,
    v_product_version,
    v_product_width_mm,
    v_product_length_m,
    v_product_thickness_mil,
    v_product_weight_kg,
    v_product_origin_country
  );

  for v_lot, v_lot_ordinal in
    select lot.value, lot.ordinality
    from jsonb_array_elements(p_lots) with ordinality as lot(value, ordinality)
  loop
    v_lot_quantity := (v_lot ->> 'quantity')::integer;
    v_source_lot_reference := nullif(btrim(v_lot ->> 'source_reference'), '');
    v_lot_id := gen_random_uuid();
    v_lot_number := format(
      'PG-L-%s-%s-%s',
      v_date_text,
      v_order_sequence_text,
      lpad(v_lot_ordinal::text, 2, '0')
    );

    insert into public.production_lots (
      id,
      production_order_id,
      product_id,
      lot_number,
      lot_sequence,
      source_lot_reference,
      roll_count
    ) values (
      v_lot_id,
      v_order_id,
      p_product_id,
      v_lot_number,
      v_lot_ordinal::integer,
      v_source_lot_reference,
      v_lot_quantity
    );

    insert into public.rolls (
      id,
      product_id,
      production_order_id,
      production_lot_id,
      roll_index,
      serial_number,
      erp_serial
    )
    select
      gen_random_uuid(),
      p_product_id,
      v_order_id,
      v_lot_id,
      roll_number,
      format(
        'PG-R-%s-%s-%s-%s',
        v_date_text,
        v_order_sequence_text,
        lpad(v_lot_ordinal::text, 2, '0'),
        case
          when roll_number = 10000 then '10000'
          else lpad(roll_number::text, 4, '0')
        end
      ),
      'ERP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16))
    from generate_series(1, v_lot_quantity) as roll_number;
  end loop;

  return v_order_id;
end;
$$;

revoke all on function public.create_production_order(uuid, uuid, date, jsonb, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_production_order(uuid, uuid, date, jsonb, text, text)
  to authenticated;

comment on column public.production_orders.request_id is
  'Internal idempotency key for safe retry of one irreversible production-generation request.';
