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

### PD-006 — Approved center account required for operational activation
**Status:** Approved

Roll opening and customer warranty activation are performed from an authenticated approved installation-center account. A free-text center name is not sufficient.

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

### PD-012 — Approved centers shown publicly are controlled records
**Status:** Approved

Only centers registered/approved in the platform can be presented as approved centers on the public website. A center is not made public merely because it installed a product.

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

### PD-026 — Operational Center registration and Warranty approval are separate
**Status:** Approved — 2026-08-12

An operationally registered/active Center may participate in the network and custody flow without automatically becoming an approved Warranty Activation center or public approved-center listing. Warranty approval is a later explicit business permission and must not be inferred from Center creation or onboarding.
