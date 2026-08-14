# Cube G — Transfer Send UX Implementation

**Status:** In progress  
**Implementation branch:** `feature/cube-g-transfer-send-ux`

## Implemented increment 1 — sender inventory reads

Cube G now has the bounded sender-read contracts required by the approved UI specification:

- `list_transfer_send_rolls(...)`
- `list_transfer_send_lots(...)`
- `expand_transfer_send_lot(...)`

The functions derive the sender from the authenticated active Profile/Operational Party, expose no other-holder identity, and do not create reservations or move custody.

Permanent database coverage verifies sender scoping, reservation visibility without recipient leakage, Lot arithmetic, service-role denial, lifecycle suspension, Production void exclusion, Agent/descendant isolation, and Admin-as-Company behavior.

## Remaining Cube G work

- Transfer module landing and own Transfer ID QR/copy surface.
- Mobile-first send task.
- Exact recipient Transfer ID entry/scan and verification.
- Scan Rolls, Select Rolls and Select Lot modes.
- Review/count confirmation and interrupted-submit idempotency.
- Success/failure UX and stable error mapping.
- Navigation/entry integration.
- UI/mobile/regression verification and final documentation.

Cube H receipt/inbox/partial receipt/custody movement remains out of scope.
