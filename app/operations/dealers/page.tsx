import Link from "next/link";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const statusLabels: Record<string, string> = {
  active: "نشط",
  suspended: "موقوف",
};

export default async function OperationsDealersPage() {
  await requireAdminProfile();

  const supabase = await createSupabaseServerClient();
  const { data: dealers, error } = await supabase
    .from("dealers")
    .select("id, code, name, country_code, status")
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }

  return (
    <>
      <div className="operations-topbar">
        <div>
          <span className="eyebrow">الهيكل التشغيلي</span>
          <h1>الوكلاء والموزعون</h1>
        </div>
        <div className="operations-topbar-actions">
          <p>{dealers.length} وكيل / موزع مسجل</p>
          <Link href="/operations/dealers/new" className="button button-primary">إضافة وكيل</Link>
        </div>
      </div>

      {dealers.length === 0 ? (
        <section className="foundation-note">
          <strong>لا يوجد وكلاء أو موزعون مسجلون بعد.</strong>
          <p>استخدم زر إضافة وكيل لإنشاء أول كيان موزع في المنصة.</p>
        </section>
      ) : (
        <section className="card-grid" aria-label="قائمة الوكلاء والموزعين">
          {dealers.map((dealer) => (
            <article className="card" key={dealer.id}>
              <span className="card-kicker">{dealer.code}</span>
              <h2>{dealer.name}</h2>
              <p>الدولة: {dealer.country_code}</p>
              <p>الحالة: {statusLabels[dealer.status] ?? dealer.status}</p>
            </article>
          ))}
        </section>
      )}
    </>
  );
}
