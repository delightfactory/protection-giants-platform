# Cube N — Public Warranty Access / Verification Specification

**Status:** Frozen for implementation — 2026-08-25  
**Base:** `main` at `61cdf9473522fa8f8f7e7e09589dc85d9dc62e45`  
**Depends on:** Production/Roll foundation, Cube E QR reliability foundation, Cube M Warranty Activation  
**Primary responsibility:** provide one permanent, secure, customer-facing public access identity per physical Roll and resolve that identity to the Roll's current real Warranty state without exposing internal Warranty data.

## 1. Purpose

Cube N closes the gap between a physical Roll and a durable customer-facing Warranty verification URL.

The key product decision is that the customer Warranty QR identity belongs to the **physical Roll**, not to a particular Warranty row. The identity exists from Roll creation because the future vehicle, Warranty-card and invoice labels are produced from the Roll's production data before customer Warranty Activation.

A mistaken Warranty Activation may be voided and later replaced by a correct new Warranty for the same Roll. The printed QR must therefore remain unchanged and resolve to the current real Warranty state of that Roll.

Cube N creates and freezes that permanent access contract. It does **not** print QR labels yet.

---

## 2. Canonical identity model

### 2.1 One physical Roll, one permanent public Warranty identity

Every new Roll created after Cube N is installed receives exactly one cryptographically strong, non-enumerable `public_code`.

The `public_code`:

- is generated exactly once as part of Roll creation;
- is globally unique;
- is random and carries no business meaning;
- does not encode or derive from SKU, Roll serial, ERP serial, Transfer ID, Warranty Number, VIN or another human/business identifier;
- is never rotated, replaced, edited or deleted through a normal application workflow;
- survives Warranty activation, correction, `voided_in_error`, legitimate reactivation and Warranty expiry;
- is the identity later reused by every customer Warranty QR reprint for that Roll.

The public code is a bearer-style access credential for public verification. It is not displayed as a customer-facing business number.

### 2.2 Atomic creation

Roll creation and public Warranty identity creation are one database transaction boundary.

For new Rolls after Cube N:

`Roll created + public identity created` **or** `neither is committed`.

The platform must never commit a new operational Roll that lacks its permanent public Warranty identity.

Implementation should attach identity provisioning to the existing Roll insert transaction rather than create a later repair queue or asynchronous provisioning workflow.

### 2.3 No production backfill subsystem

The platform is still in development and has no historical production fleet that needs migration support.

Cube N therefore does not build a legacy/backfill workflow or token-repair UI for pre-Cube-N Rolls. Existing non-production test data may be recreated for validation after the migration.

This is intentional scope control, not a limitation on future production records: every new Roll after the migration must satisfy the atomic identity invariant.

---

## 3. Relationship to the existing contextual Roll QR

Cube N does not replace or mutate Cube E's contextual Roll QR.

Two distinct identities coexist for distinct purposes:

1. **Contextual Roll QR** — existing `/r/<canonical-roll-serial>` contract. It is serial-derived, supports public Product discovery, and may be parsed by authenticated operational scan flows.
2. **Customer Warranty QR identity** — new `/w/<public-code>` contract. It is random, non-enumerable, customer-facing, and resolves the Warranty state for that physical Roll.

The new random public code is not a second identifier invented merely for the outer Roll label. It exists because customer Warranty access has a different security and lifecycle contract.

The existing `/r/...` route and `buildRollQrUrl()` contract remain unchanged by Cube N.

---

## 4. Permanent URL contract

The production customer Warranty URL is permanently frozen as:

`https://protectiongiants.com/w/<PUBLIC-CODE>`

Rules:

- `/w/` is the canonical permanent public Warranty namespace.
- The persisted identity is the `public_code`, not a deployment URL.
- Production QR assets must never contain a Vercel preview URL, staging hostname or operational portal hostname.
- Future internal routing, hosting or framework changes must preserve this URL contract, using compatibility routing/redirects if architecture changes later.
- The code is URL-safe and path-segment safe without additional business data.
- Reprinting a vehicle, Warranty-card or invoice QR later must reproduce the exact same canonical URL for the Roll.

Preview/test environments may use their own origin to exercise the route, but that does not alter the production canonical URL contract.

---

## 5. Storage and access boundary

### 5.1 Identity persistence

Implementation should store the raw public code in a dedicated private persistence boundary keyed one-to-one by `roll_id`, rather than add it to a generally readable Roll projection.

Recommended V1 shape:

- private Roll-public-identity table;
- `roll_id` primary/unique ownership key;
- `public_code` unique and not null;
- creation timestamp only if useful for diagnostics;
- no lifecycle status, rotation history, analytics counter or speculative metadata.

The raw code must remain recoverable by a future bounded Admin print/reprint path, because the same QR must be reproducible. Hash-only storage is therefore not appropriate for V1.

