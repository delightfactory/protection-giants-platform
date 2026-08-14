# Cube E — Outer Roll Label & Print Foundation Specification

**Status:** Approved implementation specification  
**Date:** 2026-08-14  
**Branch:** `feature/cube-e-outer-roll-label-print-foundation`  
**Depends on:** Product Foundation + Production Order/Lot/Roll Foundation  
**Does not depend on:** Custody/Transfer state implementation

## 1. Objective

Create the first production-grade physical identity output for a Protection Giants Roll:

1. add the missing Product GTIN/global trade identifier;
2. render one permanent outer Roll label design in two identical front/back copies;
3. place one contextual QR on that label, derived from the canonical Roll serial;
4. make normal camera scans lead to public Product information while future in-app scans resolve the same physical Roll;
5. establish a deterministic professional print/export foundation that can handle large Production Orders without manual label editing or wasteful report-style PDF layout.

This is a complete vertical cube, not a temporary QR proof and not the full future label package.

## 2. Verified foundations already available

### Product

Current Product Foundation already provides:

- internal UUID;
- canonical SKU in `products.code`;
- public `slug`;
- Product name;
- PPF type/category/version;
- width;
- length;
- thickness;
- weight;
- origin;
- public Product content;
- warranty/care policy.

Current schema has **no GTIN/barcode field**.

### Production Order snapshot

`production_orders` already snapshots the stable Product values required for deterministic historical printing:

- SKU/code;
- Product name;
- version;
- width;
- length;
- thickness;
- weight;
- origin;
- Production date;
- generated/voided status.

### Lot

`production_lots` already provides:

- system Lot number;
- Lot sequence;
- optional source Lot reference;
- Roll count.

### Roll

`rolls` already provides:

- canonical unique Roll serial (`serial_number`);
- independent unique ERP serial (`erp_serial`);
- Roll index;
- Product/Order/Lot lineage.

No extra Roll barcode/QR identity column is required.

### Current runtime

Current `package.json` contains Next.js/React/Supabase only. There is no QR, barcode, PDF, headless-browser or print library installed today.

Therefore the implementation must deliberately select and pin the smallest Node-compatible libraries that satisfy the tests below. No Selenium/Celery/Puppeteer stack is inherited from the old system by default.

## 3. Product GTIN data contract

Add nullable `products.gtin text`.

### Database invariants

When present:

- digits only;
- exact length must be one of 8, 12, 13 or 14 digits;
- GS1 check digit must validate;
- unique across Products;
- whitespace-normalized before persistence;
- leading zeroes preserved because storage is text, not numeric.

### Lifecycle rule

- Product may be created without GTIN;
- GTIN may be assigned later by Admin;
- once a non-null GTIN exists on a Product with generated operational Production, normal Product editing cannot change it to another value or clear it;
- a one-time `NULL -> valid GTIN` assignment remains allowed for an already-produced Product;
- a material Product change that requires a different GTIN should already be represented by a new Product/SKU under PD-020 rather than mutating the old produced identity.

### Authorization

Use the existing Product Admin edit boundary. Do not create a public mutation RPC for GTIN.

### Label preflight

Normal outer-label generation requires a valid GTIN. A Product/Production Order without GTIN remains valid data, but the label UI must stop before print generation and tell Admin that Product GTIN is missing.

## 4. Product barcode contract

The linear barcode on the outer label represents **Product GTIN only**.

It must not encode:

- SKU unless SKU itself is the officially assigned GTIN (not assumed);
- Roll serial;
- ERP serial;
- Activation code;
- Warranty token.

Barcode symbology is selected from the actual GTIN form and real use case, not guessed from the historical screenshot. The implementation must include automated payload tests and a physical scan test before final symbology/size is frozen.

## 5. Roll QR payload contract

The QR represents the canonical physical Roll through a stable HTTPS resolver URL.

Canonical shape:

`{PUBLIC_SITE_URL}/r/{serial_number}`

Example shape only:

`https://<production-host>/r/PG-R-YYYYMMDD-NNNNNNNN-LL-RRRR`

Rules:

- use the existing immutable Roll serial;
- no random QR token column;
- no QR payload generated from custody or Transfer state;
- same Roll => same QR payload on every print/reprint;
- front and back copies for the same Roll contain the same QR;
- URL generation must use configured public site origin, not a hard-coded development host;
- parser must reject unrelated domains/routes and malformed Roll serials when used inside operational scan flows.

## 6. Public Roll resolver

Add a public route conceptually at:

`/r/[serial]`

Its public responsibility is intentionally narrow.

### Valid public scan

For an exact known Roll whose Product is currently eligible for the public Product experience:

- resolve Roll -> Product safely;
- redirect/render the public Product page/content;
- do not expose Roll custody/history, ERP serial, Production Order, internal IDs, Transfer state or operational actions.

