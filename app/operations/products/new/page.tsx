import Link from "next/link";
import { ProductCoreFields } from "@/components/product-core-fields";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { FormPanel, FormSection } from "@/components/ui/form-layout";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
import { createProduct } from "./actions";

type ProductCreatePageProps = {
  searchParams: Promise<{ error?: string }>;
};

const errorMessages: Record<string, string> = {
  invalid: "راجع البيانات المدخلة. الكود والاسم مطلوبان، والرابط يجب أن يكون بحروف إنجليزية صغيرة وأرقام وشرطات فقط، ومدة الضمان من 1 إلى 240 شهرًا.",
  duplicate: "يوجد منتج آخر بنفس الكود أو رابط المنتج.",
  failed: "تعذر حفظ المنتج. حاول مرة أخرى.",
};

export default async function ProductCreatePage({ searchParams }: ProductCreatePageProps) {
  await requireAdminProfile();
  const { error } = await searchParams;
  const errorMessage = error ? errorMessages[error] : undefined;

  return (
    <>
      <PageHeader
        eyebrow="المنتجات"
        title="إضافة منتج"
        description="أنشئ الهوية التشغيلية الأساسية للمنتج قبل استخدامه في دورات الإنتاج والضمان."
        actions={
          <Link href="/operations/products" className="button button-ghost">
            <Icon name="back" />
            العودة للمنتجات
          </Link>
        }
      />

      <FormPanel>
        {errorMessage ? <FeedbackBanner tone="error">{errorMessage}</FeedbackBanner> : null}
        <form action={createProduct} className="operations-form">
          <FormSection title="بيانات المنتج" description="الحقول المرجعية التي تعرّف المنتج داخل المنصة.">
            <ProductCoreFields />
          </FormSection>

          <div className="operations-form-actions">
            <button type="submit" className="button button-primary">حفظ المنتج</button>
            <Link href="/operations/products" className="button button-ghost">إلغاء</Link>
          </div>
        </form>
      </FormPanel>
    </>
  );
}
