import Link from "next/link";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { setProductStatus } from "./actions";

const statusLabels: Record<string, string> = {
  active: "نشط",
  archived: "مؤرشف",
};

type OperationsProductsPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function OperationsProductsPage({ searchParams }: OperationsProductsPageProps) {
  await requireAdminProfile();
  const { error: pageError } = await searchParams;

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

      {pageError === "lifecycle" ? (
        <p className="form-error" role="alert">تعذر تغيير حالة المنتج. حاول مرة أخرى.</p>
      ) : null}

      {products.length === 0 ? (
        <section className="foundation-note">
          <strong>لا توجد منتجات مسجلة بعد.</strong>
          <p>استخدم زر إضافة منتج لإنشاء أول منتج تشغيلي.</p>
        </section>
      ) : (
        <section className="card-grid" aria-label="قائمة المنتجات">
          {products.map((product) => {
            const isArchived = product.status === "archived";

            return (
              <article className="card" key={product.id}>
                <span className="card-kicker">{product.code}</span>
                <h2>{product.name}</h2>
                <p>الضمان الافتراضي: {product.default_warranty_months} شهر</p>
                <p>الحالة: {statusLabels[product.status] ?? product.status}</p>
                <div className="card-actions">
                  <Link href={`/operations/products/${product.id}/edit`} className="button">تعديل</Link>
                  <form action={setProductStatus}>
                    <input type="hidden" name="product_id" value={product.id} />
                    <input type="hidden" name="status" value={isArchived ? "active" : "archived"} />
                    <button type="submit" className={isArchived ? "button button-primary" : "button"}>
                      {isArchived ? "إعادة تفعيل" : "أرشفة"}
                    </button>
                  </form>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </>
  );
}
