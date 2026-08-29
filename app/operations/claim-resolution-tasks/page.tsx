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
  return page > 1 ? `/operations/claim-resolution-tasks?page=${page}` : "/operations/claim-resolution-tasks";
}

function remedyLabel(remedy: string) {
  return remedy === "replacement_roll_reinstall" ? "إعادة تركيب برول بديل" : "إعادة تنفيذ الخدمة";
}

export default async function ClaimResolutionTasksPage({ searchParams }: PageProps) {
  const profile = await requireOperationalProfile();
  if (profile.role !== "center") redirect("/access-denied");

  const params = await searchParams;
  const page = parsePage(params.page);
  const offset = (page - 1) * PAGE_SIZE;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_center_assigned_warranty_claim_resolution_tasks", {
    p_limit: PAGE_SIZE + 1,
    p_offset: offset,
  });

  if (error) {
    if (error.message === "PG_CLAIM_RESOLUTION_CENTER_REQUIRED") redirect("/access-denied");
    throw error;
  }

  const rows = data ?? [];
  const hasNext = rows.length > PAGE_SIZE;
  const tasks = hasNext ? rows.slice(0, PAGE_SIZE) : rows;
  const hasPrevious = page > 1;

  return (
    <>
      <PageHeader
        eyebrow="مطالبات الضمان"
        title="مهام تنفيذ المطالبات المسندة للمركز"
        description="تظهر هنا فقط المطالبات المقبولة والمسندة حاليًا إلى مركزك للتنفيذ. نفّذ العلاج المحدد، واتبع مسار الرول الموجود عند الاستبدال، ثم وثّق الإكمال بالصور."
        meta={`صفحة ${page.toLocaleString("en-US")} · ${tasks.length.toLocaleString("en-US")} مهمة${hasNext ? " · يوجد المزيد" : ""}`}
      />

      {params.notice === "completed" ? (
        <FeedbackBanner tone="success">تم توثيق تنفيذ المطالبة وإغلاقها بنجاح.</FeedbackBanner>
      ) : null}

      {tasks.length === 0 ? (
        <EmptyState
          eyebrow="تنفيذ المطالبات"
          title={hasPrevious ? "لا توجد مهام في هذه الصفحة" : "لا توجد مهام تنفيذ مسندة حاليًا"}
          description={hasPrevious
            ? "ارجع إلى الصفحة السابقة لمراجعة المهام المتاحة."
            : "عند إسناد مطالبة مقبولة إلى مركزك ستظهر هنا تلقائيًا. لا تعرض هذه القائمة مخزونًا عامًا أو مهام مراكز أخرى."}
          action={hasPrevious
            ? <Link href={pageHref(page - 1)} className="button button-ghost">الصفحة السابقة</Link>
            : undefined}
        />
      ) : (
        <RecordList label="مهام التنفيذ الحالية">
          {tasks.map((task) => {
            const vehicle = [task.vehicle_make, task.vehicle_model, task.vehicle_year]
              .filter(Boolean)
              .join(" · ");
            return (
              <RecordItem
                key={task.resolution_id}
                kicker={<span dir="ltr">{task.claim_number}</span>}
                title={task.product_name}
                subtitle={vehicle || "بيانات السيارة غير متاحة"}
                facts={[
                  { label: "العلاج", value: remedyLabel(task.remedy_kind) },
                  { label: "المنطقة المتأثرة", value: task.affected_area },
                  { label: "تم الإسناد", value: <LocalDateTime value={task.assigned_at} /> },
                ]}
                status={<StatusBadge tone="warning">بانتظار التنفيذ</StatusBadge>}
                actions={(
                  <Link href={`/operations/claim-resolution-tasks/${task.resolution_id}`} className="button button-primary">
                    فتح مهمة التنفيذ
                  </Link>
                )}
              />
            );
          })}
        </RecordList>
      )}

      {tasks.length > 0 && (hasPrevious || hasNext) ? (
        <nav className="ui-pagination" aria-label="صفحات مهام تنفيذ المطالبات">
          {hasPrevious ? <Link href={pageHref(page - 1)} className="button button-ghost">السابق</Link> : <span />}
          <span>صفحة {page.toLocaleString("en-US")}</span>
          {hasNext ? <Link href={pageHref(page + 1)} className="button button-ghost">التالي</Link> : <span />}
        </nav>
      ) : null}
    </>
  );
}
