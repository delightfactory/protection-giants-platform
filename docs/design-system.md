# P.G Design System Foundation

هذه الوثيقة هي المرجع البصري وتجربة الاستخدام لمنصة عمالقة الحماية. الهدف ليس إنشاء مكتبة زخرفية منفصلة عن المنتج، بل تثبيت قواعد عملية تجعل كل شاشة جديدة تبدو وتعمل كجزء من نفس المنصة.

## 1. شخصية المنتج

واجهة P.G يجب أن تكون:

- **Operational:** المعلومة والإجراء أهم من الزخرفة.
- **Technical:** دقيقة، منظمة، سريعة المسح البصري.
- **Premium:** خامات بصرية هادئة وتباين مدروس بدون مؤثرات استعراضية.
- **Automotive:** الأسود/الفحمي مع الأحمر كهوية وتوجيه بصري، لا كمساحة لونية مهيمنة.
- **Arabic-first:** العربية وRTL هما الأصل، مع معالجة صحيحة للأرقام والأكواد والبريد والـVIN والـSKU والـserials.

المرجع البصري العام: كثافة وهدوء أدوات التشغيل الاحترافية، مع دقة هندسية واضحة وشخصية P.G السوداء/الحمراء.

## 2. مبادئ UX

1. الإجراء الأساسي في كل شاشة يجب أن يكون واضحًا من أول نظرة.
2. لا نعرض زرًا أو حالة شكلية بدون وظيفة حقيقية خلفها.
3. لا نضع Card داخل Card إلا عندما يكون هناك فصل معلوماتي حقيقي.
4. القوائم عالية الكثافة تستخدم Record pattern على الشاشات الكبيرة، وتتحول إلى stacked records على الهاتف.
5. النماذج تسير من الهوية الأساسية إلى الربط والصلاحية ثم الإجراء النهائي.
6. الإجراءات التدميرية لا تنافس الإجراء اليومي بصريًا؛ تستخدم danger styling محدودًا ولا تنفذ مباشرة عندما يترتب عليها تعطيل تشغيلي.
7. نجاح/فشل/فراغ/لا نتائج/تعطيل/تحميل حالات واجهة أصلية وليست رسائل لاحقة مضافة.
8. Touch targets لا تقل عن 44px في الهاتف للعناصر التفاعلية الأساسية.
9. صفحات المهام (إنشاء/تعديل) تقلل التشتيت وتخفي bottom navigation.
10. لا تُستخدم animation إلا لتأكيد انتقال أو استجابة، مع احترام `prefers-reduced-motion`.
11. لا نضيف metrics أو dashboard widgets ببيانات وهمية لمجرد ملء المساحة.
12. أي تغيير UX يجب ألا يغير منطق الأعمال ضمن نفس التعديل إلا إذا كان ذلك مقصودًا ومختبرًا.

## 3. Typography

الخط الأساسي للمنصة: **Cairo** عبر `next/font`، ويُخدم ذاتيًا بواسطة Next.js أثناء البناء.

القواعد:

- Page title: وزن 800، حجم responsive من 25–38px داخل التشغيل.
- Section title: وزن 750 تقريبًا، 14–19px حسب السياق.
- Body: 13–15px.
- Labels: 10–12px، وزن 600–700.
- Supporting/meta text: 9–12px بلون tertiary.
- Mobile bottom-navigation labels لا تقل عن 8.5px في أضيق المقاسات الحالية مع touch target مستقل لا يقل عن 44px.
- Form controls على الهاتف تستخدم 16px للنص لتجنب سلوك التكبير غير المرغوب في بعض متصفحات الهاتف.
- الأكواد والإيميلات والأرقام تعرض LTR عند الحاجة مع `tabular-nums`.
- لا نستخدم letter spacing على النص العربي كزخرفة.
- النص التقني اللاتيني يمكنه استخدام Arial/system sans محليًا عندما يحسن القراءة.

## 4. Color semantics

مصدر الحقيقة هو CSS variables في `app/globals.css`.

### Surfaces

- `--canvas`: خلفية التطبيق.
- `--surface-0`: عناصر الإدخال والمناطق الغائرة.
- `--surface-1`: Panels وRecords الأساسية.
- `--surface-2`: Controls الثانوية.
- `--surface-3`: Raised/hover contexts المحدودة.

### Text

- `--text`: النص الأساسي.
- `--text-secondary`: المعلومات الثانوية.
- `--text-tertiary`: Metadata والشرح الهادئ.
- `--text-disabled`: البيانات غير المتاحة أو controls المعطلة.

