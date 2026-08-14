# Roll Custody & Transfers — Integrated F/G/H End-to-End Validation Plan

**Date:** 2026-08-15  
**Status:** Proposed closure plan  
**Applies to:** Cube F Transfer State/Reservation + Cube G Transfer Send UX + Cube H Receipt/Partial Receipt/Resolution

## 1. Purpose

The Roll Transfer capability must not be declared complete from isolated unit/database checks alone.

After Cube H implementation, the complete business loop must be exercised locally and in a real browser/device environment:

`confirmed sender custody -> send -> reservation -> recipient inbox -> physical verification -> full/partial receipt -> confirmed custody movement -> remaining-item resolution -> final audit`.

This plan defines the final closure gate for the F/G/H stage.

---

## 2. Review model

Final stage closure uses three evidence layers.

### Layer A — repository automation

- PR Quality green on exact final H head;
- Database Quality green on exact final H head;
- generated Supabase types exact;
- production build green;
- all F/G/H permanent contracts green.

### Layer B — independent integrated code review

Codex is asked to review Cubes F, G and H as one business capability rather than three unrelated diffs.

Review must specifically trace:

- Transfer creation authority;
- reservation lifecycle;
- sender UX payload and idempotency;
- recipient receipt authority;
- partial receipt state;
- custody-current mutation;
- immutable custody events;
- cancellation/rejection hardening;
- unresolved-item resolution;
- Production void coordination;
- privacy/RLS;
- network-interruption recovery;
- 10,000-Roll bounded behavior;
- mobile scanner lifecycle.

The reviewer must report concrete blockers separately from optional improvements.

### Layer C — real operational test

Run the platform against a fresh local Supabase instance with realistic parties, users, Products, Production Order/Lots/Rolls and two independent authenticated sessions.

Then perform the flow manually in browser and on a real phone.

---

## 3. Local environment baseline

Use the normal repository toolchain; do not create hosted production infrastructure merely for testing.

Expected local components:

- repository checkout at exact final H head;
- Node version matching CI;
- `npm ci`;
- Supabase CLI version matching repository CI;
- Docker/local Supabase;
- fresh `supabase db reset` from committed migrations;
- application dev server;
- browser profiles/sessions for separate operational users.

Local environment variables must be derived from the local Supabase stack and the repository's existing env contract. No production service-role secret may be placed in browser code.

---

## 4. Deterministic E2E fixture

Create one reproducible local E2E fixture script or documented seed sequence used only for testing.

Minimum fixture:

### Parties/users

- Company/Admin user;
- Country Agent + user;
- Dealer + user;
- Center A + user;
- Center B + user;
- optionally one Center entity without a user to verify recipient identity remains entity-first.

### Inventory

At least one Product with valid production specification and any identity fields required by current migrations.

Generate Production data that provides:

- one small Lot for scan/manual flows;
- one medium Lot for partial receipt;
- one larger Lot/group for bulk confirmation behavior;
- enough independent Rolls to test conflicting reservations and wrong-transfer scans.

The fixture must use normal application/database contracts where practical rather than manually bypassing invariants.

---

## 5. Browser sessions

Use separate browser contexts, not login/logout between every action.

Recommended:

- Session 1 — sender;
- Session 2 — recipient;
- Session 3 — Admin/support when needed.

This makes stale-state and cross-session behavior realistic.

For automated browser smoke, use the available browser automation tooling to verify:

- route loads;
- no framework error overlay;
- no console errors;
- meaningful content renders;
- primary actions are discoverable;
- phone viewport has no page-level horizontal overflow.

Manual actions remain required for camera and physical QR handling.

---

## 6. Primary end-to-end scenario — full receipt

Example:

1. sender starts with confirmed custody of 5 Rolls;
2. sender opens Transfers;
3. recipient shares/scans its Transfer ID;
4. sender verifies recipient card;
5. sender selects/scans 5 exact Rolls;
6. sender reviews quantity and sends;
7. verify Transfer status = pending;
8. verify 5 reservations exist;
9. verify confirmed custody still sender for all 5;
10. recipient sees incoming Transfer without manual refresh problems beyond normal page state;
11. recipient opens detail;
12. recipient verifies all 5 physically;
13. recipient confirms full receipt;
14. verify Transfer = received;
15. verify reservations = 0;
16. verify recipient is current confirmed custodian of all 5;
17. verify one next immutable custody event per Roll linked to the Transfer;
18. verify sender no longer sees those Rolls as sendable current inventory;
19. verify recipient does see them as its current inventory;
20. verify timeline reflects creation + receipt.

