# UX-S03R — Role Navigation Reachability

Baseline: `ae2499dacfc4b906a9e08d09d3429604e4595a5e`

This record covers navigation/discoverability only. Authorization remains owned by the existing route/RPC/RLS boundaries and is not changed by UX-S03R.

## Taxonomy

- **Primary**: frequent operational destination.
- **Attention**: queue or work requiring attention.
- **Contextual**: exact task reached from an owning record/queue; not persistent navigation.
- **Reference**: lower-frequency lookup, settings or administration.

## Admin / Company

Before:
- Home exposed Accounts, Agents, Dealers, Centers, Products, Production, Rolls, Issues, Warranties, Claims, Resolutions and Transfers.
- Desktop persistent navigation exposed Accounts, Agents, Dealers, Centers, Products, Production, Rolls and Transfers, but omitted Issues, Warranties, Claims and Resolutions.
- Mobile persistent navigation exposed Home, Accounts, Dealers, Centers and Products, so current Claim/Resolution/physical work required returning Home and hunting modules.

After:
- Home, desktop and mobile are derived from one typed registry.
- Desktop exposes all valid Admin destination families including Claims, Resolutions, Warranties, Issues, Transfers and physical operations.
- Mobile prioritizes Home, Claims, Resolution and Transfers, with `Operations` as the explicit path to lower-frequency Admin/reference destinations.

## Country Agent

Before:
- Home exposed Dealers, Centers, Products, Rolls and Transfers.
- Desktop exposed the same capabilities.
- Mobile omitted Transfers despite Transfers being a primary physical task.

After:
- Mobile keeps Home, Transfers, Rolls and Centers persistently reachable.
- Products and Dealers remain reachable through `Operations` and Home.
- No capability is removed.

## Dealer / Distributor

Before:
- Home exposed Centers, Products, Rolls and Transfers.
- Desktop exposed the same capabilities.
- Mobile omitted Transfers.

After:
- Mobile keeps Home, Transfers, Rolls and Centers persistently reachable.
- Products remain reachable through `Operations` and Home.
- No capability is removed.

## Installation Center

Before:
- Home exposed Location, Claim Inspections, Resolution Tasks, Products, Rolls, Issues, Warranties and Transfers.
- Desktop omitted Location, Issues and Warranties from persistent navigation.
- Mobile showed Home, Inspections, Resolution Tasks, Products and Rolls, but omitted Transfers even though receipt/send is a primary physical flow.

After:
- Mobile keeps Home, Claim Inspections, Resolution Tasks and Transfers persistently reachable.
- Rolls, Issues, Warranties, Products and Location remain explicitly reachable through `Operations` and Home.
- Desktop exposes all valid Center destination families.

## Task-mode contract

Before, mobile navigation hiding depended on generic pathname suffix checks such as `/new`, `/edit`, `/receive`, `/open`, `/recovery`, plus broad Claim route prefixes.

After, task-mode is owned by explicit route-family patterns in the navigation registry. This prevents an unrelated future route from silently hiding navigation merely because its pathname ends with a generic suffix.

## Non-regression statement

- No role gains a destination that was absent from its existing Home capability set.
- No role loses a destination from its existing Home capability set.
- Authorization code, RPC authority and RLS are unchanged.
- Notification access remains a dedicated shell attention entry and does not consume a bottom-navigation slot.
- Account access remains a dedicated identity entry in the shell.