### Unknown/invalid scan

Return a normal public not-found/invalid-label result without internal diagnostics.

### Data-access boundary

Anonymous users currently cannot browse `rolls` and that must remain true.

Implement a narrow exact-match public resolver contract rather than granting anonymous SELECT on `rolls`. The resolver may return only the minimal public Product routing data needed for the exact supplied Roll serial.

The public resolver is informational and confers no operational authority.

## 7. Future operational scan behavior

Cube E does not build Transfer/Receipt/Roll Opening state machines.

It must, however, expose a reusable QR payload parser that future workflows can use.

Future flow:

1. camera/scanner returns the QR string;
2. parser confirms approved host/path and extracts canonical Roll serial;
3. authenticated workflow resolves the Roll through its own scoped data contract;
4. workflow applies its own rules.

Examples:

- Transfer Send: sender must currently hold the Roll and Roll must be transferable;
- Receipt: Roll must belong to the expected pending Transfer item;
- Roll Opening: authenticated active Center must hold confirmed custody and Roll must be eligible.

A copied QR image alone never passes those checks.

## 8. Outer label content contract

### Copies

Default output for each selected Roll:

- copy 1: carton front;
- copy 2: carton back;
- two copies are visually identical in Cube E.

### Physical size

Initial validation target:

- `150 mm × 100 mm` based on the historical client requirement.

This remains **provisional** until real print/cut and scan validation. Do not encode the dimension as an irreversible business invariant.

### Mandatory content

The fixed V1 outer label must contain:

- Protection Giants/Product visual identity;
- Product name;
- version/model when present and useful;
- canonical SKU;
- Product GTIN human-readable digits;
- linear Product GTIN barcode;
- width × length;
- thickness;
- Lot number;
- human-readable Roll serial;
- one contextual Roll QR.

### Optional only if layout remains clean

The first design may include:

- weight;
- country of origin;
- other Product snapshot text already available.

These must not crowd out the core identifiers/readability.

### Explicitly excluded from the V1 outer label

- second Marketing QR;
- Activation QR/code;
- Warranty QR/token;
- Transfer ID;
- customer data;
- custody/history;
- ERP serial/barcode unless a later explicit decision promotes it onto this label.

## 9. Deterministic label view model

Create a typed server-side label view model built from canonical persisted records.

Expected logical inputs:

- Production Order snapshot;
- Lot;
- Roll;
- Product GTIN;
- configured public site origin.

Expected derived fields:

- display Product identity/spec;
- GTIN barcode payload;
- Roll QR URL;
- copy count = 2.

The view model must not generate random IDs and must not depend on current custody.

## 10. Rendering architecture

### Fixed template, not a template engine

Implement one named template, e.g. `outer-roll-label-v1`.

Do not build:

- drag/drop designer;
- arbitrary DB-defined templates;
- user HTML/CSS;
- generic merge-field engine;
- print workflow engine.

### Vector-first output

The canonical label renderer should preserve text and machine-readable elements as vector geometry wherever the chosen libraries support it.

The implementation must avoid raster screenshots of the entire label as the primary print artifact.

### One visual source

Preview and export must use the same typed view model and same fixed visual template definition so PDF/export does not drift from preview.

## 11. Professional imposition / print layout

The old report-style PDF behavior is explicitly rejected.

The print composer must:

- work in physical millimetres;
- know label width/height;
- know the selected media/page width and margins/gaps from an explicit print profile;
- calculate how many labels fit per row/page/roll segment;
- pack labels deterministically with no arbitrary blank report space;
- preserve front/back pairing;
- maintain deterministic order by Production Lot sequence then Roll index;
- not add browser header/footer/page margins;
- not require manual repositioning of thousands of labels in an editor.

### Printer/cutter-specific items not yet known

Do not guess until the real machine/workflow is confirmed:

- printable media width;
- required edge margin;
- inter-label gap;
- bleed;
- cut-contour/spot-color naming;
- registration marks;
- RIP-specific PDF requirements;
- color profile.

The implementation should isolate these as a small print-profile boundary so they can be frozen after physical validation without redesigning label identity/data.

## 12. Large-order generation

Production supports up to 10,000 Rolls, so Cube E must not render one uncontrolled request containing every label.

Required behavior:

- Admin may select full Production Order, one Lot, or bounded Roll range;
- UI shows Roll count and physical label count (`rolls × 2`) before generation;
- service automatically plans bounded deterministic chunks;
- chunk boundaries must not change Roll identities;
- each chunk has stable ordering and clear range/sequence naming;
- several thousand Rolls can be completed through these automatic chunks without manual design/edit work;
- safe chunk size is determined by implementation benchmark and deployment/runtime limits, with historical 50/100-Roll files retained only as evidence, not hard-coded truth.

