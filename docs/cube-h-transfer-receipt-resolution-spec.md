# Cube H — Transfer Receipt, Partial Receipt & Resolution Specification

**Date:** 2026-08-15  
**Status:** Proposed specification for review before implementation  
**Repository:** `delightfactory/protection-giants-platform`  
**Baseline:** stacked on Cube G final software head `c26923baaba445535ff0322a01917135ca98b9d8`

## 1. Purpose

Cube H closes the physical Roll Transfer lifecycle started by Cubes F and G.

Its responsibility is deliberately bounded:

> give the intended recipient a field-ready incoming Transfer experience, confirm the Rolls physically received, move confirmed custody only for those Rolls, keep any unreceived Rolls reserved with the sender as confirmed custodian, and provide the smallest explicit resolution path needed to close unresolved items safely.

Cube H is the first cube allowed to change confirmed Roll custody after Production.

It must complete the business flow without becoming a shipping, carrier, dispute-management, accounting, notification, or generic workflow subsystem.

---

## 2. Existing approved authority — not new Cube H invention

The following rules already exist in approved project sources and are treated as fixed inputs to this specification.

### H-A01 — recipient acceptance is mandatory

Creating a Transfer reserves Rolls but does not move confirmed custody. Recipient acceptance is required before custody changes.

### H-A02 — partial receipt is required

If only part of a Transfer is physically received:

- confirmed received Rolls move custody individually;
- unreceived Rolls do not move custody;
- unresolved Rolls remain reserved;
- sender remains their confirmed current custodian;
- the system must never silently mark the whole Transfer received.

### H-A03 — scanning is a verification method, not an absolute per-Roll mandate

Small or mixed movements benefit from QR scanning. Trusted bulk movements may be confirmed in grouped/bulk form, including Lot-oriented receipt, while each physical Roll remains represented and transitioned individually in the database.

### H-A04 — pre-receipt terminal actions already exist

Before any receipt:

- sender cancellation releases all reservations;
- recipient rejection releases all reservations;
- audited Admin recovery cancellation may resolve a stuck pending Transfer under the existing Cube F recovery condition.

Cube H must harden these paths so none can invalidate already-confirmed receipt.

### H-A05 — Transfer membership is immutable

The physical Roll set selected when the Transfer was created remains historical evidence. Receipt must not edit or delete `roll_transfer_items` membership.

### H-A06 — custody is one confirmed party per Roll

`roll_custody_current` remains the authoritative one-row-per-Roll current confirmed custody projection.

### H-A07 — custody history is append-only

Every confirmed custody change must append the next immutable `roll_custody_events` event for that Roll.

### H-A08 — no automatic Transfer expiry

Pending or partially received Transfers do not auto-expire in the first release.

---

## 3. Cube H proposed first-release decisions

These decisions are introduced by this specification and should be treated as proposed until this document is approved.

### H-P01 — receipt state is monotonic per Transfer item

Cube H introduces a separate per-item current-state projection instead of making the immutable `roll_transfer_items` membership mutable.

Each Transfer item is exactly one of:

- `pending` — reserved, not yet confirmed received, sender still confirmed custodian;
- `received` — recipient confirmed physical receipt, reservation removed, recipient is confirmed custodian;
- `released_to_sender` — after partial receipt, the unresolved Roll was explicitly confirmed as remaining/returned with the sender; reservation removed and confirmed custody remains sender.

An item transitions only once from `pending` to one terminal item state.

There is no reversal of a confirmed receipt inside Cube H.

### H-P02 — Transfer header receives two open/terminal receipt states

The Transfer status vocabulary becomes:

- `pending`
- `partially_received`
- `received`
- `partially_completed`
- `cancelled`
- `rejected`

Meaning:

- `pending` — no Roll has been received yet; all original reservations remain unless the Transfer is terminally cancelled/rejected;
- `partially_received` — at least one Roll is received and at least one Roll is still unresolved/reserved;
- `received` — every Transfer item was received by the recipient; terminal;
- `partially_completed` — at least one Roll was received, and every remaining unresolved item was explicitly released back to sender custody; terminal;
- `cancelled` / `rejected` retain their Cube F pre-receipt meaning.

`closed_at` stays null only for `pending` and `partially_received`.

### H-P03 — partial receipt does not require the recipient to invent a discrepancy reason

The recipient confirms only what physically arrived.

If 19 of 20 Rolls are present, the operator confirms the 19. The twentieth remains `pending` and reserved automatically.

The system does not force the recipient to classify an unreceived Roll as lost, damaged, returned, or never shipped when the physical truth may not yet be known.

