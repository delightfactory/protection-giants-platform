import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { PageHeader } from "@/components/ui/page-header";
import { RecordItem, RecordList } from "@/components/ui/record-list";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
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
  await requireAdminProfile();
  const { error: pageError } = await searchParams;

  const supabase = await createSupabaseServerClient();
  const [centersResult, dealersResult] = await Promise.all([
    supabase
      .from("installation_centers")
      .select("id, code, name, dealer_id, country_code, city, status")
      .order("name", { ascending: true }),
    supabase.from("dealers").select("id, code, name"),
  ]);

  if (centersResult.error) throw centersResult.error;
  if (dealersResult.error) throw dealersResult.error;

  const dealerNames = new Map(
    dealersResult.data.map((dealer) => [dealer.id, `${dealer.name} (${dealer.code})`]),
  );

  return (
    <>
      <PageHeader
        eyebrow="الهيكل التشغيلي"
        title="مراكز التركيب"
        description="إدارة المراكز المعتمدة وموقعها والتبعية التشغيلية لكل مركز."
        meta={`${centersResult.data.length} مركز مسجل`}
        actions={<Link href="/operations/centers/new" className="button button-primary">إضافة مركز</Link>}
      />

      {pageError === "lifecycle" ? (
        <FeedbackBanner tone="error">تعذر تغيير حالة مركز التركيب. حاول مرة أخرى.</FeedbackBanner>
      ) : null}

      {centersResult.data.length === 0 ? (
        <EmptyState
          eyebrow="مراكز التركيب"
          title="لا توجد مراكز تركيب مسجلة بعد"
          description="أنشئ أول مركز تشغيلي وحدد إن كان مباشرًا للشركة أو تابعًا لوكيل."
          action={<Link href="/operations/centers/new" className="button button-primary">إضافة مركز</Link>}
        />
      ) : (
        <RecordList label="قائمة مراكز التركيب">
          {centersResult.data.map((center) => {
            const isSuspended = center.status === "suspended";
            const parentName = center.dealer_id
              ? dealerNames.get(center.dealer_id) ?? "وكيل غير متاح"
              : "مباشر للشركة";

            return (
              <RecordItem
                key={center.id}
                kicker={<span dir="ltr">{center.code}</span>}
                title={center.name}
                facts={[
                  { label: "الموقع", value: <>{center.city} · <span dir="ltr">{center.country_code}</span></> },
                  { label: "التبعية", value: parentName },
                ]}
                status={
                  <StatusBadge tone={isSuspended ? "neutral" : "success"}>
                    {statusLabels[center.status] ?? center.status}
                  </StatusBadge>
                }
                actions={
                  <>
                    <Link href={`/operations/centers/${center.id}/edit`} className="button button-ghost">تعديل</Link>
                    <form action={setCenterStatus}>
                      <input type="hidden" name="center_id" value={center.id} />
                      <input type="hidden" name="status" value={isSuspended ? "active" : "suspended"} />
                      <button type="submit" className={isSuspended ? "button button-primary" : "button button-danger"}>
                        {isSuspended ? "إعادة تفعيل" : "إيقاف"}
                      </button>
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
