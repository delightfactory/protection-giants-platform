import Link from "next/link";
import { AgentCoreFields } from "@/components/agent-core-fields";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { FormPanel, FormSection } from "@/components/ui/form-layout";
import { PageHeader } from "@/components/ui/page-header";
import { TaskBackLink } from "@/components/ui/task-back-link";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
import { createAgent } from "./actions";

type AgentCreatePageProps = {
  searchParams: Promise<{ error?: string }>;
};

const errorMessages: Record<string, string> = {
  invalid: "راجع البيانات المدخلة. الكود والاسم وكود الدولة مطلوبة بالقيم الصحيحة.",
  duplicate: "يوجد وكيل دولة آخر بنفس الكود.",
  failed: "تعذر إنشاء وكيل الدولة. حاول مرة أخرى.",
};

export default async function AgentCreatePage({ searchParams }: AgentCreatePageProps) {
  await requireAdminProfile();
  const { error } = await searchParams;
  const errorMessage = error ? errorMessages[error] : undefined;

  return (
    <>
      <PageHeader
        eyebrow="وكلاء الدول"
        title="إضافة وكيل دولة"
        description="أنشئ كيان وكيل الدولة أولًا، ثم اربط به الحساب التشغيلي والموزعين والمراكز."
        actions={<TaskBackLink href="/operations/agents" label="العودة لوكلاء الدول" />}
      />

      <FormPanel>
        {errorMessage ? <FeedbackBanner tone="error">{errorMessage}</FeedbackBanner> : null}
        <form action={createAgent} className="operations-form">
          <FormSection
            title="بيانات وكيل الدولة"
            description="الدولة هنا هي نطاق الوكيل الأساسي، ويجب أن يطابقها أي موزع مرتبط به."
          >
            <AgentCoreFields />
          </FormSection>

          <div className="operations-form-actions">
            <SubmitButton pendingLabel="جارٍ إنشاء وكيل الدولة…">إنشاء وكيل الدولة</SubmitButton>
            <Link href="/operations/agents" className="button button-ghost">إلغاء</Link>
          </div>
        </form>
      </FormPanel>
    </>
  );
}
