import { ModuleCard } from "@/components/ui/module-card";
import { PageHeader } from "@/components/ui/page-header";
import { requireOperationalProfile, type OperationalRole } from "@/lib/auth/operational-profile";

const adminModules = [
  { href: "/operations/users", title: "الحسابات التشغيلية", description: "المستخدمون والأدوار والارتباطات التشغيلية.", icon: "users" as const },
  { href: "/operations/agents", title: "وكلاء الدول", description: "إدارة وكلاء الدول وهويتهم وحالتهم التشغيلية وTransfer ID.", icon: "users" as const },
  { href: "/operations/dealers", title: "الوكلاء والموزعون", description: "إدارة الكيانات الموزعة وحالتها التشغيلية.", icon: "dealers" as const },
  { href: "/operations/centers", title: "مراكز التركيب", description: "إدارة المراكز المسجلة وتبعيتها التشغيلية ودعوات الحساب الأول.", icon: "centers" as const },
  { href: "/operations/products", title: "المنتجات", description: "هوية المنتج ومدة الضمان وحالة الإتاحة.", icon: "products" as const },
  { href: "/operations/production-orders", title: "الإنتاج واللفات", description: "إنشاء أوامر الإنتاج والـLots وتوليد هويات اللفات ومراجعتها.", icon: "production" as const },
];

const agentModules = [
  { href: "/operations/dealers", title: "الموزعون", description: "إدارة الموزعين وحساباتهم داخل شبكة وكيل الدولة.", icon: "dealers" as const },
  { href: "/operations/centers", title: "مراكز التركيب", description: "إدارة المراكز داخل الشبكة وإرسال دعوة الحساب الأول.", icon: "centers" as const },
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

  return (
    <>
      <PageHeader
        eyebrow="بوابة التشغيل"
        title={<>مرحبًا، <span className="ui-heading-accent">{profile.display_name}</span></>}
        description={profile.role === "admin"
          ? "الوحدات الإدارية والتشغيلية المتاحة حاليًا في المنصة."
          : "الوحدات التشغيلية المتاحة لدورك ونطاقك الحالي."}
      />

      <section className="ui-module-grid" aria-label="الوحدات التشغيلية المتاحة">
        {modules.map((module) => <ModuleCard key={module.href} {...module} />)}
      </section>
    </>
  );
}
