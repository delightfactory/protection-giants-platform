import Link from "next/link";
import { OperationalUserFields } from "@/components/operational-user-fields";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { FormField } from "@/components/ui/form-field";
import { FormGrid, FormPanel, FormSection } from "@/components/ui/form-layout";
import { PageHeader } from "@/components/ui/page-header";
import { TaskBackLink } from "@/components/ui/task-back-link";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createOperationalUser } from "./actions";

type UserCreatePageProps = {
  searchParams: Promise<{ error?: string }>;
};

const errorMessages: Record<string, string> = {
  invalid: "راجع البيانات المدخلة. الاسم والبريد والدور وكلمة المرور مطلوبة بالقيم الصحيحة.",
  entity: "الكيان التشغيلي المحدد غير متاح أو موقوف حاليًا.",
  duplicate: "يوجد حساب Auth آخر بنفس البريد الإلكتروني.",
  password: "كلمة المرور غير مقبولة حسب سياسة Supabase Auth. استخدم كلمة مرور أقوى.",
  auth: "تعذر إنشاء حساب تسجيل الدخول. لم يتم حفظ حساب تشغيلي ناقص.",
  profile: "تعذر إنشاء الملف التشغيلي تلقائيًا، ولذلك تم التراجع عن حساب Auth الجديد.",
};

export default async function UserCreatePage({ searchParams }: UserCreatePageProps) {
  await requireAdminProfile();
  const { error } = await searchParams;
  const errorMessage = error ? errorMessages[error] : undefined;

  const supabase = await createSupabaseServerClient();
  const [agentsResult, dealersResult, centersResult] = await Promise.all([
    supabase.from("country_agents").select("id, code, name, status").eq("status", "active").order("name"),
    supabase.from("dealers").select("id, code, name, status").eq("status", "active").order("name"),
    supabase.from("installation_centers").select("id, code, name, status").eq("status", "active").order("name"),
  ]);

  if (agentsResult.error) throw agentsResult.error;
  if (dealersResult.error) throw dealersResult.error;
  if (centersResult.error) throw centersResult.error;

  return (
    <>
      <PageHeader
        eyebrow="الحسابات التشغيلية"
        title="إنشاء حساب جديد"
        description="أنشئ هوية الدخول ثم حدد الدور والكيان الذي يمثله الحساب داخل المنصة."
        actions={<TaskBackLink href="/operations/users" label="العودة للحسابات" />}
      />

      <FormPanel className="user-form-panel">
        {errorMessage ? <FeedbackBanner tone="error">{errorMessage}</FeedbackBanner> : null}

        <form action={createOperationalUser} className="operations-form">
          <FormSection
            title="بيانات تسجيل الدخول"
            description="البريد هو هوية الدخول الحالية. سلّم كلمة المرور المؤقتة لصاحب الحساب عبر قناة آمنة."
          >
            <FormGrid>
              <FormField label="البريد الإلكتروني">
                <input
                  name="email"
                  type="email"
                  maxLength={254}
                  required
                  autoComplete="email"
                  inputMode="email"
                  dir="ltr"
                />
              </FormField>

              <FormField label="كلمة المرور المؤقتة" hint="12 حرفًا على الأقل، مع الالتزام بأي سياسة أقوى في Supabase Auth.">
                <input
                  name="password"
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

          <FormSection
            title="الهوية والصلاحية التشغيلية"
            description="الدور والارتباط هما مصدر الصلاحية الفعلي داخل التطبيق."
          >
            <OperationalUserFields
              agents={agentsResult.data}
              dealers={dealersResult.data}
              centers={centersResult.data}
            />
          </FormSection>

          <div className="operations-form-actions">
            <button type="submit" className="button button-primary">إنشاء الحساب</button>
            <Link href="/operations/users" className="button button-ghost">إلغاء</Link>
          </div>
        </form>
      </FormPanel>
    </>
  );
}
