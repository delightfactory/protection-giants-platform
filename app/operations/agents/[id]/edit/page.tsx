import Link from "next/link";
import { notFound } from "next/navigation";
import { AgentCoreFields } from "@/components/agent-core-fields";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { FormPanel, FormSection } from "@/components/ui/form-layout";
import { PageHeader } from "@/components/ui/page-header";
import { TaskBackLink } from "@/components/ui/task-back-link";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { updateAgent } from "./actions";

type AgentEditPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const errorMessages: Record<string, string> = {
  invalid: "راجع البيانات المدخلة. الكود والاسم وكود الدولة مطلوبة بالقيم الصحيحة.",
  duplicate: "يوجد وكيل دولة آخر بنفس الكود.",
  "country-bound": "لا يمكن تغيير دولة الوكيل بهذه القيمة مع وجود موزعين أو مراكز مرتبطة بالدولة الحالية. راجع التبعية أولًا.",
  failed: "تعذر حفظ التعديلات. حاول مرة أخرى.",
};

export default async function AgentEditPage({ params, searchParams }: AgentEditPageProps) {
  await requireAdminProfile();
  const { id } = await params;
  const { error } = await searchParams;

  if (!uuidPattern.test(id)) notFound();

  const supabase = await createSupabaseServerClient();
  const [{ data: agent, error: agentError }, { data: party, error: partyError }] = await Promise.all([
    supabase
      .from("country_agents")
      .select("id, code, name, country_code")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("operational_parties")
      .select("transfer_code")
      .eq("country_agent_id", id)
      .maybeSingle(),
  ]);

  if (agentError) throw agentError;
  if (partyError) throw partyError;
  if (!agent) notFound();

  const errorMessage = error ? errorMessages[error] : undefined;

  return (
    <>
      <PageHeader
        eyebrow="وكلاء الدول"
        title={agent.name}
        description="تعديل هوية وكيل الدولة مع الحفاظ على شبكة الموزعين والمراكز المرتبطة به."
        meta={party?.transfer_code ? <span dir="ltr">Transfer ID: {party.transfer_code}</span> : undefined}
        actions={<TaskBackLink href="/operations/agents" label="العودة لوكلاء الدول" />}
      />

      <FormPanel>
        {errorMessage ? <FeedbackBanner tone="error">{errorMessage}</FeedbackBanner> : null}
        <form action={updateAgent} className="operations-form">
          <input type="hidden" name="agent_id" value={agent.id} />
          <FormSection title="بيانات وكيل الدولة" description="راجع القيم المرجعية واحفظ التغييرات المطلوبة فقط.">
            <AgentCoreFields
              values={{
                code: agent.code,
                name: agent.name,
                countryCode: agent.country_code,
              }}
            />
          </FormSection>

          <div className="operations-form-actions">
            <button type="submit" className="button button-primary">حفظ التعديلات</button>
            <Link href="/operations/agents" className="button button-ghost">إلغاء</Link>
          </div>
        </form>
      </FormPanel>
    </>
  );
}
