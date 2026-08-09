import Link from "next/link";
import { DealerCoreFields } from "@/components/dealer-core-fields";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { FormPanel, FormSection } from "@/components/ui/form-layout";
import { PageHeader } from "@/components/ui/page-header";
import { TaskBackLink } from "@/components/ui/task-back-link";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
import { createDealer } from "./actions";

type DealerCreatePageProps = {
  searchParams: Promise<{ error?: string }>;
};

const errorMessages: Record<string, string> = {
  invalid: "راجع البيانات المدخلة. الكود والاسم وكود الدولة مطلوبة بالقيم الصحيحة.",
  duplicate: "يوجد وكيل أو موزع آخر بنفس الكود.",
  failed: "تعذر حفظ الوكيل أو الموزع. حاول مرة أخرى.",
};

export default async function DealerCreatePage({ searchParams }: DealerCreatePageProps) {
  await requireAdminProfile();
  const { error } = await searchParams;
  const errorMessage = error ? errorMessages[error] : undefined;

  return (
    <>
      <PageHeader
        eyebrow="الوكلاء والموزعون"
        title="إضافة وكيل / موزع"
        description="أنشئ الكيان التشغيلي الذي يمكن ربط مراكز التركيب والحسابات به."
        actions={<TaskBackLink href="/operations/dealers" label="العودة للوكلاء" />}
      />

      <FormPanel>
        {errorMessage ? <FeedbackBanner tone="error">{errorMessage}</FeedbackBanner> : null}
        <form action={createDealer} className="operations-form">
          <FormSection title="بيانات الوكيل" description="هوية الكيان الأساسية المستخدمة في الربط والتشغيل.">
            <DealerCoreFields />
          </FormSection>

          <div className="operations-form-actions">
            <button type="submit" className="button button-primary">حفظ الوكيل</button>
            <Link href="/operations/dealers" className="button button-ghost">إلغاء</Link>
          </div>
        </form>
      </FormPanel>
    </>
  );
}
