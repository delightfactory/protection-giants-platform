# Product Decisions

This file records approved business decisions that implementation must follow. New decisions should be appended with a date and concise rationale.

## Current approved decisions

### PD-001 — Single-brand first release
**Status:** Approved

The first deployment is dedicated to Protection Giants. Future brands use a separate deployment/repository copy strategy unless a later decision explicitly changes this.

### PD-002 — PPF is the first operational product family
**Status:** Approved

The first implementation covers paint-protection film. Window film and other product families are postponed because their activation logic differs.

### PD-003 — Physical roll is the tracked unit
**Status:** Approved

Each physical roll has one unique internal record and serial identity. The serial is an attribute/identifier of the physical roll, not a separate unrelated business object.

### PD-004 — One PPF roll, one customer warranty
**Status:** Approved

A PPF roll can issue at most one customer warranty. Remaining material does not create another warranty.

### PD-005 — Marketing QR is informational only
**Status:** Approved

The external marketing QR opens the public website/product content. It does not collect visitor data and does not activate a roll or warranty.

### PD-006 — Active custodian Center account is required for operational activation
**Status:** Approved; clarified 2026-08-12

Roll opening and customer Warranty Activation are performed from an authenticated active installation-center account representing the Center that holds confirmed current custody of the Roll. A free-text Center name is not sufficient.

Protection Giants network approval is **not** a prerequisite for Roll opening or Warranty Activation. An operationally active Center that legitimately holds the Roll may install it and activate its Warranty when all future Roll/Activation eligibility rules are satisfied.

### PD-007 — Roll opening and warranty activation are separate events
**Status:** Approved

The center first records opening/claiming the roll. Customer warranty activation happens later after installation data is available.

There is no mandatory maximum time between these two events in the first release.

### PD-008 — Pre-install roll issue reporting
**Status:** Approved

After a center records opening a roll, it can report a manufacturing/physical issue before customer warranty activation. Evidence may be requested for issue reporting, while evidence is not mandatory for normal customer activation.

### PD-009 — Customer warranty activation data is intentionally simple
**Status:** Approved

Normal activation requires customer and vehicle data including VIN. Photos, videos, invoice upload, and OTP are not mandatory for first release activation.

### PD-010 — Customer does not require an account
**Status:** Approved

The customer accesses the warranty through a secure warranty URL/QR. The customer can view warranty information and raise a claim without creating a platform login in the first release.

### PD-011 — Three physical customer QR copies
**Status:** Approved concept; print layout pending

The customer warranty QR is intended to be printed in three copies for:
- vehicle;
- warranty card;
- invoice.

Exact print layout and complete label count are finalized during print-template work.

### PD-012 — Public Center directory distinguishes registered and approved Centers
**Status:** Approved; clarified 2026-08-12

The public Center directory/map may show operationally active registered Centers that have a valid published geographic location. Approved Centers receive a distinct Protection Giants approval badge/pin state; ordinary registered Centers remain visibly distinguishable as registered but not approved.

Suspended Centers are not published. Public presentation uses a narrow controlled public projection and must not expose private Auth or internal network data.

### PD-013 — Production order remains simple
**Status:** Approved

The production-order feature records the product, quantity, relevant date/source information, lot breakdown, and printable order. It is not a procurement/shipping management workflow in the first release.

### PD-014 — Physical transfer uses scan confirmation
**Status:** Approved; clarified 2026-08-12

When physical rolls are transferred to another operational holder, scanning is used to ensure the serials recorded in the transfer match the physical rolls actually moved.

**Clarification:** scanning is a confirmation method for small/mixed physical movements and receipt verification; it is not mandatory to scan every Roll individually in a trusted whole-Lot bulk transfer. A whole-Lot selection may be one operator action while the platform expands it into individual Roll transfer items. If only part of a Lot is currently held/eligible, the available quantity must be shown explicitly and the system must not represent it as a complete-Lot move.

### PD-015 — Product warranty policy drives warranty duration
**Status:** Approved

Warranty duration and customer-facing care/coverage information come from the configured product/policy data, not hard-coded application constants.

### PD-016 — Product code is the canonical SKU in the first release
**Status:** Approved

`products.code` is the canonical SKU/operational product code. A second duplicate SKU field is not introduced without a demonstrated business distinction.

Physical roll serials, ERP serials, lot numbers, and generated warranty/activation codes are separate identifiers owned by their later business objects.

### PD-017 — Product stores stable specification data, not production-instance data
**Status:** Approved