### Brand/status

- `--accent`: أحمر P.G الأساسي.
- `--success`: الحالات الصحيحة/النشطة.
- `--warning`: الحالات التي تحتاج انتباهًا.
- `--danger`: الإيقاف/الخطأ/الإجراء التدميري.

الأحمر لا يستخدم لتلوين مساحات كبيرة بشكل دائم؛ يستخدم لتوجيه العين، active states، primary action، والتنبيه المبرر.

## 5. Shape and spacing

- Controls: `--radius-sm`.
- Records/Cards: `--radius-md`.
- Large panels: `--radius-lg`.
- حالات pill فقط تستخدم `--radius-pill`.
- لا نستخدم rounding كبيرًا لكل عنصر؛ الـradius يتبع مستوى العنصر في الهيكل.
- المسافات مبنية على scale من 4px إلى 48px (`--space-1` … `--space-9`).

## 6. Component architecture

المكونات المشتركة الحالية موجودة تحت `components/ui/` ويجب إعادة استخدامها قبل إنشاء markup جديد يؤدي نفس الوظيفة.

### Foundations / primitives

- `BrandLockup`: هوية P.G الموحدة للهيدر/التشغيل/الدخول.
- `Icon`: مجموعة الأيقونات التشغيلية الحالية بدون dependency خارجية.
- `PageHeader`: عنوان الصفحة، الوصف، الـmeta والإجراءات.
- `FeedbackBanner`: success/error/warning/info.
- `StatusBadge`: حالات دلالية موحدة.
- `EmptyState`: حالات no-data وno-results.
- `FormField`: label/control/hint/optional anatomy.
- `FormGrid`, `FormPanel`, `FormSection`: بناء النماذج.
- `FilterBar`, `FilterGrid`, `FilterField`, `FilterActions`: البحث والفلاتر.
- `TaskBackLink`: رجوع موحد وصريح من صفحات الإنشاء والتعديل إلى قائمة الكيان.
- `ConfirmSubmitButton`: confirmation dialog للإجراءات الحساسة داخل form موجود بالفعل؛ Modal على الشاشات الكبيرة وBottom Sheet على الهاتف.

### Composite operational patterns

- `RecordList` + `RecordItem`: القوائم التشغيلية عالية الكثافة؛ row-like على desktop وstacked cards على الهاتف. على الهاتف تتحول إجراءات الـghost اليومية إلى controls ذات affordance أوضح، بينما يظل destructive action منفصلًا بصريًا.
- `ModuleCard`: مدخل موحد لوحدات Dashboard الحقيقية فقط.
- `PublicNavLinks`: التنقل العام مع active state واضح و`aria-current`.
- `OperationsNavLinks`: التنقل التشغيلي المتجاوب مع active state وحالة task routes.

إذا احتاجت شاشة جديدة مكوّنًا غير موجود، نضيفه للمكتبة فقط عندما يوجد استخدام فعلي واضح، وليس تحسبًا لاحتمال مستقبلي.

## 7. Buttons

### Primary

لإجراء رئيسي واحد في السياق: إنشاء، حفظ، تفعيل.

Class: `.button.button-primary`

### Secondary

للإجراءات اليومية غير الرئيسية.

Class: `.button`

### Ghost

للرجوع، التعديل أو الأفعال منخفضة الأولوية في headers/lists. على الهاتف يمكن تقوية affordance بصريًا داخل record actions دون تحويله إلى primary.

Class: `.button.button-ghost`

### Destructive

للإيقاف/الأرشفة/الإجراء عالي الخطورة.

Class: `.button.button-danger`

لا يجوز استخدام danger كزر أحمر ممتلئ افتراضيًا؛ الهدف إبقاء الإجراء التدميري واضحًا لكن غير مهيمن. الإيقاف والأرشفة اللذان يؤثران على التشغيل يمران عبر `ConfirmSubmitButton` قبل التنفيذ، بينما إعادة التفعيل لا تحتاج confirmation إضافي عادةً.

## 8. Forms