The private identity table must not become a directly browsable Data API surface.

### 5.2 Token strength

Use a cryptographically secure database source with at least 192 bits of randomness and a URL-safe representation.

The exact encoding is an implementation detail, but it must remain compact enough for reliable QR printing and must not reduce effective entropy through truncation or predictable prefixes.

A unique database constraint is mandatory even though collision probability is negligible.

### 5.3 Public resolver only

Anonymous/customer access is allowed only through one narrow resolver accepting the public code and returning the approved public projection.

Anonymous access must not receive direct `SELECT` access to:

- `warranties`;
- Warranty events/audit data;
- `rolls`;
- the private public-identity table;
- custody/Transfer/Opening/Issue tables;
- customer PII beyond the explicitly approved public projection.

The resolver must use an explicit fixed return contract rather than `select *` or a broad table/view projection.

---

## 6. Public access rules

### 6.1 No customer account

Viewing a public Warranty page requires no login, account, password or OTP.

Possession of the high-entropy URL is sufficient to view the approved public Warranty projection.

Future sensitive actions such as Claims may apply their own verification when their cube is designed; Cube N does not pre-build that verification.

### 6.2 No public manual search

V1 does not provide public lookup by:

- Warranty Number;
- VIN/chassis;
- vehicle plate;
- Roll serial;
- ERP serial;
- SKU;
- customer phone/email/name.

`/w/<public-code>` is the only public Warranty lookup path.

The human-readable Warranty Number remains a reference shown after successful resolution, not an authorization credential.

### 6.3 Invalid-code anti-enumeration behavior

Malformed, unknown and random public codes must produce the same generic invalid-link experience.

The response must not disclose whether:

- a similar code exists;
- the Roll exists;
- a Warranty Number exists;
- a VIN/customer/Center is associated with anything.

The customer-facing Arabic message is conceptually:

> تعذر العثور على ضمان صالح بهذا الرابط.

No suggestion to try Warranty Numbers, VINs or serial permutations is displayed.

High-entropy identity, fixed-shape validation, no manual search and a narrow resolver are the V1 anti-enumeration controls. Cube N does not add a bespoke analytics or rate-limit subsystem without demonstrated need.

### 6.4 Indexing and caching

Warranty bearer URLs are not search-engine content.

The public Warranty surface must be `noindex, nofollow`, avoid leaking the code through outbound referrers, and avoid shared/stale caching that could display old Warranty state after activation/correction/voiding/expiry.

---

## 7. Public state resolver

The public code resolves first to its physical Roll. The Roll then resolves to its current customer Warranty state.

The resolver never points the code permanently at one Warranty row.

### 7.1 State precedence

If one effective `issued` Warranty exists for the Roll, that Warranty is authoritative for public customer presentation regardless of later ordinary operational metadata changes to the Roll, Product or Center.

Only when no effective issued Warranty exists does the resolver consider whether the Roll is merely unactivated, has only voided mistaken activations, or is terminally unavailable for Warranty activation.

### 7.2 `not_activated`

Condition:

- valid public code resolves to a real Roll;
- no Warranty has ever been effectively issued for the Roll;
- the current lifecycle does not make the Roll terminally unavailable for Warranty activation.

Public presentation:

- Protection Giants authenticity/registration confirmation;
- Product name from the immutable Production Order Product snapshot associated with the Roll;
- clear Arabic state that the Warranty has not yet been activated.

Conceptually:

> منتج أصلي ومسجل لدى Protection Giants. لم يتم تفعيل الضمان بعد.

Transient internal holds do not need to be exposed publicly as their operational reason.

### 7.3 `no_current_warranty_after_void`

Condition:

- no effective issued Warranty currently exists;
- at least one historical Warranty for the Roll is `voided_in_error`.

Public presentation:

- confirm that the Roll/product identity is genuine;
- state only that there is currently no active Warranty;
- do not reveal old Warranty Numbers, void reasons, Admin identity, timestamps or historical customer/vehicle data.

If the Roll is later legitimately activated again under Cube M rules, the same public URL automatically presents the new effective Warranty.

### 7.4 `active`

Condition:

- exactly one effective `issued` Warranty exists;
- current authoritative time is before `coverage_expires_at`.

Public presentation uses the approved Warranty projection in section 8 and shows status `ساري`.

### 7.5 `expired`

Condition:

- exactly one effective `issued` Warranty exists;
- current authoritative time is at or after `coverage_expires_at`.

The same URL remains valid permanently and shows the same Warranty with status `منتهي`.

Expiry never makes the Roll eligible for a second Warranty. Legitimate reactivation remains limited to the existing Cube M `voided_in_error` correction case.

No cron or background job rewrites Warranty rows merely to change active to expired.