### H-P04 — first-release unresolved-item resolution has only two legitimate outcomes

For an unresolved reserved Roll after partial receipt:

1. **Recipient later receives it** → normal receipt transition to `received` and custody moves.
2. **Sender or Admin explicitly confirms that it remains/has returned with the sender** → item becomes `released_to_sender`, reservation releases, custody remains sender.

Cube H does not invent a `lost`, `carrier`, `damaged-in-transit`, or unknown third-party custodian state.

If neither legitimate physical outcome is known, the item remains unresolved and reserved.

### H-P05 — sender resolution requires explicit reason

A sender may release one or more still-pending items to sender custody only after the Transfer is already `partially_received`.

The action requires a concise reason (5–500 trimmed characters) confirming the operational basis for keeping/releasing those Rolls with the sender.

It cannot touch a received item.

### H-P06 — Admin unresolved-item resolution is support authority, not impersonation

An active Protection Giants Admin may perform the same `released_to_sender` resolution on still-pending items after partial receipt with a mandatory reason.

Admin records no acting business party for this support action and does not impersonate sender or recipient.

This action never moves custody; it only releases an unresolved reservation while sender custody remains authoritative.

### H-P07 — extra physical Rolls are rejected from this receipt, not silently absorbed

If the recipient scans a Roll that is not an unresolved item of this Transfer:

- do not add it;
- do not move custody;
- explain that the Roll is not part of this Transfer;
- require the physical/business mismatch to be handled outside this receipt, usually by correcting the sending process or creating the proper Transfer.

Cube H does not create an ad-hoc “extra Roll” Transfer or discrepancy ledger automatically.

### H-P08 — bulk receipt is grouped by real Transfer/Lot membership

For large movements, recipient may confirm a Lot group in one deliberate action.

The system still expands the action into individual Roll IDs and performs individual item/custody transitions atomically.

The UI must distinguish:

- complete Production Lot represented in this Transfer;
- partial Production Lot represented in this Transfer;
- already received vs still pending quantities.

A partial Lot must never be presented as a full-Lot receipt.

### H-P09 — field progress survives recoverable interruption locally

The receipt UI may preserve the operator's locally verified-but-not-yet-submitted Roll selection in bounded `sessionStorage`, keyed to the Transfer and current action.

This is only field continuity. It is not a server draft subsystem.

On restore, server state is reloaded and stale/already-received items are reconciled before confirmation.

---

## 4. Scope

### 4.1 Cube H owns

- recipient incoming Transfer inbox;
- sender outgoing Transfer status/history needed to follow receipt;
- Transfer detail/timeline for sender, recipient, and Admin according to existing visibility;
- full receipt;
- partial receipt;
- repeated later receipt of remaining unresolved Rolls;
- scan-assisted receipt verification;
- expected-Roll list selection;
- Lot-group receipt confirmation;
- sender cancellation before any receipt;
- recipient whole-Transfer rejection before any receipt;
- first-release unresolved-item release-to-sender resolution;
- Admin unresolved-item support resolution;
- Admin access to the existing Cube F suspended-party recovery cancellation where still valid;
- atomic confirmed custody movement;
- immutable custody event append;
- Transfer/item receipt state;
- mobile interruption/retry behavior;
- realistic incoming/outgoing Transfer module experience;
- end-of-stage F+G+H local/browser/device verification preparation.

### 4.2 Cube H does not own

- carrier/shipping tracking;
- delivery addresses;
- courier labels;
- proof-of-delivery photos/signatures;
- invoices/accounting/payments;
- generic dispute cases;
- damage/loss claims;
- automatic expiry/SLA reminders;
- notification engine or push infrastructure;
- Roll Opening;
- Warranty Activation;
- Warranty/Claim data;
- generic inventory adjustments;
- arbitrary custody correction;
- changing Transfer recipient or membership after creation;
- global entity directory;
- new physical Roll identity.

---

## 5. Data model

Cube H extends the existing four Cube F Transfer structures without replacing them.

### 5.1 Preserve existing structures

Keep:

- `roll_transfers` — Transfer identity/header;
- `roll_transfer_items` — immutable membership;
- `roll_transfer_reservations` — currently unresolved active reservation;
- `roll_transfer_events` — immutable Transfer timeline.

### 5.2 New `roll_transfer_item_states`

Purpose: one narrow current receipt/resolution state per immutable Transfer item.

Proposed fields:

