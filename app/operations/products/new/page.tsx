import Link from "next/link";
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
          <label>
            <span>كود المنتج</span>
            <input name="code" type="text" minLength={2} maxLength={40} required />
          </label>

          <label>
            <span>اسم المنتج</span>
            <input name="name" type="text" minLength={2} maxLength={120} required />
          </label>

          <label>
            <span>رابط المنتج</span>
            <input
              name="slug"
              type="text"
              inputMode="url"
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              placeholder="protection-film-x"
              dir="ltr"
              required
            />
            <small>حروف إنجليزية صغيرة وأرقام وشرطات فقط. سيُستخدم لاحقًا في رابط صفحة المنتج العامة.</small>
          </label>

          <label>
            <span>مدة الضمان الافتراضية بالشهور</span>
            <input name="default_warranty_months" type="number" min={1} max={240} step={1} required />
          </label>

          <div className="operations-form-actions">
            <button type="submit" className="button button-primary">حفظ المنتج</button>
            <Link href="/operations/products" className="button">إلغاء</Link>
          </div>
        </form>
      </section>
    </>
  );
}
