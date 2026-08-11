import Link from "next/link";
import { ProductionOrderForm } from "@/components/production-order-form";
import { EmptyState } from "@/components/ui/empty-state";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { FormPanel } from "@/components/ui/form-layout";
import { PageHeader } from "@/components/ui/page-header";
import { TaskBackLink } from "@/components/ui/task-back-link";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ProductionOrderCreatePageProps = {
  searchParams: Promise<{ error?: string }>;
};

const errorMessages: Record<string, string> = {
  invalid: "راجع بيانات الأمر والـLots والكميات ثم حاول مرة أخرى.",
  failed: "تعذر إنشاء أمر الإنتاج. لم يتم حفظ أي أمر أو Lot أو لفة جزئيًا.",
};

export default async function ProductionOrderCreatePage({ searchParams }: ProductionOrderCreatePageProps) {
  await requireAdminProfile();
  const { error } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id, code, name, width_mm, length_m, thickness_mil")
    .eq("status", "active")
    .eq("product_type", "PPF")
    .order("name", { ascending: true });

  if (productsError) throw productsError;

  return (
    <>
      <PageHeader
        eyebrow="الإنتاج"
        title="أمر إنتاج جديد"
        description="سجّل المنتج والكميات مرة واحدة، وسيولّد النظام الـLots وهويات اللفات بصورة ذرية وآمنة."
        actions={<TaskBackLink href="/operations/production-orders" label="العودة لأوامر الإنتاج" />}
      />

      {products.length === 0 ? (
        <EmptyState
          eyebrow="متطلب قبل الإنتاج"
          title="لا يوجد منتج PPF نشط يمكن إنتاجه"
          description="فعّل أو أنشئ تعريف المنتج أولًا، ثم ارجع لإنشاء أمر الإنتاج."
          action={<Link href="/operations/products" className="button button-primary">فتح المنتجات</Link>}
        />
      ) : (
        <FormPanel>
          {error ? (
            <FeedbackBanner tone="error">{errorMessages[error] ?? errorMessages.failed}</FeedbackBanner>
          ) : null}
          <ProductionOrderForm
            products={products.map((product) => ({
              id: product.id,
              code: product.code,
              name: product.name,
              widthMm: product.width_mm,
              lengthM: product.length_m,
              thicknessMil: product.thickness_mil,
            }))}
            defaultProductionDate={new Date().toISOString().slice(0, 10)}
          />
        </FormPanel>
      )}
    </>
  );
}
