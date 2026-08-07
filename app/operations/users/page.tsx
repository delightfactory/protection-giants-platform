import { requireAdminProfile } from "@/lib/auth/operational-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const roleLabels: Record<string, string> = {
  admin: "إدارة الشركة",
  dealer: "وكيل / موزع",
  center: "مركز تركيب",
};

const statusLabels: Record<string, string> = {
  active: "نشط",
  suspended: "موقوف",
};

export default async function OperationsUsersPage() {
  await requireAdminProfile();

  const supabase = await createSupabaseServerClient();
  const [profilesResult, dealersResult, centersResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, display_name, role, status, phone, dealer_id, installation_center_id, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("dealers").select("id, code, name"),
    supabase.from("installation_centers").select("id, code, name"),
  ]);

  if (profilesResult.error) throw profilesResult.error;
  if (dealersResult.error) throw dealersResult.error;
  if (centersResult.error) throw centersResult.error;

  const dealerNames = new Map(
    dealersResult.data.map((dealer) => [dealer.id, `${dealer.name} (${dealer.code})`]),
  );
  const centerNames = new Map(
    centersResult.data.map((center) => [center.id, `${center.name} (${center.code})`]),
  );

  function entityLabel(profile: (typeof profilesResult.data)[number]) {
    if (profile.role === "admin") return "إدارة الشركة";
    if (profile.role === "dealer" && profile.dealer_id) {
      return dealerNames.get(profile.dealer_id) ?? "وكيل غير متاح";
    }
    if (profile.role === "center" && profile.installation_center_id) {
      return centerNames.get(profile.installation_center_id) ?? "مركز غير متاح";
    }
    return "ارتباط غير متاح";
  }

  return (
    <>
      <div className="operations-topbar">
        <div>
          <span className="eyebrow">الهوية والصلاحيات</span>
          <h1>الحسابات التشغيلية</h1>
        </div>
        <div className="operations-topbar-actions">
          <p>{profilesResult.data.length} حساب مسجل</p>
        </div>
      </div>

      {profilesResult.data.length === 0 ? (
        <section className="foundation-note">
          <strong>لا توجد حسابات تشغيلية متاحة.</strong>
          <p>لن يظهر إنشاء المستخدمين هنا قبل اكتمال مسار Auth Admin الآمن.</p>
        </section>
      ) : (
        <section className="card-grid" aria-label="قائمة الحسابات التشغيلية">
          {profilesResult.data.map((profile) => {
            const isActive = profile.status === "active";

            return (
              <article className="card" key={profile.id}>
                <span className="card-kicker">{roleLabels[profile.role] ?? profile.role}</span>
                <h2>{profile.display_name}</h2>

                <div className="record-meta">
                  <div className="record-meta-row">
                    <span>الارتباط</span>
                    <strong>{entityLabel(profile)}</strong>
                  </div>
                  <div className="record-meta-row">
                    <span>الهاتف</span>
                    <strong dir={profile.phone ? "ltr" : undefined}>{profile.phone ?? "غير مسجل"}</strong>
                  </div>
                  <div className="record-meta-row">
                    <span>الحالة</span>
                    <strong>
                      <span className={`status-chip ${isActive ? "is-active" : "is-suspended"}`}>
                        {statusLabels[profile.status] ?? profile.status}
                      </span>
                    </strong>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </>
  );
}
