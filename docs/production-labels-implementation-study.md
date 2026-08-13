# Production Labels — Implementation Study

**Status:** Proposed implementation study — not yet an approved implementation specification  
**Date:** 2026-08-13  
**Branch:** `agent/production-labels`  
**Roadmap position:** after Agent & Network Foundation; before Roll Custody & Transfers

## 1. Purpose

This study defines the smallest complete and safe Production Labels cube that can be built on the foundations already merged into `main`.

It does **not** authorize implementation of unresolved Activation/Warranty identifiers. Its purpose is to separate labels that can be produced deterministically from existing Production data from labels that require a later business object or protected identifier.

The implementation must preserve the project rules:

- develop one complete cube at a time;
- do not rebuild Product or Production foundations;
- do not mix physical custody/transfer state into print output;
- do not create speculative generalized template engines;
- do not reuse one identifier to impersonate another business identifier;
- complete double review before merge.

---

## 2. Source hierarchy for this cube

Implementation decisions use this priority:

1. approved Product Decisions in `docs/product-decisions.md`;
2. current Production and Network specifications/documentation;
3. verified current business requirements;
4. legacy repository only as a historical functional reference.

The legacy repository must not be copied as architecture, schema, runtime, PDF stack, or security design.

---

## 3. Confirmed roadmap position

`docs/distribution-network-flow-spec.md` explicitly freezes the sequence after Network Foundation:

1. close Agent & Network Foundation;
2. return to **Production Labels** with the network/recipient identity model fixed;
3. then implement **Roll Custody & Transfers** using the frozen Transfer contracts.

Therefore Production Labels is the next business cube.

This cube must not implement Transfer reservation, recipient acceptance, current custody, Roll opening, Warranty Activation, or claims.

---

## 4. Existing foundations that Production Labels can rely on

### 4.1 Product

The current Product foundation provides the canonical SKU (`products.code`) and stable physical Product specification.

PD-016 and PD-020 require:

- Product code/SKU is distinct from Roll serials, ERP serials, Lot numbers and future Activation/Warranty codes;
- one SKU maps to one stable physical Product specification.

### 4.2 Production Order snapshot

Each `production_orders` row already contains an immutable historical Product snapshot suitable for deterministic label reprints:

- Product/SKU code;
- Product name;
- Product version/model;
- width;
- length;
- thickness;
- weight;
- country of origin;
- production date;
- order identity and audit status.

A later Product edit therefore must not change a label reprinted for an older Production Order.

### 4.3 Lot

Each `production_lots` row already provides:

- system Lot number;
- sequence inside the Production Order;
- optional source Lot reference;
- Roll count.

### 4.4 Physical Roll

Each `rolls` row already represents one physical Roll and provides:

- immutable internal Roll serial;
- independent ERP serial;
- Roll index;
- Product/Order/Lot lineage.

No additional random “label serial” should be generated merely because a label is printed.

### 4.5 Network identity

Agent & Network Foundation is now merged. Operational Party and Transfer ID exist, but Production Labels should not consume Transfer ID unless a specific approved label requires it.

Transfer ID identifies operational parties, not Product/Roll identity.

---

## 5. Historical functional reference — what is useful and what is rejected

The legacy system historically combined:

- serial generation;
- QR generation;
- barcode generation;
- HTML ticket rendering;
- asynchronous Celery work;
- Selenium/headless Chrome PDF generation;
- stored PDF files;
- Excel export.

The useful functional lessons are only:

- operators need batch printing/reprinting;
- labels may contain machine-readable QR/barcode elements;
- a printable collection should be generated from a known set of physical identities.

The following legacy architecture is explicitly rejected as a starting point:

- generating new product/activation serials during label printing;
- Django/Celery/Selenium as an inherited runtime design;
- filesystem PDF paths as the business record;
- embedded giant HTML assets as the label definition;
- treating a Product barcode, Roll identity and Activation identity as interchangeable.

In the current platform, Production already owns the physical identities. Labels are an **output/reprint layer**, not an identity-generation subsystem.

---

## 6. Functional label inventory from the current business requirements

The historical business discussion contains multiple physical label concepts. They must be normalized before implementation rather than treated as one undifferentiated “ticket”.