Stable nominal product data such as type, category, version, dimensions, thickness, weight, origin, descriptive content, and warranty policy belongs to the product definition.

Production order, lot/batch, physical roll, ownership, serial, transfer, installation, and warranty-instance data must not be stored as product attributes.

### PD-018 — Product price is reference data, not a transaction ledger
**Status:** Approved

The optional product price is a reference/display price with an explicit currency code. Future orders, invoices, transfers, or sales that require financial history must snapshot their own transactional values rather than depending on the current product reference price.

### PD-019 — Warranty activation must snapshot the policy used
**Status:** Approved

The product stores the current default warranty duration plus customer-facing coverage and care information. When the warranty cube is implemented, the created warranty record must snapshot the applicable policy values so later product edits do not rewrite historical warranties.

### PD-020 — One SKU maps to one fixed Product specification
**Status:** Approved — 2026-08-11

Each SKU identifies one Product definition with one stable nominal specification set. A commercially meaningful change in width, length, thickness, version/model, or another defining specification is represented by a separate Product/SKU rather than by a variant engine inside the same SKU.

This keeps production orders, lots, rolls, labels, transfers, and warranties anchored to one unambiguous Product definition in the first release. A generalized variant subsystem is deferred unless a later business requirement demonstrates that multiple sellable configurations must share one SKU.

### PD-021 — Country Agent is a separate operational entity and role
**Status:** Approved — 2026-08-12

Country Agent is distinct from Dealer. Protection Giants/Admin creates Agents; Agents create Dealers and may create Centers in their network; Dealers create their Centers. The system must not overload Dealer records or Dealer-role users to represent Agents.

### PD-022 — Organizational hierarchy does not hard-code transfer routes
**Status:** Approved — 2026-08-12

Company → Agent → Dealer/Center is the normal management hierarchy and visibility boundary, but physical Roll transfers are not forced through that chain. Transfer authorization is based on confirmed current custody, active recipient identity, and transfer rules so legitimate direct/return/cross-peer movements can be supported without redesigning the hierarchy.

### PD-023 — Transfer recipients use a stable private Transfer ID, not a global directory
**Status:** Approved — 2026-08-12

Every Agent, Dealer, and Center receives a stable platform-wide unique Transfer ID and QR representation. Ordinary users do not browse a global directory of all entities. A sender may enter or scan the exact Transfer ID and receive only the minimal recipient identity needed to verify the intended party before sending.

Transfer ID is an identifier analogous to an account number, not a rotating OTP or secret. Knowing it does not grant custody.

### PD-024 — Recipient acceptance is required before confirmed custody changes
**Status:** Approved — 2026-08-12

Creating a Transfer reserves the selected Rolls but leaves confirmed custody with the sender. The recipient must accept receipt before custody moves. Rejection or sender cancellation before receipt releases the reservation. Partial receipt is supported: received Rolls move custody individually while unresolved Rolls remain reserved until their physical status is resolved.

### PD-025 — Center Onboarding is invitation-based and part of the current transfer foundation
**Status:** Approved — 2026-08-12

A Center entity may exist and receive a Transfer ID before it has any user account. Its first operational user is onboarded through a controlled invitation bound to the already-existing Center. Public operational signup remains disabled, and the recipient cannot choose or alter the protected Center role/entity binding.

Agents are registered by the Parent Company and Dealers are registered by Agents; the invitation-based onboarding flow is specifically for Centers in the current scope.

### PD-026 — Operational Center registration, network approval, and activation permission are separate
**Status:** Approved; clarified 2026-08-12

An operationally registered/active Center may participate in the network and custody flow without automatically becoming a Protection Giants approved Center.

Network approval is a trust/quality designation used for the public Center experience and does not grant custody or act as a Warranty Activation gate. An unapproved but active Center that holds confirmed custody of an eligible Roll may perform the future Roll Opening / Warranty Activation flow.

### PD-027 — Center geographic location is self-captured from the premises with Admin correction
**Status:** Approved — 2026-08-12

An onboarded Center can update its Protection Giants map location through device/browser geolocation and is instructed to do so while physically present at the Center. Center users do not manually type coordinates or freely reposition the pin. The platform records coordinates, reported accuracy, capture time and source, with an initial application acceptance target of 50 metres accuracy or better.

Protection Giants Admin may correct or update a Center location administratively. All saved location changes are auditable. Location capture is an operational verification measure and is not treated as impossible to spoof.