- `transfer_id uuid not null`
- `roll_id uuid not null`
- `status text not null` — `pending | received | released_to_sender`
- `action_request_id uuid null`
- `acted_by_profile_id uuid null`
- `acted_by_party_id uuid null`
- `acted_at timestamptz null`
- `resolution_reason text null`
- `created_at timestamptz not null default now()`

Primary key:

`(transfer_id, roll_id)`

Composite FK:

`(transfer_id, roll_id) -> roll_transfer_items(transfer_id, roll_id)`

Shape constraints:

- `pending` → all action/audit fields null;
- `received` → request/profile/recipient-party/time present, reason null;
- `released_to_sender` → request/profile/time/reason present; party is sender for ordinary sender action and null for Admin support action.

The row is not user-editable directly. Only receipt/resolution RPCs may perform the one terminal transition.

### 5.3 State initialization

On Cube H migration:

- backfill one `pending` item-state row for every existing Transfer item whose Transfer remains eligible/open;
- also backfill historical Cube F cancelled/rejected Transfer items as a terminal legacy representation only if needed for referential completeness, without creating active receipt eligibility.

For future Transfers, use a narrow database-owned initialization trigger on `roll_transfer_items` inserts to create the matching `pending` state row.

Do not rewrite the large Cube F `create_roll_transfer` RPC merely to initialize this projection.

### 5.4 Extend `roll_transfers.status`

Replace the Cube F status constraint and header transition trigger with the Cube H vocabulary and transition rules.

Allowed header transitions:

| From | Action | To |
|---|---|---|
| pending | sender cancel | cancelled |
| pending | recipient reject | rejected |
| pending | first receipt of subset | partially_received |
| pending | receipt of all | received |
| pending | eligible Admin recovery cancel | cancelled |
| partially_received | receive additional subset, some remain | partially_received |
| partially_received | receive all remaining | received |
| partially_received | resolve some remaining, some still pending | partially_received |
| partially_received | resolve all remaining to sender | partially_completed |

No `partially_received -> cancelled/rejected` transition exists.

### 5.5 Extend `roll_transfer_events`

Add only fields needed for deterministic receipt audit:

- `action_request_id uuid null`
- `affected_roll_count integer null check (affected_roll_count > 0)`

Add event types:

- `received`
- `unresolved_released`
- `administrative_unresolved_released`

Existing types remain:

- `created`
- `cancelled`
- `rejected`
- `administrative_cancelled`

Proposed event shape:

- `received` — actor recipient party, no reason, request ID + count required;
- `unresolved_released` — actor sender party, reason + request ID + count required;
- `administrative_unresolved_released` — Admin profile, `actor_party_id = null`, reason + request ID + count required.

A partial unique index on `(transfer_id, action_request_id)` where request ID is not null provides one event identity per submitted receipt/resolution action.

### 5.6 Link confirmed custody history to the originating Transfer

Add nullable:

- `roll_custody_events.transfer_id uuid references roll_transfers(id) on delete restrict`

Historical initial Company custody events remain null.

Every Cube H confirmed receipt event must set this Transfer ID.

No generic custody-source enum is introduced.

This gives direct audit evidence:

`Roll -> custody event -> Transfer -> sender/recipient/receipt timeline`.

---

## 6. Receipt mutation contract

Introduce one recipient mutation:

`receive_roll_transfer_items(p_request_id uuid, p_transfer_id uuid, p_roll_ids uuid[]) returns uuid`

The same RPC supports full receipt and partial receipt.

### 6.1 Input boundaries

- request ID required UUID;
- Transfer ID required;
- 1..10,000 Roll IDs;
- no null IDs;
- no duplicate IDs;
- every Roll must be immutable membership of that Transfer;
- every selected item must still be `pending` unless this is an exact idempotent retry.

### 6.2 Actor

- caller must be authenticated and operationally active;
- caller's acting party must equal `recipient_party_id`;
- Admin does not receive arbitrary recipient impersonation authority;
- Company may receive as recipient only through active Admin acting as the singleton Company party under existing Transfer rules.

### 6.3 Transactional sequence

Inside one transaction:

