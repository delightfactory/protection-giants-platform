# Protection Giants QR Reliability Contract

Status: canonical implementation contract for every QR surface added after this closure.

## Purpose

QR is an operational identity and transaction input in Protection Giants. A QR that merely looks correct is not acceptable. Every generated QR must remain independently decodable after the actual screen or print rendering path used by the product.

## Generation contract

1. Payload-specific code owns only the payload contract (for example Transfer ID or contextual Roll URL).
2. QR encoding and vector generation must go through `lib/qr/qr-vector.ts`.
3. The shared foundation encodes from the BWIPP/bwip-js raw QR module matrix (`pixs`, `pixx`, `pixy`) and renders that matrix without reconstructing or interpreting finder/data geometry.
4. The QR quiet zone is part of the generated asset and is exactly four modules on every side. CSS padding, card whitespace, label whitespace, or printer margins are not substitutes for the QR quiet zone.
5. Default error correction is explicitly Level M. A future surface may change this only with a documented physical-use reason and independent decode evidence; increasing error correction must not be treated as an automatic reliability improvement because it also increases symbol density.
6. Operational QR is rendered black on a solid white background with square modules and crisp edges. Logos, gradients, transparency, rounded modules, decorative finder patterns, or low-contrast color combinations are outside the default contract.
7. Vector output must preserve integer module geometry. Rasterization must avoid smoothing module boundaries where the rendering API allows that choice.
8. Payloads should remain as short as their business contract permits. Do not embed display-only or duplicated data into QR payloads.

## Current payload contracts

### Transfer ID QR

- Payload is the canonical normalized Transfer ID.
- It is not a URL and must decode to the exact Transfer ID text.
- `components/transfers/transfer-id-qr.tsx` displays the shared vector geometry.

### Contextual Roll QR

- Payload remains the approved contextual Roll URL produced by `buildRollQrUrl()`.
- The URL contract and origin validation remain owned by `lib/rolls/roll-qr.ts`.
- Screen preview and printable outer-Roll PDF use the same shared QR geometry.

## Reading contract

The operational scanner is a shared task component, currently `components/transfers/qr-scanner-sheet.tsx`.

- Prefer the environment/rear camera.
- Keep continuous scanning responsive while preventing rapid duplicate submission.
- Distinguish camera startup failure from a successfully decoded payload that later fails business validation.
- Surface secure-context, permission, unavailable-camera, and camera-busy failures with actionable messages.
- Offer flash control when the device exposes it.
- Preserve image-file and manual-entry fallbacks so a camera problem does not block the operation.
- Bound decoded payload size before passing it to business validation.
- Business code must validate the decoded payload against the exact operation contract; a readable QR is not automatically an authorized or applicable QR.

Local physical-device testing must use a secure browser context. `localhost` is acceptable on the same device; a plain `http://<LAN-IP>` page must not be assumed to have camera permission. Use trusted HTTPS or the approved local-device routing method for the test device.

## Mandatory verification

`PR Quality` must fail if QR reliability regresses.

The permanent QR reliability contract must verify at least:

1. the four-module internal quiet zone;
2. exact module-matrix dimensions;
3. Transfer ID round-trip decode at normal and compact screen sizes;
4. contextual Roll URL round-trip decode at label and compact sizes;
5. a mildly degraded camera-like raster case;
6. independent decoding by a decoder other than the production encoder/renderer;
7. decoding of the QR from the actual generated printable outer-Roll PDF after rasterizing the full label at print-like resolution;
8. existing payload, label, TypeScript, and production-build regressions.

A geometry-created, SVG-created, or PDF-created assertion by itself is not evidence of scanability.

## Physical acceptance

CI establishes deterministic software scanability; it does not replace physical acceptance. Before production release of a new physical QR surface, validate the final printed size/material with representative phones/scanners under normal and imperfect lighting and confirm the decoded payload exactly matches the source record.

## Non-negotiable rule for future cubes

Do not introduce another QR encoder/renderer or copy QR drawing logic into a feature component. Extend the shared foundation only when the current contract genuinely cannot support a required QR use case, and add the corresponding independent decode regression before accepting that change.
