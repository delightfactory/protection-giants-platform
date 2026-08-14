# Protection Giants — Canonical Project Context

**Snapshot date:** 2026-08-14  
**Purpose:** durable context for future development conversations.  
**Rule:** this file records only confirmed/approved decisions or explicitly marked historical requirements. It must not be used to invent unresolved details.

---

## 1. Source of truth and precedence

Active development repository:

`delightfactory/protection-giants-platform`

Legacy repository:

`melsayedahmed/protection-gaints-system-tickets`

The legacy repository is a historical functional reference only. It may be used to discover older workflows, screens, labels, serial behavior and warranty clues, but it is not an architecture, schema, security, or code-quality authority.

When sources conflict, use this order:

1. latest explicitly approved Product Decisions and normative amendments in the active repository;
2. current approved functional specs / roadmap;
3. merged implementation contracts and actual code/migrations/tests on `main`;
4. confirmed business requirements from project discussions;
5. legacy repository only as historical evidence of attempted behavior.

Older documents can contain superseded wording. Date and explicit precedence matter.

Important known example: older wording that treated an “Approved Center” as the activation gate was superseded on 2026-08-12. Network approval is now a public trust/quality designation, not a custody or Warranty Activation permission.

---

## 2. Product objective

The platform is a dedicated Protection Giants operational system for PPF production, physical Roll identity, distribution/custody, installation-center operations, warranty activation and subsequent warranty/claim lifecycle.

First release boundaries:

- single brand: Protection Giants;
- first operational product family: PPF;
- one physical PPF Roll is the tracked unit;
- one PPF Roll can create at most one customer warranty;
- customer accounts are not required in the first release;
- platform must not become a general ERP, accounting system, generic workflow engine, or speculative multi-tenant platform.

The architecture intentionally separates stable Product data, Production instances, physical Rolls, operational entities, custody/transfers, activation and Warranty records.

---

## 3. Development method — mandatory

Development follows small complete “cubes”.

Each cube must:

- have one clear responsibility;
- be functionally complete within that scope;
- include schema/data contract where needed;
- include business invariants;
- include authorization/RLS/security;
- include validation;
- include real UI when the cube owns UI;
- include loading/empty/error/failure paths;
- include tests and regression coverage;
- include documentation;
- avoid dead/placeholder controls;
- avoid speculative abstractions;
- avoid reopening previously closed foundations merely for convenience.

A cube is not considered complete simply because a page renders.

Before merge:

1. implementation-integrity review;
2. fresh dependency/scope review;
3. CI/database/types/build and relevant runtime smoke checks;
4. then merge.

Every new cube starts from updated `main`.

---

## 4. Mobile and UX contract

The operational platform is mobile-first in the strong sense: the phone is the primary product surface.

Confirmed rules:

- design phone interaction first, then adapt to tablet/desktop;
- do not merely stack desktop admin screens vertically;
- no horizontal page overflow for core workflows;
- core touch targets at least 44×44 CSS px, preferably ~48px for primary controls;
- avoid wide desktop tables for field operations;
- use camera/scanner entry only where a confirmed workflow requires it;
- Arabic validation/errors must be understandable;
- navigation should feel like an application, not a collapsed desktop sidebar;
- connectivity interruption/retry matters for operational workflows;
- UI should translate Protection Giants brand DNA into an efficient operational app, without inventing unverified permanent brand rules.

---

## 5. Identity and users

Current operational roles:

- `admin`: Protection Giants administration;
- `agent`: Country Agent user, bound to one `country_agent_id`;
- `dealer`: Dealer user, bound to one `dealer_id`;
- `center`: Installation Center user, bound to one `installation_center_id`.

Operational entity identity is separate from personal user identity. Multiple users may represent the same entity.

Authentication:

- email is the active sign-in identity;
- phone is optional profile data;
- SMS/OTP login is not enabled;
- credentials/secrets must never be committed to migrations/seeds/docs/source.

Profile binding is database-enforced:

- Admin: no entity binding;
- Agent: only country_agent_id;
- Dealer: only dealer_id;
- Center: only installation_center_id.

Public operational signup remains disabled.

Trusted provisioning uses protected `app_metadata.pg_provisioning`; user-editable metadata never chooses authorization role/entity.

---

## 6. Operational network model

Current normal management hierarchy:

```text
Protection Giants / Company
└── Country Agent
    ├── Dealer
    │   └── Installation Center
    └── Installation Center (direct to Agent)
```

Exceptional direct-Company Centers remain possible.

Creation/management direction:

- Admin creates Country Agents;
- Agent creates Dealers in its network;
- Agent may create direct Centers or Centers under its Dealers;
- Dealer creates Centers under itself;
- Center creates no child entity;
- Admin retains support/correction authority.

Important architectural decision:

**management hierarchy is not a physical Transfer route matrix.**

Legitimate physical Roll transfers are not hard-coded to Company → Agent → Dealer → Center only. Future transfer authorization depends on confirmed current custody, active recipient identity and transfer rules.

Examples the model must be capable of supporting without hierarchy redesign include direct/return/peer movements such as Company → Center, Dealer → Dealer, Center → Center, Center → Dealer return, Dealer → Company return, subject to Transfer rules.

---

## 7. Operational Party and Transfer ID

Custody/Transfer records do not use User ID as holder identity.

A thin `operational_parties` registry provides one uniform party ID for:

- Company;
- Agent;
- Dealer;
- Center.

It does not replace the canonical entity tables and must not grow into a generic Organizations subsystem.

Each entity receives one party identity. There is exactly one singleton Company party.

Every operational party receives a stable platform-wide unique Transfer ID.

Transfer ID properties:

- stable;
- shareable;
- exact-match lookup;
- not a secret;
- not an OTP;
- not proof of custody;
- not an activation identifier;
- ordinary users do not browse a global directory of all entities.

Sender enters/scans an exact Transfer ID and receives only minimal recipient identity sufficient to verify the destination.

---

## 8. Center onboarding

The project originally considered Center onboarding later, but this was promoted into the Agent & Network Foundation because a Center may need to receive a pending transfer before its first user exists.

Current approved model:

- Center entity can exist with zero users;
- Center party + Transfer ID exist independently of users;
- first Center user is onboarded through a controlled invitation to an already-existing Center;
- invitation is bound to the predetermined Center;
- invitee never chooses role, Agent, Dealer or Center binding;
- public operational signup remains disabled;
- raw Supabase invite tokens are not stored by the app;
- production invitation delivery requires correct hosted Site URL/redirect allowlist and production-grade SMTP.

Agents are created by Company/Admin. Dealers are created by Agents. The invitation onboarding flow in current scope is specifically for Centers.

---

## 9. Product Foundation

`products.code` is the canonical SKU in the first release.

Do not introduce a duplicate SKU field without a real demonstrated distinction.

One SKU maps to one fixed physical Product specification.

A materially different width, length, thickness, version/model or other defining physical specification becomes a new Product/SKU rather than a generalized variants engine.

Product stores stable definition data, including as applicable:

- product identity/name;
- PPF type/category/version;
- nominal width/length/thickness/weight/origin;
- descriptions/features;
- publication state;
- reference price/currency as reference data only;
- current default warranty duration;
- coverage text;
- care instructions;
- Product assets.

Product must NOT store Production-instance data such as Lot, Roll serial, ownership, Transfer, activation, or customer Warranty instances.

Reference price is not a transaction ledger.

Warranty creation later must snapshot the policy used so historical Warranty terms do not change when Product policy is edited.

The external Marketing QR is informational only and opens public Product/site content. It does not activate a Roll or collect activation data.

---

## 10. Production Order / Lot / Roll Foundation

Production Foundation is closed and establishes:

- immutable Production Order;
- one to fifty Lots per order;
- up to 10,000 total physical Rolls per order;
- one database row per physical Roll;
- atomic/idempotent Production creation;
- Product specification snapshot at generation time;
- system-generated Production Order number;
- system-generated Lot numbers;
- system-generated internal Roll serial;
- independent unique ERP serial per Roll;
- irreversible audited void instead of edit/delete;
- paginated registries and searchable identities.

Identifiers are separate business meanings:

- Product SKU;
- Production Order number;
- Lot number;
- internal Roll serial;
- ERP serial;
- Transfer ID;
- future Activation identity;
- future Warranty/public token.

These must not be reused as interchangeable identifiers.

Production records remain immutable/auditable. A voided Production Order keeps all generated IDs permanently reserved but its Rolls are not operationally eligible for later Transfer/Activation/Warranty flows.

Production Foundation deliberately excluded Transfers, ownership history, activation, Warranty and label-template workflows.