- Control height الأساسي 44–50px.
- `FormField` هو الشكل القياسي للحقل.
- label فوق الحقل في العربية.
- helper text قصير وهادئ فقط عندما يمنع خطأ أو يشرح أثرًا مهمًا.
- الحقول الاختيارية يوضحها الـlabel نفسه بدل افتراض المستخدم.
- focus يظهر بالـaccent border + focus ring.
- disabled state يجب أن يبدو غير قابل للتفاعل بوضوح.
- Desktop يستخدم 2-column grid عندما تكون الحقول مستقلة ويمكن قراءتها بسهولة.
- Mobile يعود تلقائيًا إلى عمود واحد.
- Form inputs/selects/textarea على الهاتف تستخدم 16px للنص.
- actions النهائية تصبح sticky على الهاتف في صفحات المهام الطويلة فقط؛ أزرار الأقسام الفرعية ليست sticky.
- sticky actions تحترم `env(safe-area-inset-bottom)` ولا تعتمد على قيمة bottom ثابتة فقط.
- حقول النموذج والفلاتر تملك scroll margin مناسبًا حتى لا يصبح الحقل النشط ملاصقًا للهيدر أو شريط الإجراءات عند التنقل/التركيز.

## 9. Status and feedback

- `StatusBadge` هو المكوّن القياسي للحالات.
- active/success = `tone="success"`.
- suspended/archived = `tone="neutral"` ما لم توجد دلالة أخطر مطلوبة.
- `FeedbackBanner` يستخدم لنتيجة عملية واضحة، وليس لتنسيق نص عادي.
- `EmptyState` يستخدم للفراغ وعدم وجود نتائج، مع CTA فقط إذا كان هناك إجراء حقيقي مناسب.
- Loading/Error/Not-found داخل بوابة التشغيل لها حالات مصممة بنفس النظام ولا تعتمد على صفحات Next.js الافتراضية.

كل رسالة يجب أن تقول ما حدث وما الذي يستطيع المستخدم فعله إذا كان هناك إجراء تالٍ.

## 10. Navigation

### Desktop

- Sidebar ثابتة ومضغوطة.
- هوية المستخدم منفصلة بصريًا عن هوية العلامة.
- active item = selected surface + accent indicator رفيع.
- لا glow ولا gradients قوية في التنقل.

### Mobile

- Header ثابت صغير يعرض هوية المستخدم + P.G + sign-out كإجراء ثانوي.
- sign-out والـbrand touch area لا يقلان عن 44px حتى عندما يكون الرمز البصري أصغر.
- Bottom navigation للإدارة يعرض الوحدات الخمس الحالية: الرئيسية، الحسابات، الوكلاء، المراكز، المنتجات.
- كل route أساسي يجب أن يملك active navigation state؛ لا توجد صفحة رئيسية “بلا مكان” في التنقل.
- صفحات إنشاء/تعديل تخفي bottom navigation لتقليل التشتيت.
- صفحات المهام تستخدم `TaskBackLink` بدل سلوك رجوع مختلف من شاشة لأخرى.
- الـsafe-area جزء من التصميم وليس تصحيحًا لاحقًا.
- Landscape القصير يقلل الاعتماد على sticky header حتى لا يستهلك مساحة عمودية غير مناسبة.

### Public

- الرابط الحالي يملك active state بصريًا و`aria-current="page"`.
- CTA الخاص ببوابة التشغيل يظل منفصلًا عن الروابط المعلوماتية العامة.

## 11. Page patterns

### List

`PageHeader → Feedback → FilterBar عند الحاجة → RecordList → EmptyState/No-results`

### Create/Edit

`PageHeader + TaskBackLink → Feedback → FormPanel → FormSection(s) → final actions`

### Sensitive action

`destructive trigger → ConfirmSubmitButton → explicit consequence → cancel / confirm`

على الهاتف يظهر التأكيد كـBottom Sheet قريب من منطقة الإبهام، وعلى الشاشات الكبيرة يظهر كـModal مركزي. لا نستخدم native browser confirm في تجربة المنتج.

### Dashboard

`PageHeader → ModuleCard / high-value entry points الحقيقية فقط`

### User settings

`PageHeader + current status → primary identity/permissions panel → security stack (email/password/lifecycle)`

### System states

`Loading / Error / Not-found → branded state → clear next action when one exists`

### Detail/Operational record لاحقًا

`Identity → status → high-value metadata → primary action → secondary/destructive actions`

## 12. RTL and mixed-direction data

- الصفحة `dir="rtl"` افتراضيًا.
- البريد، الهاتف، SKU، VIN، serial، UUID، slug وأي قيم تقنية تستخدم `dir="ltr"` محليًا.
- عناصر LTR تعزل اتجاهها محليًا حتى لا تعيد ترتيب النص العربي المجاور.
- العناوين العربية لا تُجبر على letter spacing لاتيني.
- ترتيب الأيقونات والأسهم يتبع اتجاه المهمة لا النسخ الحرفي من LTR.
- أي row يحتوي عربي + قيمة تقنية يجب اختباره بصريًا على الهاتف.

