import Link from "next/link";
import { notFound } from "next/navigation";
import { OperationalUserFields } from "@/components/operational-user-fields";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isOperationalUserId } from "@/lib/users/operational-user-input";
import { setOperationalUserStatus } from "../../actions";
import {
  resetOperationalUserPassword,
  updateOperationalUserEmail,
  updateOperationalUserProfile,
} from "./actions";

type UserEditPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
};

const errorMessages: Record<string, string> = {
  "self-role": "لا يمكن خفض صلاحية الحساب الإداري الذي تستخدمه الآن.",
  entity: "الكيان المحدد غير موجود أو غير متاح لهذا التغيير.",
  profile: "تعذر حفظ بيانات الحساب التشغيلية.",
  "duplicate-email": "البريد الإلكتروني مستخدم بالفعل في حساب Auth آخر.",
  email: "تعذر تغيير بريد تسجيل الدخول.",
  password: "تعذر ضبط كلمة المرور الجديدة. راجع قوة كلمة المرور وسياسة Auth.",
  "self-status": "لا يمكن إيقاف الحساب الإداري الذي تستخدمه الآن.",
  "status-auth": "تعذر تغيير حالة تسجيل الدخول في Supabase Auth.",
  "status-profile": "تعذر تغيير الحالة التشغيلية وتمت محاولة إعادة حالة Auth السابقة.",
};

const successMessages: Record<string, string> = {
  profile: "تم تحديث بيانات الحساب والدور والارتباط بنجاح.",
  email: "تم تغيير بريد تسجيل الدخول وتأكيده مباشرة بواسطة الإدارة.",
  password: "تم تعيين كلمة المرور الجديدة.",
  status: "تم تحديث حالة الحساب في Auth وفي الملف التشغيلي.",
};

export default async function UserEditPage({ params, searchParams }: UserEditPageProps) {
  const adminProfile = await requireAdminProfile();
  const { id } = await params;
  const { error, success } = await searchParams;

  if (!isOperationalUserId(id)) notFound();

  const supabase = await createSupabaseServerClient();
  const supabaseAdmin = createSupabaseAdminClient();

  const [profileResult, dealersResult, centersResult, authResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, display_name, phone, role, status, dealer_id, installation_center_id, created_at")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("dealers").select("id, code, name, status").order("name"),
    supabase.from("installation_centers").select("id, code, name, status").order("name"),
    supabaseAdmin.auth.admin.getUserById(id),
  ]);

  if (profileResult.error) throw profileResult.error;
  if (dealersResult.error) throw dealersResult.error;
  if (centersResult.error) throw centersResult.error;
  if (authResult.error || !authResult.data.user || !profileResult.data) notFound();

  const profile = profileResult.data;
  const authUser = authResult.data.user;
  const isSelf = profile.id === adminProfile.id;
  const errorMessage = error ? errorMessages[error] : undefined;
  const successMessage = success ? successMessages[success] : undefined;

  return (
    <>
      <div className="operations-topbar">
        <div>
          <span className="eyebrow">الحسابات التشغيلية</span>
          <h1>{profile.display_name}</h1>
        </div>
        <Link href="/operations/users" className="button">العودة للحسابات</Link>
      </div>

      {errorMessage ? <p className="form-error user-page-message" role="alert">{errorMessage}</p> : null}
      {successMessage ? <p className="form-success user-page-message" role="status">{successMessage}</p> : null}

      <div className="user-settings-stack">
        <section className="operations-form-panel user-form-panel">
          <div className="user-form-intro">
            <strong>الهوية والصلاحية التشغيلية</strong>
            <p>هذه البيانات هي مصدر الصلاحية الفعلي داخل المنصة.</p>
          </div>

          <form action={updateOperationalUserProfile} className="operations-form">
            <input type="hidden" name="user_id" value={profile.id} />
            <OperationalUserFields
              dealers={dealersResult.data}
              centers={centersResult.data}
              lockRole={isSelf}
              defaultValues={{
                displayName: profile.display_name,
                phone: profile.phone,
                role: profile.role as "admin" | "dealer" | "center",
                dealerId: profile.dealer_id,
                centerId: profile.installation_center_id,
              }}
            />
            <div className="operations-form-actions">
              <button type="submit" className="button button-primary">حفظ البيانات</button>
            </div>
          </form>
        </section>

        <section className="operations-form-panel user-form-panel">
          <div className="user-form-intro">
            <strong>بريد تسجيل الدخول</strong>
            <p>تغييره هنا يتم مباشرة من خلال Supabase Auth Admin ولا يحتاج مسار تأكيد من المستخدم.</p>
          </div>
          <form action={updateOperationalUserEmail} className="operations-form">
            <input type="hidden" name="user_id" value={profile.id} />
            <label>
              البريد الإلكتروني
              <input
                name="email"
                type="email"
                maxLength={254}
                required
                defaultValue={authUser.email ?? ""}
                autoComplete="email"
                inputMode="email"
                dir="ltr"
              />
            </label>
            <div className="operations-form-actions">
              <button type="submit" className="button button-primary">تغيير البريد</button>
            </div>
          </form>
        </section>

        <section className="operations-form-panel user-form-panel">
          <div className="user-form-intro">
            <strong>إعادة ضبط كلمة المرور</strong>
            <p>يتم تعيين كلمة مرور جديدة مباشرة. لا يتم عرض أو تخزين كلمة المرور الحالية في المنصة.</p>
          </div>
          <form action={resetOperationalUserPassword} className="operations-form">
            <input type="hidden" name="user_id" value={profile.id} />
            <label>
              كلمة المرور الجديدة
              <input
                name="new_password"
                type="password"
                minLength={12}
                maxLength={128}
                required
                autoComplete="new-password"
                dir="ltr"
              />
              <small>12 حرفًا على الأقل، وقد ترفض Auth كلمة المرور إذا كانت سياسة المشروع أقوى.</small>
            </label>
            <div className="operations-form-actions">
              <button type="submit" className="button button-primary">تعيين كلمة المرور</button>
            </div>
          </form>
        </section>

        <section className="operations-form-panel user-form-panel user-lifecycle-panel">
          <div className="user-form-intro">
            <strong>حالة الحساب</strong>
            <p>الإيقاف يوقف الملف التشغيلي ويمنع تسجيل الدخول في Auth. إعادة التفعيل تعيد الاثنين معًا.</p>
          </div>

          <div className="user-lifecycle-row">
            <span className={`status-chip ${profile.status === "active" ? "is-active" : "is-suspended"}`}>
              {profile.status === "active" ? "نشط" : "موقوف"}
            </span>

            {isSelf ? (
              <span className="current-account-note">الحساب الحالي محمي من الإيقاف الذاتي.</span>
            ) : (
              <form action={setOperationalUserStatus}>
                <input type="hidden" name="user_id" value={profile.id} />
                <input type="hidden" name="return_to" value="edit" />
                <input
                  type="hidden"
                  name="target_status"
                  value={profile.status === "active" ? "suspended" : "active"}
                />
                <button
                  type="submit"
                  className={`button ${profile.status === "active" ? "button-danger" : "button-primary"}`}
                >
                  {profile.status === "active" ? "إيقاف الحساب" : "إعادة التفعيل"}
                </button>
              </form>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
