# Cube L — Frozen Notification Event Catalog

**Date:** 2026-08-22  
**Status:** FROZEN implementation catalog for Cube L.  
**Companion:** `docs/cube-l-notification-pwa-frozen-spec.md`

## 1. Catalog rules

This catalog is intentionally explicit. An event not listed here does **not** generate a Cube L V1 notification merely because a database row changed.

Every catalog entry fixes:

- authoritative source;
- stable source-event key;
- recipients;
- actor/self-noise behavior;
- attention level;
- Push eligibility;
- deep-link intent;
- privacy-safe message intent.

Notification presenters may refine Arabic wording during implementation/rendered QA, but they may not change the event meaning, recipient authority, Push eligibility or leak additional source-domain data.

## 2. Stable source-event key convention

For existing immutable event rows:

`<source-table>:<event-uuid>`

Examples:

- `roll_transfer_events:<uuid>`
- `center_location_events:<uuid>`
- `center_network_approval_events:<uuid>`
- `roll_preinstall_issue_events:<uuid>`

For the existing Center onboarding status transition, which has no separate immutable event table:

- normal acceptance: `center_onboarding:<invitation-uuid>:accepted`
- accepted but repair/review required: `center_onboarding:<invitation-uuid>:review_required`

The same source transition must never generate a new source key on retry.

## 3. Recipient helpers — frozen semantics

### `party_profiles(party_id)`

All currently active Profiles representing the exact operational party, with the bound entity also active where applicable.

### `center_profiles(center_id)`

All active Profiles bound to the exact active Installation Center.

### `active_admin_profiles()`

All active Admin Profiles with valid Admin binding shape.

### `primary_center_manager_profiles(center_id)`

For onboarding completion awareness:

- Center under Dealer → active Profiles of that exact active Dealer;
- direct Center under Country Agent → active Profiles of that exact active Agent;
- direct Company Center → all active Admin Profiles.

Do not also fan out normal onboarding completion to upstream roles merely because they can inspect the Center.

### `center_approval_responsibility_profiles(center_id)`

For a Center-device location capture that creates a real approval/re-approval need:

- Center inside a Country Agent network, whether direct or under Dealer → active Profiles of the responsible active Country Agent;
- direct Company Center → active Admin Profiles.

Dealer is intentionally excluded because Dealer cannot grant Protection Giants network approval.

## 4. Transfer events

Current authoritative source: `roll_transfer_events`, with Transfer header/context from `roll_transfers`.

### L-TR-01 — Incoming Transfer created

**Source:** `roll_transfer_events.event_type = 'created'`  
**Condition:** `roll_transfers.transfer_kind = 'standard'`  
**Recipients:** `party_profiles(recipient_party_id)`  
**Actor exclusion:** normally irrelevant because sender and recipient differ; never notify the creating actor if an exceptional support path ever makes them a resolved recipient Profile.  
**Attention:** `action_required`  
**Push:** YES  
**Action:** `/operations/transfers/<transfer-id>`; recipient UI may route onward to receipt.  
**Message intent:** a new physical Roll Transfer is waiting for the recipient to verify/receive. Include Transfer number and sender display identity only; do not expose unrelated inventory.

### L-TR-02 — Transfer rejected by recipient

**Source:** `event_type = 'rejected'`  
**Recipients:** `party_profiles(sender_party_id)`  
**Actor exclusion:** recipient actor is outside sender party under normal rules.  
**Attention:** `warning`  
**Push:** YES  
**Action:** Transfer detail.  
**Message intent:** recipient rejected the Transfer; sender should inspect the Transfer state.

### L-TR-03 — Transfer cancelled by sender before receipt

**Source:** `event_type = 'cancelled'`  
**Recipients:** `party_profiles(recipient_party_id)`  
**Attention:** `info`  
**Push:** YES  
**Action:** Transfer detail.  
**Message intent:** a previously pending incoming Transfer was cancelled; it no longer requires receipt.

### L-TR-04 — Transfer administratively cancelled

**Source:** `event_type = 'administrative_cancelled'`  
**Recipients:** active Profiles of both sender and recipient parties.  
**Actor exclusion:** exclude the exact acting Admin Profile from its own copy; other active Admin Profiles representing Company may still receive the event if Company is one side.  
**Attention:** `warning`  
**Push:** YES  
**Action:** Transfer detail.  
**Message intent:** Company support administratively closed a Transfer. Push body does not include free-text administrative reason; reason remains inside authorized detail.

### L-TR-05 — Partial receipt recorded

**Source:** `event_type = 'received'`  
**Condition:** after source event, Transfer status is `partially_received`  
**Recipients:** `party_profiles(sender_party_id)`  
**Attention:** `action_required`  
**Push:** YES  
**Action:** Transfer detail.  
**Message intent:** recipient confirmed only part of the shipment and items remain unresolved. Show affected count/Transfer number where helpful, not a full Roll list in Push.

