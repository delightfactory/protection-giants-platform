import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { FormField } from "@/components/ui/form-field";
import { FormGrid, FormPanel, FormSection } from "@/components/ui/form-layout";
import { PageHeader } from "@/components/ui/page-header";
import { TaskBackLink } from "@/components/ui/task-back-link";
import { requireOperationalProfile } from "@/lib/auth/operational-profile";
import { changeOwnPassword } from "./actions";

type AccountSecurityPageProps = {
  searchParams: Promise<{ error?: string; success?: string }>;
};

const errorMessages: Record<string, string> = {
  password: "يجب أن تكون كلمة المرور الجديدة بين 12 و128 حرفًا.",
  mismatch: "تأكيد كلمة المرور لا يطابق كلمة المرور الجديدة.",
  auth: "تعذر تغيير كلمة المرور. راجع سياسة الأمان ثم حاول مرة أخرى.",
};

const successMessages: Record<string, string> = {
  password: "تم تغيير كلمة المرور بنجاح. استخدم كلمة المرور الجديدة في تسجيل الدخول القادم.",
};

export default async function AccountSecurityPage({ searchParams }: AccountSecurityPageProps) {
  const profile = await requireOperationalProfile();
  const { error, success } = await searchParams;
  const errorMessage = error ? errorMessages[error] : undefined;
  const successMessage = success ? successMessages[success] : undefined;

  return (
    <>
      <PageHeader
        eyebrow="الحساب الشخصي"
        title="أمان الحساب"
        description={`إدارة بيانات الدخول الخاصة بحساب ${profile.display_name}.`}
        actions={<TaskBackLink href="/operations" label="العودة للرئيسية" />}
      />

      {errorMessage ? <FeedbackBanner tone="error">{errorMessage}</FeedbackBanner> : null}
      {successMessage ? <FeedbackBanner tone="success">{successMessage}</FeedbackBanner> : null}

      <FormPanel>
        <form action={changeOwnPassword} className="operations-form">
          <FormSection
            title="تغيير كلمة المرور"
            description="غيّر كلمة المرور التي تستخدمها لتسجيل الدخول. لا يتم عرض أو تخزين كلمة المرور الحالية داخل المنصة."
          >
            <FormGrid columns={1}>
              <FormField label="كلمة المرور الجديدة" hint="12 حرفًا على الأقل، وبحد أقصى 128 حرفًا.">
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

              <FormField label="تأكيد كلمة المرور الجديدة">
                <input
                  name="confirm_password"
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
            <ConfirmSubmitButton
              title="تغيير كلمة المرور؟"
              description="سيتم استبدال كلمة المرور الحالية، وستستخدم كلمة المرور الجديدة في تسجيل الدخول القادم."
              confirmLabel="تأكيد التغيير"
              tone="primary"
            >
              تغيير كلمة المرور
            </ConfirmSubmitButton>
          </div>
        </form>
      </FormPanel>
    </>
  );
}
