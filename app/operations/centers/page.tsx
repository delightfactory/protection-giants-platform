import Link from "next/link";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { setCenterStatus } from "./actions";

const statusLabels: Record<string, string> = {
  active: "نشط",
  suspended: "موقوف",
};

type OperationsCentersPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function OperationsCentersPage({ searchParams }: OperationsCentersPageProps) {
  await requireAdminProfile();
  const { error: pageError } = await searchParams;

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

      {pageError === "lifecycle" ? (
        <p className="form-error" role="alert">تعذر تغيير حالة مركز التركيب. حاول مرة أخرى.</p>
      ) : null}

      {centersResult.data.length === 0 ? (
        <section className="foundation-note">
          <strong>لا توجد مراكز تركيب مسجلة بعد.</strong>
          <p>استخدم زر إضافة مركز لإنشاء أول مركز تركيب تشغيلي.</p>
        </section>
      ) : (
        <section className="card-grid" aria-label="قائمة مراكز التركيب">
          {centersResult.data.map((center) => {
            const isSuspended = center.status === "suspended";
            const parentName = center.dealer_id
              ? dealerNames.get(center.dealer_id) ?? "وكيل غير متاح"
              : "مباشر للشركة";

            return (
              <article className="card" key={center.id}>
                <span className="card-kicker" dir="ltr">{center.code}</span>
                <h2>{center.name}</h2>
                <div className="record-meta">
                  <div className="record-meta-row">
                    <span>الموقع</span>
                    <strong>{center.city} · <span dir="ltr">{center.country_code}</span></strong>
                  </div>
                  <div className="record-meta-row">
                    <span>التبعية</span>
                    <strong>{parentName}</strong>
                  </div>
                  <div className="record-meta-row">
                    <span>الحالة</span>
                    <span className={`status-chip ${isSuspended ? "is-suspended" : "is-active"}`}>
                      {statusLabels[center.status] ?? center.status}
                    </span>
                  </div>
                </div>
                <div className="card-actions">
                  <Link href={`/operations/centers/${center.id}/edit`} className="button">تعديل</Link>
                  <form action={setCenterStatus}>
                    <input type="hidden" name="center_id" value={center.id} />
                    <input type="hidden" name="status" value={isSuspended ? "active" : "suspended"} />
                    <button type="submit" className={isSuspended ? "button button-primary" : "button button-danger"}>
                      {isSuspended ? "إعادة تفعيل" : "إيقاف"}
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
