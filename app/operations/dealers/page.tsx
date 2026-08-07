import Link from "next/link";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { setDealerStatus } from "./actions";

const statusLabels: Record<string, string> = {
  active: "نشط",
  suspended: "موقوف",
};

type OperationsDealersPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function OperationsDealersPage({ searchParams }: OperationsDealersPageProps) {
  await requireAdminProfile();
  const { error: pageError } = await searchParams;

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

      {pageError === "lifecycle" ? (
        <p className="form-error" role="alert">تعذر تغيير حالة الوكيل أو الموزع. حاول مرة أخرى.</p>
      ) : null}

      {dealers.length === 0 ? (
        <section className="foundation-note">
          <strong>لا يوجد وكلاء أو موزعون مسجلون بعد.</strong>
          <p>استخدم زر إضافة وكيل لإنشاء أول كيان موزع في المنصة.</p>
        </section>
      ) : (
        <section className="card-grid" aria-label="قائمة الوكلاء والموزعين">
          {dealers.map((dealer) => {
            const isSuspended = dealer.status === "suspended";

            return (
              <article className="card" key={dealer.id}>
                <span className="card-kicker" dir="ltr">{dealer.code}</span>
                <h2>{dealer.name}</h2>
                <div className="record-meta">
                  <div className="record-meta-row">
                    <span>الدولة</span>
                    <strong dir="ltr">{dealer.country_code}</strong>
                  </div>
                  <div className="record-meta-row">
                    <span>الحالة</span>
                    <span className={`status-chip ${isSuspended ? "is-suspended" : "is-active"}`}>
                      {statusLabels[dealer.status] ?? dealer.status}
                    </span>
                  </div>
                </div>
                <div className="card-actions">
                  <Link href={`/operations/dealers/${dealer.id}/edit`} className="button">تعديل</Link>
                  <form action={setDealerStatus}>
                    <input type="hidden" name="dealer_id" value={dealer.id} />
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
