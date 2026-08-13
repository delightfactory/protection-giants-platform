-- Cube D — private append-only custody history.

create table private.roll_custody_events (
  id uuid primary key default gen_random_uuid(),
  roll_id uuid not null references public.rolls(id) on delete restrict,
  custody_sequence integer not null check (custody_sequence > 0),
  custodian_party_id uuid not null references public.operational_parties(id) on delete restrict,
  confirmed_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  constraint roll_custody_events_roll_sequence_unique unique (roll_id, custody_sequence)
);

create index roll_custody_events_roll_timeline_idx
  on private.roll_custody_events (roll_id, custody_sequence desc);
create index roll_custody_events_custodian_idx
  on private.roll_custody_events (custodian_party_id, roll_id);

revoke all on table private.roll_custody_events
  from public, anon, authenticated, service_role;

comment on table private.roll_custody_events is
  'Private immutable append-only history of confirmed Roll custodians. Sequence 1 is initial Company custody.';

insert into private.roll_custody_events (
  roll_id,
  custody_sequence,
  custodian_party_id,
  confirmed_at
)
select r.id, 1, r.custodian_party_id, r.custody_confirmed_at
from public.rolls r;
