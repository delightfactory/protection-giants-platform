import Link from "next/link";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const statusLabels: Record<string, string> = {
  active: "نشط",
  archived: "مؤرشف",
};

export default async function OperationsProductsPage() {
  await requireAdminProfile();

  const supabase = await createSupabaseServerClient();
  const { data: products, error } = await supabase
    .from("products")
    .select("id, code, name, slug, default_warranty_months, status")
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }

  return (
    <>
      <div className="operations-topbar">
        <div>
          <span className="eyebrow">البيانات المرجعية</span>
          <h1>المنتجات</h1>
        </div>
        <div className="operations-topbar-actions">
          <p>{products.length} منتج مسجل</p>
          <Link href="/operations/products/new" className="button button-primary">إضافة منتج</Link>
        </div>
      </div>

      {products.length === 0 ? (
        <section className="foundation-note">
          <strong>لا توجد منتجات مسجلة بعد.</strong>
          <p>استخدم زر إضافة منتج لإنشاء أول منتج تشغيلي.</p>
        </section>
      ) : (
        <section className="card-grid" aria-label="قائمة المنتجات">
          {products.map((product) => (
            <article className="card" key={product.id}>
              <span className="card-kicker">{product.code}</span>
              <h2>{product.name}</h2>
              <p>الضمان الافتراضي: {product.default_warranty_months} شهر</p>
              <p>الحالة: {statusLabels[product.status] ?? product.status}</p>
            </article>
          ))}
        </section>
      )}
    </>
  );
}
