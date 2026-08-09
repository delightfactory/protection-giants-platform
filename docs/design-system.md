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
4. القوائم عالية الكثافة تستخدم Records/Table patterns على الشاشات الكبيرة، وتتحول إلى stacked records على الهاتف.
5. النماذج تسير من الهوية الأساسية إلى الربط والصلاحية ثم الإجراء النهائي.
6. الإجراءات التدميرية لا تنافس الإجراء اليومي بصريًا؛ تستخدم danger styling محدودًا.
7. نجاح/فشل/فراغ/لا نتائج/تعطيل/تحميل حالات واجهة أصلية وليست رسائل لاحقة مضافة.
8. Touch targets لا تقل عن 44px في الهاتف.
9. صفحات المهام (إنشاء/تعديل) تقلل التشتيت وتخفي bottom navigation عند الحاجة.
10. لا تُستخدم animation إلا لتأكيد انتقال أو استجابة، مع احترام `prefers-reduced-motion`.

## 3. Typography

الخط الأساسي للمنصة: **Cairo** عبر `next/font`، self-hosted بواسطة Next.js.

القواعد:

- Page title: وزن 800، حجم responsive من 25–38px داخل التشغيل.
- Section/card title: وزن 750 تقريبًا، 17–21px حسب السياق.
- Body: 14–15px.
- Labels: 12–13px، وزن 650–700.
- Supporting/meta text: 10–12px بلون tertiary.
- الأكواد والإيميلات والأرقام تعرض LTR عند الحاجة مع `tabular-nums`.
- لا نستخدم letter spacing على النص العربي كزخرفة.

## 4. Color semantics

مصدر الحقيقة هو CSS variables في `app/globals.css`.

### Surfaces

- `--canvas`: خلفية التطبيق.
- `--surface-0`: عناصر الإدخال والمناطق الغائرة.
- `--surface-1`: Panels وCards الأساسية.
- `--surface-2`: Controls الثانوية.
- `--surface-3`: حالات hover/raised محدودة.

### Text

- `--text`: النص الأساسي.
- `--text-secondary`: المعلومات الثانوية.
- `--text-tertiary`: Metadata والشرح الهادئ.

### Brand/status

- `--accent`: أحمر P.G الأساسي.
- `--success`: الحالات الصحيحة/النشطة.
- `--warning`: الحالات التي تحتاج انتباهًا.
- `--danger`: الإيقاف/الخطأ/الإجراء التدميري.

الأحمر لا يستخدم لتلوين مساحات كبيرة بشكل دائم؛ يستخدم لتوجيه العين، active states، primary action، والتنبيه المبرر.

## 5. Shape and spacing

- Controls: `--radius-sm` / `--radius-control`.
- Cards: `--radius-md`.
- Large panels: `--radius-lg`.
- لا نستخدم rounding كبيرًا لكل عنصر؛ الـradius يتبع مستوى العنصر في الهيكل.
- المسافات مبنية على scale من 4px إلى 48px (`--space-1` … `--space-9`).

## 6. Buttons

### Primary

لإجراء رئيسي واحد في السياق: إنشاء، حفظ، تفعيل.

Class: `.button.button-primary`

### Secondary

للإجراءات اليومية غير الرئيسية: تعديل، رجوع، إدارة الحساب.

Class: `.button`

### Ghost

للإجراءات منخفضة الأولوية داخل toolbars أو headers.

Class: `.button.button-ghost`

### Destructive

للإيقاف/الأرشفة/الإجراء عالي الخطورة.

Class: `.button.button-danger`

لا يجوز استخدام danger كزر أحمر ممتلئ افتراضيًا؛ الهدف إبقاء الإجراء التدميري واضحًا لكن غير مهيمن.

## 7. Forms

