import Link from "next/link";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { EmptyState } from "@/components/ui/empty-state";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { PageHeader } from "@/components/ui/page-header";
import { RecordItem, RecordList } from "@/components/ui/record-list";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { setAgentStatus } from "./actions";

const statusLabels: Record<string, string> = {
  active: "نشط",
  suspended: "موقوف",
};

type OperationsAgentsPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function OperationsAgentsPage({ searchParams }: OperationsAgentsPageProps) {
  await requireAdminProfile();
  const { error: pageError } = await searchParams;

  const supabase = await createSupabaseServerClient();
  const [agentsResult, partiesResult] = await Promise.all([
    supabase
      .from("country_agents")
      .select("id, code, name, country_code, status")
      .order("name", { ascending: true }),
    supabase
      .from("operational_parties")
      .select("country_agent_id, transfer_code")
      .eq("party_type", "agent"),
  ]);

  if (agentsResult.error) throw agentsResult.error;
  if (partiesResult.error) throw partiesResult.error;

  const transferCodeByAgent = new Map(
    partiesResult.data
      .filter((party) => party.country_agent_id)
      .map((party) => [party.country_agent_id as string, party.transfer_code]),
  );

  const agents = agentsResult.data;

  return (
    <>
      <PageHeader
        eyebrow="الهيكل التشغيلي"
        title="وكلاء الدول"
        description="إدارة وكلاء الدول الذين يملكون نطاق موزعين ومراكز خاصًا بهم داخل شبكة Protection Giants."
        meta={`${agents.length} وكيل دولة مسجل`}
        actions={<Link href="/operations/agents/new" className="button button-primary">إضافة وكيل دولة</Link>}
      />

      {pageError === "lifecycle" ? (
        <FeedbackBanner tone="error">تعذر تغيير حالة وكيل الدولة. حاول مرة أخرى.</FeedbackBanner>
      ) : null}

      {agents.length === 0 ? (
        <EmptyState
          eyebrow="وكلاء الدول"
          title="لا يوجد وكلاء دول مسجلون بعد"
          description="أنشئ وكيل الدولة أولًا، ثم اربط به الموزعين والمراكز والحساب التشغيلي."
          action={<Link href="/operations/agents/new" className="button button-primary">إضافة وكيل دولة</Link>}
        />
      ) : (
        <RecordList label="قائمة وكلاء الدول">
          {agents.map((agent) => {
            const isSuspended = agent.status === "suspended";
            const transferCode = transferCodeByAgent.get(agent.id) ?? "غير متاح";

            return (
              <RecordItem
                key={agent.id}
                kicker={<span dir="ltr">{agent.code}</span>}
                title={agent.name}
                facts={[
                  { label: "الدولة", value: agent.country_code, dir: "ltr" },
                  { label: "Transfer ID", value: transferCode, dir: "ltr" },
                ]}
                status={
                  <StatusBadge tone={isSuspended ? "neutral" : "success"}>
                    {statusLabels[agent.status] ?? agent.status}
                  </StatusBadge>
                }
                actions={
                  <>
                    <Link href={`/operations/agents/${agent.id}/edit`} className="button button-ghost">تعديل</Link>
                    <form action={setAgentStatus}>
                      <input type="hidden" name="agent_id" value={agent.id} />
                      <input type="hidden" name="status" value={isSuspended ? "active" : "suspended"} />
                      {isSuspended ? (
                        <button type="submit" className="button button-primary">إعادة تفعيل</button>
                      ) : (
                        <ConfirmSubmitButton
                          title="إيقاف وكيل الدولة؟"
                          description="سيُمنع حساب وكيل الدولة من الوصول، بينما تظل كيانات الموزعين والمراكز التابعة له بحالاتها المستقلة دون إيقاف تلقائي."
                          confirmLabel="تأكيد الإيقاف"
                        >
                          إيقاف
                        </ConfirmSubmitButton>
                      )}
                    </form>
                  </>
                }
              />
            );
          })}
        </RecordList>
      )}
    </>
  );
}
