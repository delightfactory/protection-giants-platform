# UX-00 — Full Product Experience Audit

Status: **IN PROGRESS — audit only**

Baseline reviewed: `829e716fc9d1c94177d85096fad326e519aba694`

Audit branch: `agent/ux-00-full-product-audit`

## 1. الهدف

هذه المرحلة ليست إعادة تلوين أو إعادة تنسيق للواجهات. الهدف هو مراجعة المنتج كما يراه ويستخدمه كل دور، ثم تحويله من مجموعة واجهات صحيحة وظيفيًا إلى تجربة تشغيلية متماسكة، واضحة، موثوقة، قابلة للتعلم، ومناسبة لمنصة Production حقيقية.

UX-00 لا يغير business logic ولا schema ولا RLS ولا state machines. لا تُنفذ إصلاحات UI أثناء الاكتشاف حتى لا تتحول المراجعة إلى سلسلة patch موضعية قبل اكتمال الصورة.

## 2. مصادر الحقيقة المستخدمة

- الكود الفعلي على الـbaseline أعلاه.
- الـhosted deployment المطابق لنفس الـHEAD عند الإمكان.
- `docs/design-system.md`.
- `docs/mobile-native-interface-standard.md`.
- `docs/brand-interface-reference.md`.
- `docs/interface-audit-2026-08-07.md` كتاريخ سابق، وليس كدليل أن جميع الرحلات اللاحقة تم تدقيقها.
- Specs الخاصة بكل مكعب عند مراجعة رحلة تخصه؛ الـUX لا يجوز أن يغير contract تشغيلي معتمد بالخطأ.

## 3. مبدأ المراجعة

نراجع على مستوى:

`Role → Journey → Screen → State → User task → Decision → Feedback → Next action`

وليس على مستوى شكل الصفحة فقط.

كل سطح يراجع من زوايا:

1. Information architecture / discoverability.
2. Mental model ولغة المستخدم مقابل لغة النظام الداخلية.
3. وضوح الإجراء الرئيسي وترتيب الإجراءات الثانوية والخطرة.
4. Form anatomy، field order، validation، helper text، input modes وحفظ البيانات.
5. Empty / loading / error / success / disabled / blocked / pending / stale states.
6. Error prevention خصوصًا قبل الإجراءات غير القابلة للعكس.
7. Cross-role handoff: هل الدور التالي يفهم ما وصل إليه وما المطلوب منه؟
8. Mobile-first ergonomics، touch، keyboard، viewport، safe area، scroll، long content.
9. Accessibility: semantic structure، focus، ARIA، contrast، non-color cues.
10. Visual hierarchy والديناميكية البصرية والكثافة والاتساق.
11. RTL/LTR والأكواد والأرقام والـVIN/Serial/Email.
12. Trust: هل الواجهة تشرح ما حدث وما الذي سيحدث بدون كشف مصطلحات backend أو implementation؟

## 4. درجات الأولوية

- **P0 — Critical:** يمنع إتمام مهمة أساسية، يسبب خطأ تشغيليًا خطيرًا، أو يضلل المستخدم في قرار حساس.
- **P1 — High:** رحلة ناقصة/مسدودة، خطر خطأ ملحوظ، أو friction شديد في مهمة أساسية.
- **P2 — Medium:** عبء ذهني، discoverability ضعيفة، لغة تقنية، inconsistency، أو خطوات غير ضرورية.
- **P3 — Polish:** تحسين بصري/دقيق لا يغير سلامة الرحلة لكنه مطلوب لجودة Production.

## 5. قواعد جودة ثابتة ظهرت من المراجعة

هذه ليست اقتراحات تجميلية؛ تصبح acceptance rules لمرحلة التنفيذ اللاحقة:

