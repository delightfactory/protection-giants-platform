import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { ModuleCard } from "@/components/ui/module-card";
import { PageHeader } from "@/components/ui/page-header";
import { requireOperationalProfile, type OperationalRole } from "@/lib/auth/operational-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const adminModules = [
  { href: "/operations/users", title: "الحسابات التشغيلية", description: "المستخدمون والأدوار والارتباطات التشغيلية.", icon: "users" as const },
  { href: "/operations/agents", title: "وكلاء الدول", description: "إدارة وكلاء الدول وهويتهم وحالتهم التشغيلية وTransfer ID.", icon: "users" as const },
  { href: "/operations/dealers", title: "الوكلاء والموزعون", description: "إدارة الكيانات الموزعة وحالتها التشغيلية.", icon: "dealers" as const },
  { href: "/operations/centers", title: "مراكز التركيب", description: "إدارة المراكز المسجلة وموقعها واعتماد الشبكة ودعوات الحساب الأول.", icon: "centers" as const },
  { href: "/operations/products", title: "المنتجات", description: "هوية المنتج ومدة الضمان وحالة الإتاحة.", icon: "products" as const },
  { href: "/operations/production-orders", title: "الإنتاج واللفات", description: "إنشاء أوامر الإنتاج والـLots وتوليد هويات اللفات ومراجعتها.", icon: "production" as const },
];

const agentModules = [
  { href: "/operations/dealers", title: "الموزعون", description: "إدارة الموزعين وحساباتهم داخل شبكة وكيل الدولة.", icon: "dealers" as const },
  { href: "/operations/centers", title: "مراكز التركيب", description: "إدارة المراكز داخل الشبكة ومراجعة اعتمادها وإرسال دعوة الحساب الأول.", icon: "centers" as const },
  { href: "/operations/products", title: "المنتجات", description: "مراجعة بيانات المنتجات التشغيلية المتاحة.", icon: "products" as const },
];

const dealerModules = [
  { href: "/operations/centers", title: "مراكز التركيب", description: "إدارة المراكز التابعة للموزع وإرسال دعوة الحساب الأول.", icon: "centers" as const },
  { href: "/operations/products", title: "المنتجات", description: "مراجعة بيانات المنتجات التشغيلية المتاحة.", icon: "products" as const },
];

const centerModules = [
  { href: "/operations/location", title: "موقع المركز", description: "تسجيل الموقع الفعلي للمركز من الجهاز ومراجعة آخر قراءة محفوظة.", icon: "centers" as const },
  { href: "/operations/products", title: "المنتجات", description: "مراجعة بيانات المنتجات التشغيلية المتاحة للمركز.", icon: "products" as const },
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
          مركزك معتمد ضمن شبكة Protection Giants. الاعتماد تصنيف ثقة للشبكة، وهو مستقل عن الصلاحيات التشغيلية الأخرى.
        </FeedbackBanner>
      ) : null}
      {profile.role === "center" && centerApprovalStatus !== "approved" ? (
        <FeedbackBanner tone="info">
          مركزك مسجل داخل المنصة لكنه غير معتمد ضمن الشبكة حاليًا. يمكنك متابعة العمليات المتاحة لحسابك كالمعتاد.
        </FeedbackBanner>
      ) : null}

      <section className="ui-module-grid" aria-label="الوحدات التشغيلية المتاحة">
        {modules.map((module) => <ModuleCard key={module.href} {...module} />)}
      </section>
    </>
  );
}