1. validate basic input;
2. authenticate caller;
3. lock/revalidate caller Profile/entity and derive acting party using the Cube F lifecycle-lock pattern;
4. acquire advisory transaction lock for `p_request_id`;
5. lock Transfer header `FOR UPDATE`;
6. require actor = recipient;
7. allow only `pending` or `partially_received` current state;
8. if request ID already exists, verify exact actor + Transfer + Roll-set equivalence and return idempotently or reject conflict;
9. validate every Roll is immutable Transfer membership;
10. lock selected item-state rows in deterministic Roll-ID order;
11. lock selected reservation rows and require each reservation belongs to this Transfer;
12. lock selected `roll_custody_current` rows in deterministic order;
13. require current confirmed custodian still equals original sender for every selected pending item;
14. require Production Order remains operationally valid under downstream rules;
15. update selected item states to `received` with request/actor/time;
16. update selected `roll_custody_current` rows to recipient with one shared transaction confirmation timestamp;
17. append one next-sequence `roll_custody_events` row per selected Roll, linked to this Transfer;
18. delete only selected Roll reservations;
19. recompute Transfer item-state counts;
20. set header to `received` if no pending/released items remain and every item is received; otherwise `partially_received`;
21. append one immutable `received` Transfer event with affected count;
22. commit.

No selected Roll may move without all selected Rolls in that request satisfying the atomic contract.

### 6.4 Set-based requirement

10,000-Roll receipt must not perform one browser/database round trip per Roll.

Validation, state update, custody update, custody-event append, reservation deletion and counts must be set-based inside the database transaction.

---

## 7. Receipt idempotency and network ambiguity

Field connectivity makes response-loss a normal failure mode, not an edge curiosity.

### 7.1 Request identity

Every final receipt submission gets a client-generated UUID request ID bound to:

- action type = receipt;
- Transfer ID;
- normalized unordered Roll ID set.

### 7.2 Matching retry

Same request ID + same recipient actor + same Transfer + exact same Roll set:

- returns the already-committed result;
- creates no duplicate custody events;
- creates no duplicate Transfer event;
- does not fail merely because those items are now already `received`.

### 7.3 Conflict

Same request ID with different Transfer, actor, action or Roll set fails with stable conflict error.

### 7.4 Client continuity

The browser retains the request ID for an ambiguous in-flight submission until success is confirmed or the operator materially changes the payload.

A changed Roll selection creates a new request ID.

---

## 8. Unresolved-item release-to-sender contract

### 8.1 Sender action

Introduce:

`release_unreceived_roll_transfer_items(p_request_id uuid, p_transfer_id uuid, p_roll_ids uuid[], p_reason text) returns uuid`

Rules:

- actor must be original sender party;
- Transfer must be `partially_received`;
- selected items must still be `pending`;
- selected reservations must still belong to this Transfer;
- confirmed current custodian must still be sender for selected Rolls;
- reason 5–500 trimmed chars;
- item becomes `released_to_sender`;
- reservation is deleted;
- no custody-current update;
- no custody event append because confirmed custodian did not change;
- append `unresolved_released` Transfer event;
- if no pending items remain, header becomes `partially_completed`; otherwise it stays `partially_received`.

### 8.2 Admin support action

Introduce:

`admin_release_unreceived_roll_transfer_items(p_request_id uuid, p_transfer_id uuid, p_roll_ids uuid[], p_reason text) returns uuid`

Rules are identical to sender resolution except:

- actor must be active Admin;
- `actor_party_id = null` in audit;
- event type = `administrative_unresolved_released`;
- reason mandatory;
- no party impersonation;
- no custody movement.

### 8.3 What this action asserts

This action explicitly asserts that the platform should continue to treat the sender as confirmed custodian of the selected unresolved Roll(s).

It must not be used merely to make a stuck status disappear when physical location is still genuinely unknown.

---

## 9. Pre-receipt cancellation, rejection and Admin recovery hardening

The existing Cube F RPCs remain the authority for their original actions, but Cube H schema changes must guarantee:

- sender cancellation only while status = `pending` and no item is received;
- recipient rejection only while status = `pending` and no item is received;
- suspended-party Admin recovery cancellation only while status = `pending` and no item is received;
- all three actions fail after the first successful receipt commit;
- races with first receipt serialize on the Transfer header so only one valid outcome commits.

No “cancel remaining items” shortcut is introduced after partial receipt. Remaining items use explicit resolution.

---

## 10. Production Order void hardening after real custody movement

Cube F blocks Production Order void while an active reservation exists.

Cube H introduces a stronger downstream invariant:

> once any Roll from a Production Order has a confirmed custody history event beyond the initial Company custody event, that Production Order cannot be voided.

Implementation can enforce this by extending the existing Production void guard to reject if any Roll under the order has a custody event with `custody_sequence > 1`.

Reason:

- receipt means the Production record has entered real external physical distribution history;
- later return to Company does not erase that history;
- voiding Production after confirmed movement would invalidate traceability.

This is a narrow strengthening of the existing void guard, not a Production redesign.

---

## 11. Read/query contracts

H requires read projections because the recipient does not yet own pending Rolls and therefore cannot rely on current-custodian Roll RLS to render incoming shipment detail.

