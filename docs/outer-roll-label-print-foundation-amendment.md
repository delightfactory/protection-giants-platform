# Outer Roll Label & Print Foundation — Normative Amendment

**Status:** Approved  
**Date:** 2026-08-14  
**Applies to:** Cube E and later Production Label work  
**Supersedes:** the earlier Cube E wording that limited the cube to a temporary/narrow scan-only sticker

## 1. Why this amendment exists

The project has now reached the point where Product, Production Order/Lot/Roll identity, Operational Parties, Center Foundation and Roll Custody are already established.

The historical client output and the newly confirmed business direction show that the first physical Roll label should not be a throw-away scan sticker. The outer carton label can carry the permanent Roll scan identity and become the first real output of a reusable professional print foundation.

This amendment preserves the historical label goals while keeping unresolved Activation/Warranty identities out of the current cube.

## 2. Confirmed identity separation

The following remain different concepts and must never be substituted for one another:

- Product SKU (`products.code`) — canonical Product/SKU identity;
- Product GTIN — global trade-item identifier for the Product/SKU, when officially assigned;
- Production Order number — Production instance identity;
- Lot number — Production Lot identity;
- Roll serial — canonical physical Roll identity;
- ERP serial — independent ERP/sales operational Roll identity;
- Transfer ID — operational-party recipient identity;
- future Activation identity — unresolved;
- future Warranty/public token — unresolved.

Printing never creates a replacement identifier for any of these.

## 3. Product GTIN decision

A Product needs an optional Product-level GTIN field in addition to its SKU.

Rules:

- GTIN identifies the Product/trade item generally, not one physical Roll;
- GTIN is unique when present;
- the platform never invents, allocates or guesses a GS1 number;
- only an officially assigned GTIN is stored;
- supported storage must preserve the exact digit string, including leading zeroes;
- validation follows GS1 GTIN length/check-digit rules rather than accepting arbitrary numeric strings;
- Product may exist before GTIN is assigned;
- normal outer-label generation is blocked by preflight until the Product has a valid GTIN;
- after the Product has operational production, a previously assigned GTIN is part of the stable sellable identity and must not be casually changed or cleared;
- a one-time assignment from empty to a valid GTIN may be allowed for an already-produced Product so existing Products can be completed without rewriting Production history.

GS1 defines GTIN as the identifier for trade items and recognises GTIN-8, GTIN-12, GTIN-13 and GTIN-14 forms. The actual barcode symbology used on the physical label is selected from the assigned GTIN and the real print/use context; the platform must not guess an EAN/UPC/ITF form before the assigned value is known.

Official references:

- `https://www.gs1.org/standards/id-keys/gtin`
- `https://www.gs1.org/services/how-calculate-check-digit-manually`

## 4. One contextual QR per physical Roll

The outer Roll label uses **one QR only** for Roll identity and public Product discovery.

The QR payload is a stable HTTPS Roll-resolver URL derived deterministically from the already-existing Roll serial, conceptually:

`{PUBLIC_SITE_URL}/r/{ROLL_SERIAL}`

No new random Roll QR token is generated merely for printing.

The same QR is printed on both front/back copies of the same Roll label.

### Public camera scan

When scanned by a normal phone camera/browser:

1. the public resolver identifies the exact Roll only internally;
2. it resolves the Product associated with that Roll;
3. it sends the visitor to the public Product information experience;
4. it does not expose custody, Transfer history, internal Roll history, user IDs or operational permissions.

The public behavior is informational only.

### In-app operational scan

When the same QR is scanned inside a future operational workflow:

1. the app parses the canonical Roll serial from the approved QR payload;
2. the platform resolves that Roll through authenticated/scoped data access;
3. the current workflow applies its own authorization and state rules.

Examples:

- Transfer Send later checks sender custody/reservation eligibility;
- Receipt later checks the expected Transfer item;
- Roll Opening later checks active Center identity + confirmed custody + Roll eligibility.

Knowing the QR or holding a photo of it never grants any operational permission.

## 5. Outer front/back label decision

Cube E owns the first real outer carton Roll label.

Current physical/business target:

- two identical copies per Roll — front and back of the outer carton;
- historical client target around `15 × 10 cm` is retained as the first physical validation target;
- the exact final size is not frozen until a real printer/cutter and phone scan test passes.

Core content:

- Protection Giants/Product presentation;
- Product name/version as applicable;
- canonical SKU;
- Product GTIN rendered as a conventional linear Product barcode plus human-readable digits;
- key stable physical specification required to distinguish the SKU visually;
- Lot number;
- human-readable Roll serial;
- one contextual Roll QR.

The outer label does not need a second marketing QR because the Roll QR already provides the public Product-information path.

ERP serial remains separate and is not automatically exposed on the outer label. A separate ERP label remains later Production-label work unless explicitly promoted.

## 6. Historical output preserved, not copied

The historical screenshot supplied on 2026-08-14 visibly separated:

- Product number/barcode;
- Roll number;
- Lot number;
- QR;
- a separate Verification code/QR.

This confirms the old business distinction between Product-level and Roll-level identity, but the old layout/runtime is not an implementation authority.

The separate old Verification code/QR is not copied into Cube E because Activation/Warranty identity ownership is still unresolved.

## 7. Professional print foundation decision

Cube E also owns the reusable print-generation foundation needed by the outer label.

Requirements:

- fixed named templates, not a generic drag/drop designer;
- deterministic output from canonical persisted data;
- exact physical geometry in millimetres;
- vector-first barcode/QR/text output where the selected implementation library supports it;
- efficient imposition on the configured media rather than report-style pages with uncontrolled blank space;
- deterministic Roll ordering;
- two copies of each Roll remain clearly paired in output order;
- bounded generation so a 10,000-Roll Production Order is never one unbounded render request;
- several-thousand-Roll orders must still be printable through automatically planned bounded batches without manual label editing/composition;
- reprint produces the same Roll identity and label data;
- no new identity is generated on reprint;
- voided Production Orders are blocked from normal operational label generation.

The current application has no QR/barcode/PDF rendering dependency installed. Library selection is therefore an implementation decision that must be pinned and proven against Node 22 / Next.js build/runtime rather than assumed in this amendment.

## 8. What Cube E does not own

Cube E does not implement:

- Transfer state/reservation/receipt;
- Transfer ID labels;
- Activation code generation;
- Warranty public token generation;
- vehicle-pillar Warranty QR;
- warranty-card QR;
- invoice Warranty QR;
- bag/case label unless explicitly promoted later;
- inner-coil label unless explicitly promoted later;
- separate ERP label package;
- arbitrary database-defined template engine;
- shipping/accounting/ERP workflow.

## 9. Roadmap effect

The remaining dependency logic becomes:

- Cube D — Roll Custody Foundation — closed;
- Cube E — **Outer Roll Label & Print Foundation** — current/next cube;
- Cube F — Transfer State & Reservation Engine — independent of E at database state level;
- Cube G — Transfer Send UX — depends on E + F for real scan flow;
- Cube H — Receipt / Partial Receipt / Resolution — depends on F + G;
- Cube I — remaining Production Label Package — reuses Cube E print primitives and must not rebuild the print engine;
- Activation/Warranty labels remain behind their future identifier/lifecycle decision gate.