## 13. Accessibility baseline

- Contrast واضح بين text/surface/status.
- `focus-visible` موجود على كل interactive controls.
- tap target الأساسي لا يقل عن 44px على الهاتف.
- لا نعتمد على اللون وحده في الحالات الحرجة؛ النص يظل موجودًا.
- `prefers-reduced-motion` مدعوم عالميًا.
- Semantic HTML وARIA labels جزء من Definition of Done.
- icon-only controls يجب أن تملك `aria-label` أو نصًا متاحًا لقارئ الشاشة.
- confirmation يستخدم عنصر `dialog` الدلالي، يفتح بـ`showModal()` ويقبل Escape، ويضع الإلغاء كخيار واضح بجوار التأكيد.

## 14. Responsive rules

- الحد الأدنى المدعوم: 320px بدون horizontal overflow.
- مراجعة الهاتف القياسية تغطي 320 / 360 / 390 / 430px على الأقل عند التغييرات المؤثرة على layout أو navigation.
- Lists تتحول من dense rows إلى stacked records تحت 700px تقريبًا.
- Filters: البحث يمتد بعرض كامل ثم role/status في صف قابل للضغط، والإجراءات في صف مستقل عند الحاجة.
- Forms: 2 columns → 1 column.
- Bottom navigation تبقى ثابتة ولا تمنع الوصول لآخر محتوى في صفحات الإدارة.
- Task forms لا تعتمد على bottom navigation، وتستخدم sticky final actions فقط عند الحاجة.
- يجب اختبار long Arabic names وlong email/code values بدون overflow.
- يجب إجراء reduced-height review لمحاكاة المساحة المتاحة عند ظهور لوحة المفاتيح، إضافة إلى مراجعة landscape القصير عندما تتأثر الشاشة بالارتفاع.

## 15. Definition of Done لأي شاشة جديدة

لا تعتبر الشاشة مكتملة بصريًا حتى:

1. تستخدم tokens بدل ألوان/spacing عشوائية غير مبررة.
2. تستخدم component/pattern موجودًا قبل إنشاء نسخة محلية منه.
3. تعمل على 320px بدون horizontal overflow.
4. تملك focus/hover/active/disabled states المناسبة.
5. تملك حالات empty/error/success/loading/not-found المطلوبة وظيفيًا.
6. البيانات المختلطة عربي/LTR تظهر صحيحة.
7. primary action واضح ولا ينافسه destructive action.
8. destructive action المؤثر تشغيليًا يملك confirmation مناسبًا ولا ينفذ باللمس العرضي.
9. المسافات والأحجام تتبع page pattern موجودًا أو سببًا موثقًا للخروج عنه.
10. لا توجد route أساسية بلا navigation context مناسب.
11. تمر TypeScript وproduction build.
12. تتم مراجعة screenshot فعلي من browser على الهاتف والديسكتوب قبل اعتماد أي تغيير بصري كبير.
13. التغييرات المؤثرة على الهاتف تُراجع على 320/360/390/430px مع اختبار محتوى طويل، وعند الحاجة reduced-height/keyboard scenario.
14. لا نعتبر screenshot مولدًا أو mockup دليلًا على جودة الكود الفعلي.

## 16. ما لا نفعله

- لا Glassmorphism استعراضي.
- لا gradients كثيرة لإيهام الحداثة.
- لا Cards لكل label أو سطر بلا سبب.
- لا عشر درجات من الأحمر داخل نفس الشاشة.
- لا animation مستمر.
- لا native browser confirm للإجراءات الحساسة عندما نملك pattern منتج موحدًا.
- لا metrics أو بيانات وهمية لملء Dashboard.
- لا مكتبة UI ضخمة قبل وجود حاجة حقيقية لها.
- لا تغيير لمنطق الأعمال أثناء تحسين بصري إلا في تعديل مستقل ومبرر.

## 17. ملاحظات الهوية الحالية

- الـP.G mark الحالي داخل الكود هو monogram نصي مؤقت ومقصود، وليس ادعاءً بأنه الشعار الرسمي النهائي.
- لا يتم اختراع شعار أو asset بصري غير معتمد داخل الكود. عند توفير أصل رسمي معتمد يتم استبدال الـmark داخل `BrandLockup` فقط، فتتوارثه بقية المنصة تلقائيًا.
