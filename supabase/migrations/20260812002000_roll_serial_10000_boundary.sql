-- The Production cube explicitly supports up to 10,000 Rolls per order.
-- PostgreSQL rejected the generated `...-10000` serial at the existing
-- variable-width regex boundary even though 1..9,999 serials were valid.
-- Make the contract explicit: four numeric digits for normal indices, or the
-- single supported five-digit boundary value 10000.

alter table public.rolls
  drop constraint rolls_serial_format;

alter table public.rolls
  add constraint rolls_serial_format
    check (
      serial_number ~ '^PG-R-[0-9]{8}-[0-9]{8}-[0-9]{2}-([0-9]{4}|10000)$'
    );

comment on constraint rolls_serial_format on public.rolls is
  'Internal Roll serial format; supports Roll indices 0001..9999 and the configured 10000 boundary.';
