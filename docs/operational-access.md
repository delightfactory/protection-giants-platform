# Operational Access Gate

## Entry requirements

`/operations` requires all of the following:

1. valid Supabase Auth session;
2. matching `public.profiles` row;
3. active Profile status;
4. role in `admin | agent | dealer | center`;
5. exact database-valid role/entity binding;
6. active directly represented entity for Agent, Dealer, or Center.

Failure redirects to `/access-denied`.

## Entity activity

- Agent users require their bound Country Agent to be active.
- Dealer users require their bound Dealer to be active.
- Center users require their bound Center to be active.

Parent suspension does not cascade: a suspended Agent does not automatically suspend its Dealers/Centers, and a suspended Dealer does not automatically suspend Centers.

## Network visibility

RLS is the final normal-visibility boundary:

- Admin: all Agents/Dealers/Centers.
- Agent: own Agent, own Dealers, direct Centers, and Centers below own Dealers.
- Dealer: own Dealer and directly assigned Centers.
- Center: own Center only.

Company-direct Centers remain outside Agent/Dealer ordinary scope.

The exact Transfer-ID resolver is a deliberate exception to hierarchy visibility. It accepts only one exact high-entropy identifier, revalidates the caller and active recipient, and returns a fixed minimal verification card rather than a browse/search API.

## Module access

The operations home and navigation expose only real modules available to each role:

- Admin: accounts, Country Agents, Dealers, Centers, Products, Production.
- Agent: Dealers, Centers, Products.
- Dealer: Centers, Products.
- Center: Products.

Agent Dealer-account management is embedded inside the scoped Dealer management path and does not grant Agent access to global operational accounts.

## Center onboarding exception

`/onboarding/center` is intentionally outside the Operational Profile gate because the invited Auth user does not have a Profile yet.

That route still requires an authenticated invite session and a live `center_onboarding_invitations` row bound to the exact Auth user and invited email. It exposes no Operations data before protected Profile provisioning succeeds.

## Security principle

Application route checks improve UX but do not replace RLS. Every exposed business table/action must independently enforce role, status, hierarchy, ownership, or future custody rules.