- لا يظهر اسم Cube أو اسم migration/RPC/state-machine concept للمستخدم النهائي.
- لا يظهر enum/raw status إذا كان له معنى منتج يمكن شرحه بلغة الدور.
- كل رابط أو CTA يجب أن ينجز الوعد الذي يحمله اسمه، أو يشرح بوضوح لماذا لا يمكن ذلك وما البديل.
- كل حالة blocked يجب أن تعرض **ما الذي اكتمل، ما الذي ينقص، وما الإجراء التالي** عندما يكون هناك إجراء متاح.
- كل إجراء نهائي/غير قابل للعكس يعتمد على صور أو بيانات مدخلة يجب أن يسمح للمستخدم بمراجعة ما سيرسله فعليًا، لا أسماء الملفات فقط إذا كانت الصورة نفسها جزءًا من القرار.
- لا نعتمد على refresh يدوي كي يفهم المستخدم أن العملية نجحت وانتقلت إلى حالة جديدة إذا كان النظام يستطيع إظهار الحالة مباشرة.
- الشاشة التشغيلية لا تشرح architecture؛ تشرح مهمة المستخدم، أثر الإجراء، والنتيجة التالية.
- التنقل على الهاتف يعطي أولوية للتكرار الفعلي للمهام، مع مسار واضح للوحدات الأقل تكرارًا؛ عدم وضع كل شيء في bottom-nav ليس عيبًا بحد ذاته، لكن الوصول لا يجوز أن يعتمد على معرفة مسبقة مخفية.
- الرسالة الناجحة أو الفاشلة يجب أن تقول: ماذا حدث؟ ماذا يعني ذلك؟ ماذا أفعل الآن إن كان هناك فعل مطلوب؟
- Mobile ليس نسخة desktop مضغوطة؛ ترتيب المعلومات والإجراءات يراجع حسب العمل الميداني الفعلي.

## 6. Inventory أولي للأدوار والرحلات

### Customer / Public

- Public home/navigation.
- Products discovery/detail.
- Installation-center discovery/map.
- Warranty entry/verification/public warranty state.
- Claim phone verification.
- Claim creation + evidence upload.
- Claim current status/history/service history.

### Center

- Login/onboarding.
- Operations home.
- Center location.
- Product reference.
- Roll custody/opening/pre-install issues.
- Transfers send/receive.
- Warranty activation/history.
- Claim inspection queue/detail/submission.
- Claim fulfillment queue/detail/replacement-roll dependency/completion.
- Notifications/inbox.

### Dealer

- Login.
- Operations home.
- Center management.
- Product reference.
- Roll custody.
- Transfers.
- Notifications.

### Country Agent

- Login.
- Operations home.
- Dealer/center management.
- Product reference.
- Roll custody/recovery where enabled.
- Transfers.
- Notifications.

### Admin

- Login.
- Operations home/navigation.
- Accounts/agents/dealers/centers/products.
- Production/orders/lots/roll identity.
- Custody/transfers/recovery/pre-install issues.
- Warranty registry/support.
- Claim intake review/inspection/decision.
- Claim resolution assignment/replacement/recovery/completion.
- Notifications.

Inventory remains open until every user-facing route and conditional state is accounted for.

## 7. Confirmed findings — first pass

### UX00-001 — P1 — Public warranty entry promises verification but cannot perform it

**Surface:** `app/(public)/warranty/page.tsx`

The page and public navigation present a “verify warranty” task, but the standalone page only instructs the customer to scan the QR from a physical document. It does not accept a public/warranty code, provide a recovery alternative, or provide a help route when the QR/document is unavailable.

**Why it matters:** this is a journey mismatch, not a visual issue. A user intentionally navigating to Warranty reaches instructions instead of the task implied by the CTA.

**Required design direction:** decide the canonical recovery/lookup contract first. Do not invent a weaker insecure lookup merely to fill the page. The final UX must either perform a safe lookup/verification or rename/reframe the route so it does not promise an unavailable capability, with a real recovery path if product/security contracts permit it.

---

### UX00-002 — P1 — Internal development cube names are exposed to Center users

**Surface:** `app/operations/claim-resolution-tasks/[id]/page.tsx`

User-facing guidance tells the center to use “Cube J” and “Cube K”.

**Why it matters:** cube names are development architecture. A center should understand “فتح الرول” and “بلاغ مشكلة قبل التركيب”, not the order in which the engineering team built features.

**Required direction:** replace all implementation-stage naming with stable product vocabulary and direct task links. Audit globally for Cube/phase/implementation terminology before launch.

---

### UX00-003 — P2 — Admin Claim Detail exposes backend/domain implementation vocabulary

**Surfaces:**

- `app/operations/claims/[id]/page.tsx`
- `app/operations/claims/[id]/layout.tsx`

Confirmed examples include “Snapshot”, “Resolution”, “معرف Resolution”, raw resolution status, `actor_kind` display, “Timeline”, “Admin”, and a banner mentioning “Cube R”.

**Why it matters:** the screen is functionally rich but reads partly like an engineering console. This increases cognitive load and weakens product confidence.

