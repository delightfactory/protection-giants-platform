-- Registry queries are intentionally simple and paginated. These indexes match
-- their stable newest-first ordering so the UI remains responsive as production
-- history and physical Roll volume grow.

create index production_orders_registry_idx
  on public.production_orders (created_at desc, order_number desc);

create index rolls_registry_idx
  on public.rolls (created_at desc, serial_number asc);

comment on index public.production_orders_registry_idx is
  'Supports stable newest-first Production Order registry pagination.';

comment on index public.rolls_registry_idx is
  'Supports stable newest-first physical Roll registry pagination with serial tie-breaking.';