### PD-028 — Center network approval is granted only by Admin or the responsible Country Agent
**Status:** Approved — 2026-08-12

Admin may approve/revoke any Center. A Country Agent may approve/revoke Centers only inside its own network scope. Dealers cannot grant the Protection Giants approval badge and Centers cannot approve themselves.

A Center must be operationally active and have a valid current geographic location before it can be approved. Approval/revocation is audited independently from operational lifecycle.

### PD-029 — Center location change invalidates the previous network approval
**Status:** Approved — 2026-08-12

If an approved Center's saved physical location changes, the current Protection Giants network approval resets to unapproved and the event is audited. Admin or the responsible Agent may re-approve the Center after reviewing the new location.

This prevents an approval granted to one physical premises from silently following a Center to a different map location.

### PD-030 — Product GTIN is distinct from SKU and physical Roll identity
**Status:** Approved — 2026-08-14

A Product/SKU may store one optional official GTIN used to identify the trade item generally and to render its conventional Product barcode. GTIN is not the Product SKU, Roll serial, ERP serial, Transfer ID, Activation code, or Warranty token.

The platform must never invent or allocate a GS1 GTIN. It only stores an officially assigned value. The Product may exist before a GTIN is available, but normal outer Roll-label generation requires a valid GTIN at print preflight.

A GTIN may be assigned once to an already-produced Product when the field was previously empty. After a non-null GTIN is assigned to a Product with generated operational production, normal editing must not change or clear it; a materially different trade item should follow the existing new-Product/new-SKU rule.

### PD-031 — One contextual Roll QR serves public discovery and operational identification
**Status:** Approved — 2026-08-14

The outer Roll label uses one QR derived deterministically from the existing canonical Roll serial through a stable public resolver URL. No separate random Roll QR identifier is created merely for printing.

A normal phone-camera scan uses that URL only to reach the public Product information experience associated with the Roll and must not expose custody, Transfer history, ERP serial, internal IDs, or operational permissions.

The same QR may be parsed inside later authenticated workflows such as Transfer, Receipt, or Roll Opening to identify the exact physical Roll. Each workflow still applies its own authorization, custody, reservation, and lifecycle rules. Possession of the QR or a photo of it never grants operational authority.

Because this contextual Roll QR already provides the public Product-information path, the V1 outer label does not need a second Marketing QR.

### PD-032 — Cube E owns the real outer Roll label and reusable print foundation
**Status:** Approved — 2026-08-14

Cube E is no longer a temporary scan-only sticker. It owns the first real outer carton Roll label, printed as two identical front/back copies per Roll, plus the professional deterministic print/imposition foundation needed to generate and reprint it at production scale.

The historical `15 × 10 cm` outer-label size is the first physical validation target, not a frozen final printer specification. Final dimensions, media margins/gaps, bleed, cut contour, registration marks, RIP requirements, and color profile are frozen only after real print/cut and scan validation.

Cube E must avoid report-style PDFs with uncontrolled blank space and must support automatically planned bounded output for Production Orders containing thousands of Rolls without manual repositioning or editing of individual labels.

The remaining Production-owned labels — such as bag/case, inner Roll, and separate ERP labels — remain later Cube I work and must reuse Cube E print primitives rather than create a second print engine. Activation/Warranty labels remain excluded until their own identifier/lifecycle decisions are approved.

### PD-033 — Protection Giants Admin acts only as the Company party in Transfer mutations
**Status:** Approved — 2026-08-14

For ordinary Roll Transfer party actions, an active Protection Giants Admin represents the singleton Company Operational Party. This allows Company-held production Rolls to be sent and allows returns to the Company without adding a separate Company-user role.

This is intentionally narrow: Admin does not receive a general ability to impersonate an Agent, Dealer, or Center as the acting sender/recipient party. Ordinary operational parties act only through users bound to their own active entity. A separately defined administrative recovery action may resolve a stuck pending reservation without acting as either business party; that exception is governed by PD-036.

### PD-034 — Active Transfer reservation blocks Production Order void
**Status:** Approved — 2026-08-14

A Production Order cannot be voided while any Roll generated under it is reserved in an active pending Transfer. The pending Transfer must first be cancelled, rejected, received, or otherwise resolved by its owning lifecycle.

The platform does not silently cancel Transfer state as a side effect of voiding Production. This preserves the physical movement record and prevents a Roll from being simultaneously treated as operationally reserved and historically voided.