Whether the final delivery is one multi-page vector PDF, multiple PDFs, or a packaged set is chosen after real runtime/print-tool testing; the domain does not need a `print_jobs` business table merely to make that choice.

## 13. Print/reprint behavior

- Admin-only in Cube E;
- generated Production Orders only;
- voided Production Orders blocked from normal label output;
- same Roll reprint => same Product/Lot/Roll identity and same QR payload;
- no one-time-print restriction;
- no new serial/token on reprint;
- no persistent print-event table unless a later approved audit/legal need requires it.

## 14. Admin UX

Primary entry point: existing Production Order detail flow.

Proposed task flow:

1. `ملصقات الرولات الخارجية`;
2. preflight Product GTIN + generated-order status;
3. choose scope: entire order / Lot / Roll range;
4. show Rolls count + labels count;
5. preview representative labels;
6. generate/export print-ready bounded output;
7. allow deterministic reprint.

Error states must clearly cover:

- GTIN missing/invalid;
- voided order;
- empty range;
- export-generation failure;
- unsupported/missing print profile;
- batch too large if benchmark limit is exceeded.

## 15. Database/security work expected in Cube E

Minimum expected database changes:

1. add `products.gtin` with uniqueness/format/check-digit protection;
2. extend the produced-Product identity lock with the one-time-assignment rule described above;
3. add the narrow exact-match public Roll -> public Product resolver contract;
4. update explicit grants/RLS tests without granting anonymous Roll browse access.

No new Roll identity table is expected.

No print-job/template/activation/warranty table is expected.

## 16. Automated verification

### Product GTIN

Test:

- valid GTIN lengths/check digits accepted;
- invalid length rejected;
- non-digits rejected;
- bad check digit rejected;
- duplicate GTIN rejected;
- leading zero preserved;
- produced Product allows one-time null -> valid GTIN assignment;
- produced Product rejects change/clear after assignment.

### Public resolver

Test:

- valid exact Roll resolves only public Product routing data;
- unknown serial returns no internal detail;
- anon still cannot SELECT/browse `rolls`;
- resolver does not return ERP serial, custody, internal IDs or Production details.

### QR payload

Test:

- same Roll always produces same URL;
- different Rolls produce different URLs;
- parser accepts approved route;
- parser rejects malformed serial/host/path;
- QR generation round-trip returns exact URL payload.

### Label data

Test:

- correct Product snapshot / Lot / Roll mapping;
- GTIN belongs to Product, Roll serial belongs to physical Roll;
- front/back copies identical;
- voided Production Order rejected;
- deterministic ordering and reprint.

### Print output

Test/inspect:

- physical dimension metadata;
- no report-style browser margins/header/footer;
- expected number of labels per selected Roll count;
- no duplicate/missing Roll identities across chunks;
- barcode/QR payload equality to view model.

## 17. Mandatory physical acceptance before Cube E closure

Software CI is not enough to freeze a print foundation.

Before final merge/closure:

1. print a real proof of the V1 outer label;
2. confirm physical label size on the actual output;
3. scan Product linear barcode with an appropriate scanner/app;
4. scan Roll QR with ordinary phone camera and confirm public Product experience;
5. scan the same QR through the internal parser/test harness and confirm exact Roll identity;
6. verify smallest QR/barcode size still scans reliably after real printing;
7. verify two-copy front/back layout;
8. verify a representative multi-Roll imposed sheet/roll segment;
9. record actual printer/cutter media/profile requirements discovered;
10. freeze the V1 physical profile only after those results.

If the actual printer/cutter model or RIP requirements are not yet available, implementation may reach software-complete status but Cube E must remain physically unclosed until the print profile is validated.

## 18. Explicit non-goals

Do not include in Cube E:

- Transfer engine;
- receipt/partial receipt;
- custody changes;
- Activation code;
- Warranty token;
- pillar/card/invoice Warranty labels;
- customer activation;
- claims;
- generic label designer;
- full ERP integration;
- shipping/accounting workflows;
- blanket public Roll API.

## 19. Done definition

Cube E is Done only when all of the following are true:

- Product supports a safe official GTIN field;
- a real generated Roll can produce two deterministic outer labels;
- label contains Product GTIN barcode + human-readable Roll serial + one contextual Roll QR;
- normal camera scan reaches public Product information without operational leakage;
- internal parser resolves the same QR to the exact canonical Roll identity;
- output is arranged through exact-geometry professional imposition rather than report-style PDF spacing;
- large orders are handled by automatic bounded chunking without manual label editing;
- reprint is deterministic;
- voided orders cannot produce normal operational labels;
- database/security/build/print tests pass;
- real print + scan acceptance passes;
- two independent review passes are complete.