### 11.1 `list_roll_transfers(...)`

A narrow paginated Transfer list projection supporting:

- incoming for caller's party;
- outgoing for caller's party;
- active/action-needed filters;
- history filters;
- exact Transfer-number search;
- Admin optional all-Transfer audit scope.

Return only operationally useful summary fields:

- Transfer UUID;
- Transfer number;
- status;
- created/closed timestamps;
- sender/recipient minimal identity;
- total Roll count;
- received count;
- pending count;
- released-to-sender count.

No private user contact or hierarchy data.

### 11.2 `get_roll_transfer_detail(p_transfer_id)`

Return one authorized Transfer detail projection:

- immutable Transfer identity;
- minimal sender and recipient identity;
- total/received/pending/released counts;
- Lot-group summaries;
- action availability booleans derived from server state;
- timeline summary.

Caller must be sender, recipient, or active Admin.

### 11.3 `list_roll_transfer_items(...)`

Paginated item projection for an authorized Transfer:

- Roll ID;
- canonical serial;
- ERP serial;
- Product code/name;
- Lot ID/number;
- item receipt state;
- acted-at timestamp where relevant.

Supports safe exact/prefix serial search and status filter.

### 11.4 `expand_roll_transfer_receipt_lot(p_transfer_id, p_lot_id)`

Returns the currently pending item IDs in that Transfer/Lot plus honest counts:

- Production Lot total;
- items from this Lot originally in Transfer;
- already received;
- still pending;
- released-to-sender;
- `transfer_contains_full_lot` boolean.

This is a read helper only. Final receipt mutation revalidates every item.

### 11.5 Privacy

Read RPCs must not reveal:

- other Transfers involving the same Roll;
- unrelated custodians;
- global Operational Party directory;
- Auth emails/phones;
- internal reservation details outside the authorized Transfer;
- Admin-only resolution reasons to ordinary parties unless later explicitly approved.

---

## 12. Transfer module information architecture

Cube G created the first real Transfer landing and sender flow. Cube H completes that module instead of creating a second receipt area.

### 12.1 `/operations/transfers`

Phone-first landing becomes the operational Transfer hub.

Core surfaces:

- compact current-party Transfer ID share card;
- prominent incoming action-needed count;
- segmented/tabs for `الواردة` and `الصادرة`;
- clear statuses and quantities;
- history accessible without competing with pending work;
- Admin-only access to all-Transfer support/audit scope when required.

Do not add a new primary mobile bottom-nav item merely for H if the existing Transfer module entry already works from Operations.

### 12.2 Incoming card

Prioritize:

- sender name/type;
- Transfer number;
- created time/date;
- total Roll count;
- received/remaining count for partial transfers;
- status;
- one obvious task CTA: `مراجعة واستلام` or `استكمال الاستلام`.

Do not display every serial in the inbox.

### 12.3 Outgoing card

Prioritize:

- recipient;
- Transfer number;
- total/received/remaining;
- current state;
- attention state if partially received/unresolved.

Valid sender cancellation or unresolved-resolution actions belong in Transfer detail, not crowded directly into every list card.

---

## 13. Transfer detail UX

Route:

`/operations/transfers/[transferId]`

The same detail adapts to caller relationship.

### 13.1 Common header

- Transfer number;
- status chip;
- counterparty minimal card;
- creation date/time;
- quantity summary;
- grouped Product/Lot summary.

### 13.2 Recipient view

When `pending`:

- primary: `بدء الاستلام`;
- secondary/destructive: `رفض التحويل` with explicit confirmation sheet.

When `partially_received`:

- primary: `استكمال الاستلام`;
- clear remaining count;
- no whole-transfer rejection.

### 13.3 Sender view

When `pending`:

- status clearly says recipient has not confirmed receipt;
- sender may cancel through explicit confirmation.

When `partially_received`:

- show how many moved to recipient and how many remain reserved with sender;
- allow explicit unresolved-item resolution only from the remaining subset;
- no whole-transfer cancellation.

### 13.4 Admin view

Admin sees the complete audit-safe detail and only the support actions whose database preconditions are actually satisfied:

- Cube F suspended-party pending recovery cancellation;
- Cube H unresolved release-to-sender after partial receipt.

Admin UI must not expose “act as sender” or “act as recipient”.

---

## 14. Recipient field receipt flow

Route:

`/operations/transfers/[transferId]/receive`

This is a focused task surface, not a generic form.

### 14.1 Stage 1 — physical verification

Persistent context:

- sender;
- Transfer number;
- expected total;
- already received;
- still pending;
- selected/verified now.

