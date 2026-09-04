# Protection Giants — Pre-Launch Operational Readiness Requirements

**Status:** Frozen pre-launch requirements baseline  
**Baseline repository:** `delightfactory/protection-giants-platform`  
**Baseline `main` at freeze:** `e42e346238ad96a874c3cffcd435019d2818cee2`  
**Purpose:** Define the remaining work required to move the qualified V1 product from development/UAT into controlled operational launch without reopening already-closed foundations unless a real defect is proven.

---

## 1. Governing rule

Protection Giants is no longer in broad feature-development mode for V1. The core product lifecycle, role model, Claims/Resolution lifecycle, mobile UX harmonization and browser-acceptance chain have already been implemented and qualified.

Pre-launch work must therefore focus on:

1. hosted UAT and real-device acceptance;
2. full E2E coverage audit and execution;
3. print/preview correction and physical print validation;
4. production infrastructure/configuration;
5. real production data/content/users;
6. production-domain/Auth/SMTP/Push qualification;
7. backup/monitoring/operational readiness;
8. golden operational cycle and controlled soft launch.

Do **not** reopen RLS, Transfers, Warranty, Claims, Notifications, PWA, role architecture or other closed foundations merely for convenience. Reopen only when a reproducible defect, security gap or newly approved business-rule change requires it.

All remediation must continue to follow the project cube principle: bounded changes, small PRs, exact-head qualification, no broad speculative refactors.

---

## 2. Current V1 capability baseline

The launch-readiness program assumes the following core surfaces already exist and must be verified rather than rebuilt:

- Product management;
- Production Order / Lots / Rolls;
- Admin / Agent / Dealer / Center operational roles;
- Network and Center management;
- Center location and network approval;
- Roll custody;
- Transfer send / pending / receive lifecycle;
- Roll Opening;
- Pre-install Issue reporting and evidence;
- Warranty Activation;
- Public Warranty verification;
- production / warranty print packs;
- Customer Warranty Claim intake;
- Admin Claim review;
- Center inspection assignment/submission;
- Admin decision;
- Claim Resolution / fulfillment / recovery;
- customer service history;
- Inbox notifications, deep links and Web Push/PWA foundation;
- Arabic product-facing UX vocabulary;
- responsive/mobile interaction and accessibility foundations;
- ACC-01 rendered browser acceptance A through K;
- UAT-01 Product Barcode and focused UX improvements.

A failure discovered in pre-launch testing is a defect against this baseline unless Product Ownership explicitly changes the requirement.

---

# 3. Launch Readiness Gates

## PRL-01 — Hosted Product-Owner UAT

The currently deployed hosted candidate must be tested as an actual operator, not only as a development build.

### Admin

Verify at minimum:

- login/logout and authenticated navigation;
- Operations Home clarity;
- Agent management;
- Dealer support/management where authorized;
- Center management;
- Center location review;
- approve/revoke Center;
- Product management;
- Production Order creation;
- Lot/Roll generation;
- print-pack access;
- Transfer visibility and operational handling;
- Claims queue;
- Claim review;
- inspection assignment;
- Claim decision;
- Resolution assignment;
- Resolution correction/recovery paths;
- Resolution completion visibility;
- notifications and deep links.

### Agent

Verify at minimum:

- access limited to the authorized network;
- Dealers;
- Centers;
- Product reference surfaces;
- Roll/custody visibility;
- Transfer send;
- Transfer receive;
- denial of out-of-network data/actions.

### Dealer

Verify at minimum:

- own Centers;
- Product reference surfaces;
- custody visibility;
- Transfer send/receive;
- no Admin/Agent-only controls or unauthorized routes.

### Center

Verify primarily on a phone:

- login;
- Receive Roll;
- Roll inventory;
- scanner entry;
- manual Roll Serial fallback;
- Roll Opening;
- Pre-install Issue;
- photo/evidence upload;
- Warranty Activation;
- Claim inspection;
- Resolution fulfillment;
- Inbox/notifications;
- PWA installation;
- Push delivery;
- notification deep links.

Every UAT finding must be classified as `BLOCKER`, `IMPORTANT`, or `POLISH`. Not every observation becomes a redesign.

---

## PRL-02 — Real-Device Acceptance

Browser automation does not replace real hardware acceptance.

Required representative checks:

- Android device;
- iPhone/iOS where practical;
- Chrome mobile;
- Safari/iOS;
- camera QR scan;
- direct photo capture/upload;
- Add to Home Screen / PWA installation;
- Web Push on supported mobile environments;
- notification open when the app is backgrounded/closed where supported;
- Wi-Fi and mobile-data use;
- short connectivity interruption/retry on safe representative workflows;
- mobile software-keyboard/form behavior.

