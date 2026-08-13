import Link from "next/link";
import { redirect } from "next/navigation";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { EmptyState } from "@/components/ui/empty-state";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { PageHeader } from "@/components/ui/page-header";
import { RecordItem, RecordList } from "@/components/ui/record-list";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireOperationalProfile } from "@/lib/auth/operational-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { setDealerStatus } from "./actions";

const statusLabels: Record<string, string> = {
  active: "نشط",
  suspended: "موقوف",
};

type OperationsDealersPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function OperationsDealersPage({ searchParams }: OperationsDealersPageProps) {
  const profile = await requireOperationalProfile();
  if (profile.role !== "admin" && profile.role !== "agent") redirect("/access-denied");

  const { error: pageError } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const [dealersResult, agentsResult, partiesResult] = await Promise.all([
    supabase
      .from("dealers")
      .select("id, code, name, country_code, country_agent_id, status")
      .order("name", { ascending: true }),
    supabase.from("country_agents").select("id, code, name"),
    supabase
      .from("operational_parties")
      .select("dealer_id, transfer_code")
      .eq("party_type", "dealer"),
  ]);

  if (dealersResult.error) throw dealersResult.error;
  if (agentsResult.error) throw agentsResult.error;
  if (partiesResult.error) throw partiesResult.error;

  const agentNames = new Map(agentsResult.data.map((agent) => [agent.id, `${agent.name} (${agent.code})`]));
  const transferCodes = new Map(
    partiesResult.data
      .filter((party) => party.dealer_id)
      .map((party) => [party.dealer_id as string, party.transfer_code]),
  );
  const dealers = dealersResult.data;

  return (
    <>
      <PageHeader
        eyebrow="الهيكل التشغيلي"
        title="الوكلاء والموزعون"
        description={profile.role === "agent"
          ? "إدارة الموزعين داخل نطاق وكيل الدولة الخاص بك."
          : "إدارة الموزعين وربط كل موزع بوكيل الدولة المسؤول عنه."}
        meta={`${dealers.length} وكيل / موزع مسجل`}
        actions={<Link href="/operations/dealers/new" className="button button-primary">إضافة وكيل</Link>}
      />

      {pageError === "lifecycle" ? (
        <FeedbackBanner tone="error">تعذر تغيير حالة الوكيل أو الموزع. حاول مرة أخرى.</FeedbackBanner>
      ) : null}

      {dealers.length === 0 ? (
        <EmptyState
          eyebrow="الوكلاء"
          title="لا يوجد وكلاء أو موزعون مسجلون بعد"
          description="أنشئ أول موزع داخل نطاق وكيل الدولة، ثم يمكنك ربط مراكز التركيب والحسابات التشغيلية به."
          action={<Link href="/operations/dealers/new" className="button button-primary">إضافة وكيل</Link>}
        />
      ) : (
        <RecordList label="قائمة الوكلاء والموزعين">
          {dealers.map((dealer) => {
            const isSuspended = dealer.status === "suspended";
            return (
              <RecordItem
                key={dealer.id}
                kicker={<span dir="ltr">{dealer.code}</span>}
                title={dealer.name}
                facts={[
                  { label: "وكيل الدولة", value: agentNames.get(dealer.country_agent_id) ?? "غير متاح" },
                  { label: "الدولة", value: dealer.country_code, dir: "ltr" },
                  { label: "Transfer ID", value: transferCodes.get(dealer.id) ?? "غير متاح", dir: "ltr" },
                ]}
                status={
                  <StatusBadge tone={isSuspended ? "neutral" : "success"}>
                    {statusLabels[dealer.status] ?? dealer.status}
                  </StatusBadge>
                }
                actions={
                  <>
                    <Link href={`/operations/dealers/${dealer.id}/edit`} className="button button-ghost">تعديل</Link>
                    <form action={setDealerStatus}>
                      <input type="hidden" name="dealer_id" value={dealer.id} />
                      <input type="hidden" name="status" value={isSuspended ? "active" : "suspended"} />
                      {isSuspended ? (
                        <button type="submit" className="button button-primary">إعادة تفعيل</button>
                      ) : (
                        <ConfirmSubmitButton
                          title="إيقاف الوكيل / الموزع؟"
                          description="سيظل الكيان وبياناته محفوظين، ولن يتم إيقاف مراكز التركيب التابعة له تلقائيًا."
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
