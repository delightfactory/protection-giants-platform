import Link from "next/link";
import { DealerCoreFields } from "@/components/dealer-core-fields";
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
      <div className="operations-topbar">
        <div>
          <span className="eyebrow">الوكلاء والموزعون</span>
          <h1>إضافة وكيل / موزع</h1>
        </div>
        <Link href="/operations/dealers" className="button">العودة للوكلاء</Link>
      </div>

      <section className="operations-form-panel">
        {errorMessage ? <p className="form-error" role="alert">{errorMessage}</p> : null}

        <form action={createDealer} className="operations-form">
          <DealerCoreFields />

          <div className="operations-form-actions">
            <button type="submit" className="button button-primary">حفظ الوكيل</button>
            <Link href="/operations/dealers" className="button">إلغاء</Link>
          </div>
        </form>
      </section>
    </>
  );
}
