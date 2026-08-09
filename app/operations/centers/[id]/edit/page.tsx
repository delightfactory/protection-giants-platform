import Link from "next/link";
import { notFound } from "next/navigation";
import { CenterCoreFields } from "@/components/center-core-fields";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { FormPanel, FormSection } from "@/components/ui/form-layout";
import { PageHeader } from "@/components/ui/page-header";
import { TaskBackLink } from "@/components/ui/task-back-link";
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

  if (!uuidPattern.test(id)) notFound();

  const supabase = await createSupabaseServerClient();
  const [centerResult, dealersResult] = await Promise.all([
    supabase
      .from("installation_centers")
      .select("id, code, name, dealer_id, country_code, city")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("dealers").select("id, code, name, status").order("name", { ascending: true }),
  ]);

  if (centerResult.error) throw centerResult.error;
  if (dealersResult.error) throw dealersResult.error;
  if (!centerResult.data) notFound();

  const center = centerResult.data;
  const errorMessage = error ? errorMessages[error] : undefined;

  return (
    <>
      <PageHeader
        eyebrow="مراكز التركيب"
        title={center.name}
        description="تعديل هوية المركز وموقعه وتبعيته التشغيلية."
        actions={<TaskBackLink href="/operations/centers" label="العودة للمراكز" />}
      />

      <FormPanel>
        {errorMessage ? <FeedbackBanner tone="error">{errorMessage}</FeedbackBanner> : null}
        <form action={updateCenter} className="operations-form">
          <input type="hidden" name="center_id" value={center.id} />
          <FormSection title="بيانات مركز التركيب" description="راجع الموقع والتبعية والهوية الأساسية للمركز.">
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
          </FormSection>

          <div className="operations-form-actions">
            <button type="submit" className="button button-primary">حفظ التعديلات</button>
            <Link href="/operations/centers" className="button button-ghost">إلغاء</Link>
          </div>
        </form>
      </FormPanel>
    </>
  );
}
