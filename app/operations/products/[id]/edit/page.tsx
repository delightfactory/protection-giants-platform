import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductCoreFields } from "@/components/product-core-fields";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { FormPanel, FormSection } from "@/components/ui/form-layout";
import { PageHeader } from "@/components/ui/page-header";
import { TaskBackLink } from "@/components/ui/task-back-link";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { updateProduct } from "./actions";

type ProductEditPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const errorMessages: Record<string, string> = {
  invalid: "راجع البيانات المدخلة. الكود والاسم مطلوبان، والرابط يجب أن يكون بحروف إنجليزية صغيرة وأرقام وشرطات فقط، ومدة الضمان من 1 إلى 240 شهرًا.",
  duplicate: "يوجد منتج آخر بنفس الكود أو رابط المنتج.",
  failed: "تعذر حفظ التعديلات. حاول مرة أخرى.",
};

export default async function ProductEditPage({ params, searchParams }: ProductEditPageProps) {
  await requireAdminProfile();
  const { id } = await params;
  const { error } = await searchParams;

  if (!uuidPattern.test(id)) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id, code, name, slug, default_warranty_months")
    .eq("id", id)
    .maybeSingle();

  if (productError) throw productError;
  if (!product) notFound();

  const errorMessage = error ? errorMessages[error] : undefined;

  return (
    <>
      <PageHeader
        eyebrow="المنتجات"
        title={product.name}
        description="تعديل البيانات المرجعية للمنتج دون تغيير دورة حياته التشغيلية."
        actions={<TaskBackLink href="/operations/products" label="العودة للمنتجات" />}
      />

      <FormPanel>
        {errorMessage ? <FeedbackBanner tone="error">{errorMessage}</FeedbackBanner> : null}
        <form action={updateProduct} className="operations-form">
          <input type="hidden" name="product_id" value={product.id} />
          <FormSection title="بيانات المنتج" description="راجع القيم الأساسية واحفظ التغييرات المطلوبة فقط.">
            <ProductCoreFields
              values={{
                code: product.code,
                name: product.name,
                slug: product.slug,
                defaultWarrantyMonths: product.default_warranty_months,
              }}
            />
          </FormSection>

          <div className="operations-form-actions">
            <button type="submit" className="button button-primary">حفظ التعديلات</button>
            <Link href="/operations/products" className="button button-ghost">إلغاء</Link>
          </div>
        </form>
      </FormPanel>
    </>
  );
}
