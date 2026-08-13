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
import { setCenterStatus } from "./actions";

const statusLabels: Record<string, string> = {
  active: "نشط",
  suspended: "موقوف",
};

type OperationsCentersPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function OperationsCentersPage({ searchParams }: OperationsCentersPageProps) {
  const profile = await requireOperationalProfile();
  if (profile.role === "center") redirect("/access-denied");

  const { error: pageError } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const [centersResult, dealersResult, agentsResult, partiesResult] = await Promise.all([
    supabase
      .from("installation_centers")
      .select("id, code, name, dealer_id, country_agent_id, country_code, city, status, latitude, longitude, location_source, approval_status, approved_at")
      .order("name", { ascending: true }),
    supabase.from("dealers").select("id, code, name"),
    profile.role === "dealer"
      ? Promise.resolve({ data: [], error: null })
      : supabase.from("country_agents").select("id, code, name"),
    supabase
      .from("operational_parties")
      .select("installation_center_id, transfer_code")
      .eq("party_type", "center"),
  ]);

  if (centersResult.error) throw centersResult.error;
  if (dealersResult.error) throw dealersResult.error;
  if (agentsResult.error) throw agentsResult.error;
  if (partiesResult.error) throw partiesResult.error;

  const dealerNames = new Map(
    dealersResult.data.map((dealer) => [dealer.id, `${dealer.name} (${dealer.code})`]),
  );
  const agentNames = new Map(
    agentsResult.data.map((agent) => [agent.id, `${agent.name} (${agent.code})`]),
  );
  const transferCodes = new Map(
    partiesResult.data
      .filter((party) => party.installation_center_id)
      .map((party) => [party.installation_center_id as string, party.transfer_code]),
  );

  return (
    <>
      <PageHeader
        eyebrow="الهيكل التشغيلي"
        title="مراكز التركيب"
        description={profile.role === "admin"
          ? "إدارة المراكز وموقعها والتبعية التشغيلية واعتماد الشبكة لكل مركز."
          : "إدارة مراكز التركيب الواقعة داخل نطاقك التشغيلي ومراجعة حالة اعتمادها."}
        meta={`${centersResult.data.length} مركز مسجل`}
        actions={<Link href="/operations/centers/new" className="button button-primary">إضافة مركز</Link>}
      />

      {pageError === "lifecycle" ? (
        <FeedbackBanner tone="error">تعذر تغيير حالة مركز التركيب. حاول مرة أخرى.</FeedbackBanner>
      ) : null}

      {centersResult.data.length === 0 ? (
        <EmptyState
          eyebrow="مراكز التركيب"
          title="لا توجد مراكز تركيب في نطاقك بعد"
          description="أنشئ مركزًا جديدًا وحدد تبعيته التشغيلية المسموح بها لهذا الحساب."
          action={<Link href="/operations/centers/new" className="button button-primary">إضافة مركز</Link>}
        />
      ) : (
        <RecordList label="قائمة مراكز التركيب">
          {centersResult.data.map((center) => {
            const isSuspended = center.status === "suspended";
            const isApproved = center.approval_status === "approved";
            const parentName = center.dealer_id
              ? dealerNames.get(center.dealer_id) ?? "موزع غير متاح"
              : center.country_agent_id
                ? agentNames.get(center.country_agent_id) ?? "وكيل دولة غير متاح"
                : "مباشر للشركة";
            const hasLocation = center.latitude !== null && center.longitude !== null;

            return (
              <RecordItem
                key={center.id}
                kicker={<span dir="ltr">{center.code}</span>}
                title={center.name}
                facts={[
                  { label: "الموقع", value: <>{center.city} · <span dir="ltr">{center.country_code}</span></> },
                  { label: "الموقع الجغرافي", value: hasLocation ? (center.location_source === "admin" ? "مسجل · تصحيح إداري" : "مسجل من المركز") : "غير مسجل" },
                  { label: "اعتماد الشبكة", value: isApproved ? "معتمد" : "غير معتمد" },
                  { label: "التبعية", value: parentName },
                  { label: "Transfer ID", value: transferCodes.get(center.id) ?? "غير متاح", dir: "ltr" },
                ]}
                status={
                  <StatusBadge tone={isSuspended ? "neutral" : "success"}>
                    {statusLabels[center.status] ?? center.status}
                  </StatusBadge>
                }
                actions={
                  <>
                    {profile.role === "admin" || profile.role === "agent" ? (
                      <Link href={`/operations/centers/${center.id}/approval`} className="button button-ghost">الاعتماد</Link>
                    ) : null}
                    {profile.role === "admin" ? (
                      <Link href={`/operations/centers/${center.id}/location`} className="button button-ghost">الموقع</Link>
                    ) : null}
                    <Link href={`/operations/centers/${center.id}/edit`} className="button button-ghost">تعديل</Link>
                    <form action={setCenterStatus}>
                      <input type="hidden" name="center_id" value={center.id} />
                      <input type="hidden" name="status" value={isSuspended ? "active" : "suspended"} />
                      {isSuspended ? (
                        <button type="submit" className="button button-primary">إعادة تفعيل</button>
                      ) : (
                        <ConfirmSubmitButton
                          title="إيقاف مركز التركيب؟"
                          description="سيظل المركز محفوظًا داخل النظام، لكن حالته التشغيلية ستصبح موقوفة حتى إعادة التفعيل."
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
