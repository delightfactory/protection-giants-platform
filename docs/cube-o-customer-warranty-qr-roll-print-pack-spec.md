# Cube O — Customer Warranty QR & Unified Roll Print Pack Specification

**Status:** Approved implementation specification; hardware/media print profile remains pending physical validation  
**Date:** 2026-08-25  
**Branch:** `spec/cube-o-customer-warranty-qr-print`  
**Depends on:** Cube E Outer Roll Label & Print Foundation + Cube N Public Warranty Access / Verification  
**Does not reopen:** Cube E identity semantics, Cube M Warranty lifecycle, or Cube N public identity/access semantics

## 1. Objective

Cube O completes the current customer-Warranty print slice and removes the temporary print-file composition limitation left intentionally by Cube E.

The cube must:

1. render the approved customer Warranty QR as three identical physical stickers per Roll;
2. use the one permanent Roll-owned Cube N Public Code and exact canonical Warranty URL on every copy and reprint;
3. combine the two existing Outer Roll label copies and the three Warranty QR copies into one deterministic **Roll Print Pack** per physical Roll;
4. make Roll boundaries obvious in the PDF so operators can identify, cut, prepare and reprint one Roll's complete label set without confusing it with the next Roll;
5. reuse the existing vector QR, PDF and millimetre-based print foundation rather than create a second print engine;
6. isolate the still-unknown printer/cutter/media-specific values so the client hardware answer becomes a small print-profile patch, not a redesign;
7. physically validate final printed QR readability, dimensions, gaps and cutting behavior before Production printing is declared frozen.

This is a focused completion of the confirmed print requirement, not a generic label/template system.

## 2. Verified current-state problem

Cube E deliberately left the physical machine/RIP profile provisional.

The current software master profile is exactly one `150 × 100 mm` Outer Roll label page with zero margins and zero gaps. Therefore `cellsPerPage = 1`, and the current planner emits:

`Roll A / copy 1 -> Roll A / copy 2 -> Roll B / copy 1 -> Roll B / copy 2 -> ...`

The current operations UI also explicitly describes these files as master pages with one page per copy pending final print-profile validation.

That behavior is internally deterministic, but it is not operationally complete for the real preparation/cutting workflow because:

- the front/back copies are not presented as one obvious Roll group;
- successive Rolls have no strong visual group boundary;
- adding the three customer Warranty copies to the same sequential stream would make the problem worse;
- a print operator should not have to infer where one Roll's physical set ends and the next begins.

Cube O therefore changes the composition unit from **one isolated label** to **one Roll Print Pack**.

## 3. Frozen identity contracts

Cube O must not create any new customer Warranty identifier.

### 3.1 Outer Roll identity

The two existing Outer Roll labels continue to use Cube E's contextual Roll QR contract:

`/r/<canonical-roll-serial>`

No change to its identity, resolver, barcode, Product GTIN or operational meaning is part of Cube O.

### 3.2 Customer Warranty identity

The customer Warranty QR uses the permanent Cube N identity:

`https://protectiongiants.com/w/<PUBLIC-CODE>`

Rules:

- the Public Code belongs to the physical Roll;
- the three customer copies for one Roll encode the exact same URL;
- every reprint encodes the same URL again;
- the URL does not change after Activation, correction, `voided_in_error`, legitimate reactivation or natural expiry;
- the printed payload must never use Vercel preview/staging URLs, Roll Serial, ERP serial, Warranty Number, VIN or another business identifier as a substitute;
- the raw Public Code must not be printed as human-readable text, placed in filenames, response headers, pack guides or logs.

The production-domain routing release gate remains separate: production customer QR printing is not authorized until `https://protectiongiants.com/w/<PUBLIC-CODE>` is connected and verified with HTTPS.

## 4. Customer Warranty sticker contract

### 4.1 Copies

Each physical Roll owns exactly three customer Warranty stickers in the normal pack:

1. vehicle copy;
2. Warranty card/certificate copy;
3. invoice copy.

The **three stickers are visually and technically identical**. Their intended destinations are pack/operational handling concepts only and are not printed as different customer-facing sticker variants.

### 4.2 Pre-Activation-safe content

