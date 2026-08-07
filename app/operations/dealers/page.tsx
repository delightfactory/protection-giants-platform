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
        <p>{dealers.length} وكيل / موزع مسجل</p>
      </div>

      {dealers.length === 0 ? (
        <section className="foundation-note">
          <strong>لا يوجد وكلاء أو موزعون مسجلون بعد.</strong>
          <p>إضافة الوكلاء ستتاح في المكعب التالي بعد تثبيت شاشة القراءة الحالية.</p>
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