When confirmed receipt/custody movement is implemented later, the Production-void rule must be re-reviewed for already-transferred Rolls.

### PD-035 — Pending Transfers do not expire automatically in the first release
**Status:** Approved — 2026-08-14

The first release does not automatically expire pending Roll Transfers or release reservations on a timer. Cancellation, rejection, receipt, or later explicit resolution changes the Transfer state.

Automatic timeout/cron expiry is deferred until a real operational requirement demonstrates that it is needed.

### PD-036 — Suspended-party pending Transfers have a narrow audited Admin recovery path
**Status:** Approved — 2026-08-14

Suspending an operational party does not automatically cancel its pending Transfers or silently release Roll reservations. Physical movement intent must remain explicit and auditable.

To avoid an unrecoverable reservation when an involved business party becomes operationally inactive, an active Protection Giants Admin may perform a dedicated administrative recovery cancellation of a still-pending Transfer only when the defined suspended-party recovery condition is present. The action requires an audit reason, releases the pending reservation, and does not change confirmed custody.

This recovery action is not sender/recipient impersonation and must not become a general Admin ability to send, reject, receive, or otherwise act as an arbitrary Agent, Dealer, or Center.

### PD-037 — Pre-install Issue submission immediately pauses Warranty Activation
**Status:** Approved — 2026-08-22

A valid Pre-install Roll Issue submitted after Roll Opening immediately places that exact Roll under a temporary Warranty Activation hold. Company confirmation is not required to start the hold, and submission alone does not mean the Roll is proven defective.

`cleared_for_use` or the narrow administrative correction `reported_in_error` removes the issue-specific hold, subject to every other Activation rule. `return_required` keeps the Roll blocked from Warranty Activation. The future Warranty Activation mutation must revalidate this state atomically rather than trust UI state.

### PD-038 — Company alone resolves Pre-install Issues in V1
**Status:** Approved — 2026-08-22

Only active Protection Giants Admin/Company may make the final V1 Pre-install Issue decision. Country Agents, Dealers, and Centers do not receive quality-review authority; an Agent's opened-Roll Recovery capability does not grant quality-decision power.

The two normal terminal quality outcomes are `cleared_for_use` and `return_required`. A separate Admin-only `reported_in_error` terminal correction is permitted for accidental reports, requires an audit reason, preserves the original report/history, and is not treated as a quality clearance.

### PD-039 — Pre-install Issue categories are fixed and intentionally small in V1
**Status:** Approved — 2026-08-22

V1 uses exactly four report categories: `manufacturing_defect`, `physical_damage`, `contamination_or_packaging`, and `other`. A human description is required and category selection never determines the final quality decision automatically.

Severity matrices, root-cause taxonomies, SLA classifications, and generic QMS coding are deferred unless real operational use demonstrates a need.

### PD-040 — Pre-install Issue evidence is optional private images without an in-system evidence loop
**Status:** Approved — 2026-08-22

A Center may attach optional private images when submitting a Pre-install Issue; zero images remains a valid report. V1 supports images only, not video, and issue evidence is operational evidence separate from Product assets.

V1 does not add a formal `request more evidence / Center response` workflow, comments thread, assignment, or ticket-state loop. Exceptional requests for more information may occur outside the platform until operational usage proves that a dedicated in-system loop is necessary.

### PD-041 — Warranty Activation creates one Warranty with its own Warranty Number
**Status:** Approved — 2026-08-25

Successful V1 Warranty Activation creates the durable customer Warranty record directly; there is no separate generic mutable Activation workflow object.

Every created Warranty receives a database-generated human-readable **Warranty Number** using the `PG-W-NNNNNNNN` family. It is a stable operational/customer reference, not a secret. It is globally unique, never reused, and remains permanently reserved even if the Warranty is later corrected to `voided_in_error`.

Database sequence gaps are acceptable. The Warranty Number is distinct from SKU, Roll serial, ERP serial, Transfer ID and the future secure public Warranty token. This decision supersedes earlier generic references to an “Activation Code” where those references meant the human-facing Warranty-instance identifier.

### PD-042 — Mistaken activation uses audited void-in-error, never deletion or silent reassignment
**Status:** Approved — 2026-08-25

A demonstrably false/wrong-Roll activation may be transitioned by active Protection Giants Admin to `voided_in_error` with a mandatory reason and immutable audit evidence. The historical Warranty row and Warranty Number remain retained.

