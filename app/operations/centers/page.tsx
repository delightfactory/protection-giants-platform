import Link from "next/link";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const statusLabels: Record<string, string> = {
  active: "نشط",
  suspended: "موقوف",
};

export default async function OperationsCentersPage() {
  await requireAdminProfile();

  const supabase = await createSupabaseServerClient();
  const [centersResult, dealersResult] = await Promise.all([
    supabase
      .from("installation_centers")
      .select("id, code, name, dealer_id, country_code, city, status")
      .order("name", { ascending: true }),
    supabase.from("dealers").select("id, code, name"),
  ]);

  if (centersResult.error) {
    throw centersResult.error;
  }

  if (dealersResult.error) {
    throw dealersResult.error;
  }

  const dealerNames = new Map(
    dealersResult.data.map((dealer) => [dealer.id, `${dealer.name} (${dealer.code})`]),
  );

  return (
    <>
      <div className="operations-topbar">
        <div>
          <span className="eyebrow">الهيكل التشغيلي</span>
          <h1>مراكز التركيب</h1>
        </div>
        <div className="operations-topbar-actions">
          <p>{centersResult.data.length} مركز مسجل</p>
          <Link href="/operations/centers/new" className="button button-primary">إضافة مركز</Link>
        </div>
      </div>

      {centersResult.data.length === 0 ? (
        <section className="foundation-note">
          <strong>لا توجد مراكز تركيب مسجلة بعد.</strong>
          <p>استخدم زر إضافة مركز لإنشاء أول مركز تركيب تشغيلي.</p>
        </section>
      ) : (
        <section className="card-grid" aria-label="قائمة مراكز التركيب">
          {centersResult.data.map((center) => (
            <article className="card" key={center.id}>
              <span className="card-kicker">{center.code}</span>
              <h2>{center.name}</h2>
              <p>الموقع: {center.city} — {center.country_code}</p>
              <p>التبعية: {center.dealer_id ? dealerNames.get(center.dealer_id) ?? "وكيل غير متاح" : "مباشر للشركة"}</p>
              <p>الحالة: {statusLabels[center.status] ?? center.status}</p>
              <div className="card-actions">
                <Link href={`/operations/centers/${center.id}/edit`} className="button">تعديل</Link>
              </div>
            </article>
          ))}
        </section>
      )}
    </>
  );
}