### 6.1 Production-data labels — technically buildable now

These can be generated entirely from current immutable Product/Order/Lot/Roll data and do not require a new operational business state:

1. **Outer carton Product/Roll label**
   - historical requested size: approximately `15 × 10 cm`;
   - requested as two physical copies for carton front/back;
   - Product header/name;
   - SKU;
   - Lot;
   - stable physical specification such as thickness/length/weight as applicable;
   - production/roll identity needed for traceability;
   - informational/marketing website QR where required.

2. **Outer bag/case label**
   - used when the Roll is shipped without the carton;
   - based on the same production identity, not a new serial.

3. **Inner Roll/coil identity label**
   - stays physically with the Roll;
   - uses the canonical Roll/Lot identity;
   - does not create or imply Warranty Activation.

4. **Independent ERP serial label**
   - small operational label;
   - encodes/displays the existing `rolls.erp_serial`;
   - ERP serial remains distinct from public/Activation identity.

5. **Marketing/global website QR**
   - informational only according to PD-005;
   - may be included within a production label template;
   - never changes Roll custody or Warranty state.

### 6.2 Labels that depend on later Activation/Warranty identity — not safe to invent now

The historical requirements also mention:

- an Activation sticker with QR and variable Activation code;
- a vehicle-pillar follow-up QR label;
- warranty-card label;
- invoice label.

Those labels are not automatically equivalent to Production labels merely because they are physically printed in the same factory workflow.

PD-016 explicitly separates future Activation codes from:

- Product SKU;
- Roll serial;
- ERP serial;
- Lot number.

Therefore the Production Labels cube must **not** silently use `rolls.serial_number` or `rolls.erp_serial` as an Activation/Warranty code.

A formal Product Decision is required before these later-identity labels are implemented if they must physically be printed at Production time.

---

## 7. Unresolved physical-count ambiguity

Historical requirements included a reference to “5 pieces per Roll”, while the described label/copy inventory can exceed five physical pieces once carton front/back plus bag, inner Roll, Activation, pillar, warranty-card, invoice and ERP labels are counted.

The implementation must not silently normalize this mismatch.

Before final print-template implementation, the approved label matrix must state for each label:

- label type;
- number of physical copies per Roll;
- exact physical size;
- when it is printed;
- where it is applied;
- whether it is always printed or conditional;
- identifier encoded/displayed.

This is a print-production decision, not a database reason to add generalized configuration now.

---

## 8. Identifier separation contract

Production Labels must maintain the following distinct concepts:

| Identifier | Owner | Current status | Label use |
|---|---|---|---|
| Product SKU | Product | implemented | Product identification / barcode if approved |
| Production Order number | Production Order | implemented | batch/order traceability where useful |
| Lot number | Production Lot | implemented | physical Lot traceability |
| Internal Roll serial | Physical Roll | implemented | canonical platform Roll identity |
| ERP serial | Physical Roll | implemented | independent ERP/sales operational identity |
| Transfer ID | Operational Party | implemented | recipient identity; not a Roll label identifier by default |
| Marketing website URL/QR | Public content | available concept | informational only |
| Activation code | future Activation object/contract | unresolved | must not be substituted with Roll/ERP serial |
| Warranty public token/URL | future Warranty object/contract | unresolved | owned by Warranty cube unless explicitly decided otherwise |

No renderer may infer that two rows in this table are interchangeable.

---

## 9. Recommended architecture

### 9.1 Labels are deterministic projections

A label should be rendered from canonical persisted data, primarily:

`Production Order snapshot + Lot + Roll`

The label layer should not own copies of Product specification or generate new Roll identities.

This gives reliable reprints and avoids label drift.

### 9.2 No speculative template engine

First release should use a small fixed set of named label templates/components rather than:

- drag-and-drop designer;
- database-defined arbitrary templates;
- user-authored HTML/CSS;
- generic merge-field engine;
- workflow designer.

Those abstractions are not required by the approved use case and create unnecessary failure/security surface.

### 9.3 Canonical render path

Recommended structure:

- server-only label data loader validates Admin and generated Production Order;
- fixed typed label-view models convert persisted data to print fields;
- fixed React/HTML label templates render exact physical dimensions using print CSS;
- QR/barcode generation receives only explicit canonical payloads;
- browser print route is the canonical visual renderer;
- downloadable PDF support should reuse the same label definitions, not maintain a second visual template.

### 9.4 QR/barcode generation

A small pinned library can be added when implementation starts, after runtime/build verification.

Rules:

- QR/barcode payload is explicit per label type;
- generated visual code is derived from persisted canonical identity;
- no hidden random code is created at render time;
- reprinting produces the same identity payload;
- human-readable identity is printed alongside machine-readable identity where operationally necessary.

### 9.5 PDF strategy

Do not inherit the old Selenium/Celery stack by default.

The current Next.js application already supports dedicated print routes. The preferred first implementation is:

1. deterministic print-optimized route as canonical output;
2. exact-size CSS pages/labels;
3. bounded batch selection;
4. only add direct downloadable PDF generation if required by the operational handoff, using the same view model/template source.

If a server PDF library is introduced, it must be verified against the actual deployment runtime and must not require a heavyweight browser/container subsystem unless a demonstrated rendering requirement makes that unavoidable.

---

## 10. Batch and reprint model

Historical operations referenced PDF collections around 50/100 serials. The new model should not create a separate serial collection business entity just to preserve that behavior.

Recommended behavior:

- operator opens a generated Production Order;
- chooses a fixed label set/template;
- chooses all Rolls, one Lot, or a bounded Roll range;
- the system shows the exact count before rendering;
- large outputs are split into bounded print batches;
- reprint uses the same canonical persisted data;
- no “printed once” flag prevents legitimate reprint unless a later audit requirement specifically requires print-event tracking.

A practical initial bounded batch target can be `50` or `100` Rolls, but the exact default should be approved with the physical print workflow rather than guessed from the old system.

The maximum 10,000-Roll Production Order must **not** be rendered as one unbounded browser/PDF payload.

---

## 11. Voided Production Order rule

Production Foundation requires later operational flows to reject Rolls whose parent Production Order is `voided`.

For labels:

- normal operational label generation must reject a voided Production Order;
- previously generated identities remain visible for audit;
- if audit/reprint access to a voided label is needed, it must be unmistakably marked `VOID / مُبطل — غير صالح للاستخدام التشغيلي` and must not be presented as a normal production output.

This avoids turning retained audit identities into usable stock labels.

---

## 12. Authorization scope

Initial Production Labels should remain **Admin-only**, aligned with current Production Order access.

The label cube does not grant Agents/Dealers/Centers access to Production Order history merely because those parties will later hold Rolls.

Later custody views may expose the current custodian's own Roll identity through their own scoped contracts, without widening Production Label administration.

---

## 13. UI integration

The cleanest initial integration point is the existing Production Order detail page.

For a generated order, add a deliberate action such as:

- `ملصقات الإنتاج`

This opens a task flow rather than crowding the order detail with print settings.

Suggested mobile-first flow:

1. choose label type/set;
2. choose scope: full order / Lot / bounded Roll range;
3. preview count and key identity range;
4. open print preview;
5. print/export.

The existing production registry and Roll registry remain unchanged.

Voided orders expose only the explicit audit-safe path if approved.

---

## 14. Data-model impact

### 14.1 Expected first increment

For production-only deterministic labels, **no new business table is currently required**.

Existing immutable Production data is sufficient for rendering.

### 14.2 Do not add pre-emptively

Do not add tables for:

- label copies;
- print jobs;
- arbitrary templates;
- activation tokens;
- warranty tokens;
- delivery/shipping labels;
- custody history.

A small print-event audit table should be added only if there is an approved operational/legal requirement to know who printed/reprinted which batch and when. It is not required merely to render labels.

---

## 15. Proposed implementation increments

The cube can be developed smoothly in complete vertical increments:

### Increment 1 — Production Label contract and view model

- approve label matrix that is buildable from current Production data;
- typed server view models;
- void-state rules;
- explicit machine-readable payload contract;
- automated data/identity tests.

### Increment 2 — First fixed production label template

- outer Product/Roll label;
- exact print dimensions;
- Product snapshot + Lot + Roll identity;
- marketing QR if approved for that template;
- one-Roll preview/print route;
- visual print regression checks where practical.

