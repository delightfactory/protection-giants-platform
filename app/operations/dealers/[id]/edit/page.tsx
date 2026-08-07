import Link from "next/link";
import { notFound } from "next/navigation";
import { DealerCoreFields } from "@/components/dealer-core-fields";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { updateDealer } from "./actions";

type DealerEditPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const errorMessages: Record<string, string> = {
  invalid: "راجع البيانات المدخلة. الكود والاسم وكود الدولة مطلوبة بالقيم الصحيحة.",
  duplicate: "يوجد وكيل أو موزع آخر بنفس الكود.",
  failed: "تعذر حفظ التعديلات. حاول مرة أخرى.",
};

export default async function DealerEditPage({ params, searchParams }: DealerEditPageProps) {
  await requireAdminProfile();
  const { id } = await params;
  const { error } = await searchParams;

  if (!uuidPattern.test(id)) {
    notFound();
  }

  const supabase = await createSupabaseServerClient();
  const { data: dealer, error: dealerError } = await supabase
    .from("dealers")
    .select("id, code, name, country_code")
    .eq("id", id)
    .maybeSingle();

  if (dealerError) {
    throw dealerError;
  }

  if (!dealer) {
    notFound();
  }

  const errorMessage = error ? errorMessages[error] : undefined;

  return (
    <>
      <div className="operations-topbar">
        <div>
          <span className="eyebrow">الوكلاء والموزعون</span>
          <h1>تعديل الوكيل / الموزع</h1>
        </div>
        <Link href="/operations/dealers" className="button">العودة للوكلاء</Link>
      </div>

      <section className="operations-form-panel">
        {errorMessage ? <p className="form-error" role="alert">{errorMessage}</p> : null}

        <form action={updateDealer} className="operations-form">
          <input type="hidden" name="dealer_id" value={dealer.id} />
          <DealerCoreFields
            values={{
              code: dealer.code,
              name: dealer.name,
              countryCode: dealer.country_code,
            }}
          />

          <div className="operations-form-actions">
            <button type="submit" className="button button-primary">حفظ التعديلات</button>
            <Link href="/operations/dealers" className="button">إلغاء</Link>
          </div>
        </form>
      </section>
    </>
  );
}
