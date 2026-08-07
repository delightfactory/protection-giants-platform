import Link from "next/link";
import { CenterCoreFields } from "@/components/center-core-fields";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createCenter } from "./actions";

type CenterCreatePageProps = {
  searchParams: Promise<{ error?: string }>;
};

const errorMessages: Record<string, string> = {
  invalid: "راجع البيانات المدخلة. الكود والاسم والدولة والمدينة مطلوبة بالقيم الصحيحة.",
  duplicate: "يوجد مركز تركيب آخر بنفس الكود.",
  dealer: "الوكيل المحدد لم يعد متاحًا. اختر وكيلًا آخر أو اجعل المركز مباشرًا للشركة.",
  failed: "تعذر حفظ مركز التركيب. حاول مرة أخرى.",
};

export default async function CenterCreatePage({ searchParams }: CenterCreatePageProps) {
  await requireAdminProfile();
  const { error } = await searchParams;

  const supabase = await createSupabaseServerClient();
  const { data: dealers, error: dealersError } = await supabase
    .from("dealers")
    .select("id, code, name, status")
    .order("name", { ascending: true });

  if (dealersError) {
    throw dealersError;
  }

  const errorMessage = error ? errorMessages[error] : undefined;

  return (
    <>
      <div className="operations-topbar">
        <div>
          <span className="eyebrow">مراكز التركيب</span>
          <h1>إضافة مركز تركيب</h1>
        </div>
        <Link href="/operations/centers" className="button">العودة للمراكز</Link>
      </div>

      <section className="operations-form-panel">
        {errorMessage ? <p className="form-error" role="alert">{errorMessage}</p> : null}

        <form action={createCenter} className="operations-form">
          <CenterCoreFields dealers={dealers} />

          <div className="operations-form-actions">
            <button type="submit" className="button button-primary">حفظ المركز</button>
            <Link href="/operations/centers" className="button">إلغاء</Link>
          </div>
        </form>
      </section>
    </>
  );
}
