import Link from "next/link";
import { requireOperationalProfile } from "@/lib/auth/operational-profile";

const adminModules = [
  { href: "/operations/users", title: "الحسابات التشغيلية", description: "مراجعة المستخدمين وأدوارهم وارتباطهم بالكيانات التشغيلية." },
  { href: "/operations/dealers", title: "الوكلاء والموزعون", description: "إدارة الكيانات الموزعة وحالتها التشغيلية." },
  { href: "/operations/centers", title: "مراكز التركيب", description: "إدارة المراكز المعتمدة وربطها بالوكيل المناسب." },
  { href: "/operations/products", title: "المنتجات", description: "إدارة هوية المنتج ومدة الضمان والحالة." },
];

export default async function OperationsPage() {
  const profile = await requireOperationalProfile();
  const isAdmin = profile.role === "admin";

  return (
    <>
      <div className="operations-topbar">
        <div>
          <span className="eyebrow">بوابة التشغيل</span>
          <h1>مرحبًا، {profile.display_name}</h1>
        </div>
        <p>{isAdmin ? "الوحدات الإدارية المتاحة حاليًا" : "مساحتك التشغيلية"}</p>
      </div>

      {isAdmin ? (
        <section className="operations-quick-grid" aria-label="الوحدات الإدارية المتاحة">
          {adminModules.map((module) => (
            <Link href={module.href} className="operations-quick-link" key={module.href}>
              <strong>{module.title}</strong>
              <span>{module.description}</span>
            </Link>
          ))}
        </section>
      ) : (
        <section className="foundation-note">
          <strong>الحساب جاهز للتشغيل.</strong>
          <p>ستظهر هنا الوحدات الخاصة بدورك عند اكتمال مكعباتها التشغيلية. لا توجد أزرار أو بيانات شكلية قبل وجود وظيفة حقيقية خلفها.</p>
        </section>
      )}
    </>
  );
}
