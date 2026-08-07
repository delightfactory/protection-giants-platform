import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductCoreFields } from "@/components/product-core-fields";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { updateProduct } from "./actions";

type ProductEditPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

const errorMessages: Record<string, string> = {
  invalid: "راجع البيانات المدخلة. الكود والاسم مطلوبان، والرابط يجب أن يكون بحروف إنجليزية صغيرة وأرقام وشرطات فقط، ومدة الضمان من 1 إلى 240 شهرًا.",
  duplicate: "يوجد منتج آخر بنفس الكود أو رابط المنتج.",
  failed: "تعذر حفظ التعديلات. حاول مرة أخرى.",
};

export default async function ProductEditPage({ params, searchParams }: ProductEditPageProps) {
  await requireAdminProfile();
  const { id } = await params;
  const { error } = await searchParams;

  const supabase = await createSupabaseServerClient();
  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id, code, name, slug, default_warranty_months")
    .eq("id", id)
    .maybeSingle();

  if (productError) {
    throw productError;
  }

  if (!product) {
    notFound();
  }

  const errorMessage = error ? errorMessages[error] : undefined;

  return (
    <>
      <div className="operations-topbar">
        <div>
          <span className="eyebrow">المنتجات</span>
          <h1>تعديل المنتج</h1>
        </div>
        <Link href="/operations/products" className="button">العودة للمنتجات</Link>
      </div>

      <section className="operations-form-panel">
        {errorMessage ? <p className="form-error" role="alert">{errorMessage}</p> : null}

        <form action={updateProduct} className="operations-form">
          <input type="hidden" name="product_id" value={product.id} />
          <ProductCoreFields
            values={{
              code: product.code,
              name: product.name,
              slug: product.slug,
              defaultWarrantyMonths: product.default_warranty_months,
            }}
          />

          <div className="operations-form-actions">
            <button type="submit" className="button button-primary">حفظ التعديلات</button>
            <Link href="/operations/products" className="button">إلغاء</Link>
          </div>
        </form>
      </section>
    </>
  );
}