Any hardware-specific limitation must be explicitly documented rather than silently marked PASS.

---

## PRL-03 — Print Pack Visual Correction and Physical Acceptance

### PRL-03-A — PDF/output readability correction

Current hosted UAT evidence shows that the print-pack composition is structurally usable but the visual hierarchy is not yet production-ready.

Required corrections:

- retain the approved pack composition unless Product Ownership changes it: `Outer x2` and `Warranty x3` per Roll pack;
- increase human-readable text sizes where available space clearly permits it;
- improve hierarchy between Product name, Product Barcode, SKU, size, thickness, Lot and Roll identity;
- use existing empty space more efficiently instead of keeping operationally important text unnecessarily small;
- keep QR and linear-barcode quiet zones intact;
- do not enlarge text by reducing machine-readable reliability;
- preserve deterministic output and correct Roll/Product identity;
- preserve print/cut guide separation from the actual labels;
- verify long-but-valid Product names/codes/identifiers without clipping or overlap;
- verify representative Arabic/Latin content where applicable.

The objective is **fast visual recognition on a physical label**, not merely fitting all data into the PDF.

### PRL-03-B — In-platform label preview correction

The current pre-download preview has a confirmed visual defect: text/header/QR content can overlap or clip instead of presenting the labels cleanly.

Required acceptance:

- no overlapping text;
- no clipped headings;
- no content escaping its label card;
- correct aspect ratio for Outer and Warranty previews;
- QR remains visually contained;
- preview may be scaled, but internal composition must remain coherent;
- labels must remain individually distinguishable;
- desktop and representative mobile widths must be checked;
- the preview must accurately communicate the resulting pack before the user opens/downloads the PDF.

The preview is not required to reproduce physical-size typography pixel-for-pixel, but it must preserve layout hierarchy and avoid false visual corruption.

### PRL-03-C — Physical validation

After software layout correction, execute real printing before production freeze:

- real printer output;
- final label dimensions;
- margins;
- cut/registration tolerance;
- text sharpness/readability;
- QR scanning using multiple ordinary phone cameras;
- Product Barcode / Code 128 scanner validation;
- quiet zones;
- printer/RIP/media settings;
- representative batch of at least 10–20 Roll packs;
- duplicate/misaligned identity detection;
- deterministic reprint;
- representative real application to the package/Roll.

The software PDF being valid is not equivalent to physical-production acceptance.

---

## PRL-04 — Production Supabase

Create and qualify a deliberate Production Supabase environment independent from Staging.

Requirements:

- canonical migrations from qualified `main`;
- clean/consistent migration history;
- no Staging-only fixtures copied as production data;
- DB lint/advisors qualification;
- required Storage buckets and policies;
- production Auth configuration;
- public signup disabled;
- anonymous operational sign-in disabled unless explicitly required by an approved public flow;
- correct Production Site URL and redirect allowlist;
- production-only secrets/credentials;
- no Preview/Staging keys in Production;
- no Production secrets in Preview/public client configuration.

This is deployment/parity qualification of already-reviewed authority contracts, not a reason to redesign RLS.

---

## PRL-05 — Production Authentication, Provisioning and SMTP

The operating model uses provisioned users rather than public operational signup.

Required production checks:

- production-grade SMTP configured;
- sender identity appropriate for Protection Giants;
- Center invitation email delivery;
- correct invite link and redirect;
- first Center user onboarding to the predetermined Center;
- expired/invalid/already-used invitation handling;
- Admin provisioning;
- Agent provisioning;
- Dealer provisioning according to the current authorized workflow;
- suspended user behavior;
- suspended entity behavior;
- session refresh;
- logout;
- password recovery if retained as an operational path.

---

## PRL-06 — Vercel Production and Release Governance

Required before Go-Live:

- verify the intended Vercel project;
- separate Preview and Production environment configuration;
- Production deployment must point only to Production Supabase;
- correct `NEXT_PUBLIC_SITE_URL`;
- production VAPID and Push worker secrets;
- no server secrets under `NEXT_PUBLIC_*`;
- define the production release rule for `main`;
- avoid accidental Production promotion/deployment during routine development;
- record exact Release SHA;
- define rollback procedure.

Production deployment should be an intentional release action, not an unnoticed side effect.

---

## PRL-07 — Domains and Durable Public Routing

Before printing production QR codes or opening the network:

- public domain finalized;
- operational portal domain/subdomain finalized;
- DNS correct;
- HTTPS valid;
- `www`/non-`www` policy finalized;
- Supabase Site URL and redirect URLs aligned;
- PWA origin/scope valid;
- public Warranty URL final;
- Roll QR route final;
- Product public route/QR final where applicable;
- Claim links final;
- notification deep links final.

