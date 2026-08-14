# Cube H — Canonical State & Locking Amendment

**Date:** 2026-08-15  
**Status:** Proposed canonical amendment  
**Applies to:** `docs/cube-h-transfer-receipt-resolution-spec.md`

This amendment is authoritative over any conflicting wording in the base Cube H specification.

It closes two issues found during the second design review before implementation:

1. cancelled/rejected pre-receipt Transfer items need a truthful terminal item state rather than remaining visually `pending` after the Transfer is closed;
2. receipt/resolution must lock affected Production Order rows before reservation release/custody transition so Production void cannot race across the operation boundary.

---

## 1. Canonical item-state vocabulary

`roll_transfer_item_states.status` is:

- `pending`
- `received`
- `released_to_sender`
- `closed_unreceived`

### `pending`

The item belongs to an open `pending` or `partially_received` Transfer, still has the Transfer's active reservation, and has not been confirmed received or explicitly released.

Confirmed custody remains sender.

### `received`

Recipient confirmed physical receipt. Reservation is removed and confirmed custody moved to recipient with a linked immutable custody event.

### `released_to_sender`

After partial receipt, sender/Admin explicitly resolved the still-unreceived item as remaining/returned with sender. Reservation is removed. Confirmed custody stays sender and no new custody event is appended.

### `closed_unreceived`

The whole Transfer ended before any receipt through one of the existing legitimate pre-receipt terminal paths:

- sender cancellation;
- recipient rejection;
- eligible Cube F Admin recovery cancellation.

Reservation is removed and confirmed custody remains sender.

This state does **not** mean a partial-receipt discrepancy was resolved. It exists only to keep item history coherent when the entire Transfer closes before receipt.

---

## 2. Canonical monotonic transitions

Per item:

```text
pending -> received
pending -> released_to_sender      # only after Transfer is partially_received
pending -> closed_unreceived       # only through whole-Transfer pre-receipt terminal action
```

No terminal item state transitions again in Cube H.

Received items can never become released/closed through Transfer UI.

---

## 3. Initialization and historical backfill

On Cube H migration:

- existing Cube F/G items in `pending` Transfers -> `pending` state;
- existing items in `cancelled` or `rejected` Transfers -> `closed_unreceived` state;
- no receipt/custody movement is invented by backfill.

Future `roll_transfer_items` inserts receive one `pending` state row through a narrow database-owned initialization trigger.

---

## 4. Pre-receipt close synchronization

Cube H must ensure that every valid whole-Transfer transition:

`pending -> cancelled/rejected`

also transitions all of that Transfer's remaining `pending` item-state rows to `closed_unreceived` in the **same database transaction** that releases reservations.

Implementation may harden the existing Cube F RPCs directly or use an equally narrow database-owned mechanism, but it must preserve:

- existing actor authorization;
- existing lifecycle locks;
- existing Transfer event types;
- existing idempotency behavior;
- no custody movement.

Do not implement this synchronization in browser code.

---

## 5. Item-state audit shape

For `received` and `released_to_sender`, retain the action audit fields proposed in the base specification:

- action request ID;
- actor profile;
- actor party where applicable;
- action time;
- resolution reason only for release-to-sender.

For `pending` and `closed_unreceived`, these item action fields may remain null because the whole-Transfer `roll_transfer_events` timeline already records the authoritative create/cancel/reject/Admin-recovery actor and time.

This avoids duplicating the same header terminal audit onto thousands of item rows.

---

## 6. Canonical pending count

For an open Transfer:

`pending_count = count(item_states.status = 'pending')`

For `cancelled`/`rejected` Transfers, `pending_count` is zero because items are `closed_unreceived`.

Transfer list/detail projections may additionally expose `closed_unreceived_count` for historical accuracy when useful, but ordinary cancelled/rejected UI does not need to display that count as a separate operational task.

---

## 7. Production Order locking during receipt

Before changing any selected receipt item, `receive_roll_transfer_items(...)` must:

1. determine the distinct Production Orders for selected Rolls;
2. lock those Production Order rows in deterministic ID order;
3. require each still has the allowed generated/operational state;
4. only then proceed to custody/item/reservation mutation.

This follows the established Cube F lock-order principle and coordinates with the Production void path.

The exact internal lock order must be documented and tested to avoid deadlocks with Transfer creation and Production void.

---

## 8. Production Order locking during unresolved release

Before deleting selected unresolved reservations in sender/Admin `released_to_sender` resolution:

1. determine affected Production Orders;
2. lock them in deterministic order;
3. revalidate downstream state;
4. then perform item-state/reservation resolution.

Because a valid release-to-sender action exists only after at least one item has already been received, the strengthened `custody_sequence > 1` Production void guard should already make the Production Order non-voidable. The lock is still required for deterministic race behavior.

---

## 9. Strengthened Production void guard remains canonical

Cube H must reject `generated -> voided` if either is true:

- any Roll under the Production Order has an active Transfer reservation;
- any Roll under the Production Order has confirmed custody history with `custody_sequence > 1`.

This makes the invariant stable both before and after reservation consumption.

---

## 10. Revised critical consistency invariant

At commit time, every Transfer item must tell one coherent story:

### Open pending item

- item state = `pending`;
- reservation exists for this Transfer;
- confirmed custody = sender.

### Received item

- item state = `received`;
- no reservation;
- confirmed custody = recipient;
- next immutable custody event exists and links this Transfer.

### Released unresolved item

- item state = `released_to_sender`;
- no reservation;
- confirmed custody = sender;
- no synthetic custody event was added.

### Whole-Transfer pre-receipt closed item

- item state = `closed_unreceived`;
- no reservation;
- confirmed custody = sender;
- Transfer header = `cancelled` or `rejected`;
- no synthetic custody event was added.

Database Quality must assert these correlations directly.
