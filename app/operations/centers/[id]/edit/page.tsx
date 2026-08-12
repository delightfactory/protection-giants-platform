import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CenterCoreFields, type CenterParentOption } from "@/components/center-core-fields";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { FormPanel, FormSection } from "@/components/ui/form-layout";
import { PageHeader } from "@/components/ui/page-header";
import { TaskBackLink } from "@/components/ui/task-back-link";
import { requireOperationalProfile } from "@/lib/auth/operational-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { updateCenter } from "./actions";

type CenterEditPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const errorMessages: Record<string, string> = {
  invalid: "راجع البيانات المدخلة وحدد تبعية تشغيلية صحيحة.",
  parent: "الطرف الأب المحدد غير متاح أو خارج نطاقك أو موقوف لهذا النقل.",
  duplicate: "يوجد مركز تركيب آخر بنفس الكود.",
  failed: "تعذر حفظ التعديلات. حاول مرة أخرى.",
};

export default async function CenterEditPage({ params, searchParams }: CenterEditPageProps) {
  const profile = await requireOperationalProfile();
  if (profile.role === "center") redirect("/access-denied");

  const { id } = await params;
  const { error } = await searchParams;
  if (!uuidPattern.test(id)) notFound();

  const supabase = await createSupabaseServerClient();
  const [centerResult, dealersResult, agentsResult, partyResult] = await Promise.all([
    supabase
      .from("installation_centers")
      .select("id, code, name, dealer_id, country_agent_id, country_code, city")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("dealers").select("id, code, name, country_code, status").order("name"),
    profile.role === "dealer"
      ? Promise.resolve({ data: [], error: null })
      : supabase.from("country_agents").select("id, code, name, country_code, status").order("name"),
    supabase
      .from("operational_parties")
      .select("transfer_code")
      .eq("installation_center_id", id)
      .maybeSingle(),
  ]);

  if (centerResult.error) throw centerResult.error;
  if (dealersResult.error) throw dealersResult.error;
  if (agentsResult.error) throw agentsResult.error;
  if (partyResult.error) throw partyResult.error;
  if (!centerResult.data) notFound();

  const center = centerResult.data;
  const currentParentRef = center.dealer_id
    ? `dealer:${center.dealer_id}`
    : center.country_agent_id
      ? `agent:${center.country_agent_id}`
      : "company";

  const parentOptions: CenterParentOption[] = [];

  if (profile.role === "admin") {
    parentOptions.push({ value: "company", label: "مباشر لشركة Protection Giants", countryCode: center.dealer_id || center.country_agent_id ? "" : center.country_code });
  }

  if (profile.role === "admin" || profile.role === "agent") {
    for (const agent of agentsResult.data) {
      if (agent.status !== "active" && `agent:${agent.id}` !== currentParentRef) continue;
      parentOptions.push({
        value: `agent:${agent.id}`,
        label: `مباشر لوكيل الدولة: ${agent.name} (${agent.code})${agent.status === "suspended" ? " — موقوف" : ""}`,
        countryCode: agent.country_code,
      });
    }
  }

  for (const dealer of dealersResult.data) {
    if (dealer.status !== "active" && `dealer:${dealer.id}` !== currentParentRef) continue;
    parentOptions.push({
      value: `dealer:${dealer.id}`,
      label: `تحت الموزع: ${dealer.name} (${dealer.code})${dealer.status === "suspended" ? " — موقوف" : ""}`,
      countryCode: dealer.country_code,
    });
  }

  if (profile.role === "dealer" && currentParentRef !== `dealer:${profile.dealer_id}`) {
    notFound();
  }

  const errorMessage = error ? errorMessages[error] : undefined;

  return (
    <>
      <PageHeader
        eyebrow="مراكز التركيب"
        title={center.name}
        description="تعديل هوية المركز وموقعه وتبعيته داخل الحدود المسموح بها لهذا الحساب."
        meta={partyResult.data?.transfer_code ? <span dir="ltr">Transfer ID: {partyResult.data.transfer_code}</span> : undefined}
        actions={<TaskBackLink href="/operations/centers" label="العودة للمراكز" />}
      />

      <FormPanel>
        {errorMessage ? <FeedbackBanner tone="error">{errorMessage}</FeedbackBanner> : null}
        <form action={updateCenter} className="operations-form">
          <input type="hidden" name="center_id" value={center.id} />
          <input type="hidden" name="current_parent_ref" value={currentParentRef} />
          <FormSection
            title="بيانات مركز التركيب"
            description={profile.role === "dealer"
              ? "يمكنك تعديل بيانات مركز تابع لك، بينما تظل التبعية ثابتة على موزعك."
              : "يمكنك نقل المركز فقط بين الأطراف التي تظهر لك ضمن نطاقك التشغيلي."}
          >
            <CenterCoreFields
              parentOptions={parentOptions}
              lockParent={profile.role === "dealer"}
              values={{
                code: center.code,
                name: center.name,
                parentRef: currentParentRef,
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