### 7.6 `unavailable_for_warranty`

Condition:

- no effective issued Warranty exists; and
- the existing authoritative lifecycle marks the Roll terminally unusable for Warranty activation, such as a voided Production source or an approved terminal pre-install disposition that permanently blocks use.

Public presentation:

> هذا الرول غير متاح لتفعيل الضمان.

The public page does not expose the internal operational reason or audit trail.

If an effective issued Warranty already exists, later ordinary Roll operational state does not silently override that customer Warranty.

### 7.7 Impossible/conflicting state

The database already protects the one-effective-Warranty-per-Roll invariant. Nevertheless, public code must fail safely if a future defect creates contradictory data.

If the resolver cannot determine one authoritative public state, it must not guess or select an arbitrary Warranty. It returns a generic temporary-unavailable result for the public UI and leaves diagnosis to internal operational review.

---

## 8. Approved public Warranty projection

When an effective Warranty exists, the public page displays only:

- Warranty Number;
- derived public status: `ساري` or `منتهي`;
- Product name from the Warranty's issuance snapshot;
- Warranty activation/start date;
- Warranty coverage end date;
- activating/installation Center name from the Warranty snapshot;
- vehicle make;
- vehicle model;
- vehicle year only when present.

The page does **not** publicly display in V1:

- customer phone;
- customer email;
- customer name;
- full or partial VIN/chassis;
- vehicle plate;
- Roll serial;
- ERP serial;
- SKU unless later explicitly approved for customer display;
- internal UUIDs;
- custody/Transfer history;
- Opening/Issue details;
- Warranty audit events;
- correction reasons;
- void reasons;
- internal actor/profile identifiers.

This is an intentional minimal projection. The secure URL is the primary access control, but QR links can be photographed, copied or shared, so unrelated PII is still excluded without adding customer-login complexity.

---

## 9. Snapshot and correction behavior

### 9.1 Before Warranty Activation

Product identity displayed from the QR must come from the immutable production snapshot belonging to the physical Roll, not from the current mutable Product catalog.

Later Product renaming therefore does not redefine what that already-produced Roll was manufactured as.

### 9.2 After Warranty Activation

The public page uses Cube M Warranty issuance snapshots for Product, Center and coverage facts.

Later edits to current Product or Center records do not rewrite old customer Warranty presentation.

### 9.3 Allowed Warranty detail corrections

Cube M's bounded Admin customer/vehicle correction updates the same Warranty rather than creating a new Warranty.

Any corrected field that belongs to the approved public projection — currently vehicle make/model/year — must be reflected by subsequent public reads.

Immutable issuance snapshots remain unchanged.

---

## 10. Mistaken Activation and reactivation

The public identity is never voided with a Warranty.

Example lifecycle:

1. Roll `R` is created and receives public code `C`.
2. A mistaken Activation creates Warranty `W1`.
3. Admin marks `W1` `voided_in_error`; `W1` and its Warranty Number remain historical audit evidence.
4. Public code `C` remains unchanged.
5. Until a new valid activation exists, `C` shows no current Warranty without exposing `W1` details.
6. A later legitimate Activation creates Warranty `W2` with a new Warranty Number.
7. The same `C` now resolves to `W2`.

There is no QR replacement, token rotation, Warranty Number reuse or relinking operation.

---

## 11. Public UI contract

### 11.1 Route

Implement a mobile-first Arabic public route at:

`/w/[publicCode]`

The existing `/warranty` public page remains a non-search landing/information surface and should no longer claim that verification is unavailable once Cube N is complete.

It must not introduce a manual Warranty lookup form.

### 11.2 Language

Cube N public Warranty UI is Arabic only.

Do not add a localization framework or English toggle in this cube. The implementation should remain structurally compatible with future localization without building it now.

### 11.3 UI states

The page must have intentional mobile-first presentation for:

- valid not-yet-activated Roll;
- active Warranty;
- expired Warranty;
- no current Warranty after mistaken activation was voided;
- Roll unavailable for Warranty activation;
- invalid/unknown link;
- temporary internal inconsistency/failure.

No dead Claims button or placeholder customer action is displayed.

---

## 12. QR/print boundary

Cube N freezes the identity and URL that the customer QR will use, but does not generate or print the customer QR assets.

The next customer Warranty print slice owns:

- QR rendering through the existing shared QR vector foundation;
- three approved identical customer-access copies: vehicle, Warranty card and invoice;
- physical layout, copy placement and print/reprint UX;
- physical scan validation for the final printed sizes/materials.

All three copies for one Roll use the exact same `/w/<public-code>` URL.

Reprints use the same URL; no new public code is created.

---

## 13. Explicit non-goals

Cube N does not implement:

