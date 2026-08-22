import Link from "next/link";
import { notFound } from "next/navigation";
import { AgentCoreFields } from "@/components/agent-core-fields";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { FormPanel, FormSection } from "@/components/ui/form-layout";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { TaskBackLink } from "@/components/ui/task-back-link";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { setAgentOpenedRollRecovery, updateAgent } from "./actions";

type AgentEditPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string;
    recovery?: string;
    recovery_error?: string;
  }>;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const errorMessages: Record<string, string> = {
  invalid: "راجع البيانات المدخلة. الكود والاسم وكود الدولة مطلوبة بالقيم الصحيحة.",
  duplicate: "يوجد وكيل دولة آخر بنفس الكود.",
  "country-bound": "لا يمكن تغيير دولة الوكيل بهذه القيمة مع وجود موزعين أو مراكز مرتبطة بالدولة الحالية. راجع التبعية أولًا.",
  failed: "تعذر حفظ التعديلات. حاول مرة أخرى.",
};

const recoveryErrorMessages: Record<string, string> = {
  invalid: "تعذر قراءة حالة صلاحية الاسترداد المطلوبة.",
  failed: "تعذر تحديث صلاحية استرداد اللفات المفتوحة. حاول مرة أخرى.",
};

export default async function AgentEditPage({ params, searchParams }: AgentEditPageProps) {
  await requireAdminProfile();
  const { id } = await params;
  const { error, recovery, recovery_error: recoveryError } = await searchParams;

  if (!uuidPattern.test(id)) notFound();

  const supabase = await createSupabaseServerClient();
  const [{ data: agent, error: agentError }, { data: party, error: partyError }] = await Promise.all([
    supabase
      .from("country_agents")
      .select("id, code, name, country_code, opened_roll_recovery_enabled")
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
  const recoveryErrorMessage = recoveryError ? recoveryErrorMessages[recoveryError] : undefined;
  const recoverySuccessMessage = recovery === "enabled"
    ? "تم تفعيل صلاحية استرداد اللفات المفتوحة لهذا الوكيل."
    : recovery === "disabled"
      ? "تم إلغاء صلاحية استرداد اللفات المفتوحة لهذا الوكيل."
      : undefined;

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

      <FormPanel>
        {recoverySuccessMessage ? <FeedbackBanner tone="success">{recoverySuccessMessage}</FeedbackBanner> : null}
        {recoveryErrorMessage ? <FeedbackBanner tone="error">{recoveryErrorMessage}</FeedbackBanner> : null}
        <form action={setAgentOpenedRollRecovery} className="operations-form">
          <input type="hidden" name="agent_id" value={agent.id} />
          <input
            type="hidden"
            name="enabled"
            value={agent.opened_roll_recovery_enabled ? "false" : "true"}
          />
          <FormSection
            title="استرداد اللفات المفتوحة"
            description="صلاحية استثنائية مستقلة. تسمح للوكيل باستلام رول مفتوح فعليًا من مركز داخل شبكته عبر مسار Recovery المراجع، ولا تمنحه أي صلاحية عامة على الحيازة أو التحويلات."
          >
            <div className="operations-form-actions">
              <StatusBadge tone={agent.opened_roll_recovery_enabled ? "success" : "neutral"}>
                {agent.opened_roll_recovery_enabled ? "مفعّلة" : "غير مفعّلة"}
              </StatusBadge>
              <button
                type="submit"
                className={agent.opened_roll_recovery_enabled ? "button button-ghost" : "button button-primary"}
              >
                {agent.opened_roll_recovery_enabled ? "إلغاء صلاحية الاسترداد" : "تفعيل صلاحية الاسترداد"}
              </button>
            </div>
          </FormSection>
        </form>
      </FormPanel>
    </>
  );
}