### Increment 3 — Remaining production-only label templates

- bag/case label;
- inner Roll identity label;
- ERP serial label;
- shared visual primitives only where duplication is demonstrated.

### Increment 4 — Batch print/reprint

- full Lot / bounded Roll range selection;
- count preflight;
- 50/100-style bounded output policy after approval;
- deterministic order and page breaks;
- no unbounded 10,000-Roll render.

### Increment 5 — Downloadable PDF only if operationally required

- use the same view model/template definitions;
- verify actual hosting runtime;
- no Selenium/Celery inheritance without demonstrated need;
- bounded generation and clear failure behavior.

### Increment 6 — Closure

- production data correctness review;
- identifier/security review;
- print dimension/QR/barcode readability review;
- mobile/admin workflow review;
- reprint and void regressions;
- full existing Product/Production/Network regression;
- second independent review before merge.

Activation/Warranty labels are **not automatically Increment 7**. They enter implementation only when their owning identifier/lifecycle is approved.

---

## 16. Blocking decisions before implementation is called complete

The following must be formalized before the physical label set can be declared complete:

1. **Final label/copy matrix**
   - exact list of label types;
   - exact copies per Roll;
   - exact size for each;
   - conditional vs always printed.

2. **Machine-readable payload per label**
   - SKU barcode, Roll serial, ERP serial, URL QR, etc.;
   - barcode symbology where a barcode is required.

3. **Activation label ownership/timing**
   - whether an Activation identifier is allocated at Production time or only in the future Activation cube;
   - which table/business object owns it;
   - public route and anti-enumeration contract;
   - reprint rules.

4. **Warranty/pillar/invoice QR relationship**
   - whether they are copies of one future Warranty public token/URL or distinct physical identifiers;
   - when they become printable.

5. **Batch print operating default**
   - `50`, `100`, or another bounded default;
   - whether operator can switch between approved batch sizes.

6. **Final visual artwork/assets**
   - brand/logo rules;
   - multilingual requirements;
   - exact text/legal marks;
   - printer tolerances/bleed if required.

These are narrow product/print decisions. None justify adding a generalized print-management subsystem.

---

## 17. Recommended decision on the cube boundary

The safest and most coherent implementation boundary is:

### Production Labels cube now

Build and close all labels whose truth already exists in Product/Production data:

- physical Product/Roll traceability labels;
- Lot/SKU/spec labels;
- inner Roll identity;
- ERP identity;
- informational website QR;
- bounded batch print/reprint.

### Defer identity-dependent labels until their owning cube is defined

Do not create fake Activation/Warranty identifiers just to finish a physical sheet.

When the future Activation/Warranty contract is approved, those templates can reuse the established label rendering primitives without redesigning Production or Roll identity.

This respects the project rule: complete each function that can be truthfully completed, but do not complete a print layout by inventing business state owned by a later cube.

---

## 18. Double-review acceptance plan

Before Production Labels is merged:

### Review 1 — implementation integrity

- correct Product snapshot / Lot / Roll data mapping;
- no identifier substitution;
- generated vs voided behavior;
- exact dimensions/page breaks;
- QR/barcode payload and readability;
- batch boundaries and reprint determinism;
- Admin authorization;
- TypeScript/build/current regression suite.

### Review 2 — independent cross-layer review

Re-read Product Decisions and Production contracts from scratch, then audit:

- Product → Order snapshot → Lot → Roll → label relationship;
- history/reprint stability;
- no accidental custody/Activation/Warranty state;
- no service key/client exposure;
- large-order behavior;
- mobile task flow and dead controls;
- legacy-reference contamination;
- full Product/Production/Network regressions.

No merge before both passes are green.

---

## 19. Study conclusion

The platform is technically ready to begin Production Labels without redesigning the merged foundations.

The correct next engineering step is **not** to create new serials. It is to build a deterministic print/reprint layer over the already-established immutable Production identities.

The only material product boundary that must remain explicit is the Activation/Warranty label family. Current approved decisions separate those identifiers from Roll and ERP identity, so they must not be fabricated or aliased inside Production Labels.