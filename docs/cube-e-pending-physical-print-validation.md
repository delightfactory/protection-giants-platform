# Cube E — Pending Physical Print Validation

Status: **Mandatory follow-up; does not block continued software development**

Cube E has passed software review, CI, independent local-laptop validation, and the corrected end-to-end public Roll resolver retest.

The remaining validation is physical and has not been executed because a suitable printer/cutter is not currently available.

## Mandatory validation when equipment becomes available

At the earliest practical opportunity, print a representative Outer Roll Label sample and verify on real equipment:

- physical label size and useful margins;
- QR readability using normal phone cameras;
- Product GTIN barcode readability using a suitable scanner;
- text/vector sharpness and minimum readable sizes;
- quiet zones around machine-readable codes;
- front/back copy handling;
- real cut accuracy and material tolerance;
- printer/RIP requirements, media width, gaps, bleed, cut contour and registration marks where applicable.

## Important status rule

Until that test is completed:

- `150 × 100 mm` remains the current validated software/master-label target, not a permanently frozen production size;
- printer/cutter/RIP profile values remain provisional;
- successful software PDF generation must not be represented as completed physical-production acceptance.

This outstanding validation must remain visible in future print/label work and should be completed before declaring the physical printing configuration production-frozen.

It does **not** block proceeding with later platform cubes whose software dependencies on Cube E are satisfied.