The sticker is created at Roll-production time, before customer Warranty Activation. Therefore its durable visible content must not depend on future customer or Warranty data.

Mandatory content:

- Protection Giants brand identity;
- a concise customer-facing Warranty verification label/instruction;
- one vector QR encoding the exact canonical `/w/<PUBLIC-CODE>` URL.

Allowed stable supporting content if it improves the final visual design without crowding the QR:

- Product name from the immutable Production Order snapshot;
- a generic `protectiongiants.com` brand-domain reference that does not expose the Public Code.

Explicitly excluded:

- Warranty Number;
- customer name, phone or email;
- VIN/chassis or plate;
- Activation date;
- coverage end date;
- Center name;
- Roll Serial or ERP serial;
- Public Code as readable text;
- Claims button/instructions;
- mutable operational state.

### 4.3 Provisional software proof geometry

Until the real printer/media workflow is known, Cube O uses a **software proof target** for the Warranty sticker rather than falsely freezing a production size.

Initial proof target:

- landscape sticker: `70 × 45 mm`;
- QR quiet-zone bounding square: target at least `30 × 30 mm` inside the sticker;
- standard QR error correction level remains `M` unless physical tests demonstrate a confirmed reason to change it;
- the existing four-module QR quiet zone must remain intact.

Rationale: the frozen production Warranty URL is approximately a Version-6 QR at EC level M under the current encoder, while DENSO WAVE guidance requires a four-module quiet zone and recommends larger modules for stable printing/scanning. A 30 mm QR region leaves materially more module width than common 300 dpi thermal-printer minimum configurations while still leaving adequate visual space on a compact sticker.

This target is **not** a final physical size. Final sticker dimensions and minimum accepted QR size are frozen only after real print, material, placement and phone-camera validation.

Reference evidence for the physical validation stage:

- DENSO WAVE QR quiet-zone guidance: `https://www.qrcode.com/en/howto/code.html`
- DENSO WAVE module/printer-density guidance: `https://www.qrcode.com/en/howto/cell.html/index.html`

## 5. Roll Print Pack — the new composition unit

For every selected Roll, the normal output contains one logical Roll Print Pack with exactly five label pieces:

1. Outer Roll copy 1;
2. Outer Roll copy 2;
3. Warranty QR copy 1;
4. Warranty QR copy 2;
5. Warranty QR copy 3.

The pack is the unit of grouping, chunking and operator recognition.

### 5.1 Pack invariants

- all five pieces belong to the same exact Roll;
- the two Outer copies retain the same Cube E identity/content contract;
- the three Warranty copies are identical and carry the same Cube N URL;
- no labels from another Roll may be interleaved inside the pack;
- deterministic order is Lot sequence -> Roll index -> canonical Roll serial;
- chunk/file boundaries occur **between complete Roll Packs**, never through the middle of one pack;
- retries/reprints reproduce the same identities, same five-piece membership and same deterministic order;
- a missing/mismatched Warranty public identity fails the affected output closed rather than creating a partial four-piece/five-piece pack;
- the planner must never silently drop, duplicate or borrow a label from a neighboring Roll.

## 6. Provisional Master Pack PDF layout

The machine/media profile is currently unknown, but the PDF itself must already become operationally understandable.

Cube O therefore introduces a **Master Roll Pack page** independent of the eventual printer media profile.

Conceptual arrangement:

```text
+---------------------------------------------------------------+
| ROLL PACK | <ROLL SERIAL> | Roll n / N                        |
|                                                               |
| +--------------------------+  +--------------------------+    |
| | OUTER COPY 1             |  | OUTER COPY 2             |    |
| | 150 × 100 mm target      |  | 150 × 100 mm target      |    |
| +--------------------------+  +--------------------------+    |
|                                                               |
| +------------+  +------------+  +------------+                |
| | WARRANTY 1 |  | WARRANTY 2 |  | WARRANTY 3 |                |
| | same QR    |  | same QR    |  | same QR    |                |
| +------------+  +------------+  +------------+                |
+---------------------------------------------------------------+
```

Rules:

- one Master Pack page represents one Roll only;
- Outer copy 1 and copy 2 are side-by-side in the master where geometry permits;
- the three Warranty stickers are grouped together on the same master page;
- a non-sticker pack header/guide sits outside cut regions and includes the human-readable Roll Serial and pack ordinal (`Roll n / N`) for the print operator;
- the header/guide is not a customer label and must never contain the Warranty Public Code;
- visible gutters separate label cut regions;
- no browser report headers/footers or uncontrolled whitespace;
- exact geometry is millimetre based and deterministic;
- the page may use a custom master size because it is an intermediate print master, not a claim about the final physical sheet/roll media.

A practical provisional master canvas may be derived from the two `150 × 100 mm` Outer targets, the three `70 × 45 mm` Warranty proof targets, safe margins and explicit gutters. Its dimensions are implementation constants, not business invariants.

## 7. Final hardware/media imposition boundary

The client has not yet confirmed whether real output uses continuous sticker roll media, a sheet format, a plotter/cutter, or another RIP workflow.

Therefore Cube O must separate:

### Frozen now

- Roll Pack membership;
- identity payloads;
- sticker template content rules;
- deterministic grouping/order;
- pack boundary behavior;
- chunking by complete packs;
- preview/PDF visual source;
- vector QR rendering;
- security and reprint invariants.

### Pending final physical profile

- actual media width/height or roll width;
- number of Roll Packs or labels across the media;
- printer edge margins;
- inter-pack/inter-label production gaps;
- bleed;
- cut contour / spot-color naming;
- registration marks;
- cutter/RIP-specific requirements;
- color profile;
- final Outer label dimensions if physical validation changes the historical 150 × 100 mm target;
- final Warranty sticker dimensions and minimum QR size.

When the client supplies the printer/media information, these values must be a **small print-profile patch**. They must not require changes to Public Code, QR URL, label membership, pack grouping or business lifecycle.

## 8. Rendering architecture

Cube O reuses the established Cube E stack:

- `pdf-lib` for deterministic vector PDF composition;
- shared `lib/qr/qr-vector.ts` QR matrix/vector geometry;
- millimetre-based physical geometry helpers;
- fixed named templates;
- bounded deterministic chunk generation.

Required additions should remain small and explicit, conceptually:

- `warranty-qr-label-template` — fixed customer Warranty sticker visual geometry;
- `warranty-qr-label-plan` — maps Roll + private Public Code + production snapshot to the safe sticker view model;
- `roll-print-pack-plan` — composes two existing Outer models plus three identical Warranty models per Roll;
- `roll-print-pack-layout` — Master Pack geometry and later physical-profile imposition boundary;
- `roll-print-pack-pdf` — one vector output path using the same view models as preview.

Do not build:

- a drag/drop label designer;
- database-defined arbitrary templates;
- user-authored HTML/CSS print templates;
- a generic workflow engine;
- a persistent print-job business table without a demonstrated audit requirement;
- a second QR renderer;
- a second PDF engine.

## 9. Data access and security

The Roll-owned Public Code remains private persistence owned by Cube N.

Cube O requires a **bounded internal Admin-only print read boundary** that can resolve the Public Code for the exact selected Roll set without opening `private.roll_public_identities` to ordinary Data API browsing.

Requirements:

- normal print/reprint entry remains active Protection Giants Admin only, matching the existing Outer Roll print boundary;
- anonymous users never gain access;
- ordinary authenticated Center/Dealer/Agent users do not gain the private code source;
- direct broad SELECT on the private identity table remains denied;
- any SQL function/RPC used for print reads must validate active Admin authority and return only the minimal Roll id/Public Code mapping required by the server print path;
- raw Public Codes are never logged or placed into filenames/headers/error text;
- browser/client code should receive rendered preview geometry or a safe view model, not an unnecessary raw Public Code field where server rendering can avoid it.

No new customer/Warranty persistence table is required.

## 10. Print preflight

A Roll Print Pack may be generated only when:

- Production Order exists and is `generated`;
- selected Lots/Rolls belong exactly to that order;
- existing Cube E Product GTIN preflight passes because the Pack includes the two Outer labels;
- every selected Roll has exactly one Cube N Public Identity;
- no duplicate Roll identity exists in the selected source;
- selection is non-empty and ordered deterministically;
- the requested chunk exists;
- vector/PDF geometry passes validation.