No production physical QR may depend on a temporary Vercel Preview hostname.

---

## PRL-08 — Production Content and Real Business Data

Production must not start with dummy/staging content.

### Products

Approve and load:

- names;
- Product Barcode;
- versions/specifications;
- dimensions;
- warranty duration;
- coverage;
- care instructions;
- Product images/assets;
- publication status.

### Network

Approve and load:

- real Country Agents;
- real Dealers;
- real Centers;
- approved public contact/location fields;
- locations;
- network approval states;
- correct hierarchy/binding.

### Public content

Approve:

- Home copy;
- Arabic wording;
- Product descriptions;
- Warranty wording;
- care content;
- trust/approval language;
- support/contact information;
- legal/privacy wording where required by the business.

---

## PRL-09 — Web Push Production Qualification

Cube L behavior is not to be redesigned. Production qualification must verify:

- production VAPID pair;
- strong Production Push worker secret;
- permission request;
- subscription;
- disable subscription;
- resubscribe;
- multiple devices;
- Inbox unread state;
- Push delivery;
- click/deep-link to the correct authorized action;
- safe behavior for stale notifications;
- Push failure does not control or roll back business state;
- Inbox remains the durable notification truth.

---

## PRL-10 — Production Operational Seed

Establish only real initial operating identities/data:

- singleton Company party;
- real Admin accounts;
- initial real Agent(s);
- initial real Dealer(s);
- initial real Center(s);
- Transfer IDs;
- Products;
- Center locations;
- approval states.

Before Go-Live confirm there are no unintended test users, fake Products, test Claims, fake Warranties, fake Rolls or stale test notifications in Production.

---

## PRL-11 — Golden Real-Life Cycle

Before broad launch, execute one complete small real-life cycle on the final environment:

`Product → Production Order → Lot → Roll → Print → Scan → Custody → Transfer → Receive → Roll Opening → Warranty Activation → Public Warranty → Claim → Review → Inspection → Decision → Resolution → Completion → Customer History`

Notifications/deep links must be observed at the appropriate handoff points.

This is the final operational proof, not a substitute for lower-level automated tests.

---

## PRL-12 — Backup and Recovery

Minimum production requirement:

- known Production backup policy;
- known retention;
- documented restore process;
- at least one restore rehearsal to an isolated environment where practical;
- exact release SHA retained;
- migration correction/incident procedure;
- Vercel rollback procedure;
- named emergency access owner(s).

Avoid building an unnecessary enterprise disaster-recovery subsystem for V1; the requirement is a tested, usable recovery path.

---

## PRL-13 — Monitoring

Minimum operational monitoring:

- failed Vercel deployment visibility;
- runtime 5xx visibility;
- Supabase DB/Auth errors;
- Storage failures;
- Push worker failures;
- abnormal error spikes;
- manual daily health check during the initial launch period.

Do not add a heavy observability stack unless real operating volume justifies it.

---

## PRL-14 — Operational Handbook

Prepare concise role-oriented operational guidance, preferably with final screenshots:

- Admin network/production basics;
- Agent/Dealer network and Transfers;
- Center Receive/Open/Activate;
- Claims/inspection;
- Resolution fulfillment;
- common error/recovery handling;
- support/escalation path.

This should be a practical operator playbook, not a large technical manual.

---

## PRL-15 — Launch Control and Soft Launch

Before launch day:

- code freeze;
- exact Release SHA recorded;
- required GitHub quality gates GREEN;
- Production DB ready;
- backup confirmed;
- domains ready;
- SMTP ready;
- Storage ready;
- Push ready;
- real users ready;
- real Products ready;
- physical labels qualified;
- Golden Cycle PASS;
- Product Owner hosted UAT accepted.

Initial operating rollout should be deliberately limited, for example:

- Admin;
- one Agent where applicable;
- one or two trusted Centers;
- limited real Roll quantity.

Expand only after several days of successful real operation and defect review.

---

# 4. E2E Coverage Audit and Device Execution — Mandatory Before Final Launch Acceptance

The next acceptance phase must not begin by blindly adding more tests. It must first prove what the platform actually contains and which existing tests already cover it.

## E2E-01 — Complete coverage inventory

Inspect the actual repository and frozen specs and build a coverage matrix covering **100% of the identified approved V1 product surface**.

The inventory must enumerate at minimum:

### Surfaces

- all public routes;
- all authenticated operational routes;
- all role-specific navigation paths;
- forms, dialogs, confirmations and destructive/sensitive controls;
- print/preview/download surfaces;
- scanner/manual-fallback entry points;
- PWA/Push/Inbox surfaces;
- loading/empty/not-found/error/access-denied states.

### Authority and workflow

