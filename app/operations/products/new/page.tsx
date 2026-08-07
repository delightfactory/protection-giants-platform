import Link from "next/link";
import { ProductCoreFields } from "@/components/product-core-fields";
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
      <div className="operations-topbar">
        <div>
          <span className="eyebrow">المنتجات</span>
          <h1>إضافة منتج</h1>
        </div>
        <Link href="/operations/products" className="button">العودة للمنتجات</Link>
      </div>

      <section className="operations-form-panel">
        {errorMessage ? <p className="form-error" role="alert">{errorMessage}</p> : null}

        <form action={createProduct} className="operations-form">
          <ProductCoreFields />

          <div className="operations-form-actions">
            <button type="submit" className="button button-primary">حفظ المنتج</button>
            <Link href="/operations/products" className="button">إلغاء</Link>
          </div>
        </form>
      </section>
    </>
  );
}
