import Link from "next/link";
import { redirect } from "next/navigation";
import { DealerCoreFields } from "@/components/dealer-core-fields";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { FormPanel, FormSection } from "@/components/ui/form-layout";
import { PageHeader } from "@/components/ui/page-header";
import { TaskBackLink } from "@/components/ui/task-back-link";
import { requireOperationalProfile } from "@/lib/auth/operational-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createDealer } from "./actions";

type DealerCreatePageProps = {
  searchParams: Promise<{ error?: string }>;
};

const errorMessages: Record<string, string> = {
  invalid: "راجع البيانات المدخلة واختر وكيل الدولة الصحيح.",
  agent: "وكيل الدولة المحدد غير متاح أو موقوف.",
  duplicate: "يوجد وكيل أو موزع آخر بنفس الكود.",
  failed: "تعذر حفظ الوكيل أو الموزع. حاول مرة أخرى.",
};

export default async function DealerCreatePage({ searchParams }: DealerCreatePageProps) {
  const profile = await requireOperationalProfile();
  if (profile.role !== "admin" && profile.role !== "agent") redirect("/access-denied");

  const { error } = await searchParams;
  const errorMessage = error ? errorMessages[error] : undefined;
  const supabase = await createSupabaseServerClient();
  const { data: agents, error: agentsError } = await supabase
    .from("country_agents")
    .select("id, code, name, country_code")
    .eq("status", "active")
    .order("name");

  if (agentsError) throw agentsError;

  const ownAgentId = profile.role === "agent" ? profile.country_agent_id : null;
  if (profile.role === "agent" && !agents.some((agent) => agent.id === ownAgentId)) {
    redirect("/access-denied");
  }

  return (
    <>
      <PageHeader
        eyebrow="الوكلاء والموزعون"
        title="إضافة وكيل / موزع"
        description="أنشئ الموزع داخل نطاق وكيل الدولة؛ الدولة تُستمد تلقائيًا من هذا الارتباط."
        actions={<TaskBackLink href="/operations/dealers" label="العودة للوكلاء" />}
      />

      <FormPanel>
        {errorMessage ? <FeedbackBanner tone="error">{errorMessage}</FeedbackBanner> : null}
        <form action={createDealer} className="operations-form">
          <FormSection title="بيانات الوكيل" description="حدد الهوية ووكيل الدولة المسؤول عن هذا الكيان.">
            <DealerCoreFields
              agents={agents}
              lockAgent={profile.role === "agent"}
              values={ownAgentId ? { code: "", name: "", countryAgentId: ownAgentId } : undefined}
            />
          </FormSection>

          <div className="operations-form-actions">
            <button type="submit" className="button button-primary">حفظ الوكيل</button>
            <Link href="/operations/dealers" className="button button-ghost">إلغاء</Link>
          </div>
        </form>
      </FormPanel>
    </>
  );
}
