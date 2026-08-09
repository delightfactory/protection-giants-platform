import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { PageHeader } from "@/components/ui/page-header";
import { RecordItem, RecordList } from "@/components/ui/record-list";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
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
  await requireAdminProfile();
  const { error: pageError } = await searchParams;

  const supabase = await createSupabaseServerClient();
  const { data: dealers, error } = await supabase
    .from("dealers")
    .select("id, code, name, country_code, status")
    .order("name", { ascending: true });

  if (error) throw error;

  return (
    <>
      <PageHeader
        eyebrow="الهيكل التشغيلي"
        title="الوكلاء والموزعون"
        description="إدارة الكيانات الموزعة وحالتها التشغيلية قبل ربط المراكز والحسابات بها."
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
          description="أنشئ أول كيان موزع، ثم يمكنك ربط مراكز التركيب والحسابات التشغيلية به."
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
                facts={[{ label: "الدولة", value: dealer.country_code, dir: "ltr" }]}
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
