import Link from "next/link";
import { ProductCoreFields } from "@/components/product-core-fields";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { FormPanel } from "@/components/ui/form-layout";
import { PageHeader } from "@/components/ui/page-header";
import { TaskBackLink } from "@/components/ui/task-back-link";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
import { createProduct } from "./actions";

type ProductCreatePageProps = {
  searchParams: Promise<{ error?: string }>;
};

const errorMessages: Record<string, string> = {
  duplicate: "يوجد منتج آخر بنفس الـSKU أو رابط المنتج أو GTIN.",
  failed: "تعذر حفظ المنتج. حاول مرة أخرى.",
};

export default async function ProductCreatePage({ searchParams }: ProductCreatePageProps) {
  await requireAdminProfile();
  const { error } = await searchParams;
  const errorMessage = error ? errorMessages[error] ?? error : undefined;

  return (
    <>
      <PageHeader
        eyebrow="المنتجات"
        title="إضافة منتج"
        description="سجّل تعريف المنتج ومواصفاته الاسمية ومصدر سياسة الضمان والمحتوى العام قبل استخدامه في الإنتاج."
        actions={<TaskBackLink href="/operations/products" label="العودة للمنتجات" />}
      />

      <FormPanel>
        {errorMessage ? <FeedbackBanner tone="error">{errorMessage}</FeedbackBanner> : null}
        <form action={createProduct} className="operations-form">
          <ProductCoreFields />

          <div className="operations-form-actions">
            <button type="submit" className="button button-primary">حفظ المنتج</button>
            <Link href="/operations/products" className="button button-ghost">إلغاء</Link>
          </div>
        </form>
      </FormPanel>
    </>
  );
}