Input modes:

1. `مسح اللفات` — continuous QR scanner;
2. `اختيار من المتوقع` — searchable expected-item list;
3. `تأكيد مجموعة Lot` — bulk group confirmation.

All three modes operate on one shared selected Roll set.

Switching mode must not discard verified selection.

### 14.2 Continuous scan behavior

Reuse the proven Cube G scanner foundation rather than creating a second scanner framework.

For each scan:

- valid pending Transfer item → add once, positive feedback, scanner remains open;
- already selected → no duplicate, neutral/warning feedback;
- already received → explain already confirmed;
- released-to-sender → explain no longer receivable in this Transfer;
- valid Roll but not part of Transfer → explicit mismatch error, no action;
- invalid/wrong QR → validation message;
- camera denied/unsupported → image + manual serial fallback.

Camera session should not restart after every successful scan.

### 14.3 Expected-item list

Mobile cards, not a wide table.

Each row shows only:

- Product;
- Roll serial;
- Lot;
- state.

Pending rows are selectable. Received/released rows are read-only state evidence.

Search and pagination preserve the shared selected set.

### 14.4 Lot-group confirmation

Each group shows:

- Product;
- Lot number;
- Production Lot total;
- originally in this Transfer;
- already received;
- pending now;
- released-to-sender;
- whether this Transfer represented the complete Production Lot.

If pending > 0, operator may choose `تأكيد X لفة المتبقية من هذه المجموعة`.

A confirmation sheet must state the exact quantity before the IDs are added to current receipt selection.

### 14.5 Review before mutation

Review screen must make three quantities unmistakable:

- `سيتم استلامه الآن`;
- `مستلم سابقًا`;
- `سيظل غير مستلم ومحجوزًا`.

Full receipt CTA example:

`تأكيد استلام 20 لفة وإكمال التحويل`

Partial receipt CTA example:

`تأكيد الاستلام الجزئي — 19 من 20`

Accompany partial CTA with one concise explanation:

`ستنتقل عهدة 19 لفة فقط. اللفة المتبقية ستظل محجوزة وعهدتها المؤكدة لدى المرسل.`

No hidden mass acceptance.

---

## 15. Field continuity and connectivity UX

### 15.1 Local verified-selection draft

Before final submission, the client may persist:

- Transfer ID;
- selected pending Roll IDs;
- last updated time;
- version/fingerprint.

Use `sessionStorage`, not permanent localStorage and not server database drafts.

### 15.2 Restore

On reload in the same session:

1. fetch current Transfer detail;
2. compare stored selected IDs to current pending membership;
3. drop items already received/released by another valid action;
4. inform operator if restored selection was reconciled;
5. allow continuing without rescanning the remaining valid selection.

### 15.3 Lost submit response

If network drops after submit:

- retain request ID and selection;
- show an explicit ambiguous-result message;
- retry same payload with same request ID;
- rely on database idempotency for truth.

Never tell the operator to create a new receipt attempt blindly.

---

## 16. Decision sheets and destructive safety

Use application-native sheets/dialog surfaces, not `window.confirm`.

Require explicit confirmation for:

- whole Transfer rejection;
- sender cancellation;
- partial receipt;
- bulk Lot receipt;
- release-to-sender unresolved resolution;
- Admin support resolution.

For resolution actions, show the exact Roll count and the consequence that the reservation will release while custody remains sender.

---

## 17. Timeline and audit UX

Transfer detail timeline should be human-readable and derived from immutable events.

Examples:

- `تم إنشاء التحويل — 20 لفة`
- `تم استلام 19 لفة`
- `تم استلام لفة واحدة لاحقًا`
- `تم تأكيد بقاء لفة واحدة لدى المرسل`
- `تم حل لفة إداريًا مع بقاء العهدة لدى المرسل`
- `تم إلغاء التحويل قبل الاستلام`
- `تم رفض التحويل قبل الاستلام`

Exact internal reasons remain controlled by caller visibility policy; ordinary timeline does not need to expose Admin support notes.

---

## 18. Error taxonomy for Arabic UX

Add stable service codes for at least:

- unauthenticated/inactive actor;
- Transfer not found/not visible;
- actor not recipient;
- actor not sender;
- invalid Transfer state;
- receipt attempted after cancellation/rejection/closure;
- reject/cancel attempted after first receipt;
- invalid/duplicate/too-large Roll selection;
- Roll not part of Transfer;
- item already received;
- item already released;
- reservation missing or belongs to another Transfer;
- sender custody no longer matches invariant;
- request ID conflict;
- resolution not allowed before partial receipt;
- resolution reason invalid;
- Admin support action unauthorized;
- Production downstream state invalid;
- ambiguous/lost network response at application layer.

