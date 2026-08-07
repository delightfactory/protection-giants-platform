import Link from "next/link";
import { notFound } from "next/navigation";
import { CenterCoreFields } from "@/components/center-core-fields";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { updateCenter } from "./actions";

type CenterEditPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const errorMessages: Record<string, string> = {
  invalid: "راجع البيانات المدخلة. الكود والاسم والدولة والمدينة مطلوبة بالقيم الصحيحة.",
  duplicate: "يوجد مركز تركيب آخر بنفس الكود.",
  dealer: "الوكيل المحدد لم يعد متاحًا. اختر وكيلًا آخر أو اجعل المركز مباشرًا للشركة.",
  failed: "تعذر حفظ التعديلات. حاول مرة أخرى.",
};

export default async function CenterEditPage({ params, searchParams }: CenterEditPageProps) {
  await requireAdminProfile();
  const { id } = await params;
  const { error } = await searchParams;

  if (!uuidPattern.test(id)) {
    notFound();
  }

  const supabase = await createSupabaseServerClient();
  const [centerResult, dealersResult] = await Promise.all([
    supabase
      .from("installation_centers")
      .select("id, code, name, dealer_id, country_code, city")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("dealers")
      .select("id, code, name, status")
      .order("name", { ascending: true }),
  ]);

  if (centerResult.error) {
    throw centerResult.error;
  }

  if (dealersResult.error) {
    throw dealersResult.error;
  }

  if (!centerResult.data) {
    notFound();
  }

  const center = centerResult.data;
  const errorMessage = error ? errorMessages[error] : undefined;

  return (
    <>
      <div className="operations-topbar">
        <div>
          <span className="eyebrow">مراكز التركيب</span>
          <h1>تعديل مركز التركيب</h1>
        </div>
        <Link href="/operations/centers" className="button">العودة للمراكز</Link>
      </div>

      <section className="operations-form-panel">
        {errorMessage ? <p className="form-error" role="alert">{errorMessage}</p> : null}

        <form action={updateCenter} className="operations-form">
          <input type="hidden" name="center_id" value={center.id} />
          <CenterCoreFields
            dealers={dealersResult.data}
            values={{
              code: center.code,
              name: center.name,
              dealerId: center.dealer_id,
              countryCode: center.country_code,
              city: center.city,
            }}
          />

          <div className="operations-form-actions">
            <button type="submit" className="button button-primary">حفظ التعديلات</button>
            <Link href="/operations/centers" className="button">إلغاء</Link>
          </div>
        </form>
      </section>
    </>
  );
}
