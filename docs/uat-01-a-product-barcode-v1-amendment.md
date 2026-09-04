# UAT-01-A / BAR-01 — V1 Product Barcode Amendment

Status: **Approved for V1**

This amendment supersedes only the Product GTIN / linear-barcode requirements introduced by Cube E. All Roll QR, Production identity, custody, warranty, claims and public-resolver contracts remain unchanged.

## V1 decision

Protection Giants V1 treats the Product linear identifier as an optional **Product Barcode**, not as an official GS1 GTIN.

- The Product may be created and Production may be generated without a Barcode.
- When present, the V1 Barcode is numeric text from 1 to 32 digits. Leading zeroes are preserved.
- The platform does **not** require GTIN-8/12/13/14 lengths and does **not** calculate or validate a GS1 check digit in V1.
- The Barcode remains unique across Products.
- A Product that already has generated Production may receive its first Barcode once. After a non-null Barcode exists with generated Production, normal Product editing may not change or clear it; a materially different barcode identity should use a new Product/SKU.
- Outer Roll label generation requires a Barcode because the physical linear barcode must have a payload. Missing/invalid Barcode stops label generation only; it does not invalidate the Product or Production Order.
- The outer-label linear barcode uses **Code 128** for the V1 numeric Barcode payload.
- The printed label calls the value `BARCODE`, not `GTIN`.

## Compatibility boundary

The existing database column `products.gtin` is retained as the V1 storage key to avoid a broad schema/type/query rename before launch. In V1 this technical column stores the Product Barcode and must not be interpreted as proof of GS1 allocation or licensing.

The existing unique index and produced-Product identity lock are retained. Legacy internal error-code names that contain `gtin` may remain where changing them would create unnecessary compatibility churn; user-visible text and active validation follow this amendment.

## Future GS1 support

If Protection Giants later has a real business requirement and licensed GS1 allocation, official GTIN support should be introduced explicitly. It must not infer that an arbitrary V1 Barcode is an official GTIN. A future implementation may add a distinct official-GTIN field/validation contract while preserving historical V1 Barcode identity.

## Non-goals

This amendment does not add a barcode generator, GS1 allocation service, new identifier subsystem, new Product table, new Roll identity, or changes to Roll QR, Transfers, Warranty, Claims, Notifications, Auth, RLS or Production cutover configuration.
