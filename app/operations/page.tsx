import { EmptyState } from "@/components/ui/empty-state";
import { ModuleCard } from "@/components/ui/module-card";
import { PageHeader } from "@/components/ui/page-header";
import { requireOperationalProfile } from "@/lib/auth/operational-profile";

const adminModules = [
  { href: "/operations/users", title: "الحسابات التشغيلية", description: "المستخدمون والأدوار والارتباطات التشغيلية.", icon: "users" as const },
  { href: "/operations/dealers", title: "الوكلاء والموزعون", description: "إدارة الكيانات الموزعة وحالتها التشغيلية.", icon: "dealers" as const },
  { href: "/operations/centers", title: "مراكز التركيب", description: "إدارة المراكز المعتمدة وتبعيتها التشغيلية.", icon: "centers" as const },
  { href: "/operations/products", title: "المنتجات", description: "هوية المنتج ومدة الضمان وحالة الإتاحة.", icon: "products" as const },
  { href: "/operations/production-orders", title: "الإنتاج واللفات", description: "إنشاء أوامر الإنتاج والـLots وتوليد هويات اللفات ومراجعتها.", icon: "production" as const },
];

export default async function OperationsPage() {
  const profile = await requireOperationalProfile();
  const isAdmin = profile.role === "admin";

  return (
    <>
      <PageHeader
        eyebrow="بوابة التشغيل"
        title={<>مرحبًا، <span className="ui-heading-accent">{profile.display_name}</span></>}
        description={isAdmin ? "الوحدات الإدارية والتشغيلية المتاحة حاليًا في المنصة." : "مساحتك التشغيلية داخل منصة عمالقة الحماية."}
      />

      {isAdmin ? (
        <section className="ui-module-grid" aria-label="الوحدات الإدارية والتشغيلية المتاحة">
          {adminModules.map((module) => <ModuleCard key={module.href} {...module} />)}
        </section>
      ) : (
        <EmptyState
          eyebrow="المساحة التشغيلية"
          title="الحساب جاهز للتشغيل"
          description="ستظهر هنا الوحدات الخاصة بدورك عند اكتمال مكعباتها التشغيلية. لا توجد وظائف شكلية قبل وجود مسار حقيقي خلفها."
        />
      )}
    </>
  );
}