### L-TR-06 — Standard Transfer fully received

**Source:** `event_type = 'received'`  
**Condition:** `transfer_kind = 'standard'` and after event Transfer status is `received`  
**Recipients:** `party_profiles(sender_party_id)`  
**Attention:** `info`  
**Push:** YES  
**Action:** Transfer detail.  
**Message intent:** the recipient physically received the Transfer and confirmed custody moved for all included Rolls.

### L-TR-07 — Further receipt while Transfer remains partial

Same source/recipient semantics as L-TR-05. Each immutable receipt event may create one notification because each represents new physical receipt evidence. Deduplication occurs by source event, not by Transfer id.

### L-TR-08 — Sender releases unresolved items

**Source:** `event_type = 'unresolved_released'`  
**Recipients:** `party_profiles(recipient_party_id)`  
**Actor exclusion:** sender actor is outside recipient party.  
**Attention:** `info`  
**Push:** YES  
**Action:** Transfer detail.  
**Message intent:** remaining unreceived Rolls were released back to sender custody/reservation state and will no longer arrive under this Transfer. Push must not expose the private free-text resolution reason.

### L-TR-09 — Admin releases unresolved items

**Source:** `event_type = 'administrative_unresolved_released'`  
**Recipients:** active Profiles of both sender and recipient parties.  
**Actor exclusion:** exclude exact acting Admin Profile from its own Company-side copy.  
**Attention:** `warning`  
**Push:** YES  
**Action:** Transfer detail.  
**Message intent:** Company support resolved outstanding unreceived items. Do not include free-text resolution reason in lock-screen Push.

## 5. Opened-Roll Recovery specialization

Cube J performs Recovery atomically as a real Transfer with `transfer_kind = 'opened_roll_recovery'`, writes `opened_roll_recovery_created`, and then reuses Cube H receipt, producing a `received` event and terminal `received` Transfer.

### L-RC-01 — Opened Roll physically recovered

**Authoritative completion source:** the `roll_transfer_events.event_type = 'received'` row for a Transfer whose `transfer_kind = 'opened_roll_recovery'`.  
**Recipients:** active Profiles of the **former Center sender party** if that Center is still operationally active.  
**Actor exclusion:** Recovery actor is Admin/Agent recipient, not Center.  
**Attention:** `info`  
**Push:** YES  
**Action:** Transfer detail or Center-safe relevant custody/history route; implementation must choose a route the former Center is authorized to open.  
**Message intent:** “تم استلام الرول وإخراجه من عهدة المركز” in user language. Do not use internal “Recovery” jargon as the primary Center message.

**Suppression:** for this same `received` event, do **not** also create generic L-TR-06 to the former Center. L-RC-01 replaces it.

`opened_roll_recovery_created` itself does not generate a second user notification because creation and receipt are atomic in Cube J V1.

## 6. Center location / network approval events

### L-CT-01 — Center device location captured and approval is needed

**Source:** `center_location_events`  
**Condition:** `source = 'center_device'`; after the location operation the Center is active and is not currently approved for the new location.  
**Recipients:** `center_approval_responsibility_profiles(center_id)`  
**Actor exclusion:** Center actor is outside approver responsibility.  
**Attention:** `action_required`  
**Push:** YES  
**Action:** `/operations/centers/<center-id>/approval`  
**Message intent:** Center location is ready for Company/Agent approval. Include Center display name; do not expose raw coordinate data in Push.

Admin location corrections (`source = 'admin'`) do not create L-CT-01; the acting Admin already knows the action, and any trust-state consequence is covered by approval events below.

### L-CT-02 — Center network approval granted

**Source:** `center_network_approval_events.action = 'approved'`  
**Recipients:** `center_profiles(center_id)`  
**Attention:** `info`  
**Push:** YES  
**Action:** Center's normal operational Home/location/status context; do not link the Center to Admin approval controls.  
**Message intent:** Center now carries Protection Giants network approval/trust status. Explicitly do not imply this grants custody or Warranty Activation permission.

### L-CT-03 — Center network approval revoked

**Source:** `action = 'revoked'`  
**Recipients:** `center_profiles(center_id)`  
**Attention:** `warning`  
**Push:** YES  
**Action:** Center-safe status/location context.  
**Message intent:** network approval was revoked. Push does not expose internal actor/admin detail.

### L-CT-04 — Center location changed and previous approval invalidated

**Source:** `action = 'location_changed'`  
**Recipients:** `center_profiles(center_id)`  
**Attention:** `warning`  
**Push:** YES  
**Action:** `/operations/location` for Center user.  
**Message intent:** saved location changed, so previous approval no longer applies and re-approval is required. This does not suspend Center operations, custody, Opening or future Activation eligibility by itself.

## 7. Center onboarding events

