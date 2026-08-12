import { notFound } from "next/navigation";
import { OperationalUserFields } from "@/components/operational-user-fields";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { FormField } from "@/components/ui/form-field";
import { FormGrid, FormPanel, FormSection } from "@/components/ui/form-layout";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { TaskBackLink } from "@/components/ui/task-back-link";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isOperationalUserId, type OperationalUserRole } from "@/lib/users/operational-user-input";
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

  const [profileResult, agentsResult, dealersResult, centersResult, authResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, display_name, phone, role, status, country_agent_id, dealer_id, installation_center_id, created_at")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("country_agents").select("id, code, name, status").order("name"),
    supabase.from("dealers").select("id, code, name, status").order("name"),
    supabase.from("installation_centers").select("id, code, name, status").order("name"),
    supabaseAdmin.auth.admin.getUserById(id),
  ]);

  if (profileResult.error) throw profileResult.error;
  if (agentsResult.error) throw agentsResult.error;
  if (dealersResult.error) throw dealersResult.error;
  if (centersResult.error) throw centersResult.error;
  if (authResult.error || !authResult.data.user || !profileResult.data) notFound();

  const profile = profileResult.data;
  const authUser = authResult.data.user;
  const isSelf = profile.id === adminProfile.id;
  const isActive = profile.status === "active";
  const errorMessage = error ? errorMessages[error] : undefined;
  const successMessage = success ? successMessages[success] : undefined;

  return (
    <>
      <PageHeader
        eyebrow="الحسابات التشغيلية"
        title={profile.display_name}
        description="إدارة الهوية والصلاحية وبيانات الدخول وحالة الحساب من شاشة واحدة."
        meta={<StatusBadge tone={isActive ? "success" : "neutral"}>{isActive ? "نشط" : "موقوف"}</StatusBadge>}
        actions={<TaskBackLink href="/operations/users" label="العودة للحسابات" />}
      />

      {errorMessage ? <FeedbackBanner tone="error">{errorMessage}</FeedbackBanner> : null}
      {successMessage ? <FeedbackBanner tone="success">{successMessage}</FeedbackBanner> : null}

      <div className="user-settings-stack">
        <FormPanel className="user-form-panel user-settings-primary">
          <form action={updateOperationalUserProfile} className="operations-form">
            <input type="hidden" name="user_id" value={profile.id} />
            <FormSection
              title="الهوية والصلاحية التشغيلية"
              description="هذه البيانات هي مصدر الصلاحية الفعلي داخل المنصة."
            >
              <OperationalUserFields
                agents={agentsResult.data}
                dealers={dealersResult.data}
                centers={centersResult.data}
                lockRole={isSelf}
                defaultValues={{
                  displayName: profile.display_name,
                  phone: profile.phone,
                  role: profile.role as OperationalUserRole,
                  countryAgentId: profile.country_agent_id,
                  dealerId: profile.dealer_id,
                  centerId: profile.installation_center_id,
                }}
              />
            </FormSection>
            <div className="operations-form-actions is-inline">
              <button type="submit" className="button button-primary">حفظ البيانات</button>
            </div>
          </form>
        </FormPanel>

        <div className="user-security-stack">
          <FormPanel className="user-form-panel">
            <form action={updateOperationalUserEmail} className="operations-form">
              <input type="hidden" name="user_id" value={profile.id} />
              <FormSection
                title="بريد تسجيل الدخول"
                description="يتم تغييره مباشرة بواسطة الإدارة عبر Supabase Auth Admin."
              >
                <FormGrid columns={1}>
                  <FormField label="البريد الإلكتروني">
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
                  </FormField>
                </FormGrid>
              </FormSection>
              <div className="operations-form-actions is-inline">
                <button type="submit" className="button">تغيير البريد</button>
              </div>
            </form>
          </FormPanel>

          <FormPanel className="user-form-panel">
            <form action={resetOperationalUserPassword} className="operations-form">
              <input type="hidden" name="user_id" value={profile.id} />
              <FormSection
                title="إعادة ضبط كلمة المرور"
                description="لا يتم عرض أو تخزين كلمة المرور الحالية داخل المنصة."
              >
                <FormGrid columns={1}>
                  <FormField label="كلمة المرور الجديدة" hint="12 حرفًا على الأقل، وقد ترفض Auth كلمة المرور إذا كانت سياسة المشروع أقوى.">
                    <input
                      name="new_password"
                      type="password"
                      minLength={12}
                      maxLength={128}
                      required
                      autoComplete="new-password"
                      dir="ltr"
                    />
                  </FormField>
                </FormGrid>
              </FormSection>
              <div className="operations-form-actions is-inline">
                <button type="submit" className="button">تعيين كلمة المرور</button>
              </div>
            </form>
          </FormPanel>

          <FormPanel className="user-form-panel user-lifecycle-panel">
            <FormSection
              title="حالة الحساب"
              description="الإيقاف يمنع تسجيل الدخول ويوقف الملف التشغيلي، وإعادة التفعيل تعيد الاثنين معًا."
            >
              <div className="user-lifecycle-row">
                <StatusBadge tone={isActive ? "success" : "neutral"}>{isActive ? "نشط" : "موقوف"}</StatusBadge>
                {isSelf ? (
                  <span className="current-account-note">الحساب الحالي محمي من الإيقاف الذاتي.</span>
                ) : (
                  <form action={setOperationalUserStatus}>
                    <input type="hidden" name="user_id" value={profile.id} />
                    <input type="hidden" name="return_to" value="edit" />
                    <input type="hidden" name="target_status" value={isActive ? "suspended" : "active"} />
                    {isActive ? (
                      <ConfirmSubmitButton
                        title="إيقاف الحساب؟"
                        description="سيتم منع تسجيل الدخول وإيقاف الملف التشغيلي لهذا الحساب حتى إعادة تفعيله."
                        confirmLabel="تأكيد الإيقاف"
                      >
                        إيقاف الحساب
                      </ConfirmSubmitButton>
                    ) : (
                      <button type="submit" className="button button-primary">إعادة التفعيل</button>
                    )}
                  </form>
                )}
              </div>
            </FormSection>
          </FormPanel>
        </div>
      </div>
    </>
  );
}