---

## 11. Center location, registration and network approval — corrected model

Three concepts are explicitly independent:

1. **Operational status** — registered active/suspended operational entity.
2. **Geographic location** — current physical Center coordinates.
3. **Network approval** — Protection Giants trust/quality/public badge.

Network approval is NOT:

- proof of Roll ownership;
- permission to bypass Transfer acceptance;
- a Warranty Activation gate;
- a replacement for custody.

### Center location

Center self-captures location from browser/device while physically at the premises.

Current rules:

- latitude/longitude not manually typed by Center;
- Center cannot freely drag pin to arbitrary position;
- capture includes coordinates, accuracy, time and source;
- initial target is reported accuracy ≤ 50m;
- location changes are auditable;
- Admin may correct location administratively;
- Country Agent does not receive arbitrary manual-coordinate correction authority in current scope.

### Network approval

- Admin may approve/revoke any Center;
- responsible Country Agent may approve/revoke Centers in its own network;
- Dealer cannot grant Protection Giants approval;
- Center cannot self-approve;
- Center must be operationally active and have valid location before approval;
- saved location change invalidates the previous approval and requires re-approval;
- revocation does not suspend Center and does not remove custody.

### Public Center directory/map

- only active Centers with valid current location are published;
- both registered and approved Centers may appear;
- approved Centers receive distinct trust badge/pin state;
- suspended Centers are not published;
- public projection must not expose Auth IDs, private email, Transfer ID, private hierarchy/audit data.

---

## 12. Critical change to activation eligibility

Earlier project wording used “Approved Center” too broadly. This was corrected on 2026-08-12.

Current rule:

**Protection Giants network approval is NOT required for Roll Opening or Warranty Activation.**

An active Center may later perform Roll Opening / Warranty Activation when the module rules are satisfied, including at minimum:

- authenticated acting user;
- active Center-bound operational profile;
- Center entity operationally active;
- Center is confirmed current custodian of the Roll;
- parent Production Order is not voided;
- Roll is not already in conflicting/terminal activation state;
- Roll Opening and Warranty Activation remain separate events.

Free-text Center name, possession of a Roll serial/QR, Transfer ID, or public listing is never sufficient authorization.

---

## 13. Roll Custody Foundation — Cube D

Current custody is modeled against `operational_parties.id`, never User ID.

Cube D owns only:

- one authoritative current confirmed custodian per Roll;
- backfill existing Rolls to Company custody;
- automatic Company custody initialization for future Rolls through a narrow database path;
- immutable custody event/history contract;
- one confirmed custodian only;
- voided Production Order downstream eligibility rule;
- custody read/RLS contracts;
- read-only operational custody UI where appropriate.

It does NOT own pending Transfer, reservation, receipt, scanner UX, labels, activation or Warranty.

Status snapshot 2026-08-14:

- PR #43 merged into `main`;
- merge commit: `0d1dfa3c84f4cbec5ff17e8a4804c4acbc6200aa`;
- independent Codex review found no P0/P1 and no Domain Model/RLS redesign need; it identified two P2 closure gaps in permanent regression coverage;
- closure patch PR #45 added permanent Database Quality execution of the custody contract, a real pre-migration backfill acceptance test, Agent/Dealer/Center isolation coverage, suspended profile/entity coverage, service-role Data API denial coverage, and explicit duplicate-current/duplicate-sequence constraint checks;
- PR #45 merged successfully to `main` as `b9872ddfdbcccd2b76a0b228226abc92a5aa5d33` after PR Quality and Database Quality passed on its final head;
- the closure patch did not change the Cube D schema/RLS architecture and did not add Transfer, receipt, scan, label, Activation or Warranty behavior.

**Cube D is closed.** A later cube must not reopen it merely for convenience; reopen only for a real regression or newly approved business-rule change.

---

## 14. Transfer lifecycle — approved design, not all implemented yet

Transfer rules already approved:

- sender must be confirmed current custodian;
- recipient must be an active operational party and not sender;
- creating Transfer does NOT immediately move confirmed custody;
- selected Rolls are reserved while custody remains with sender;
- recipient acceptance/receipt is required before custody moves;
- rejection or sender cancellation before receipt releases reservation;
- partial receipt is supported;
- custody moves individually only for received Rolls;
- unresolved Rolls remain reserved and sender remains confirmed custodian until resolved;
- race/concurrency protection must prevent double reservation/double Transfer.

