# Cube G — Transfer Send UX Specification

**Date:** 2026-08-14  
**Status:** Implementation-ready draft; authoritative only after review/merge  
**Repository:** `delightfactory/protection-giants-platform`  
**Baseline reviewed:** `main` at `e9cd60902a148b2203b3e7e128e8e7108f4c5712`

## 1. Responsibility

Cube G owns one complete sender-facing job:

> Identify the exact recipient, identify the physical Rolls to send through an approved input mode, review the quantity, and create one valid pending Roll Transfer through the already-merged Cube F engine.

Cube G is intentionally a UI-bearing vertical slice. It may add the minimum sender-read contracts required by that UI, but it does not create a second Transfer engine and does not move confirmed custody.

The happy-path product flow is:

```text
Transfers
→ Enter / scan exact recipient Transfer ID
→ Verify recipient
→ Choose input mode
   ├─ Scan Rolls
   ├─ Select Rolls
   └─ Select Lot
→ Review selected quantity
→ Send
→ Pending Transfer confirmed
```

## 2. Authoritative dependencies

Cube G consumes these existing contracts unchanged:

- `public.resolve_transfer_recipient(text)` — exact active-recipient resolver;
- `public.create_roll_transfer(uuid, text, uuid[])` — authoritative pending Transfer mutation;
- `roll_custody_current` — confirmed current custody only;
- `roll_transfer_reservations` — authoritative active reservation projection, not directly browseable by ordinary clients;
- `lib/rolls/roll-qr.ts` — canonical contextual Roll QR builder/parser;
- `docs/mobile-native-interface-standard.md` — mandatory UI standard;
- PD-014, PD-022, PD-023, PD-024 and PD-031 in `docs/product-decisions.md`.

Final mutation validation remains in Cube F even when Cube G has already shown a Roll as available.

## 3. Explicit non-goals

Cube G does **not** implement:

- recipient inbox;
- recipient accept/reject UI;
- partial receipt;
- discrepancy resolution;
- confirmed custody movement;
- custody event append on receipt;
- transfer expiry/timers;
- transfer-purpose/type taxonomy;
- route restrictions derived from management hierarchy;
- global recipient search/directory;
- recent counterparties;
- Transfer history/reporting beyond the immediate success state;
- Warranty, Activation, Claims or customer/VIN logic;
- a generic scanner framework or generic inventory engine.

Those boundaries must not be weakened for convenience.

## 4. Route and entry contract

### 4.1 Transfer module landing

Add:

`/operations/transfers`

This is a real, small module landing surface, not a placeholder. In Cube G it contains:

- primary action: **إرسال تحويل جديد**;
- the current party's existing Transfer ID;
- a copy action for the Transfer ID;
- a QR representation of that same Transfer ID for another sender to scan;
- a concise explanation that the ID identifies the receiving operational entity and does not itself move custody.

The QR payload is exactly the normalized Transfer ID text, for example:

`PG-C-H7QF-3M9X-T5VK`

No public lookup URL, token, OTP or additional identity is introduced.

The QR is a rendering of the already-existing immutable `operational_parties.transfer_code`; Cube G never creates or rotates it.

### 4.2 Send task route

Add:

`/operations/transfers/new`

The send flow is task-oriented. On mobile, normal bottom navigation is hidden while this task route is active, consistent with the existing task-route navigation behavior.

### 4.3 Entry points

Add a functional Transfer module card to `/operations` for all active operational roles: Admin, Agent, Dealer and Center.

Add a secondary **تحويل لفات** action from `/operations/rolls` so the operator can move directly from custody review into the send task.

Do not displace the current five-item mobile primary navigation merely to add this workflow.

## 5. Sender identity

The acting sender is derived exclusively from the authenticated active Profile and its bound Operational Party.

- Admin acts as Company / Protection Giants.
- Agent acts as its Agent party.
- Dealer acts as its Dealer party.
- Center acts as its Center party.

The UI never offers an “act as” selector and never accepts sender party ID from browser input.

If Profile or entity lifecycle becomes inactive, sender-read RPCs return no usable inventory / an authorization error and Cube F remains the final mutation guard.

## 6. Step 1 — Exact recipient Transfer ID

### 6.1 Accepted entry

The recipient may be supplied by:

- manual/paste entry of the exact Transfer ID;
- camera scan of a QR whose decoded payload is the exact Transfer ID text.

Normalize with trim + uppercase before resolution.

The UI should format visually in grouped form but must not fuzzy-search or autocomplete operational entities.