Browser UI maps these to concise Arabic operational messages and never displays arbitrary PostgreSQL/internal exception text.

---

## 19. Security and authorization

### 19.1 Mutation remains RPC-only

No ordinary browser direct INSERT/UPDATE/DELETE grants on:

- Transfer headers;
- Transfer membership;
- item states;
- reservation projection;
- Transfer events;
- custody current;
- custody events.

### 19.2 Lifecycle revalidation

Receipt/resolution mutations must reuse the Cube F rule of locking/revalidating Profile and bound entity inside the database transaction.

Stale UI authorization is never enough.

### 19.3 Party boundary

- recipient receives only its incoming Transfer;
- sender resolves only its outgoing partially received Transfer;
- Admin support actions are explicit and audited;
- Admin ordinary party action remains Company-only;
- no generic party ID parameter allows impersonation.

### 19.4 QR is identification only

Possession of a contextual Roll QR does not grant receipt authority.

The Roll must also be an unresolved item in a Transfer addressed to the caller's active party.

---

## 20. Concurrency requirements

Permanent tests must cover at least:

- receipt vs sender cancellation race before first receipt;
- receipt vs recipient rejection race;
- receipt vs Admin pending recovery cancellation race;
- two recipient users receiving the same item concurrently;
- two different receipt requests for overlapping subsets;
- receipt subset A concurrent with disjoint receipt subset B;
- receipt vs sender unresolved resolution;
- receipt vs Admin unresolved resolution;
- sender vs Admin resolution of same unresolved item;
- actor/entity suspension vs receipt;
- actor/entity suspension vs resolution;
- Production void vs first confirmed receipt.

Valid outcomes must serialize. No Roll may have two custodians, duplicate custody sequence, missing reservation/custody correlation, or received state without the matching custody event.

---

## 21. Performance boundaries

### Transfer inbox

- paginated;
- indexed by recipient/sender/status/recent date;
- exact Transfer-number search;
- no unbounded history load.

### Item lists

- paginated;
- serial/Lot filters indexed where demonstrated;
- 10,000-item Transfer must not render 10,000 DOM cards simultaneously.

### Receipt mutation

- 10,000 items supported in one trusted bulk action under project CI/runtime limits;
- 10,001 rejected before mutation;
- set-based database changes;
- no N network calls per Roll.

### Lot expansion

- bounded to one authorized Transfer + Lot;
- never scans unrelated global inventory merely to render receipt.

---

## 22. Database Quality contract

Cube H is incomplete until permanent local verification covers the following.

### 22.1 Full receipt

- Company -> Agent receipt;
- Company -> Center receipt;
- Agent -> Dealer;
- Dealer -> Center;
- Center -> Center;
- Dealer/Center return to Company;
- all received items move custody to recipient;
- reservations fully removed;
- exactly one next custody event per Roll;
- custody event links Transfer;
- header becomes `received` and closes;
- one Transfer receipt event created.

### 22.2 Partial receipt

Example 20 items / receive 19:

- exactly 19 item states `received`;
- exactly 19 custody rows moved;
- exactly 19 custody events appended;
- exactly 19 reservations removed;
- 1 item remains `pending`;
- 1 reservation remains;
- sender still confirmed custodian of the one unresolved Roll;
- header = `partially_received` and `closed_at` null.

### 22.3 Later receipt

- recipient can later receive the remaining item;
- final reservation removed;
- custody moves;
- header becomes `received`;
- repeated matching request is idempotent.

### 22.4 Sender resolution

After partial receipt:

- sender can release only pending unresolved items;
- reason required;
- reservation releases;
- custody remains sender;
- no new custody event;
- item becomes `released_to_sender`;
- if no pending item remains, header becomes `partially_completed`.

### 22.5 Admin resolution

- active Admin can perform explicit unresolved support resolution;
- actor party remains null in audit;
- reason required;
- no custody move;
- received items cannot be touched.

### 22.6 Pre-receipt hardening

- pending sender cancel remains valid;
- pending recipient reject remains valid;
- pending eligible Admin recovery remains valid;
- all three fail after first receipt;
- races serialize.

### 22.7 Idempotency

- same receipt request retry returns same outcome;
- reordered exact set accepted as same retry;
- changed set conflicts;
- different actor conflicts;
- no duplicate Transfer event;
- no duplicate custody event.

Repeat equivalent coverage for sender/Admin resolution request IDs.