If any selected Roll lacks the required public identity or contains contradictory identity data, the file must fail closed. Cube O must not emit a partial Pack or silently omit its Warranty stickers.

## 11. Selection, chunking and large orders

Preserve the current useful selection modes:

- whole Production Order;
- one Lot;
- bounded Roll Serial range.

Change the count semantics to Pack-aware output:

- selected Rolls = `R`;
- Roll Packs = `R`;
- physical label pieces = `R × 5`;
- Outer pieces = `R × 2`;
- Warranty pieces = `R × 3`.

Software chunks remain bounded by complete Rolls/Packs. A chunk of 100 Rolls is 100 complete Pack pages in the provisional master output, never 500 unrelated label pages.

The existing chunk-size limit may be retained initially if benchmark/build evidence shows it remains safe with the larger Pack renderer; otherwise adjust only from measured runtime evidence.

## 12. Admin UX

The Production Order print experience should become one coherent **Roll Label Pack** workflow rather than requiring the operator to reason about separate raw label streams.

Minimum UX:

1. entry from Production Order detail;
2. preflight summary: order status, GTIN, total Rolls, Public Identity completeness;
3. selection: whole order / Lot / Roll range;
4. counts: Rolls, Outer labels, Warranty labels, total pieces, output files;
5. representative preview of one **complete Roll Pack**, not only one isolated Outer label;
6. visually obvious labels `Outer 1`, `Outer 2`, and three Warranty copies in the preview/print guide while keeping the actual three customer stickers identical;
7. chunk download with first/last Roll Serial;
8. deterministic reprint through the same selection;
9. explicit development/physical-validation note until the hardware profile is frozen.

Do not expose a fake printer-profile selector before real profiles exist.

## 13. Failure paths

Required explicit handling:

- Production Order not found;
- voided/non-generated order;
- missing/invalid GTIN;
- incomplete Lot/Roll source;
- invalid Roll range;
- missing Roll Public Identity;
- duplicate/contradictory Roll Public Identity;
- QR generation failure;
- sticker content does not fit fixed proof geometry;
- Master Pack geometry cannot fit all five pieces;
- chunk request out of range;
- PDF generation failure;
- authenticated user is not active Admin.

Errors must not expose the Public Code.

## 14. Automated verification

### Warranty QR identity

Test:

- one Roll produces exactly one canonical `/w/<PUBLIC-CODE>` payload;
- all three Warranty copies are byte-for-byte equivalent in customer-facing model/QR payload;
- different Rolls use different Cube N Public Codes;
- reprint produces the same URL;
- Activation/correction/void/reactivation do not alter the printed URL;
- preview/staging host is never used as the production Warranty QR payload;
- raw Public Code is absent from filename/header/guide text.

### Pack grouping

Test:

- each selected Roll produces exactly one five-piece Pack;
- Pack contains exactly two Outer + three Warranty pieces;
- no neighboring Roll appears inside the Pack;
- packs are sorted by Lot sequence then Roll index;
- chunk boundary never splits a Pack;
- no duplicate/missing piece across full selection;
- full replan/reprint is deterministic.

### PDF/master geometry

Test/inspect:

- one master page per Roll Pack in the provisional profile;
- two Outer cut regions are grouped together;
- three Warranty cut regions are grouped together;
- pack header/guide is outside cut regions;
- header carries Roll Serial/ordinal but not Public Code;
- physical dimensions are encoded in millimetres/points deterministically;
- QR vectors retain four-module quiet zone;
- output count matches `Rolls × 5` pieces and `Rolls × 1` master pages for the provisional profile.

### Security

Test:

- anon cannot read print identity source;
- non-Admin operational user cannot read it;
- active Admin exact print source succeeds;
- broad private identity browsing remains denied;
- error paths do not leak codes.

### Regression

Run/retain:

- Cube E identity/Outer label regression;
- Cube M Warranty regression;
- Cube N public identity/resolver/lifecycle regression;
- Database Quality;
- TypeScript and production build.

## 15. Physical acceptance

Software CI is not sufficient to declare the physical print configuration production-frozen.