### 6.2 Recipient scanner

The camera scanner is a Cube G-local client component.

Requirements:

- request camera permission only after explicit operator action;
- prefer the rear/environment camera when available;
- decode QR only;
- stop the camera immediately after a valid Transfer ID is captured or the user exits scanning;
- reject Roll QR URLs and unrelated QR payloads as “ليس Transfer ID صالحًا”;
- provide manual/paste entry as a full fallback when camera permission is denied, unavailable or decoding cannot start;
- do not make camera support a prerequisite for sending a Transfer.

No new generalized scanner subsystem is introduced. A small QR decoder dependency may be added only if required for reliable supported-phone coverage; the component contract remains local to this workflow.

### 6.3 Verification card

Call the existing exact resolver only after a syntactically valid ID is available.

Show only the existing minimum resolver response:

- entity display name;
- human-readable entity type;
- entity code when present;
- country when present;
- city for Center when present.

Do not expose internal `party_id`, Auth email, phone, network tree, users or unrelated metadata.

The user must explicitly confirm the recipient card before proceeding.

A recipient equal to the sender may be detected early for UX when possible, but Cube F remains authoritative and may return `PG_TRANSFER_SENDER_RECIPIENT_SAME`.

Invalid, unknown or suspended recipient IDs must not reveal whether a hidden entity exists. The user-facing response is one neutral “تعذر التحقق من Transfer ID” state.

## 7. Step 2 — Input mode selection

After recipient verification, present exactly three approved modes:

1. **Scan Rolls** — best for small/mixed physical movement.
2. **Select Rolls** — best for a known subset already in the sender's custody.
3. **Select Lot** — best for trusted bulk movement from one Lot.

The operator may switch modes without losing already-selected valid Rolls. Selection is one shared set keyed by `roll_id`.

A Roll may appear only once in that set regardless of how it was added.

Maximum selected physical Rolls is 10,000.

## 8. Sender inventory read contracts

The existing direct table policies are intentionally insufficient for a correct G UI because:

- reservations are not browseable;
- ordinary parties do not browse `production_lots`;
- the approved Lot UX needs total/held/available/elsewhere clarity.

Cube G therefore introduces **narrow read-only security-definer RPCs**. They derive the active sender from `auth.uid()` and never accept a sender party ID argument.

All functions are explicitly revoked from `public`, `anon` and `service_role`, then granted only to `authenticated` where required by the Data API path.

They expose no recipient or reservation-destination data.

### 8.1 `list_transfer_send_rolls`

Conceptual signature:

```text
list_transfer_send_rolls(
  p_search text default null,
  p_lot_id uuid default null,
  p_limit integer default 100,
  p_offset integer default 0
)
```

Return only generated-order Rolls currently in the caller sender party's confirmed custody.

Minimum row shape:

- `roll_id`
- `serial_number`
- `erp_serial`
- `lot_id`
- `lot_number`
- product code/name snapshot suitable for human identification
- `availability` = `available | reserved`

`reserved` means currently held by the sender but already reserved by another pending Transfer. It does not reveal which Transfer or recipient.

Search is bounded and intended for exact/prefix Serial, ERP Serial or Lot narrowing. It is not a global inventory search.

Limit is bounded to a small interactive page size for Select Rolls; bulk Lot expansion uses the separate contract below.

### 8.2 `list_transfer_send_lots`

Conceptual signature:

```text
list_transfer_send_lots(
  p_search text default null,
  p_limit integer default 100,
  p_offset integer default 0
)
```

Return only Lots for which the caller currently holds at least one physical Roll under a generated Production Order.

Minimum row shape:

- `lot_id`
- `lot_number`
- product code/name snapshot
- `total_count`
- `held_count`
- `available_count`
- `reserved_count`
- `elsewhere_count`

Definitions:

- `total_count` = all physical Rolls originally generated in that Lot;
- `held_count` = Rolls whose confirmed current custodian is the sender;
- `reserved_count` = held Rolls with an active Cube F reservation;
- `available_count` = held Rolls not actively reserved;
- `elsewhere_count` = total physical Rolls whose confirmed current custodian is not the sender.

The arithmetic shown to the operator must remain understandable. A held-but-reserved Roll is not classified as “elsewhere”.

No holder identity for `elsewhere_count` is exposed.

### 8.3 `expand_transfer_send_lot`

Conceptual signature:

```text
expand_transfer_send_lot(p_lot_id uuid)
```

Return a bounded result containing:

- the same Lot summary counts used for confirmation;
- the UUIDs of the Rolls that are **currently available** to this sender for inclusion.

Maximum array size is 10,000, matching the Production/Transfer contract.

This is a preview/selection helper, not a reservation mutation. A race after expansion is allowed to fail safely at `create_roll_transfer`.

## 9. Mode A — Scan Rolls

### 9.1 QR identity

Use the existing contextual Roll QR.

The scanner must pass the decoded payload through:

`parseRollQrPayload(payload, expectedPublicSiteOrigin)`

Only the resulting canonical Roll serial is used for lookup.

Do not accept arbitrary serial text extracted from unrelated URLs and do not create a second Roll QR format.

### 9.2 Scan result behavior

For each valid Roll QR:

- exact-match the canonical serial through the sender-read contract;
- if available, add it once and give immediate positive feedback;
- if already selected, do not duplicate it and show a light “مضاف بالفعل” response;
- if reserved, do not add it and explain “محجوز في تحويل آخر”;
- if not in sender custody / voided / otherwise not eligible, do not reveal another custodian; show “هذه اللفة غير متاحة للتحويل من عهدتك الحالية”;
- keep the scanner ready for the next Roll after recoverable outcomes.

The selected count stays visible during scanning.

Manual Serial entry is available in the same mode as a fallback for damaged QR/camera problems. The same exact eligibility path is used.

## 10. Mode B — Select Rolls

Present a mobile-friendly searchable list/cards, not a wide table.

Each row/card shows only the fields required to identify the physical Roll:

- Roll serial;
- product;
- Lot number;
- optional ERP Serial as secondary text;
- availability chip.

Available rows have a touch-sized select control. Reserved rows are visible but disabled and clearly labeled.

Selection persists while searching/paging within the task.

Provide:

- selected count;
- “عرض المحدد” summary surface;
- remove one selected Roll;
- clear selection with explicit confirmation when non-empty.

Do not load/render thousands of rows at once.

## 11. Mode C — Select Lot

### 11.1 Lot card

Each Lot card shows:

- Lot number;
- product;
- total physical Rolls;
- currently held by this sender;
- available to this Transfer;
- reserved in another pending Transfer, when non-zero;
- elsewhere, when non-zero.

### 11.2 Full Lot

If:

`available_count = total_count`

then the action may say:

**اختيار الـLot بالكامل — X لفة**

### 11.3 Partial Lot

If only part of the Lot is available, the UI must not describe the operation as a full-Lot transfer.

Example:

```text
500 إجمالي
480 متاحة للتحويل
15 لدى جهات أخرى
5 محجوزة في تحويلات معلقة
```

The action is explicitly:

**اختيار 480 لفة المتاحة**

and requires confirmation before expansion/addition.

This preserves PD-014: one trusted Lot action may select many Rolls, but the resulting Transfer still records every physical Roll as an individual item.

### 11.4 No available Rolls

A Lot with `available_count = 0` may be shown when it has sender-held Rolls that are reserved, but its select action is disabled with a useful explanation.

## 12. Shared selection rules

The selected set is client/task state only; Cube G does not create a server-side Transfer draft table.

Rules:

- unique by `roll_id`;
- 1..10,000 at final submit;
- switching modes preserves selected Rolls;
- adding a Lot merges its currently available IDs into the same set without duplication;
- selected count is always derived from the unique set;
- the review screen does not render 10,000 detailed cards; it uses grouped/count summaries and allows a bounded drill-down/removal surface;
- changing recipient does not silently retain a ready-to-send review without warning. If a non-empty selection exists, recipient change requires confirmation because the business destination changed.

No availability preview is treated as a reservation. Only Cube F creation reserves.

## 13. Step 3 — Review and confirmation

Before final submission show:

- verified recipient card;
- total selected Roll count;
- compact breakdown by Product/Lot where useful;
- a clear statement: “سيتم حجز هذه اللفات للتحويل، وتظل العهدة المؤكدة لدى المرسل حتى الاستلام.”

Primary action:

**إرسال التحويل**

Use a sticky/bottom action area on phone where appropriate without covering content or safe-area insets.

The destructive/reversible distinction must remain clear: sending creates a pending reservation; it is not receipt and not immediate custody transfer.

## 14. Idempotency and interrupted submission

Cube F already makes `p_request_id` authoritative. Cube G must preserve that contract through browser/network retries.

### 14.1 Request key lifecycle

At final-review readiness, derive a deterministic client payload fingerprint from:

- normalized recipient Transfer ID;
- sorted unique Roll IDs.

Maintain a session-scoped record:

```text
{ payloadFingerprint, requestId }
```

Rules:

- same payload in the same browser tab/session reuses the same `requestId` across retry/reload;
- changed recipient or Roll set generates a new `requestId`;
- successful confirmed creation clears the pending send key;
- do not use a request ID from one payload for another payload.

`sessionStorage` is sufficient; Cube G does not introduce persisted server drafts.

### 14.2 Submission path

A server action/service boundary receives only:

- request ID;
- normalized recipient Transfer ID;
- unique Roll IDs.

It calls the existing authenticated Supabase RPC:

`create_roll_transfer(...)`

No `service_role` mutation path is used.

Disable repeated primary-action taps while one request is in flight, but correctness must never depend on that UI lock.

### 14.3 Lost response

If the network response is lost after the database commits, retrying the same payload with the same request ID must resolve to the same Transfer ID through Cube F idempotency.

The UI then displays the normal success state rather than creating a duplicate Transfer.

## 15. Error mapping and stale-preview behavior

Map stable Cube F errors into concise Arabic task feedback while preserving current selections whenever safe.

Required mappings include at least:

- recipient invalid/not found/inactive → re-verify recipient;
- sender/recipient same → recipient error;
- Roll not found/not held → selection stale; identify that one or more selected Rolls are no longer available;
- Roll reserved → selection stale; tell the user another pending Transfer reserved one or more Rolls;
- Production Order voided → selected Roll became ineligible;
- actor inactive → access/lifecycle failure;
- request payload conflict → rotate only when the local payload/request binding is proven inconsistent; never silently create another Transfer after an uncertain response;
- Roll count invalid → selection count correction;
- generic unexpected failure → retryable error without discarding the task state.

After an availability/concurrency failure, provide an explicit **إعادة فحص المحدد** action that refreshes eligibility and removes nothing silently. The operator decides whether to drop unavailable items and retry.

Do not reveal the current holder or reservation destination for a Roll that is no longer available.

## 16. Success state

After `create_roll_transfer` returns a Transfer ID, read the participant-visible Transfer header and show a completed send confirmation containing:

- Transfer number;
- verified recipient display name;
- Roll count;
- status: **بانتظار الاستلام** (`pending`);
- message that confirmed custody has not moved yet.

Provide functional actions only:

- **إرسال تحويل آخر**;
- **العودة للتحويلات**;
- **العودة للعهدة**.

Do not add receipt, cancellation, rejection or discrepancy controls in Cube G merely because backend functions exist; those operational controls belong to the later lifecycle surface defined by Cube H.

## 17. Mobile interaction contract

Cube G must satisfy `docs/mobile-native-interface-standard.md` in full.

Phone-specific requirements:

- one-column task flow by default;
- touch targets at least 44×44 CSS px, approximately 48px for primary controls;
- camera actions reachable one-handed;
- no horizontal page scrolling;
- input keyboard must not cover the active confirmation CTA;
- scanner view has a clear close/back action;
- camera permission/loading/denied/unsupported states are explicit;
- selected count remains visible without crowding scan content;
- long Serial/Transfer IDs wrap or truncate safely while remaining copyable;
- review/send CTA respects safe area;
- loading, empty, validation, retry and success states are intentionally designed;
- tablet/desktop may widen composition but must preserve the same workflow and rules.

A real phone-width smoke check is mandatory before merge.

## 18. Security and privacy contract

Cube G is incomplete unless all are true:

- exact Transfer ID is the only cross-network recipient resolution path;
- no fuzzy/global recipient directory exists;
- sender-read RPCs derive sender from the authenticated Profile and cannot browse another sender by argument;
- sender-read RPCs return only sender-held generated-order Rolls / summaries necessary for the task;
- reservation information is reduced to availability only; no reservation destination/participant details leak;
- another custodian is represented only as an aggregate `elsewhere_count` for an affected Lot;
- client-provided Roll IDs are never trusted for authorization;
- final Cube F mutation revalidates custody/reservation/lifecycle/Production state atomically;
- no service-role key or privileged client is exposed to the browser;
- Transfer ID QR remains an identifier, not an authentication credential;
- Roll QR remains an identifier, not authorization.

## 19. Performance boundaries

