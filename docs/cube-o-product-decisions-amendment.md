# Protection Giants — Cube O Product Decisions Amendment

**Status:** Approved product-owner decisions for Cube O  
**Date:** 2026-08-25  
**Applies to:** Customer Warranty QR / Print and Roll Print Pack composition

This amendment records the Cube O decisions approved after Cube N closure. It is normative for Cube O implementation and should be folded into the main Product Decisions ledger during Cube O delivery/closure.

## PD-O1 — Three customer Warranty QR stickers are identical

Each physical Roll produces three customer-facing Warranty QR stickers intended for:

1. vehicle;
2. Warranty card/certificate;
3. invoice.

All three are visually and technically identical. They use the same permanent Roll-owned Cube N Public Code and exact same Warranty URL. They are not three separate identities or three customer-facing template variants.

## PD-O2 — Customer Warranty stickers are pre-Activation-safe

The Warranty stickers are generated from the Roll's permanent identity at production time, before Warranty Activation.

Therefore they do not contain customer data, Warranty Number, vehicle data, Activation/coverage dates, Center data or another value that is not known/stable at Roll production time.

The durable customer-facing content is Protection Giants identity, a concise Warranty verification instruction, and the permanent Warranty QR. Stable Product identity from the Production Order snapshot may be used only if the final visual design remains clean.

## PD-O3 — One Roll Print Pack is the primary print grouping

The operational print unit is one **Roll Print Pack** containing the complete currently approved label set for one physical Roll:

- Outer Roll copy 1;
- Outer Roll copy 2;
- Warranty QR copy 1;
- Warranty QR copy 2;
- Warranty QR copy 3.

Labels from another Roll must not be interleaved inside this pack. Chunk/file boundaries must occur between complete Roll Packs rather than split a Roll's set.

## PD-O4 — The print file must visibly separate one Roll from the next

The current Cube E one-label-per-master-page sequence is no longer sufficient as the final operator experience.

Cube O must make each Roll's complete set visually obvious in preview/PDF output. A non-customer print guide/separator may display Roll Serial and pack ordinal outside cut areas. It must not expose the Warranty Public Code.

The preferred Master Pack composition places the two Outer copies together and the three identical Warranty stickers together on one Roll-specific master page.

## PD-O5 — Hardware-specific imposition is isolated, not guessed

The client has not yet confirmed the real printer/media/RIP workflow. Development continues without blocking on that answer.

Roll Pack identity, membership, grouping, templates, QR payloads, chunking and deterministic reprint are frozen independently from the physical machine profile.

Media width/height, margins, gaps, bleed, cut contour, registration marks, printer/RIP requirements and final physical label dimensions remain pending physical validation. When the client supplies this information, it must be implemented as a small print-profile patch rather than redesigning the cube.

## PD-O6 — Production Warranty QR printing waits for the canonical-domain release gate

The customer Warranty QR payload is permanently:

`https://protectiongiants.com/w/<PUBLIC-CODE>`

Development/staging proof output may be generated before the root Production domain is attached, but customer Production printing is not authorized until the canonical domain route is connected, HTTPS is verified, and a real printed QR opens the expected Production Warranty page.

Vercel preview/staging hostnames must never become the permanent printed customer Warranty identity.

## Boundary note

Cube O finalizes the shared print-file grouping/composition behavior for the currently approved Outer Roll + customer Warranty label set. It does not silently add the historically deferred bag/case, inner-Roll or separate ERP label content. If those are later confirmed, they must reuse this print foundation rather than create a new print engine.