The invited user does not yet have an operational Profile at invitation delivery time; the Supabase Auth invitation email remains the onboarding delivery mechanism and is not duplicated as an Inbox notification.

### L-ON-01 — Center first-user onboarding completed normally

**Source transition:** `center_onboarding_invitations.status` becomes `accepted` with no `review_required_at`.  
**Source key:** `center_onboarding:<invitation-id>:accepted`  
**Recipients:** `primary_center_manager_profiles(center_id)`  
**Actor exclusion:** invitee Center Profile is not the management recipient.  
**Attention:** `info`  
**Push:** YES  
**Action:** authorized Center detail/edit route for that manager.  
**Message intent:** first Center account completed onboarding successfully.

### L-ON-02 — Accepted onboarding requires repair/review

**Source transition:** accepted invitation has `review_required_at is not null` and approved `failure_code`.  
**Source key:** `center_onboarding:<invitation-id>:review_required`  
**Recipients:** `active_admin_profiles()`  
**Actor exclusion:** none unless exact Admin actor generated a future explicit support transition; current onboarding actor is invitee.  
**Attention:** `action_required`  
**Push:** YES  
**Action:** Admin operational account/Center repair surface that is actually authorized at implementation time.  
**Message intent:** onboarding needs Company review. Push may include Center display name but must not include raw failure internals or invitation/auth tokens.

Do not generate a separate L-ON-01 for the same invitation when L-ON-02 applies.

## 8. Cube K — Pre-install Roll Issue events

Authoritative source: `roll_preinstall_issue_events` with event kinds exactly:

- `submitted`
- `cleared_for_use`
- `return_required`
- `reported_in_error`

### L-QA-01 — New Pre-install Issue submitted

**Source:** `event_kind = 'submitted'`  
**Recipients:** `active_admin_profiles()`  
**Attention:** `action_required`  
**Push:** YES  
**Action:** `/operations/rolls/issues/<issue-id>`  
**Message intent:** a Center submitted a pre-install Roll issue requiring Company decision. Lock-screen body may include Center display name and Roll serial but not defect description/evidence.

Agent and Dealer receive **no** Cube K notification merely because the reporting Center is in their network.

### L-QA-02 — Company cleared Roll for use

**Source:** `event_kind = 'cleared_for_use'`  
**Recipients:** active Profiles of the reporting Center, provided the Center remains active.  
**Attention:** `info`  
**Push:** YES  
**Action:** issue detail.  
**Message intent:** Company allowed use of the Roll; this removes this issue-specific Activation hold only. Push does not include the private resolution reason.

### L-QA-03 — Company requires Roll return

**Source:** `event_kind = 'return_required'`  
**Recipients:** active Profiles of the reporting Center, provided the Center remains active.  
**Attention:** `action_required`  
**Push:** YES  
**Action:** issue detail.  
**Message intent:** Roll must not be used and must be returned according to Company instructions. Do not imply custody has already moved; Recovery/physical receipt remains separate.

### L-QA-04 — Report administratively marked as reported in error

**Source:** `event_kind = 'reported_in_error'`  
**Recipients:** active Profiles of the reporting Center, provided Center active.  
**Attention:** `info`  
**Push:** YES  
**Action:** issue detail.  
**Message intent:** report was closed as an administrative correction, not as quality clearance. Push omits private resolution reason.

## 9. Events deliberately NOT notified in Cube L V1

- normal Roll Opening by the same Center actor;
- Product create/edit/publish actions;
- Production Order creation/print/reprint;
- ordinary synchronous location save success to the same Center;
- invitation email itself before the invitee has a Profile;
- simple database CRUD changes with no approved cross-role handoff;
- every custody event independently when it is already explained by a Transfer/Recovery event;
- future Warranty Activation/Public Warranty/Claims events before their own product specs define exact recipient/content semantics.

## 10. Push eligibility principle

Every V1 catalog entry above is Push-eligible because it either:

- requires another role to act;
- cancels/replaces work another role was waiting on;
- records a material physical custody handoff outcome;
- resolves a state the recipient was waiting on;
- changes Center trust status materially.

Future low-value informational Inbox events may be `push_eligible = false`; that does not require changing the engine.

## 11. Notification content security

Inbox content is still subject to recipient-domain authority. Push content is intentionally narrower because it may be visible on a device lock screen.

Never include in Push:

- customer personal data;
- free-text quality descriptions;
- Cube K evidence;
- administrative resolution reasons;
- Center raw coordinates;
- auth/invitation tokens;
- Push endpoint/key material;
- secrets;
- any URL/identifier that itself grants authorization.

## 12. Future-domain integration rule

Warranty Activation, public Warranty access and Claims will add entries to this catalog only when their own Cubes freeze their source event/state semantics. Cube L supplies the notification infrastructure but does not pre-invent those lifecycles.