When suitable printer/media details and equipment are available, print representative Roll Packs and verify:

1. one complete Roll Pack is immediately distinguishable from the next;
2. Outer front/back handling is obvious to the operator;
3. all three identical Warranty stickers are obvious as one set belonging to the same Roll;
4. actual cut/gap handling does not cause labels from neighboring Rolls to be mixed;
5. Outer Roll QR scans correctly;
6. Product GTIN barcode scans correctly;
7. Warranty QR decodes to the exact permanent production URL;
8. after the canonical domain release gate is closed, the Warranty QR opens the expected `/w/<PUBLIC-CODE>` page on ordinary phone cameras;
9. smallest accepted QR remains reliable across representative phones/materials;
10. no label text is clipped or too small;
11. actual media width, margins, bleed, contour/registration/RIP requirements are recorded;
12. final physical profile is frozen only from those results.

If hardware details arrive after Cube O software completion, this remains a documented small physical-profile patch/acceptance gate rather than reopening the identity or lifecycle design.

## 16. Explicit non-goals

Cube O does not implement:

- Claims or claim QR/actions;
- replacement/reinstall lifecycle;
- customer accounts/OTP;
- manual Warranty search;
- Public Code rotation;
- scan analytics;
- multilingual Warranty UI;
- bag/case, inner-Roll or separate ERP label content from the historically deferred remaining Production label package;
- arbitrary label designer/template engine;
- printer fleet management or RIP automation;
- persistent print-event auditing without an approved operational/legal need.

Any later confirmed additional label type must consume the same finalized QR/PDF/Pack composition foundation rather than create another print engine.

## 17. Incremental implementation blocks

Implementation follows the repository cube principle:

### O1 — Warranty print identity read boundary

- bounded Admin-only Public Code source;
- typed server mapping;
- security regression.

### O2 — Warranty QR sticker model + vector template

- canonical production URL builder;
- three-identical-copy model;
- provisional `70 × 45 mm` proof geometry;
- preview + machine-readable tests.

### O3 — Roll Print Pack planner

- combine two existing Outer pieces + three Warranty pieces;
- deterministic five-piece membership/order;
- pack-aware chunking and preflight.

### O4 — Master Pack PDF + Admin UX

- one Roll per Master Pack page;
- side-by-side Outer copies;
- grouped three Warranty copies;
- non-sticker Roll separator/header;
- Pack preview, counts and download/reprint flow.

### O5 — Regression / software closure

- full affected quality gates;
- independent double review;
- Staging/mobile/preview smoke for Admin print UX;
- generated PDF inspection and QR decode checks;
- document hardware-profile gate.

### O6 — Physical profile patch/acceptance when equipment details are available

- freeze real media profile;
- real print/cut/scan acceptance;
- close canonical-domain QR Production gate before customer production printing.

O6 may occur after O1–O5 software completion if the client's printer/media answer is delayed. It must stay a narrow physical-profile patch and must not redesign O1–O5.

## 18. Definition of Done

### Software-complete

Cube O software is complete when:

- every Roll can deterministically resolve its existing Cube N Public Code for authorized printing;
- three identical customer Warranty stickers are rendered from the permanent canonical URL;
- one Roll Print Pack contains exactly two Outer + three Warranty pieces;
- PDF/master output clearly groups one Roll and separates it from the next;
- pack-aware selection/chunk/reprint behavior is deterministic;
- no Public Code leaks outside the intended QR bearer representation;
- Admin UX is coherent and mobile-usable;
- Cube E/M/N regressions, Database Quality, TypeScript/build and Cube O tests pass;
- two independent reviews pass;
- staging software smoke passes.

### Production-print frozen

Physical Production printing is frozen only when, in addition:

- client printer/media/RIP details are known;
- real physical Pack print/cut/scan acceptance passes;
- final dimensions/gaps/margins/bleed/cut profile are recorded;
- `https://protectiongiants.com/w/<PUBLIC-CODE>` is routed and verified with HTTPS;
- a printed Warranty QR successfully opens the Production public Warranty path.

Until those final physical/release gates close, the software may continue to support development/staging proof output but must not be represented as fully validated Production printing.