Pass condition: database truth, sender UI and recipient UI agree.

---

## 7. Partial receipt scenario

Example Transfer: 20 Rolls.

1. sender sends 20;
2. recipient physically confirms/scans/selects only 19;
3. review screen must explicitly show `19 received now / 1 remains unresolved`;
4. recipient confirms partial receipt;
5. verify 19 custody rows move;
6. verify 19 custody events append;
7. verify 19 reservations release;
8. verify one reservation remains;
9. verify one unresolved Roll remains confirmed with sender;
10. Transfer = partially_received;
11. sender and recipient both see honest `19 / 20` state;
12. recipient later receives the final Roll;
13. Transfer becomes received;
14. final reservation disappears;
15. custody/timeline remain consistent.

No screen may imply all 20 were received at step 4.

---

## 8. Partial completion / sender resolution scenario

Example Transfer: 20 Rolls, recipient receives 19, last Roll is confirmed never delivered or physically returned to sender.

1. perform 19/20 partial receipt;
2. sender opens outgoing Transfer;
3. sender sees one Roll still reserved and still in its confirmed custody;
4. sender selects only that unresolved Roll;
5. sender enters required operational reason;
6. confirm release-to-sender resolution;
7. reservation releases;
8. custody remains sender;
9. no new custody event is created for that Roll;
10. item = released_to_sender;
11. Transfer = partially_completed;
12. recipient cannot later receive the released item in this Transfer;
13. both parties see the final 19-received / 1-remained-with-sender outcome.

Repeat once using Admin support resolution and verify no party impersonation is recorded.

---

## 9. Pre-receipt cancellation and rejection

### Sender cancellation

- send Transfer;
- before receipt sender cancels;
- all reservations release;
- custody unchanged;
- recipient cannot receive cancelled Transfer.

### Recipient rejection

- send Transfer;
- before receipt recipient rejects;
- all reservations release;
- custody unchanged;
- sender cannot re-open same Transfer.

### After partial receipt

Verify sender cancellation and recipient whole rejection are no longer available and database RPC rejects any stale attempt.

---

## 10. QR/scanner field matrix

Test with real rendered QR targets.

### Recipient Transfer ID

- correct Transfer ID QR;
- manually typed/pasted Transfer ID;
- malformed QR;
- sender's own Transfer ID;
- inactive recipient.

### Roll receipt

- correct Roll in Transfer;
- correct Roll already selected locally;
- Roll already received;
- Roll released-to-sender;
- valid platform Roll not part of Transfer;
- malformed QR;
- QR image upload fallback;
- manual serial fallback;
- camera permission denied then fallback.

Scanner must remain open between consecutive successful Roll scans unless user closes it.

---

## 11. Bulk/Lot field matrix

Test:

- one Transfer containing a complete Lot;
- one Transfer containing only part of a Lot;
- one Transfer spanning multiple Lots;
- a Lot group partially received earlier;
- grouped confirmation of the remaining items;
- exact displayed counts vs database membership.

The UI must never call a partial Lot complete.

---

## 12. Network/interruption tests

Use browser devtools/network controls or equivalent local tooling.

### Sender

- cut network immediately after send click;
- restore;
- retry same payload;
- verify no duplicate Transfer.

### Recipient

- verify several Rolls locally;
- reload before submit;
- restore valid session selection;
- submit;
- cut network at receipt confirmation;
- restore;
- retry same request;
- verify no duplicate custody/Transfer events.

### Resolution

Repeat ambiguous-response retry for sender/Admin unresolved-item resolution.

---

## 13. Cross-session concurrency checks

Use two sessions for the same business entity where needed.

Verify practical races:

- two recipient sessions attempt to receive same Roll;
- recipient receipt vs sender cancel;
- recipient receipt vs recipient reject in another session;
- receipt of overlapping subsets;
- receipt vs sender unresolved resolution;
- sender vs Admin unresolved resolution.

At most one valid physical state transition wins for each Roll.

---

## 14. Real phone validation

A real phone is required before merge because camera, touch reachability, software keyboard and mobile browser chrome cannot be certified from desktop viewport emulation alone.

### 14.1 Android USB preferred path

If the test phone is Android and USB debugging is available, prefer local loopback through ADB rather than deploying production infrastructure.

Conceptually:

- connect phone by USB;
- authorize debugging;
- reverse the local application port to phone localhost;
- reverse the local Supabase API port(s) actually required by browser requests;
- open the application on the phone through `http://localhost:<app-port>`.

Because loopback localhost is treated specially by modern browsers, this path is preferable to ordinary insecure LAN HTTP for camera testing.

Exact port commands must be resolved from the actual local Supabase/app configuration at test time; do not hard-code guessed ports in the product.

### 14.2 iPhone / unsupported USB path

If direct local loopback is not practical, use the smallest secure temporary HTTPS access method suitable for the local test environment.

Do not publish a production deployment solely to obtain camera permission.

### 14.3 Phone checks

The user manually verifies:

- login/session works;
- Transfer module navigation feels natural;
- Transfer ID scan works;
- Roll camera scan works repeatedly;
- action buttons are comfortably reachable;
- no accidental zoom/horizontal scroll;
- keyboard does not hide confirmation;
- sheet/back behavior is predictable;
- partial receipt warning is clear;
- retry messaging is understandable;
- real-world speed is acceptable while handling Rolls.

---

## 15. Device test QR material

The stage test may use generated/printed test QR sheets containing valid current contextual Roll QR payloads and Transfer ID QR payloads.

This validates application scanning behavior.

It does **not** claim that Cube E's final production printer/cutter/media/RIP physical label acceptance has been completed. That remains a separate hardware gate.

---

## 16. Database truth inspection after each scenario

Codex must verify evidence, not trust UI messages.

After key actions inspect:

- `roll_transfers`;
- `roll_transfer_items`;
- Cube H item-state projection;
- `roll_transfer_reservations`;
- `roll_transfer_events`;
- `roll_custody_current`;
- `roll_custody_events`.

For every tested Roll, state across these structures must tell one coherent story.

---

## 17. Visual/UX review evidence

Capture at least:

- phone Transfers landing;
- incoming pending card;
- Transfer detail;
- scanner sheet;
- partial receipt review;
- success/completed state;
- sender partially-received resolution state;
- one empty state;
- one error/retry state;
- desktop/tablet equivalent where composition changes.

Review for hierarchy, spacing, readability, touch target size, safe area, clipping, overflow, raw technical wording and inconsistent Arabic/English labels.

---

## 18. Final Codex report format

Codex should return one closure report with:

### A. Environment

- exact branch/commit;
- Node/Supabase CLI versions;
- local database reset result;
- browser/device used.

### B. Automated gates

- PR Quality;
- Database Quality;
- any extra targeted checks.

### C. F/G/H integrated review

- blockers;
- correctness risks;
- security/privacy risks;
- UX/field-work risks;
- performance/bounded-scale risks.

### D. Executed E2E scenarios

For each scenario: PASS / FAIL + observed result + database evidence.

### E. Real device findings

- camera;
- touch;
- keyboard;
- navigation;
- partial receipt comprehension;
- interruption/retry.

### F. Verdict

Exactly one:

- `BLOCKED`
- `READY FOR FINAL REVIEW`

Codex must not merge.

---

## 19. Merge gate

The Roll Transfer stage is ready for merge only when:

- F, G and H integrated review has no unresolved blocker;
- full receipt passes;
- partial receipt passes;
- later receipt passes;
- unresolved release-to-sender passes;
- cancel/reject hardening passes;
- QR scan matrix passes;
- network retry passes;
- database truth matches UI;
- real phone camera/touch smoke passes;
- final exact heads are known and CI-green;
- explicit user approval to merge is given.

No successful isolated cube test substitutes for this integrated closure gate.