Physical Transfer selection modes later include:

- exact recipient Transfer ID;
- scan Rolls for small/mixed moves;
- select known Roll subset;
- trusted whole-Lot selection.

A trusted whole-Lot move does not require scanning every Roll individually. The platform still expands the Lot into individual Roll Transfer items.

If only part of the Lot is currently held/eligible, UI must show that explicitly and must not represent the action as a complete-Lot move.

---

## 15. Operational Roll Scan Identity — Cube E

The operational scan label is intentionally narrow and separate from the full label package.

Purpose:

- allow the physical Roll to be scanned into its already-existing canonical Roll identity;
- support later Transfer scan UX and Roll Opening scan flow.

Rules:

- creates no new business identifier;
- must not masquerade as Activation code, Warranty token, Transfer ID or Marketing QR;
- deterministic print/reprint;
- human-readable identity beside machine code where operationally needed;
- final symbology/dimensions frozen only after real print/scan validation;
- voided-order protection.

Cube E is independent of Cube D/F at database level, but the scan UX later depends on both scan identity and Transfer engine.

---

## 16. Production label package and historical label requirements

### Current approved architecture

Full Production-owned label package is later Cube I and must use already-existing immutable Product/Production/Roll data.

It may own, after final physical matrix approval:

- outer carton Product/Roll labels;
- bag/case labels;
- broader inner-Roll presentation;
- ERP serial label;
- Product/Lot/spec information;
- informational marketing/site QR;
- bounded batch print/reprint.

Activation/Warranty labels are explicitly excluded until their own identifier/lifecycle decisions are made.

### Historical client-call requirements that must not be lost

The earlier client requirements/discussion included:

- outer carton label around 15×10 cm, with two copies requested for front/back;
- bag/outer-case sticker for shipments without carton;
- inside-coil/on-Roll sticker;
- activation sticker with QR + variable alphanumeric activation code;
- compact vehicle-pillar QR sticker (example size discussed around 7×5 cm);
- Warranty-card QR sticker;
- invoice QR sticker;
- ERP serial as a separate unique Roll serial/label, distinct from Warranty/Activation identity;
- ERP serial intended for operational scanning and not to be exposed externally in a way that enables misuse;
- historical print batches such as 50/100 serials per file were discussed.

These are retained as **historical functional requirements/candidates**, not all as frozen production-print specifications.

The exact total physical sticker count, dimensions, copy matrix, printer tolerances and final artwork remain subject to the later print-template decision. Current Product Decision PD-011 only fixes the concept of three customer Warranty QR copies: vehicle, Warranty card, invoice; exact layout remains pending.

Do not invent Activation/Warranty identifiers merely to finish label artwork.

---

## 17. Roll Opening and Warranty Activation — approved business direction

Roll Opening and Warranty Activation are two separate events.

Current approved direction:

1. authenticated active Center holding confirmed custody opens/claims the Roll;
2. after opening, Center may report a pre-install manufacturing/physical issue;
3. customer Warranty Activation happens later when installation/customer data is available;
4. no mandatory maximum time between opening and activation in first release.

Normal customer activation intentionally remains simple:

- customer data;
- vehicle data;
- VIN;
- no mandatory photos/videos/invoice upload/OTP in first release.

Pre-install issue reporting may request evidence; normal activation does not require evidence by default.

Customer does not need a platform account.

Customer later accesses Warranty through a secure Warranty URL/QR and can view Warranty information and raise a claim without login in the first release.

Warranty duration and customer-facing coverage/care come from Product policy, but the created Warranty must snapshot the policy used.

---

## 18. Activation/Warranty identifier decision gate — intentionally unresolved

Before implementing Activation sticker / Warranty QR copies, the future specification must decide:

1. when Activation identity is allocated;
2. which object owns it;
3. whether it is printable at Production time or later;
4. whether vehicle/card/invoice copies share one Warranty public URL/token or another approved model;
5. reprint behavior;
6. anti-enumeration/security behavior.

Do NOT substitute any of the following merely to close artwork:

- SKU;
- Roll serial;
- ERP serial;
- Transfer ID.

---

## 19. Roadmap state and dependency correction

The roadmap was corrected on 2026-08-13 because the older broad order “Production Labels → Roll Custody & Transfers” created a false dependency.