- interactive Roll/Lot lists are paginated/bounded;
- no initial load of all 10,000 Rolls;
- scanner performs exact one-Roll resolution per accepted scan rather than reloading the inventory list;
- Lot expansion may return up to 10,000 UUIDs because 10,000 is the approved upper bound and final Transfer payload already supports that boundary;
- review uses counts/grouping rather than rendering every bulk item;
- avoid N+1 recipient/product/lot lookups;
- sender-read RPCs need indexes/query plans compatible with current custody/reservation indexes and the 10,000-Roll boundary.

## 20. Required verification

### 20.1 Read-contract/database tests

Verify:

- Admin is treated as Company sender;
- Agent/Dealer/Center read only their own sender inventory;
- inactive Profile/entity cannot obtain usable send inventory;
- reservations are surfaced only as `reserved`/counts, never Transfer destination details;
- Lot total/held/available/reserved/elsewhere math is correct;
- full Lot and partial Lot expansion return only currently available caller-held generated Rolls;
- voided Production Order Rolls are not transferable;
- 10,000 available Roll expansion succeeds within the supported boundary;
- no sender-read RPC can be abused with another party ID because no such input exists;
- Data API grants are explicit and narrow.

### 20.2 UI/domain tests

Verify:

- Transfer ID normalization/validation;
- invalid/unknown/suspended recipient neutral feedback;
- Roll QR parsing reuses canonical parser;
- unrelated QR payload rejected;
- duplicate scan does not duplicate selection;
- reserved/not-held/voided scans do not enter selection;
- mode switching preserves unique selection;
- Select Rolls paging/search does not lose selected IDs;
- partial Lot wording never says “full Lot”;
- selected count max is 10,000;
- request fingerprint is order-insensitive for Roll IDs;
- same payload retry reuses request ID;
- payload change rotates request ID;
- success clears session request binding;
- stable Cube F errors map to correct recoverable UI state.

### 20.3 Integrated lifecycle tests

Verify through the real Cube F RPC:

- Scan Rolls selection creates one pending Transfer;
- Select Rolls selection creates one pending Transfer;
- Select Lot expands to individual immutable Transfer items;
- mixed Products/Lots remain valid where Rolls are eligible;
- sender custody does not move after send;
- active reservations exist after send;
- double-submit/network retry does not create duplicate Transfer;
- a reservation/custody/void race between preview and submit fails safely through Cube F;
- existing Cube F core/race/lifecycle/10k verification remains green.

### 20.4 Mobile smoke

At minimum check a phone viewport for:

- manual recipient entry;
- recipient QR camera path;
- Roll camera path;
- camera permission denied fallback;
- Select Rolls;
- partial Select Lot confirmation;
- review/send;
- error retry preserving task state;
- success state;
- no horizontal overflow and no CTA obscured by mobile browser/keyboard/safe area.

## 21. Definition of Done

Cube G is Done only when all applicable points are true:

1. active Admin/Agent/Dealer/Center can open the Transfer module and see/share their existing Transfer ID;
2. sender can identify an active recipient by exact typed or scanned Transfer ID and verify the minimum recipient card;
3. Scan Rolls works with the existing contextual Roll QR plus manual fallback;
4. Select Rolls works against the sender's own current custody and visibly handles reservations;
5. Select Lot supports both full and partial availability and expands only available physical Rolls into individual IDs;
6. selection remains unique and bounded to 10,000;
7. review clearly explains reservation vs confirmed custody;
8. final send uses the existing Cube F `create_roll_transfer` RPC without bypasses;
9. duplicate/interrupted submission retries are idempotent through a preserved request ID;
10. stale preview/concurrency failures are recoverable without silent data loss;
11. success shows the real Transfer number/count/pending state;
12. no receipt/custody-change UI or logic leaks in from Cube H;
13. security/privacy checks pass;
14. Database Quality, typecheck and production build pass;
15. phone-focused smoke check passes;
16. affected existing Roll/Cube F regression checks remain green;
17. documentation reflects the final implementation with no dead controls or placeholder surfaces.

## 22. Implementation sequence

To keep the cube small and reviewable, implement in this order on a fresh branch from the then-current merged `main`:

1. narrow sender inventory read RPCs + tests;
2. Transfer module landing + own Transfer ID/QR read-only card;
3. recipient entry/scan + verification card;
4. shared selection state + Select Rolls;
5. Scan Rolls using the existing Roll QR parser;
6. Select Lot summary/expansion;
7. review + idempotent send service/action + error mapping;
8. success state;
9. integrated/database/mobile regression verification;
10. two review passes before merge.

Do not stack Cube H on the same branch.