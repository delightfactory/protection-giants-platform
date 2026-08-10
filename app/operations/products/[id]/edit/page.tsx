import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductCoreFields } from "@/components/product-core-fields";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { FormPanel } from "@/components/ui/form-layout";
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
  duplicate: "يوجد منتج آخر بنفس الـSKU أو رابط المنتج.",
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
    .select(
      "id, code, name, slug, product_type, category, version_name, reference_price, currency_code, width_mm, length_m, thickness_mil, weight_kg, origin_country, default_warranty_months, marketing_description, technical_description, features, warranty_coverage, care_instructions, publication_status",
    )
    .eq("id", id)
    .maybeSingle();

  if (productError) throw productError;
  if (!product) notFound();

  const errorMessage = error ? errorMessages[error] ?? error : undefined;

  return (
    <>
      <PageHeader
        eyebrow="المنتجات"
        title={product.name}
        description="تعديل تعريف المنتج ومواصفاته ومحتواه وسياسة الضمان دون تغيير سجلات الإنتاج المستقبلية."
        actions={<TaskBackLink href="/operations/products" label="العودة للمنتجات" />}
      />

      <FormPanel>
        {errorMessage ? <FeedbackBanner tone="error">{errorMessage}</FeedbackBanner> : null}
        <form action={updateProduct} className="operations-form">
          <input type="hidden" name="product_id" value={product.id} />
          <ProductCoreFields
            values={{
              code: product.code,
              name: product.name,
              slug: product.slug,
              productType: product.product_type,
              category: product.category,
              versionName: product.version_name,
              referencePrice: product.reference_price,
              currencyCode: product.currency_code,
              widthMm: product.width_mm,
              lengthM: product.length_m,
              thicknessMil: product.thickness_mil,
              weightKg: product.weight_kg,
              originCountry: product.origin_country,
              defaultWarrantyMonths: product.default_warranty_months,
              marketingDescription: product.marketing_description,
              technicalDescription: product.technical_description,
              features: product.features,
              warrantyCoverage: product.warranty_coverage,
              careInstructions: product.care_instructions,
              publicationStatus: product.publication_status,
            }}
          />

          <div className="operations-form-actions">
            <button type="submit" className="button button-primary">حفظ التعديلات</button>
            <Link href="/operations/products" className="button button-ghost">إلغاء</Link>
          </div>
        </form>
      </FormPanel>
    </>
  );
}