Current dependency logic:

- current Roll custody does not require a label;
- Transfer state/reservation does not require a label;
- scan-based Send UX does require a physical machine-readable Roll identity;
- therefore narrow Operational Roll Scan Identity is separated from full Production Label Package;
- Activation/Warranty labels wait for their own identifier decision.

Approved remaining chain after Center completion:

- D — Roll Custody Foundation;
- E — Operational Roll Scan Identity Label;
- F — Roll Transfer State & Reservation Engine;
- G — Transfer Send UX: Transfer ID + Scan / Select / Lot;
- H — Transfer Receipt, Partial Receipt & Resolution;
- I — Production Label Package;
- later: Roll Opening → Pre-install Issue → Warranty Activation → public Warranty access/verification → Claims.

Dependency details:

- D → F;
- E independent of D/F;
- E + F → G;
- F + G → H;
- E print primitives → I.

Status snapshot 2026-08-14:

- Product Foundation: complete;
- Production Order / Lot / Roll Foundation: complete;
- Agent & Network Foundation: complete;
- Cube A Center Location: complete/merged;
- Cube B Center Network Approval: complete/merged;
- Cube C Public Center Directory & Map: complete/merged;
- Cube D Roll Custody: complete/closed; independent review found only test/CI closure gaps, and closure PR #45 merged the accepted permanent protections after green CI;
- the roadmap may proceed from updated `main` without reopening Cube D architecture.

Note: `gap-closure-roadmap.md` still contains an old “immediate next step = Cube A” section because it was authored before A/B/C/D were completed. Use its dependency graph and cube definitions, but do not use that stale status sentence as current progress.

---

## 20. Known documentation supersession/drift risks

Future reviewers must not treat every older file as equal authority.

Known examples:

### `docs/scope-guardrails.md`
Contains earlier wording:

- `Brand Owner -> Country Dealer/Distributor -> Approved Installation Center -> Customer`;
- earlier module order putting labels before network/custody;
- “approved center” language around opening.

Later approved decisions supersede those details:

- Country Agent is now a distinct entity from Dealer;
- Center operational status/network approval/activation permission are separate;
- full label package no longer blocks custody/Transfer foundation.

The high-level anti-scope-creep rules in that file remain valid.

### `docs/gap-closure-roadmap.md`
Dependency definitions remain current, but its “Immediate next development step = Cube A” status text is stale after Cubes A-D were completed.

### `docs/center-location-foundation-implementation.md`
Contains historical “implementation in review / cube open” status from 2026-08-13. Use it for Cube A contract details, not current project progress.

This canonical context therefore separates:

- normative business rules;
- architectural contracts;
- implementation status.

---

## 21. Things that must NOT be silently inferred

Until an explicit decision/spec exists, do not assume:

- final Activation identifier format;
- final Warranty public token strategy;
- final label count/copy matrix;
- final QR/barcode symbology and physical dimensions for operational label before print validation;
- detailed claim/replacement/reinstall state machine;
- Window Film activation rules;
- multi-brand/multi-tenant architecture;
- general ERP/accounting/shipping/procurement workflows;
- mandatory customer account or OTP;
- network approval as activation permission;
- direct parent-child hierarchy as mandatory physical Transfer route.

---

## 22. New-conversation startup checklist

Before continuing Protection Giants development in any new conversation:

1. confirm repository is `delightfactory/protection-giants-platform`;
2. inspect current `main` and latest merged PR/state;
3. read this canonical context;
4. read `docs/product-decisions.md`;
5. read the applicable current spec/amendment for the next cube;
6. read `docs/gap-closure-roadmap.md` for dependency boundaries, while checking current status separately;
7. check whether a later Product Decision supersedes older wording;
8. do not use the legacy repository as architectural authority;
9. define the next cube’s exact scope and explicit exclusions before coding;
10. start a fresh branch from updated `main`;
11. implement a complete vertical slice;
12. perform double review + CI before merge.

If a chat recollection conflicts with an approved current Product Decision/spec, stop and reconcile against the authoritative repository documents before implementation.

---

## 23. Core principle in one sentence

Build the real Protection Giants operational lifecycle — Product → Production → physical Roll → custody/Transfer → Center opening → Warranty Activation → customer Warranty/claims — as small complete, secure, mobile-first cubes, without conflating identifiers, permissions, statuses or future workflows.
