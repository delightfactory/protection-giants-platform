-- Agent & Network Foundation — Center Onboarding invitation audit.
-- Invitations are server-managed records. Operational clients never receive
-- direct table access; the authenticated invitee is resolved server-side by
-- the trusted onboarding route using auth.uid().

create table public.center_onboarding_invitations (
  id uuid primary key default gen_random_uuid(),
  installation_center_id uuid not null
    references public.installation_centers(id) on delete restrict,
  invited_email text not null,
  auth_user_id uuid
    references auth.users(id) on delete set null,
  invited_by_profile_id uuid not null
    references public.profiles(id) on delete restrict,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  cancelled_at timestamptz,
  superseded_at timestamptz,
  review_required_at timestamptz,
  failure_code text,

  constraint center_onboarding_invited_email_normalized
    check (
      invited_email = lower(btrim(invited_email))
      and char_length(invited_email) between 3 and 254
    ),
  constraint center_onboarding_status_allowed
    check (status in ('pending', 'accepted', 'cancelled', 'superseded')),
  constraint center_onboarding_status_timestamps
    check (
      (
        status = 'pending'
        and accepted_at is null
        and cancelled_at is null
        and superseded_at is null
      )
      or
      (
        status = 'accepted'
        and accepted_at is not null
        and cancelled_at is null
        and superseded_at is null
      )
      or
      (
        status = 'cancelled'
        and accepted_at is null
        and cancelled_at is not null
        and superseded_at is null
      )
      or
      (
        status = 'superseded'
        and accepted_at is null
        and cancelled_at is null
        and superseded_at is not null
      )
    ),
  constraint center_onboarding_review_marker_valid
    check (
      (
        review_required_at is null
        and failure_code is null
      )
      or
      (
        status = 'accepted'
        and review_required_at is not null
        and failure_code in ('profile-mismatch', 'profile-read-uncertain')
      )
    )
);

-- Pending means the invitation is awaiting the recipient. Accepted means the
-- recipient has claimed it and server-side Profile provisioning is finalizing
-- (or has been locked for explicit review). Both states are therefore "open"
-- and must remain unique across Center, invited email and bound Auth user.
create unique index center_onboarding_one_open_per_center
  on public.center_onboarding_invitations (installation_center_id)
  where status in ('pending', 'accepted');

create unique index center_onboarding_one_open_per_email
  on public.center_onboarding_invitations (invited_email)
  where status in ('pending', 'accepted');

create unique index center_onboarding_one_open_per_auth_user
  on public.center_onboarding_invitations (auth_user_id)
  where status in ('pending', 'accepted') and auth_user_id is not null;

create index center_onboarding_center_history_idx
  on public.center_onboarding_invitations (installation_center_id, created_at desc);

create index center_onboarding_inviter_idx
  on public.center_onboarding_invitations (invited_by_profile_id, created_at desc);

alter table public.center_onboarding_invitations enable row level security;

revoke all on table public.center_onboarding_invitations from public;
revoke all on table public.center_onboarding_invitations from anon;
revoke all on table public.center_onboarding_invitations from authenticated;
revoke all on table public.center_onboarding_invitations from service_role;

grant select, insert, update
  on table public.center_onboarding_invitations
  to service_role;

comment on table public.center_onboarding_invitations is
  'Server-managed audit for the first controlled Installation Center onboarding invitation. No raw Supabase invitation token is stored.';