The Roll may be activated again only through a new request after every current Activation eligibility rule is revalidated. The new Warranty receives a new Warranty Number. There is no restore-to-issued action, no Warranty Number reuse, and no automatic Transfer/Recovery/reactivation side effect.

This is an audit correction, not a replacement/reinstall entitlement.

### PD-043 — PPF Warranty coverage begins at authoritative successful Activation time in V1
**Status:** Approved — 2026-08-25

The V1 Warranty term begins at the authoritative database timestamp of successful Activation. Expiry is derived from that timestamp plus the snapshotted Product warranty duration using calendar-month arithmetic.

The Center does not enter or backdate an installation date in V1, and there is no mandatory maximum delay between Roll Opening and Activation. A future requirement to start coverage from another physical-installation date requires a new explicit Product Decision.

### PD-044 — Warranty snapshots physical Product identity, current policy, and installing Center identity
**Status:** Approved — 2026-08-25

The Warranty snapshots the Product code/name/version identity from the immutable Production Order snapshot belonging to the physical Roll, while warranty duration/coverage/care are snapshotted from one consistent current Product policy state at Activation time.

The installer is not entered as free text. It is the authenticated active Center that holds confirmed current custody. The Warranty stores both the stable activating Center party id and an immutable activating Center-name snapshot so later Center renaming does not rewrite the historical issuance record.

An already-produced legitimate Roll is not blocked merely because the Product is later archived/unpublished, but incomplete warranty policy content blocks Activation recoverably until Admin completes it.

### PD-045 — V1 customer Warranty data remains intentionally minimal
**Status:** Approved — 2026-08-25

Normal Activation requires customer full name and phone; email is optional.

The legacy reference system also collected postal address lines, country, state and postal code. Those fields are not carried into normal V1 Activation because no current Warranty lifecycle requirement justifies the additional collection/PII burden.

No generic customer table, customer account, CRM/deduplication subsystem or mandatory OTP is introduced by Cube M.

### PD-046 — V1 vehicle identity uses conservative VIN/chassis validation
**Status:** Approved — 2026-08-25

Normal Activation requires vehicle make, vehicle model and VIN/chassis identifier. Model year, plate number and vehicle color are optional.

VIN/chassis is normalized uppercase and accepts 6–40 ASCII letters/digits with no whitespace rather than enforcing only the modern 17-character VIN form. VIN/chassis is not globally unique across all Warranties and is never used as a public-access secret.

### PD-047 — Center users cannot edit or undo an issued Warranty
**Status:** Approved — 2026-08-25

After successful Activation the Center cannot directly edit, delete, void or reassign the Warranty.

Active Protection Giants Admin has only two bounded support paths in Cube M: correct customer/vehicle details with a mandatory reason and audit event, or mark an activation `voided_in_error` under PD-042.

Roll identity, Warranty Number, installing Center identity/name snapshot, activation actor/time, Product/policy snapshots and coverage timestamps remain immutable through the customer/vehicle correction path.

### PD-048 — Effective Warranty closes the pre-Warranty Issue/Recovery path
**Status:** Approved — 2026-08-25

An effective issued Warranty blocks creation of a new Pre-install Roll Issue for that Roll and blocks Cube J Opened Roll Recovery.

The Warranty Activation mutation, Pre-install Issue mutation and Opened Roll Recovery mutation must preserve their established physical-Roll lock discipline so concurrent attempts produce one deterministic valid winner rather than contradictory committed states.

If a Warranty is later `voided_in_error`, only the Warranty-specific block is removed; all ordinary Cube J/K eligibility rules still apply.

### PD-049 — Later Center/Product metadata changes do not silently rewrite an issued Warranty
**Status:** Approved — 2026-08-25

After issuance, changes to Center network approval, Center location, later Center suspension, later Center name, Product publication/archive state or later Product policy/content do not silently rewrite or cancel the historical customer Warranty.

Customer coverage remains based on the issuance snapshots until a future explicitly approved Claims/Replacement lifecycle establishes a customer-Warranty consequence.

### PD-050 — Public Warranty security identity is separate from Warranty Number
**Status:** Approved — 2026-08-25

Cube M does not create the public Warranty authorization credential. The later Public Warranty Access / Verification cube owns a cryptographically strong, non-enumerable public token and stable public Warranty URL.

The approved future vehicle, Warranty-card and invoice QR copies must point to that secure public identity. SKU, Roll serial, ERP serial, Transfer ID and the non-secret Warranty Number must not be used as substitutes for the public authorization token.

