import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { FilterActions, FilterBar, FilterField, FilterGrid } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { RecordItem, RecordList } from "@/components/ui/record-list";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listAllOperationalAuthUsers } from "@/lib/users/auth-admin";
import { setOperationalUserStatus } from "./actions";

const roleLabels: Record<string, string> = {
  admin: "إدارة الشركة",
  dealer: "وكيل / موزع",
  center: "مركز تركيب",
};

const statusLabels: Record<string, string> = {
  active: "نشط",
  suspended: "موقوف",
};

const successMessages: Record<string, string> = {
  created: "تم إنشاء الحساب وربط Auth بالملف التشغيلي بنجاح.",
  status: "تم تحديث حالة الحساب في Auth وفي الملف التشغيلي.",
};

const errorMessages: Record<string, string> = {
  invalid: "تعذر تنفيذ الطلب بسبب بيانات غير صحيحة.",
  missing: "الحساب التشغيلي المطلوب غير موجود.",
  "self-status": "لا يمكن إيقاف الحساب الإداري الذي تستخدمه الآن.",
  "status-auth": "تعذر تغيير حالة تسجيل الدخول في Supabase Auth.",
  "status-profile": "تعذر تغيير الحالة التشغيلية وتمت محاولة إعادة حالة Auth السابقة.",
};

type UsersPageProps = {
  searchParams: Promise<{
    q?: string;
    role?: string;
    status?: string;
    error?: string;
    success?: string;
  }>;
};

type ProfileEntityBinding = {
  role: string;
  dealer_id: string | null;
  installation_center_id: string | null;
};