**Required direction:** establish a presentation vocabulary mapping for statuses, event actors, handoff/resolution concepts and historical snapshots. Keep raw identifiers available only when they genuinely help support/audit, and label them as technical references rather than primary content.

---

### UX00-004 — P1 — Image-based irreversible submissions do not provide adequate visual review

**Surfaces confirmed:**

- customer claim evidence in `app/(public)/w/[publicCode]/claim/claim-client.tsx`
- center inspection evidence in `components/claims/center-claim-inspection-form.tsx`

Uploads are represented primarily by filename/state/size before final submission. The image itself is evidence used by later decisions, and Center inspection acknowledges that the result becomes a fixed record after submission.

**Why it matters:** a wrong/repeated/blurred image can be submitted despite the user believing the correct evidence was selected. Filename review is weak error prevention on mobile camera workflows.

**Required direction:** provide lightweight thumbnail/review affordance for selected/uploaded evidence, preserving existing private-storage and upload semantics. Do not weaken immutability; improve pre-submit verification.

---

### UX00-005 — P2 — Customer claim success depends on manual refresh to reach the new mental state

**Surface:** `app/(public)/w/[publicCode]/claim/claim-client.tsx`

After successful submission the UI presents the claim number and tells the customer the status will appear “after updating the page”.

**Why it matters:** success should transition the product into the “current claim” state without asking the customer to know browser refresh behavior.

**Required direction:** keep the claim number success confirmation, then render/refresh the authoritative current-claim state automatically or provide a clear explicit action if a refresh boundary is technically necessary.

---

### UX00-006 — P2 — Admin claim registry has weak direct findability for support work

**Surface:** `app/operations/claims/page.tsx`

Current filtering is scope + status with pagination. There is no direct search by claim number, warranty number, customer/vehicle identifiers or other supported operational key.

**Why it matters:** status filters are good for queues but support/admin work often starts from a specific reference supplied by a customer or center. Scanning pages is not a professional retrieval workflow as volume grows.

**Required direction:** determine which identifiers the existing secure RPC can safely support, then add targeted search without bypassing the authoritative query/security boundary.

---

### UX00-007 — P2 — Login copy contradicts the platform’s actual Center operating model

**Surfaces:**

- `app/login/page.tsx`
- `app/operations/page.tsx`

Login describes the portal as being for “مراكز التركيب المعتمدة”, while the operations home explicitly supports registered but not network-approved centers and states that lack of approval does not automatically block custody/opening/warranty activation.

**Why it matters:** the login page can tell a valid registered center that the portal is not for them.

**Required direction:** use role-neutral/contract-accurate access language. Network approval must remain a trust classification, not be accidentally presented as login eligibility.

---

### UX00-008 — P2 — Center onboarding leaks identity/provisioning implementation language

**Surface:** `app/onboarding/center/page.tsx`

Confirmed user-facing terms include “Profile التشغيلي”, “Center Code”, “استكمال Profile”, and security/provisioning explanations framed around internal record creation.

**Why it matters:** the user needs to know which center is being activated, which email is linked, what information they must provide, and what happens next. They do not need the internal profile model.

**Required direction:** preserve the same safeguards and error specificity, but translate them into user mental-model language. Technical identifiers can remain as secondary references where useful.

---

### UX00-009 — P2 — Claim decision actions are structurally separated from the long Admin review surface

**Surface:** `app/operations/claims/[id]/layout.tsx`

The review/decision shortcut is rendered after the entire detail page. The detail itself contains many long sections and evidence grids.

**Why it matters:** an Admin can finish reviewing a long record without a persistent or contextually located indication of the next allowed step. The current placement makes primary workflow actions less discoverable than the data being reviewed.

**Required direction:** evaluate a compact task/status action rail or contextual top/section action treatment while preserving separate audit/read and mutation routes. Do not collapse review/decision APIs simply for visual convenience.

---

### UX00-010 — P2 — Blocked Center fulfillment lacks an explicit requirements checklist

**Surface:** `app/operations/claim-resolution-tasks/[id]/page.tsx`

When completion cannot proceed, the UI states that the completion form will become available when “the operational requirements above” are complete.

**Why it matters:** the page already knows the gating facts (`replacement roll assigned`, `opened`, `quality block`). Requiring the user to infer the missing gate from multiple sections increases uncertainty and support load.

**Required direction:** present a small authoritative checklist/state summary: assigned roll, opened state, quality clearance, and next available action. It must reflect actual server-authoritative state and never simulate eligibility client-side.

---