### PD-051 — Customer Warranty public identity is permanently owned by the physical Roll
**Status:** Approved — 2026-08-25

The customer-facing public Warranty credential belongs to the physical Roll, not to a particular Warranty row. Every new Roll receives exactly one cryptographically strong, random, non-enumerable public code atomically as part of Roll creation; a new operational Roll must not commit without that identity.

The public code is permanent. It is not derived from SKU, Roll serial, ERP serial, Transfer ID, Warranty Number, VIN or another business identifier, and it is not rotated, reassigned or replaced when a Warranty is corrected, voided in error, legitimately reactivated or naturally expires.

This decision supersedes PD-050 only where its wording implied that the public credential would be allocated to a Warranty after Activation. PD-050 remains authoritative that Warranty Number and other human/operational identifiers are not public authorization credentials. PD-031's contextual outer-Roll QR remains a separate unchanged identity surface.

### PD-052 — One stable canonical Warranty URL is reused by every customer QR copy and reprint
**Status:** Approved — 2026-08-25

The permanent production public Warranty URL is `https://protectiongiants.com/w/<PUBLIC-CODE>`. The vehicle, Warranty-card and invoice copies for one Roll all use this exact Roll-owned identity, and every later reprint must reproduce the same URL.

Deployment, hosting or internal routing changes must preserve the `/w/<PUBLIC-CODE>` contract. Vercel preview URLs, staging hostnames and operational portal hostnames must never become the printed production Warranty identity.

### PD-053 — Public Warranty verification is bearer-link access only in V1
**Status:** Approved — 2026-08-25

Viewing the public Warranty page requires no customer account, login, password or OTP. Possession of the high-entropy `/w/<PUBLIC-CODE>` URL is sufficient for the approved read-only public projection.

V1 provides no public manual lookup by Warranty Number, VIN/chassis, vehicle plate, Roll serial, ERP serial, SKU, customer phone/email/name or similar enumerable identifiers. Malformed and unknown public codes use the same generic invalid-link response and reveal no existence hints.

### PD-054 — The Roll-owned public identity resolves the current real Warranty lifecycle
**Status:** Approved — 2026-08-25

Before Activation, a valid public identity confirms the Roll/Product is genuine and registered and states that Warranty is not yet activated. If a mistaken Warranty is later `voided_in_error`, the public identity remains valid but exposes no historical void details; until a legitimate new Warranty exists it states only that there is no current Warranty.

A later legitimate reactivation after `voided_in_error` is shown automatically through the same public URL and carries its new Warranty Number. Natural Warranty expiry keeps the same URL permanently verifiable with status `expired` and never makes the Roll eligible for a second Warranty. A Roll that becomes terminally unavailable before any effective Warranty shows only that it is unavailable for Warranty activation.

If contradictory data prevents one authoritative state from being determined, the public resolver must fail closed rather than guess or select an arbitrary Warranty. Once an effective issued Warranty exists, later ordinary Roll/Product/Center operational metadata changes do not silently change or cancel the customer Warranty.

### PD-055 — Public Warranty projection is minimal and snapshot-based
**Status:** Approved — 2026-08-25

For an effective Warranty, the V1 public page may display only Warranty Number, derived status, Product name, Activation/start date, coverage end date, activating/installation Center name, vehicle make, vehicle model and vehicle year when present.

Customer name, phone, email, VIN/chassis, vehicle plate, Roll serial, ERP serial, internal UUIDs, custody/Transfer history, Opening/Issue details, audit events and correction/void reasons are not part of the anonymous public projection.

Before Activation, Product identity comes from the immutable Production Order snapshot belonging to the Roll. After Activation, Product/Center/coverage facts come from the Warranty issuance snapshots. Cube M's allowed customer/vehicle correction updates may be reflected where the corrected field is part of the approved public projection.

### PD-056 — Cube N freezes public Warranty access but defers Claims, printing and analytics
**Status:** Approved — 2026-08-25

Cube N Public Warranty Access / Verification owns the permanent Roll public identity, stable `/w/` URL, narrow resolver, Arabic mobile-first public page, lifecycle states, anti-enumeration behavior and security/privacy regression coverage.

Cube N does not render or print the customer QR labels, implement vehicle/Warranty-card/invoice layouts, expose a Claims button or Claims workflow, build QR scan/view analytics, add customer login/OTP, or add multilingual UI. The next customer Warranty print slice reuses the already-frozen `/w/<PUBLIC-CODE>` identity and the existing shared QR reliability foundation.