export default async function OperationsUsersPage({ searchParams }: UsersPageProps) {
  const adminProfile = await requireAdminProfile();
  const params = await searchParams;
  const query = params.q?.trim().toLowerCase() ?? "";
  const roleFilter = ["admin", "dealer", "center"].includes(params.role ?? "") ? params.role : "";
  const statusFilter = ["active", "suspended"].includes(params.status ?? "") ? params.status : "";

  const supabase = await createSupabaseServerClient();
  const [profilesResult, dealersResult, centersResult, authUsers] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, display_name, role, status, phone, dealer_id, installation_center_id, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("dealers").select("id, code, name"),
    supabase.from("installation_centers").select("id, code, name"),
    listAllOperationalAuthUsers(),
  ]);

  if (profilesResult.error) throw profilesResult.error;
  if (dealersResult.error) throw dealersResult.error;
  if (centersResult.error) throw centersResult.error;

  const authById = new Map(authUsers.map((user) => [user.id, user]));
  const dealerNames = new Map(dealersResult.data.map((dealer) => [dealer.id, `${dealer.name} (${dealer.code})`]));
  const centerNames = new Map(centersResult.data.map((center) => [center.id, `${center.name} (${center.code})`]));

  function entityLabel(profile: ProfileEntityBinding) {
    if (profile.role === "admin") return "إدارة الشركة";
    if (profile.role === "dealer" && profile.dealer_id) return dealerNames.get(profile.dealer_id) ?? "وكيل غير متاح";
    if (profile.role === "center" && profile.installation_center_id) return centerNames.get(profile.installation_center_id) ?? "مركز غير متاح";
    return "ارتباط غير متاح";
  }

  const filteredProfiles = profilesResult.data.filter((profile) => {
    if (roleFilter && profile.role !== roleFilter) return false;
    if (statusFilter && profile.status !== statusFilter) return false;
    if (!query) return true;

    const authUser = authById.get(profile.id);
    const haystack = [
      profile.display_name,
      profile.phone ?? "",
      authUser?.email ?? "",
      roleLabels[profile.role] ?? profile.role,
      entityLabel(profile),
    ].join(" ").toLowerCase();

    return haystack.includes(query);
  });

  const successMessage = params.success ? successMessages[params.success] : undefined;
  const errorMessage = params.error ? errorMessages[params.error] : undefined;

  return (
    <>
      <PageHeader
        eyebrow="الهوية والصلاحيات"
        title="الحسابات التشغيلية"
        description="إدارة هوية الدخول والدور والارتباط التشغيلي من نقطة واحدة."
        meta={`${filteredProfiles.length} من ${profilesResult.data.length} حساب`}
        actions={<Link href="/operations/users/new" className="button button-primary">إنشاء حساب</Link>}
      />

      {successMessage ? <FeedbackBanner tone="success">{successMessage}</FeedbackBanner> : null}
      {errorMessage ? <FeedbackBanner tone="error">{errorMessage}</FeedbackBanner> : null}

      <FilterBar label="بحث وتصفية الحسابات">
        <form method="get">
          <FilterGrid>
            <FilterField label="بحث" wide>
              <input
                name="q"
                type="search"
                defaultValue={params.q ?? ""}
                placeholder="الاسم، البريد، الهاتف أو الكيان"
                autoComplete="off"
              />
            </FilterField>

            <FilterField label="الدور">
              <select name="role" defaultValue={roleFilter}>
                <option value="">كل الأدوار</option>
                <option value="admin">إدارة الشركة</option>
                <option value="dealer">وكيل / موزع</option>
                <option value="center">مركز تركيب</option>
              </select>
            </FilterField>

            <FilterField label="الحالة">
              <select name="status" defaultValue={statusFilter}>
                <option value="">كل الحالات</option>
                <option value="active">نشط</option>
                <option value="suspended">موقوف</option>
              </select>
            </FilterField>

            <FilterActions>
              <button type="submit" className="button button-primary">تطبيق</button>
              <Link href="/operations/users" className="button button-ghost">مسح</Link>
            </FilterActions>
          </FilterGrid>
        </form>
      </FilterBar>

      {profilesResult.data.length === 0 ? (
        <EmptyState
          eyebrow="الحسابات"
          title="لا توجد حسابات تشغيلية بعد"
          description="أنشئ أول حساب وحدد دوره والكيان الذي يمثله داخل المنصة."
          action={<Link href="/operations/users/new" className="button button-primary">إنشاء حساب</Link>}
        />
      ) : filteredProfiles.length === 0 ? (
        <EmptyState
          eyebrow="نتيجة البحث"
          title="لا توجد نتائج مطابقة"
          description="غيّر نص البحث أو امسح أحد الفلاتر الحالية."
          action={<Link href="/operations/users" className="button button-ghost">مسح الفلاتر</Link>}
        />
      ) : (
        <RecordList label="قائمة الحسابات التشغيلية">
          {filteredProfiles.map((profile) => {
            const authUser = authById.get(profile.id);
            const isActive = profile.status === "active";
            const isSelf = profile.id === adminProfile.id;

            return (
              <RecordItem
                key={profile.id}
                kicker={roleLabels[profile.role] ?? profile.role}
                title={profile.display_name}
                subtitle={<span dir="ltr">{authUser?.email ?? "Auth email unavailable"}</span>}
                facts={[
                  { label: "الارتباط", value: entityLabel(profile) },
                  { label: "الهاتف", value: profile.phone ?? "غير مسجل", dir: profile.phone ? "ltr" : undefined },
                ]}
                status={
                  <StatusBadge tone={isActive ? "success" : "neutral"}>
                    {statusLabels[profile.status] ?? profile.status}
                  </StatusBadge>
                }
                actions={
                  <>
                    <Link href={`/operations/users/${profile.id}/edit`} className="button button-ghost">إدارة الحساب</Link>
                    {isSelf ? (
                      <span className="current-account-note">الحساب الحالي</span>
                    ) : (
                      <form action={setOperationalUserStatus}>
                        <input type="hidden" name="user_id" value={profile.id} />
                        <input type="hidden" name="return_to" value="list" />
                        <input type="hidden" name="target_status" value={isActive ? "suspended" : "active"} />
                        <button type="submit" className={isActive ? "button button-danger" : "button button-primary"}>
                          {isActive ? "إيقاف" : "إعادة التفعيل"}
                        </button>
                      </form>
                    )}
                  </>
                }
              />
            );
          })}
        </RecordList>
      )}
    </>
  );
}
