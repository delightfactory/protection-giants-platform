\set ON_ERROR_STOP on

do $$
declare
  v_order_id uuid;
  v_roll_count integer;
  v_event_count integer;
  v_company_party_id uuid;
  v_history_trigger_count integer;
  v_snapshot_trigger_count integer;
begin
  select id into strict v_order_id
  from public.production_orders
  where source_reference = 'CUSTODY-PO';

  select id into strict v_company_party_id
  from public.operational_parties
  where party_type = 'company';

  select count(*) into v_roll_count
  from public.rolls
  where production_order_id = v_order_id;

  if v_roll_count <> 2 then
    raise exception 'Expected exactly two custody fixture Rolls, got %', v_roll_count;
  end if;

  select count(*) into v_event_count
  from private.roll_custody_events e
  join public.rolls r on r.id = e.roll_id
  where r.production_order_id = v_order_id
    and e.custody_sequence = 1
    and e.custodian_party_id = v_company_party_id
    and e.confirmed_at = r.custody_confirmed_at;

  if v_event_count <> 2 then
    raise exception 'Expected one initial Company custody event per fixture Roll, got %', v_event_count;
  end if;

  select count(*) into v_history_trigger_count
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'private'
    and c.relname = 'roll_custody_events'
    and t.tgname = 'roll_custody_events_immutable'
    and not t.tgisinternal;

  if v_history_trigger_count <> 1 then
    raise exception 'Immutable custody history trigger is missing.';
  end if;

  select count(*) into v_snapshot_trigger_count
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'private'
    and c.relname = 'roll_custody_bootstrap_snapshot'
    and t.tgname = 'roll_custody_bootstrap_snapshot_immutable'
    and not t.tgisinternal;

  if v_snapshot_trigger_count <> 1 then
    raise exception 'Immutable custody bootstrap trigger is missing.';
  end if;

  if has_table_privilege('anon', 'private.roll_custody_events', 'SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('authenticated', 'private.roll_custody_events', 'SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('service_role', 'private.roll_custody_events', 'SELECT,INSERT,UPDATE,DELETE')
  then
    raise exception 'Private custody history exposes application table privileges.';
  end if;

  if has_table_privilege('anon', 'private.roll_custody_bootstrap_snapshot', 'SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('authenticated', 'private.roll_custody_bootstrap_snapshot', 'SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('service_role', 'private.roll_custody_bootstrap_snapshot', 'SELECT,INSERT,UPDATE,DELETE')
  then
    raise exception 'Private custody bootstrap snapshot exposes application table privileges.';
  end if;
end;
$$;

select 'Roll custody private audit verification passed.' as result;
