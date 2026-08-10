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
**Status:** Approved

When physical rolls are transferred to another operational holder, scanning is used to ensure the serials recorded in the transfer match the physical rolls actually moved.

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
