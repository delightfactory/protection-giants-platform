import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DealerCoreFields } from "@/components/dealer-core-fields";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { FormPanel, FormSection } from "@/components/ui/form-layout";
import { PageHeader } from "@/components/ui/page-header";
import { TaskBackLink } from "@/components/ui/task-back-link";
import { requireOperationalProfile } from "@/lib/auth/operational-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { updateDealer } from "./actions";

type DealerEditPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const errorMessages: Record<string, string> = {
  invalid: "راجع البيانات المدخلة واختر وكيل الدولة الصحيح.",
  agent: "وكيل الدولة المحدد غير متاح أو موقوف لهذا النقل.",
  duplicate: "يوجد وكيل أو موزع آخر بنفس الكود.",
  failed: "تعذر حفظ التعديلات. حاول مرة أخرى.",
};

export default async function DealerEditPage({ params, searchParams }: DealerEditPageProps) {
  const profile = await requireOperationalProfile();
  if (profile.role !== "admin" && profile.role !== "agent") redirect("/access-denied");

  const { id } = await params;
  const { error } = await searchParams;
  if (!uuidPattern.test(id)) notFound();

  const supabase = await createSupabaseServerClient();
  const [dealerResult, agentsResult, partyResult] = await Promise.all([
    supabase
      .from("dealers")
      .select("id, code, name, country_code, country_agent_id")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("country_agents")
      .select("id, code, name, country_code, status")
      .order("name"),
    supabase
      .from("operational_parties")
      .select("transfer_code")
      .eq("dealer_id", id)
      .maybeSingle(),
  ]);

  if (dealerResult.error) throw dealerResult.error;
  if (agentsResult.error) throw agentsResult.error;
  if (partyResult.error) throw partyResult.error;
  if (!dealerResult.data) notFound();

  const dealer = dealerResult.data;
  const agents = agentsResult.data.filter(
    (agent) => agent.status === "active" || agent.id === dealer.country_agent_id,
  );

  if (profile.role === "agent" && dealer.country_agent_id !== profile.country_agent_id) {
    notFound();
  }

  const errorMessage = error ? errorMessages[error] : undefined;

  return (
    <>
      <PageHeader
        eyebrow="الوكلاء والموزعون"
        title={dealer.name}
        description="تعديل هوية الموزع وربطه بوكيل الدولة المسؤول عنه."
        meta={partyResult.data?.transfer_code ? <span dir="ltr">Transfer ID: {partyResult.data.transfer_code}</span> : undefined}
        actions={<TaskBackLink href="/operations/dealers" label="العودة للوكلاء" />}
      />

      <FormPanel>
        {errorMessage ? <FeedbackBanner tone="error">{errorMessage}</FeedbackBanner> : null}
        <form action={updateDealer} className="operations-form">
          <input type="hidden" name="dealer_id" value={dealer.id} />
          <FormSection
            title="بيانات الوكيل"
            description={profile.role === "admin"
              ? "يمكن للإدارة نقل الموزع إلى وكيل دولة آخر نشط؛ الدولة ستتغير تلقائيًا مع الوكيل الجديد."
              : "يمكنك تعديل بيانات الموزع داخل نطاقك، ولا يمكنك نقله إلى وكيل دولة آخر."}
          >
            <DealerCoreFields
              agents={agents}
              lockAgent={profile.role === "agent"}
              values={{
                code: dealer.code,
                name: dealer.name,
                countryAgentId: dealer.country_agent_id,
              }}
            />
          </FormSection>

          <div className="operations-form-actions">
            <button type="submit" className="button button-primary">حفظ التعديلات</button>
            <Link href="/operations/dealers" className="button button-ghost">إلغاء</Link>
          </div>
        </form>
      </FormPanel>
    </>
  );
}
