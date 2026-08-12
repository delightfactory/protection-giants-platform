-- Finalize the Roll serial boundary without relying on regex alternation.
-- The configured maximum is 10,000 Rolls per order, so the serial suffix must
-- be 0001..9999 or exactly 10000 and must agree with roll_index.

alter table public.rolls
  drop constraint rolls_serial_format_check;

alter table public.rolls
  add constraint rolls_serial_format_check
    check (
      (
        serial_number ~ '^PG-R-[0-9]{8}-[0-9]{8}-[0-9]{2}-[0-9]{4}$'
        or serial_number ~ '^PG-R-[0-9]{8}-[0-9]{8}-[0-9]{2}-10000$'
      )
      and split_part(serial_number, '-', 6)::integer = roll_index
    );

comment on constraint rolls_serial_format_check on public.rolls is
  'Internal Roll serial format. Suffix is 0001..9999 or 10000 and must equal roll_index.';
