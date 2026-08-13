-- Cube D — read-only compatibility surface over the Roll custody invariant.
-- SECURITY INVOKER keeps the underlying rolls RLS authoritative.

create view public.roll_custody_current
with (security_invoker = true)
as
select
  r.id as roll_id,
  r.custodian_party_id,
  r.custody_confirmed_at as confirmed_at,
  r.created_at
from public.rolls r;

revoke all on table public.roll_custody_current
  from public, anon, authenticated, service_role;
grant select on table public.roll_custody_current
  to authenticated;

comment on view public.roll_custody_current is
  'Read-only view of current confirmed Roll custody. Authoritative state lives on public.rolls; RLS is inherited through SECURITY INVOKER.';
