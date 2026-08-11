create sequence public.production_order_sequence;

create table public.production_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  product_id uuid not null references public.products(id) on delete restrict,
  production_date date not null,
  source_reference text,
  notes text,
  total_rolls integer not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint production_orders_number_format_check
    check (order_number ~ '^PG-PO-[0-9]{8}-[0-9]{8}$'),
  constraint production_orders_source_reference_check
    check (source_reference is null or (char_length(btrim(source_reference)) between 1 and 120)),
  constraint production_orders_notes_check
    check (notes is null or char_length(notes) <= 2000),
  constraint production_orders_total_rolls_check
    check (total_rolls between 1 and 10000)
);

create table public.production_lots (
  id uuid primary key default gen_random_uuid(),
  production_order_id uuid not null references public.production_orders(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  lot_number text not null unique,
  lot_sequence integer not null,
  source_lot_reference text,
  roll_count integer not null,
  created_at timestamptz not null default now(),
  constraint production_lots_number_format_check
    check (lot_number ~ '^PG-L-[0-9]{8}-[0-9]{8}-[0-9]{2}$'),
  constraint production_lots_sequence_check
    check (lot_sequence between 1 and 50),
  constraint production_lots_source_reference_check
    check (source_lot_reference is null or (char_length(btrim(source_lot_reference)) between 1 and 120)),
  constraint production_lots_roll_count_check
    check (roll_count between 1 and 10000),
  constraint production_lots_order_sequence_unique
    unique (production_order_id, lot_sequence)
);

create table public.rolls (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  production_order_id uuid not null references public.production_orders(id) on delete restrict,
  production_lot_id uuid not null references public.production_lots(id) on delete restrict,
  roll_index integer not null,
  serial_number text not null unique,
  erp_serial text not null unique,
  created_at timestamptz not null default now(),
  constraint rolls_index_check
    check (roll_index between 1 and 10000),
  constraint rolls_serial_format_check
    check (serial_number ~ '^PG-R-[0-9]{8}-[0-9]{8}-[0-9]{2}-[0-9]{4,5}$'),
  constraint rolls_erp_serial_format_check
    check (erp_serial ~ '^ERP-[A-F0-9]{16}$'),
  constraint rolls_lot_index_unique
    unique (production_lot_id, roll_index)
);

create index production_orders_product_date_idx
  on public.production_orders (product_id, production_date desc);
create index production_lots_order_idx
  on public.production_lots (production_order_id, lot_sequence);
create index rolls_order_idx
  on public.rolls (production_order_id, production_lot_id, roll_index);
create index rolls_product_idx
  on public.rolls (product_id, created_at desc);

alter table public.production_orders enable row level security;
alter table public.production_lots enable row level security;
alter table public.rolls enable row level security;

revoke all on table public.production_orders from public, anon, authenticated, service_role;
revoke all on table public.production_lots from public, anon, authenticated, service_role;
revoke all on table public.rolls from public, anon, authenticated, service_role;
revoke all on sequence public.production_order_sequence from public, anon, authenticated, service_role;

grant select on table public.production_orders to authenticated;
grant select on table public.production_lots to authenticated;
grant select on table public.rolls to authenticated;

create policy "production_orders_admin_read"
on public.production_orders
for select
to authenticated
using ((select private.is_active_admin()));

create policy "production_lots_admin_read"
on public.production_lots
for select
to authenticated
using ((select private.is_active_admin()));

create policy "rolls_admin_read"
on public.rolls
for select
to authenticated
using ((select private.is_active_admin()));

create function public.create_production_order(
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
begin
  if not (select private.is_active_admin()) then
    raise exception 'Only an active administrator can create production orders.' using errcode = '42501';
  end if;

  if p_product_id is null or p_production_date is null then
    raise exception 'Product and production date are required.' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.products
    where products.id = p_product_id
      and products.status = 'active'
      and products.product_type = 'PPF'
  ) then
    raise exception 'Production orders require an active PPF product.' using errcode = '22023';
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
    where case
      when coalesce(lot.value ->> 'quantity', '') ~ '^[1-9][0-9]{0,4}$'
        then (lot.value ->> 'quantity')::integer > 10000
      else true
    end
       or (
         lot.value ? 'source_reference'
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
    created_by
  ) values (
    v_order_id,
    v_order_number,
    p_product_id,
    p_production_date,
    nullif(btrim(p_source_reference), ''),
    nullif(btrim(p_notes), ''),
    v_total_rolls,
    auth.uid()
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

comment on table public.production_orders is
  'Immutable first-release production headers. Creation is atomic through create_production_order().';
comment on table public.production_lots is
  'Lot breakdown generated as part of an immutable production order.';
comment on table public.rolls is
  'One record per physical PPF roll, with internal and ERP serial identities generated at production time.';
