-- Closure hardening for the Production Order / Lot / Roll cube.
-- Keep historical production identity stable, enforce lineage consistency,
-- and provide an audited void path without deleting generated identities.

alter table public.production_orders
  add column status text not null default 'generated',
  add column void_reason text,
  add column voided_by uuid references public.profiles(id) on delete restrict,
  add column voided_at timestamptz,
  add column product_code_snapshot text,
  add column product_name_snapshot text,
  add column product_version_snapshot text,
  add column width_mm_snapshot numeric(10, 2),
  add column length_m_snapshot numeric(10, 2),
  add column thickness_mil_snapshot numeric(8, 3),
  add column weight_kg_snapshot numeric(10, 3),
  add column origin_country_snapshot text;

-- Backfill any development/test rows created by the earlier migration before
-- making the production snapshot mandatory.
update public.production_orders as production_order
set
  product_code_snapshot = product.code,
  product_name_snapshot = product.name,
  product_version_snapshot = product.version_name,
  width_mm_snapshot = product.width_mm,
  length_m_snapshot = product.length_m,
  thickness_mil_snapshot = product.thickness_mil,
  weight_kg_snapshot = product.weight_kg,
  origin_country_snapshot = product.origin_country
from public.products as product
where product.id = production_order.product_id;

alter table public.production_orders
  alter column product_code_snapshot set not null,
  alter column product_name_snapshot set not null,
  alter column width_mm_snapshot set not null,
  alter column length_m_snapshot set not null,
  alter column thickness_mil_snapshot set not null,
  alter column weight_kg_snapshot set not null,
  alter column origin_country_snapshot set not null,
  add constraint production_orders_status_allowed
    check (status in ('generated', 'voided')),
  add constraint production_orders_snapshot_code_check
    check (
      char_length(btrim(product_code_snapshot)) between 2 and 40
      and product_code_snapshot = upper(btrim(product_code_snapshot))
      and product_code_snapshot ~ '^[A-Z0-9][A-Z0-9._-]*$'
    ),
  add constraint production_orders_snapshot_name_check
    check (char_length(btrim(product_name_snapshot)) between 2 and 120),
  add constraint production_orders_snapshot_version_check
    check (product_version_snapshot is null or char_length(btrim(product_version_snapshot)) between 1 and 80),
  add constraint production_orders_snapshot_width_check
    check (width_mm_snapshot > 0),
  add constraint production_orders_snapshot_length_check
    check (length_m_snapshot > 0),
  add constraint production_orders_snapshot_thickness_check
    check (thickness_mil_snapshot > 0),
  add constraint production_orders_snapshot_weight_check
    check (weight_kg_snapshot > 0),
  add constraint production_orders_snapshot_origin_check
    check (char_length(btrim(origin_country_snapshot)) between 2 and 80),
  add constraint production_orders_void_state_check
    check (
      (
        status = 'generated'
        and void_reason is null
        and voided_by is null
        and voided_at is null
      )
      or (
        status = 'voided'
        and void_reason is not null
        and char_length(btrim(void_reason)) between 5 and 500
        and voided_by is not null
        and voided_at is not null
      )
    ),
  add constraint production_orders_id_product_unique
    unique (id, product_id);

-- The duplicated lineage keys are intentional for efficient downstream joins,
-- but the database must guarantee that they always describe one hierarchy.
alter table public.production_lots
  add constraint production_lots_id_order_product_unique
    unique (id, production_order_id, product_id),
  add constraint production_lots_order_product_consistency_fkey
    foreign key (production_order_id, product_id)
    references public.production_orders(id, product_id)
    on delete restrict;

alter table public.rolls
  add constraint rolls_lot_order_product_consistency_fkey
    foreign key (production_lot_id, production_order_id, product_id)
    references public.production_lots(id, production_order_id, product_id)
    on delete restrict;

create or replace function public.create_production_order(
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
       or jsonb_typeof(lot.value -> 'quantity') <> 'number'
       or coalesce(lot.value ->> 'quantity', '') !~ '^[1-9][0-9]{0,4}$'
       or (lot.value ->> 'quantity')::integer > 10000
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
        lpad(roll_number::text, 4, '0')
      ),
      'ERP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16))
    from generate_series(1, v_lot_quantity) as roll_number;
  end loop;

  return v_order_id;
end;
$$;

revoke all on function public.create_production_order(uuid, date, jsonb, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_production_order(uuid, date, jsonb, text, text)
  to authenticated;

create function public.void_production_order(
  p_order_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if not (select private.is_active_admin()) then
    raise exception 'Only an active administrator can void production orders.' using errcode = '42501';
  end if;

  if p_order_id is null
     or p_reason is null
     or char_length(btrim(p_reason)) < 5
     or char_length(btrim(p_reason)) > 500 then
    raise exception 'A void reason between 5 and 500 characters is required.' using errcode = '22023';
  end if;

  select production_order.status
    into v_status
  from public.production_orders as production_order
  where production_order.id = p_order_id
  for update;

  if not found then
    raise exception 'Production order was not found.' using errcode = '22023';
  end if;

  if v_status = 'voided' then
    return p_order_id;
  end if;

  update public.production_orders
  set
    status = 'voided',
    void_reason = btrim(p_reason),
    voided_by = auth.uid(),
    voided_at = now()
  where id = p_order_id
    and status = 'generated';

  return p_order_id;
end;
$$;

revoke all on function public.void_production_order(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.void_production_order(uuid, text)
  to authenticated;

comment on column public.production_orders.product_code_snapshot is
  'Canonical SKU captured when the immutable production order is generated.';
comment on column public.production_orders.status is
  'Audit lifecycle: generated orders are operational; voided orders remain visible but must not be used by downstream flows.';
comment on function public.void_production_order(uuid, text) is
  'Audited replacement for deleting or editing a generated production order. Generated serial identities remain reserved.';