- customer Warranty QR rendering or label printing;
- vehicle/Warranty-card/invoice layouts;
- Claims submission or Claims buttons;
- customer accounts;
- OTP verification;
- manual public Warranty/VIN/serial search;
- token rotation/revocation UI;
- QR scan/view analytics or counters;
- access-history logging as a product feature;
- SMS/email/WhatsApp delivery;
- multilingual UI;
- generic customer master/CRM;
- replacement/reinstall lifecycle;
- changes to the existing contextual `/r/<roll-serial>` Roll QR contract;
- a generic public-token framework for unrelated entities.

---

## 14. Implementation slices

Implementation should proceed in four small complete slices.

### N1 — Roll public-identity persistence

Owns:

- private one-to-one Roll public-identity persistence;
- cryptographically strong compact public-code generation;
- unique constraint;
- atomic future-Roll provisioning inside Roll creation;
- no backfill subsystem;
- database tests for identity completeness/immutability/uniqueness.

### N2 — Public resolver/security boundary

Owns:

- fixed-shape public resolver;
- exact public state derivation;
- approved projection only;
- malformed/unknown anti-enumeration behavior;
- explicit grants/revokes;
- no direct anonymous table exposure;
- regression tests for state precedence and privacy.

### N3 — Public Warranty page

Owns:

- `/w/[publicCode]`;
- Arabic mobile-first states;
- noindex/no-referrer/no-stale-cache behavior as applicable;
- `/warranty` landing-page correction;
- no public search form;
- no Claims placeholder.

### N4 — Integration/regression closure

Owns:

- mistaken Activation -> void -> legitimate reactivation on the same URL;
- expiry behavior;
- allowed detail correction reflected publicly;
- existing `/r/<serial>` behavior unchanged;
- Cube M internal Warranty privacy unchanged;
- TypeScript/database/public-surface regression coverage;
- documentation/status amendment.

Do not begin the customer QR print cube until N1–N4 close and the `/w/` identity contract is qualified.

---

## 15. Required quality gates

At minimum, Cube N automated evidence must prove:

1. every newly created Roll receives exactly one public identity in the same transaction;
2. public codes are non-null, unique, URL-safe and generated from a cryptographically secure source;
3. public identity cannot be updated/rotated through application/Data API paths;
4. production creation fails atomically if identity creation cannot complete;
5. anonymous callers cannot directly read Roll/Warranty/private-identity persistence;
6. the resolver returns exactly the approved public columns/states and no PII/internal identifiers;
7. malformed and nonexistent codes share the same public not-found behavior;
8. pre-activation resolves using the production Product snapshot;
9. active/expired state is derived correctly from authoritative Warranty timestamps;
10. a `voided_in_error` Warranty never destroys or changes the Roll public identity;
11. legitimate reactivation after `voided_in_error` makes the same URL resolve to the new Warranty Number;
12. Warranty correction updates allowed public vehicle fields without changing immutable issuance snapshots;
13. multiple/contradictory effective Warranty data fails closed rather than guessing;
14. `/r/<serial>` contextual Roll behavior remains unchanged;
15. no customer lookup form, Claims button, analytics subsystem or QR print implementation enters this cube;
16. phone-focused public UI smoke coverage passes together with coherent tablet/desktop behavior.

Expected repository gates:

- existing `PR Quality`;
- existing `Database Quality`;
- a focused Cube N Public Warranty quality gate or equivalent permanent regression suite.

---

## 16. Definition of Done

Cube N is Done only when:

- the Roll-owned permanent public identity is implemented and immutable;
- future Roll creation cannot produce a Roll without that identity;
- the canonical `/w/<public-code>` URL contract is implemented;
- the public resolver exposes only the approved projection;
- all approved lifecycle states behave deterministically;
- mistaken Activation/void/reactivation preserves one permanent QR identity;
- expired Warranties remain permanently verifiable;
- no login or manual identifier search is required or offered;
- no dead Claims/print functionality is present;
- the existing contextual Roll QR and Cube M internal Warranty flows remain intact;
- security/privacy and failure paths are regression-tested;
- public mobile UI is qualified;
- Product Decisions and canonical status documentation are updated to reflect that the public Warranty identity is Roll-owned rather than Warranty-row-owned;
- all applicable quality gates pass on one exact reviewed HEAD.

---

## 17. Decision precedence

This specification preserves PD-050's valid principle that Warranty Number is not the public authorization credential, but **supersedes the old ownership/timing assumption** that the public credential would be created for a Warranty after Activation.

The approved contract is now:

`Production creates Roll -> Roll receives permanent public Warranty identity -> future customer QR prints that identity -> Warranty Activation changes what the identity resolves to, not the identity itself.`

This also preserves PD-031 because the existing contextual Roll QR and the customer Warranty QR are separate surfaces with separate purposes.