### UX00-011 — P2 — Navigation strategy is coherent but needs frequency/discoverability validation after P/Q/R

**Surface:** `components/operations-nav-links.tsx` + `app/operations/page.tsx`

The mobile bottom navigation intentionally limits destinations. Admin mobile shows five primary entries while claims, warranties, production, transfers, quality issues and resolution remain reachable from the operations home rather than the bottom bar. Other roles follow a similar bounded-nav model.

**Why it is not automatically a defect:** the design-system standard deliberately keeps bottom navigation small and the home page exposes real ModuleCards.

**Audit question:** after adding later cubes, are the five mobile destinations still the highest-frequency tasks per role, and can a user reach every secondary task without knowing that it exists beforehand?

**Required direction:** validate with journey frequency and role task topology; do not simply add more bottom-nav items.

---

### UX00-012 — P2 / product decision — Public Center Directory discovers centers but does not yet complete the real-world visit task

**Surfaces:**

- `components/center-directory-browser.tsx`
- `components/center-directory-map.tsx`

The directory supports search, approval filter, map focus, and public location where consent allows it. It currently does not expose an obvious directions/contact/near-me continuation.

**Why it matters:** “find a center” commonly ends with choosing and reaching/contacting a center, not only seeing a pin.

**Constraint:** do not invent phone/address/contact data or location permissions. Determine what public center fields and consent contracts actually allow before implementing any continuation.

---

## 8. Positive patterns to preserve

The audit must not destroy strong work already present.

Confirmed good foundations include:

- semantic shared components (`PageHeader`, `StatusBadge`, `FeedbackBanner`, `EmptyState`, `FormField`, filters, record list, task back link, confirm dialog);
- clear mobile touch-size and focus rules in the design system;
- Center claim inspection deliberately hides customer contact data and company decision authority;
- claim and inspection actions have detailed safe retry/error mappings and idempotency-aware behavior;
- role-specific module visibility on Operations home;
- high-quality empty states in many operational queues;
- transfer sending is already modeled as a staged task (`recipient → select → review → success`) rather than one giant form;
- mixed RTL/LTR values are intentionally handled in many operational surfaces;
- the existing design system explicitly rejects placeholder metrics, fake buttons and mockup-only evidence.

These are assets. UX hardening should simplify the user model without weakening backend correctness or operational controls.

## 9. Audit execution batches

To stay within the project’s cube principle, UX-00 discovery proceeds in bounded batches while remaining one audit artifact:

1. **Foundation & standards** — prior audit, design system, mobile standard, brand, shell/navigation/shared states. **Started.**
2. **Public/customer** — home/products/centers/warranty/claims. **Started.**
3. **Identity/onboarding/account access** — login/invites/access denied/account states. **Started.**
4. **Distribution/custody** — parties, roll registry, transfers send/receive, recovery.
5. **Production & print** — product/admin production orders, lots, generated labels/print surfaces.
6. **Center operating journey** — location, roll opening, pre-install issue, warranty activation.
7. **Claims — Center** — inspection and fulfillment. **Started.**
8. **Claims — Admin** — queue, detail, review, inspection assignment, decision, resolution/recovery. **Started.**
9. **Notifications/PWA** — permission, inbox, unread state, action routing, update lifecycle.
10. **Cross-role end-to-end** — production → custody → opening → warranty → customer → claim → inspection → decision → fulfillment.
11. **Accessibility/responsive/state matrix** — final cross-cutting pass.
12. **Execution backlog** — only after audit coverage is complete.

## 10. Exit criteria for UX-00

UX-00 is not complete until:

- every user-facing route is assigned to a role/journey or explicitly classified as non-user surface;
- each major conditional state is reviewed, not only happy paths;
- all user-visible raw/internal terminology is mapped;
- every irreversible action is checked for review/confirmation/error recovery;
- every major queue supports the retrieval model needed by its role;
- mobile task reachability is reviewed at journey level;
- public/customer recovery paths are reviewed;
- cross-role handoffs are traced end-to-end;
- accessibility/responsive risks have a testable acceptance criterion;
- findings are deduplicated into an ordered implementation backlog;
- implementation cubes are small enough to qualify independently without a giant redesign PR.

## 11. Implementation freeze during audit

Until this document reaches `AUDIT COMPLETE`, findings are evidence and proposed direction only. No finding authorizes bypassing a security/business contract, broad refactor, design-system rewrite, or speculative feature addition.

The next implementation phase starts only after the complete journey inventory makes dependencies and priorities visible.