- Control height الأساسي 46–50px.
- label فوق الحقل في العربية.
- helper text قصير وهادئ أسفل الحقل فقط عندما يمنع خطأ أو يشرح أثرًا مهمًا.
- focus يظهر بالـaccent border + focus ring.
- disabled state يجب أن يبدو غير قابل للتفاعل بوضوح.
- على الهاتف لا نحول كل label إلى Card مستقل؛ النموذج نفسه هو الـpanel.
- actions يمكن أن تصبح sticky على الهاتف في صفحات المهام الطويلة.

## 8. Status and feedback

- `status-chip.is-active`: نجاح/نشط.
- `status-chip.is-suspended` / `is-archived`: حالة غير فعالة ومحايدة بصريًا.
- `.form-success`: نجاح العملية.
- `.form-error`: فشل قابل للمعالجة.
- Empty state يستخدم `.foundation-note` حتى يوجد Component مستقل مبرر.

كل رسالة يجب أن تقول ما حدث وما الذي يستطيع المستخدم فعله إذا كان هناك إجراء تالٍ.

## 9. Navigation

### Desktop

- Sidebar ثابتة ومضغوطة.
- active item = surface selected + accent indicator رفيع.
- لا نستخدم glow أو gradients قوية في التنقل.

### Mobile

- Header ثابت صغير يحافظ على هوية المستخدم الحالية.
- Bottom navigation محصور في الوحدات الأعلى تكرارًا فقط.
- صفحات إنشاء/تعديل تخفي bottom navigation لتقليل التشتيت.
- الـsafe-area جزء من التصميم وليس تصحيحًا لاحقًا.

## 10. Page patterns

### List

Page header → optional feedback → compact filter toolbar → records → empty/no-results state.

### Create/Edit

Page header → feedback → one or more logical form panels → sticky actions on phone.

### Dashboard

Page header → high-value metrics/entry points فقط؛ لا نضيف widgets لمجرد ملء المساحة.

### Detail/Operational record

Identity → status → high-value metadata → primary action → secondary/destructive actions.

## 11. RTL and mixed-direction data

- الصفحة `dir="rtl"` افتراضيًا.
- البريد، الهاتف، SKU، VIN، serial، UUID وأي قيم تقنية تستخدم `dir="ltr"` محليًا.
- العناوين العربية لا تُجبر على letter spacing لاتيني.
- ترتيب الأيقونات والأسهم يتبع اتجاه المهمة لا النسخ الحرفي من LTR.

## 12. Accessibility baseline

- Contrast واضح بين text/surface/status.
- focus-visible موجود على كل interactive controls.
- tap target لا يقل عن 44px على الهاتف.
- لا نعتمد على اللون وحده في الحالات الحرجة؛ النص يظل موجودًا.
- `prefers-reduced-motion` مدعوم عالميًا.
- Semantic HTML وARIA labels تستمر كجزء من Definition of Done.

## 13. Definition of Done لأي شاشة جديدة

لا تعتبر الشاشة مكتملة بصريًا حتى:

1. تستخدم tokens بدل ألوان/spacing عشوائية غير مبررة.
2. تعمل على 320px بدون horizontal overflow.
3. تملك focus/hover/active/disabled states المناسبة.
4. تملك حالات empty/error/success المطلوبة وظيفيًا.
5. البيانات المختلطة عربي/LTR تظهر صحيحة.
6. primary action واضح ولا ينافسه destructive action.
7. المسافات والأحجام تتبع page pattern موجودًا أو سببًا موثقًا للخروج عنه.
8. تمر TypeScript وproduction build.
9. تتم مراجعة screenshot فعلي من browser على الهاتف والديسكتوب عندما تصبح بيئة runtime متاحة.

## 14. ما لا نفعله

- لا Glassmorphism استعراضي.
- لا gradients كثيرة لإيهام الحداثة.
- لا Cards لكل سطر أو label بلا سبب.
- لا عشر درجات من الأحمر داخل نفس الشاشة.
- لا animation مستمر.
- لا مكتبة UI ضخمة قبل وجود حاجة حقيقية لها.
- لا تغيير لمنطق الأعمال أثناء تحسين بصري إلا في PR مستقل ومبرر.
