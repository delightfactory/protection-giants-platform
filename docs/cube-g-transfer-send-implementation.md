# Cube G — Transfer Send UX Implementation

**Status:** Software implementation complete on feature branch; merge remains gated by final CI and device/mobile smoke validation  
**Implementation branch:** `feature/cube-g-transfer-send-ux`  
**Implementation PR:** `#52`

## 1. Delivered scope

Cube G now implements the complete sender-side Transfer workflow frozen by `docs/cube-g-transfer-send-ux-spec.md`.

### Transfer landing and sender identity

`/operations/transfers` now provides:

- the authenticated actor's own immutable Transfer ID;
- a machine-readable QR containing that exact Transfer ID only;
- a copy action;
- a clear explanation that Transfer ID identifies a recipient but does not authenticate, reserve, or move custody;
- the primary entry to send a new Transfer.

Admin acts as the singleton Company Operational Party. Agent, Dealer, and Center users act only as their own bound Operational Party.

### Recipient verification

`/operations/transfers/new` begins with one deliberate recipient decision:

- manual/paste Transfer ID;
- camera QR scan;
- exact `resolve_transfer_recipient(...)` verification only;
- no global directory or fuzzy search;
- minimum recipient verification card;
- explicit confirmation before Roll selection;
- the actor's own Transfer ID is rejected immediately in the UI while Cube F remains the final authority.

Changing the recipient after selecting Rolls requires an explicit decision and clears the old selection so a prepared Roll set cannot silently be redirected to another party.

### Roll selection modes

The sender can switch between three modes without losing the shared unique Roll selection:

1. **مسح اللفات** — continuous camera QR scan with image/manual fallback;
2. **اختيار اللفات** — paged mobile-friendly current-custody list;
3. **اختيار Lot** — bounded Lot summaries and available-Roll expansion.

The scanner reuses the existing contextual Roll QR parser. It does not introduce another Roll identity.

Camera decoding is loaded only when needed. The scanner session stays open between valid/invalid Roll scans, stops/releases the camera on close, locks background scrolling while active, supports Escape on keyboard-capable devices, and provides image/manual fallbacks when camera access is unavailable.

### Partial Lot clarity

The Lot sender view exposes only operationally useful counts:

- total;
- available;
- reserved;
- elsewhere.

It never exposes another custodian's identity.

When only part of a Lot is available, the operator must explicitly confirm the currently available count. The UI does not describe that action as a complete-Lot Transfer.

### Review and send

The final review surface shows:

- verified recipient;
- selected Roll count;
- Lot breakdown where applicable;
- the explicit custody rule:

> سيتم حجز هذه اللفات للتحويل، وتظل العهدة المؤكدة لدى المرسل حتى الاستلام.

Submission calls the existing Cube F `create_roll_transfer(...)` RPC. Cube G does not duplicate or weaken Cube F authority.

The success surface shows the Transfer number, reserved Roll count, and `pending` meaning without implying that custody has moved.

## 2. Sender inventory read contracts

Cube G adds three narrow authenticated read RPCs:

- `list_transfer_send_rolls(...)`
- `list_transfer_send_lots(...)`
- `expand_transfer_send_lot(...)`

They:

- derive the sender from the authenticated active Profile/Operational Party;
- require the sender entity to remain active;
- expose only generated Production Orders;
- expose only the sender's own held Rolls for Roll selection;
- expose reservation state without Transfer/recipient identity;
- aggregate Lot totals only for Lots in which the sender currently holds Rolls;
- return only currently available sender-held Roll IDs from Lot expansion;
- create no reservation;
- move no custody;
- grant no service-role Data API execution path.

## 3. Interrupted-submit safety

The client stores only one versioned pending-send record in `sessionStorage`:

- payload fingerprint = normalized recipient Transfer ID + sorted unique Roll IDs;
- same payload reuses the same UUID request ID;
- changed payload receives a new request ID;
- success clears the stored request;
- a lost/ambiguous network response preserves the same request and selection so retry goes back through Cube F idempotency instead of creating a new logical request.

Unexpected database errors are not returned raw to the browser. The server action exposes only known stable Transfer error codes and maps unknown failures to `PG_TRANSFER_SEND_FAILED`.

## 4. Mobile and interaction decisions

The workflow is task-oriented rather than a long administrative form:

`المستلم → اللفات → المراجعة → نتيجة الإرسال`

Implemented interaction rules include:

- Arabic-first labels and guidance;
- touch-sized actions;
- 16px mobile text inputs to avoid browser zoom behavior;
- phone-first one-column adaptation;
- sticky primary review/send action;
- safe-area-aware scanner/decision sheets;
- no desktop table as the field selection surface;
- no native browser confirm dialogs;
- explicit decision sheets for destructive local-selection changes;
- background scroll locking for modal task surfaces;
- no mobile bottom-navigation displacement for the new module;
- direct Transfer entry from the existing custody page and dashboard;
- scanner dependency dynamically loaded rather than added to the initial task bundle.

## 5. Verification coverage

Permanent database coverage in `scripts/verify-transfer-send-read-contracts.mjs` verifies:

- Admin-as-Company behavior;
- Agent/Dealer/Center sender scoping;
- no descendant custody inheritance;
- available/reserved Roll status;
- exact sender Roll search;
- hidden other-holder Roll identity;
- Lot count arithmetic;
- no holder/recipient/Transfer identity leakage from Lot summaries;
- safe Lot expansion;
- service-role denial;
- suspended actor denial/reactivation;
- Production void exclusion;
- bounded search/limit/offset validation.

Permanent client coverage in `scripts/verify-transfer-send-client-contract.mjs` verifies:

- Transfer ID normalization/validation;
- order-insensitive and duplicate-safe payload fingerprinting;
- recipient/selection changes produce a new fingerprint;
- same payload reuses the same request ID;
- changed payload receives a new request ID;
- success clears pending request state.

`Database Quality` and `PR Quality` were extended to include the Cube G contracts. Generated Supabase types and `package-lock.json` are synchronized from the real toolchain rather than hand-authored.

## 6. Review findings closed during implementation

Two implementation review passes identified and closed several realistic issues before merge:

- continuous scanning originally risked camera reinitialization after each React state update; callbacks are now held through stable refs so the camera session stays open;
- Lot listing originally risked aggregating unrelated generated inventory before sender filtering; it now identifies sender Lots first and aggregates only that bounded set;
- generated Supabase types exposed optional RPC arguments precisely and the client calls were aligned with those generated contracts;
- native browser confirmation was replaced with an application decision sheet;
- recipient verification and submit paths now handle interrupted connectivity explicitly;
- raw unexpected database error text is no longer passed through to the browser;
- progress-step markup was simplified to avoid duplicate visual stage numbers;
- modal/scanner background interaction is locked while the task surface is open.

## 7. Boundary preserved

Cube G does **not** implement:

- recipient pending-Transfer inbox;
- receipt acceptance UI;
- partial receipt;
- discrepancy resolution;
- `roll_custody_current` movement;
- new `roll_custody_events` entries;
- Transfer expiry;
- global recipient directory;
- Warranty/Activation/customer/VIN logic.

Those receipt/custody responsibilities remain Cube H.

## 8. Remaining merge gate

The repository CI must be green on the exact final PR head.

A rendered phone/device smoke check remains required before merge for the camera and final visual/touch experience. The current execution environment cannot clone the repository from GitHub to start a local browser session because outbound DNS resolution to `github.com` is unavailable; this is an environment limitation, not an application fallback. The PR therefore remains Draft until that final device/preview smoke gate is satisfied.
