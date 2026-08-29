import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { ModuleCard } from "@/components/ui/module-card";
import { PageHeader } from "@/components/ui/page-header";
import { requireOperationalProfile, type OperationalRole } from "@/lib/auth/operational-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const transferModule = {
  href: "/operations/transfers",
  title: "تحويل اللفات",
  description: "إرسال لفات من عهدة جهتك باستخدام Transfer ID ومسارات المسح أو الاختيار أو الـLot.",
  icon: "transfer" as const,
};

const issueModule = {
  href: "/operations/rolls/issues",
  title: "بلاغات ما قبل التركيب",
  description: "متابعة مشكلات اللفات المفتوحة قبل تفعيل الضمان وقرار الشركة عليها.",
  icon: "production" as const,
};

const warrantyModule = {
  href: "/operations/warranties",
  title: "ضمانات العملاء",
  description: "مراجعة سجل ضمانات العملاء وحالاتها ومسارات الدعم التشغيلي المسموحة لدورك.",
  icon: "production" as const,
};

const claimModule = {
  href: "/operations/claims",
  title: "مطالبات الضمان",
  description: "مراجعة مطالبات العملاء وسياق الضمان والمرفقات والفحص وسجل القرار.",
  icon: "production" as const,
};

const resolutionModule = {
  href: "/operations/claim-resolutions",
  title: "تنفيذ مطالبات الضمان",
  description: "إسناد ومعالجة المطالبات المقبولة وإدارة مادة الاستبدال والإغلاق التشغيلي المؤهل.",
  icon: "production" as const,
};

const inspectionModule = {
  href: "/operations/claim-inspections",
  title: "فحوصات مطالبات الضمان",
  description: "تنفيذ الفحوصات الرسمية المسندة حاليًا إلى مركزك وتوثيق النتيجة الفنية بالصور.",
  icon: "production" as const,
};

const centerResolutionModule = {
  href: "/operations/claim-resolution-tasks",
  title: "تنفيذ مطالبات الضمان",
  description: "تنفيذ المطالبات المقبولة المسندة لمركزك، واتباع مسار الرول البديل عند الحاجة، ثم توثيق الإكمال.",
  icon: "production" as const,
};

const adminModules = [
  { href: "/operations/users", title: "الحسابات التشغيلية", description: "المستخدمون والأدوار والارتباطات التشغيلية.", icon: "users" as const },
  { href: "/operations/agents", title: "وكلاء الدول", description: "إدارة وكلاء الدول وهويتهم وحالتهم التشغيلية وTransfer ID.", icon: "users" as const },
  { href: "/operations/dealers", title: "الوكلاء والموزعون", description: "إدارة الكيانات الموزعة وحالتها التشغيلية.", icon: "dealers" as const },
  { href: "/operations/centers", title: "مراكز التركيب", description: "إدارة المراكز المسجلة وموقعها واعتماد الشبكة ودعوات الحساب الأول.", icon: "centers" as const },
  { href: "/operations/products", title: "المنتجات", description: "هوية المنتج ومدة الضمان وحالة الإتاحة.", icon: "products" as const },
  { href: "/operations/production-orders", title: "الإنتاج واللفات", description: "إنشاء أوامر الإنتاج والـLots وتوليد هويات اللفات ومراجعتها.", icon: "production" as const },
  { href: "/operations/rolls", title: "عهدة اللفات", description: "مراجعة حامل العهدة المؤكد حاليًا لكل لفة وحالة أهلية أمر الإنتاج.", icon: "production" as const },
  issueModule,
  warrantyModule,
  claimModule,
  resolutionModule,
  transferModule,
];

const agentModules = [
  { href: "/operations/dealers", title: "الموزعون", description: "إدارة الموزعين وحساباتهم داخل شبكة وكيل الدولة.", icon: "dealers" as const },
  { href: "/operations/centers", title: "مراكز التركيب", description: "إدارة المراكز داخل الشبكة ومراجعة اعتمادها وإرسال دعوة الحساب الأول.", icon: "centers" as const },
  { href: "/operations/products", title: "المنتجات", description: "مراجعة بيانات المنتجات التشغيلية المتاحة.", icon: "products" as const },
  { href: "/operations/rolls", title: "عهدة اللفات", description: "عرض اللفات المؤكدة حاليًا في عهدة جهة وكيل الدولة فقط.", icon: "production" as const },
  transferModule,
];

const dealerModules = [
  { href: "/operations/centers", title: "مراكز التركيب", description: "إدارة المراكز التابعة للموزع وإرسال دعوة الحساب الأول.", icon: "centers" as const },
  { href: "/operations/products", title: "المنتجات", description: "مراجعة بيانات المنتجات التشغيلية المتاحة.", icon: "products" as const },
  { href: "/operations/rolls", title: "عهدة اللفات", description: "عرض اللفات المؤكدة حاليًا في عهدة الموزع فقط.", icon: "production" as const },
  transferModule,
];

const centerModules = [
  { href: "/operations/location", title: "موقع المركز", description: "تسجيل الموقع الفعلي للمركز من الجهاز ومراجعة آخر قراءة محفوظة.", icon: "centers" as const },
  inspectionModule,
  centerResolutionModule,
  { href: "/operations/products", title: "المنتجات", description: "مراجعة بيانات المنتجات التشغيلية المتاحة للمركز.", icon: "products" as const },
  { href: "/operations/rolls", title: "عهدة اللفات", description: "عرض اللفات المؤكدة حاليًا في عهدة المركز فقط.", icon: "production" as const },
  issueModule,
  warrantyModule,
  transferModule,
];

function modulesForRole(role: OperationalRole) {
  if (role === "admin") return adminModules;
  if (role === "agent") return agentModules;
  if (role === "dealer") return dealerModules;
  return centerModules;
}

export default async function OperationsPage() {
  const profile = await requireOperationalProfile();
  const modules = modulesForRole(profile.role);

  let centerApprovalStatus: string | null = null;
  if (profile.role === "center") {
    const supabase = await createSupabaseServerClient();
    const { data: center, error } = await supabase
      .from("installation_centers")
      .select("approval_status")
      .eq("id", profile.installation_center_id)
      .maybeSingle();

    if (error) throw error;
    centerApprovalStatus = center?.approval_status ?? null;
  }

  return (
    <>
      <PageHeader
        eyebrow="بوابة التشغيل"
        title={<>مرحبًا، <span className="ui-heading-accent">{profile.display_name}</span></>}
        description={profile.role === "admin"
          ? "الوحدات الإدارية والتشغيلية المتاحة حاليًا في المنصة."
          : "الوحدات التشغيلية المتاحة لدورك ونطاقك الحالي."}
      />

      {profile.role === "center" && centerApprovalStatus === "approved" ? (
        <FeedbackBanner tone="success">
          مركزك معتمد ضمن شبكة Protection Giants. الاعتماد تصنيف ثقة للشبكة، وليس شرطًا لاستلام اللفات أو فتحها أو تفعيل الضمان.
        </FeedbackBanner>
      ) : null}
      {profile.role === "center" && centerApprovalStatus !== "approved" ? (
        <FeedbackBanner tone="info">
          مركزك مسجل داخل المنصة لكنه غير معتمد ضمن الشبكة حاليًا. عدم الاعتماد لا يمنع تلقائيًا استلام اللفات أو فتحها أو تفعيل الضمان؛ لكل عملية شروطها المستقلة.
        </FeedbackBanner>
      ) : null}

      <section className="ui-module-grid" aria-label="الوحدات التشغيلية المتاحة">
        {modules.map((module) => <ModuleCard key={module.href} {...module} />)}
      </section>
    </>
  );
}