- Server Actions;
- RPCs used by the application;
- authoritative DB transitions;
- role/RLS boundaries;
- Storage upload/read lifecycle;
- notification projectors/handoffs;
- idempotency/retry paths;
- concurrency-sensitive paths already owned by the product;
- allowed correction/recovery paths.

### Roles

- anonymous/public customer;
- Admin;
- Agent;
- Dealer;
- Center;
- suspended/invalid authenticated identity where applicable.

### State classes

For every workflow, inventory:

- happy path;
- invalid input;
- unauthorized actor;
- stale state;
- duplicate submit/idempotent replay;
- cancellation/rejection where supported;
- empty state;
- not-found/unknown identity;
- relevant retry/recovery;
- privacy/non-disclosure boundary.

### Interaction/quality

- mobile 320/360/390/430 representative widths where relevant;
- representative desktop;
- touch targets;
- horizontal overflow;
- accessibility/axe where applicable;
- keyboard/focus;
- Arabic readability;
- runtime/network failures;
- real-device-only coverage markers.

## E2E-02 — Coverage Matrix contract

The matrix should contain at least:

| Field | Meaning |
|---|---|
| Coverage ID | Stable identifier |
| Domain/Cube | Product area |
| Route/Surface | Exact UI entry |
| Role | Authorized actor |
| Preconditions | Required state |
| User action | What is performed |
| Expected UI | Rendered result |
| Authoritative assertion | DB/RPC/event/storage fact |
| Negative/privacy assertion | What must fail/not leak |
| Device class | Browser / mobile / hardware |
| Existing test | Current verifier/workflow if any |
| Coverage status | Covered / gap / device-only / deferred-with-reason |
| Evidence | Artifact/screenshot/log reference |

## E2E-03 — Meaning of “100% coverage”

For this launch program, `100% coverage` means:

- every identified approved V1 route/surface and business workflow has a row in the matrix;
- every role boundary has explicit positive/negative coverage;
- every supported authoritative state transition has coverage;
- every known public/privacy boundary has coverage;
- every P0/P1 row is executed and PASS before Go-Live;
- hardware-only rows are executed on real devices before the corresponding launch gate closes;
- any deliberate deferment is explicit, justified and Product-Owner approved.

It does **not** mean claiming mathematical coverage of every theoretically possible browser/device/database failure combination.

## E2E-04 — Reuse before adding tests

The audit must first map existing quality gates, including the existing ACC-01 A–K and cube regressions, to the matrix.

Do not duplicate a test merely to increase test count.

New E2E work is created only for a proven uncovered row or an inadequate existing assertion.

## E2E-05 — Direct device/browser execution

After the matrix is complete, run the maximum practical end-to-end acceptance directly against the current hosted candidate using the available device/browser automation environment.

Where the execution agent can directly control a browser/device, it should use the real rendered application rather than simulated component tests.

Required evidence for each executed row should prefer:

- rendered screen assertion;
- final URL/route;
- authoritative DB/RPC/event/storage assertion where relevant;
- screenshot/artifact for significant user-facing flows;
- runtime/network error capture;
- no unexpected console errors;
- exact build/commit/environment identity.

Camera, native notification and physical-print behavior that cannot be honestly proven in the automation environment must be marked `REAL-DEVICE REQUIRED`, not guessed.

## E2E-06 — Defect handling

When E2E exposes a defect:

1. record the exact coverage row and reproducible evidence;
2. classify severity;
3. stop expansion of that slice if the defect invalidates later assertions;
4. fix surgically in a small dedicated branch/PR;
5. add or strengthen a permanent regression;
6. rerun the affected slice plus necessary upstream regression;
7. do not weaken an assertion simply to make the run GREEN.

Avoid combining unrelated defects into one large remediation PR.

---

# 5. Final Go-Live Definition

Protection Giants V1 is eligible for `GO-LIVE` only when all of the following are true:

1. Hosted Product-Owner UAT accepted;
2. E2E Coverage Matrix complete for the approved V1 surface;
3. all launch-blocking E2E rows PASS;
4. real-device acceptance PASS for required hardware paths;
5. Print PDF and in-platform preview defects corrected;
6. physical print/scan acceptance PASS;
7. Production Supabase/Auth/SMTP/Storage qualified;
8. Production Vercel/domain routing qualified;
9. production content/data/users approved;
10. Production Push qualified;
11. backup/recovery path ready;
12. minimum monitoring ready;
13. Golden Real-Life Cycle PASS;
14. soft-launch scope agreed.

Any remaining item must be explicitly marked either `BLOCKER`, `ACCEPTED DEFERMENT`, or `POST-LAUNCH`, with Product Owner approval. Silent unknowns are not acceptable launch readiness.