### 22.8 RLS/privacy

- recipient reads its incoming detail/items;
- sender reads its outgoing detail/items;
- unrelated party cannot read either;
- Admin audit works;
- receipt reads do not expose unrelated custody/Transfer history;
- no direct mutations;
- service-role Data API remains denied except explicit established contracts;
- public/anon cannot execute operational H RPCs.

### 22.9 Production void

- active reservation still blocks void;
- confirmed custody movement (`custody_sequence > 1`) blocks void even after Transfer reservation is gone;
- unresolved released-to-sender item alone does not invent custody movement;
- Production void vs receipt race never yields `voided + confirmed external movement`.

### 22.10 Scale

- 10,000-item full receipt;
- 10,000-item partial subset path where practical;
- 10,001 rejected;
- detail/list pagination remains bounded;
- generated Supabase types exactly match rebuilt schema.

---

## 23. Frontend/mobile verification contract

### Phone

Verify at common narrow viewport and real device:

- incoming list understandable without horizontal scroll;
- Transfer detail status/counts readable;
- start receipt obvious;
- scanner opens and closes naturally;
- camera permission denied state usable;
- repeated scans do not restart camera;
- duplicate/wrong/already-received QR feedback immediate;
- selected count always visible;
- switching input modes preserves selection;
- software keyboard does not cover primary CTA;
- sticky action respects safe area;
- partial receipt consequence is impossible to miss;
- decision sheets lock background interaction;
- no action depends on hover;
- touch targets >= 44px.

### Tablet/Desktop

- same business flow;
- denser composition allowed;
- no giant stretched phone sheet;
- lists/detail may use split composition if useful;
- no business-rule divergence from phone.

---

## 24. Implementation sequence — small completed increments

Implementation should proceed in this order on a fresh Cube H implementation branch based on the approved stacked baseline:

1. **Receipt state schema foundation**
   - item-state projection;
   - header vocabulary/immutability transition extension;
   - event/custody Transfer linkage;
   - initialization/backfill;
   - no UI yet.

2. **Atomic receipt engine**
   - recipient full/partial receipt RPC;
   - custody + events + reservations;
   - request idempotency;
   - concurrency tests.

3. **Resolution engine and F hardening**
   - sender unresolved release;
   - Admin unresolved support release;
   - cancel/reject/Admin recovery hardening;
   - Production void hardening;
   - tests.

4. **Receipt/read projections**
   - Transfer lists;
   - detail;
   - paginated items;
   - Lot expansion;
   - privacy tests/types.

5. **Transfer hub completion**
   - real incoming/outgoing lists;
   - action-needed states;
   - history/detail;
   - role-aware actions.

6. **Field receipt UX**
   - scan/select/Lot shared selection;
   - continuous scanner reuse;
   - partial/full review;
   - session continuity;
   - stable error mapping.

7. **Sender/Admin resolution UX**
   - pending cancel/reject surfaces;
   - partially received unresolved-item resolution;
   - Admin support paths;
   - timeline.

8. **Double review + integrated F/G/H verification**
   - database/security review;
   - UX/mobile review;
   - local Supabase + real browser;
   - real phone camera/touch test;
   - only then readiness recommendation.

Do not combine these into one giant implementation commit even if they live in one stacked PR.

---

## 25. Definition of Done

Cube H is Done only when all are true:

- recipient has a real incoming Transfer inbox;
- recipient can inspect one Transfer without needing current custody first;
- full receipt works;
- partial receipt works;
- later receipt of remaining Rolls works;
- unreceived Roll remains reserved and sender remains confirmed custodian;
- sender/Admin can explicitly release an unresolved item to sender only through the approved narrow path;
- received Roll custody changes atomically with immutable custody history;
- Transfer event timeline is immutable and comprehensible;
- pre-receipt cancel/reject/recovery cannot run after receipt begins;
- Production void is hardened against already-distributed Rolls;
- scanner/select/Lot field flow is mobile-first and interruption-tolerant;
- no broad directory, logistics, dispute, accounting, notification or Warranty scope leaks in;
- Database Quality is green on exact final head;
- PR Quality/type/build is green on exact final head;
- F/G/H integrated browser and device test is completed;
- no merge occurs before explicit approval.

---

## 26. Macro completion implication

When Cube H passes its own checks **and** the integrated Cubes F + G + H end-to-end test, the software Roll Custody & Transfers capability can be considered functionally closed.

Cube E's real printer/cutter physical-validation gate remains separately tracked. The phone test for F/G/H can use valid QR payloads/printed test labels without pretending that final production print hardware has already been certified.
