import Link from "next/link";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { LocalDateTime } from "@/components/ui/local-date-time";
import { PageHeader } from "@/components/ui/page-header";
import { RecordItem, RecordList } from "@/components/ui/record-list";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireOperationalProfile } from "@/lib/auth/operational-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const PAGE_SIZE = 25;
const MAX_PAGE = 400;

type PageProps = {
  searchParams: Promise<{ page?: string; notice?: string }>;
};

function parsePage(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, MAX_PAGE) : 1;
}

function pageHref(page: number) {
  return page > 1 ? `/operations/claim-inspections?page=${page}` : "/operations/claim-inspections";
}

export default async function ClaimInspectionsPage({ searchParams }: PageProps) {
  const profile = await requireOperationalProfile();
  if (profile.role !== "center") redirect("/access-denied");

  const params = await searchParams;
  const page = parsePage(params.page);
  const offset = (page - 1) * PAGE_SIZE;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_center_pending_claim_inspections", {
    p_limit: PAGE_SIZE + 1,
    p_offset: offset,
  });

  if (error) {
    if (error.message === "PG_CLAIM_INSPECTION_CENTER_REQUIRED") redirect("/access-denied");
    throw error;
  }

  const rows = data ?? [];
  const hasNext = rows.length > PAGE_SIZE;
  const inspections = hasNext ? rows.slice(0, PAGE_SIZE) : rows;
  const hasPrevious = page > 1;

  return (
    <>
      <PageHeader
        eyebrow="مطالبات الضمان"
        title="فحوصات الضمان المسندة للمركز"
        description="المهام الظاهرة هنا هي فقط الفحوصات الرسمية المسندة حاليًا إلى مركزك. دور المركز هو توثيق الحالة الفنية بالدليل، بينما قرار المطالبة يظل مسؤولية الشركة."
        meta={`صفحة ${page.toLocaleString("en-US")} · ${inspections.length.toLocaleString("en-US")} فحص${hasNext ? " · يوجد المزيد" : ""}`}
      />

      {params.notice === "submitted" ? (
        <FeedbackBanner tone="success">
          تم إرسال نتيجة الفحص إلى الشركة. لا توجد خطوة أخرى على هذا الفحص من المركز الآن؛ انتظر قرار الشركة. إذا تم قبول المطالبة وإسناد تنفيذ لمركزك فستظهر كمهمة مستقلة ضمن مهام التنفيذ.
        </FeedbackBanner>
      ) : null}

      {inspections.length === 0 ? (
        <EmptyState
          eyebrow="فحوصات الضمان"
          title={hasPrevious ? "لا توجد فحوصات في هذه الصفحة" : "لا توجد فحوصات مطلوبة حاليًا"}
          description={hasPrevious
            ? "ارجع إلى الصفحة السابقة لمراجعة المهام المتاحة."
            : "عند إسناد فحص رسمي إلى مركزك سيظهر هنا تلقائيًا. اعتماد المركز ضمن الشبكة ليس شرطًا مستقلًا لهذه المهمة؛ صلاحية التكليف تتحقق تشغيليًا عند التنفيذ."}
          action={hasPrevious
            ? <Link href={pageHref(page - 1)} className="button button-ghost">الصفحة السابقة</Link>
            : undefined}
        />
      ) : (
        <RecordList label="الفحوصات الرسمية المطلوبة">
          {inspections.map((inspection) => {
            const vehicle = [inspection.vehicle_make, inspection.vehicle_model, inspection.vehicle_year]
              .filter(Boolean)
              .join(" · ");
            return (
              <RecordItem
                key={inspection.inspection_id}
                kicker={<span dir="ltr">{inspection.claim_number}</span>}
                title={inspection.product_name}
                subtitle={vehicle || "بيانات السيارة غير متاحة"}
                facts={[
                  { label: "كود المنتج", value: inspection.product_code, dir: "ltr" as const },
                  { label: "المنطقة المتأثرة", value: inspection.affected_area },
                  { label: "طلب الفحص", value: <LocalDateTime value={inspection.requested_at} /> },
                ]}
                status={<StatusBadge tone="warning">بانتظار الفحص</StatusBadge>}
                actions={(
                  <Link href={`/operations/claim-inspections/${inspection.inspection_id}`} className="button button-primary">
                    فتح مهمة الفحص
                  </Link>
                )}
              />
            );
          })}
        </RecordList>
      )}

      {inspections.length > 0 && (hasPrevious || hasNext) ? (
        <nav className="ui-pagination" aria-label="صفحات فحوصات الضمان">
          {hasPrevious ? <Link href={pageHref(page - 1)} className="button button-ghost">السابق</Link> : <span />}
          <span>صفحة {page.toLocaleString("en-US")}</span>
          {hasNext ? <Link href={pageHref(page + 1)} className="button button-ghost">التالي</Link> : <span />}
        </nav>
      ) : null}
    </>
  );
}
