import Link from "next/link";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterActions, FilterBar, FilterField, FilterGrid } from "@/components/ui/filter-bar";
import { LocalDateTime } from "@/components/ui/local-date-time";
import { PageHeader } from "@/components/ui/page-header";
import { RecordItem, RecordList } from "@/components/ui/record-list";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireOperationalProfile } from "@/lib/auth/operational-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const PAGE_SIZE = 25;
const MAX_PAGE = 400;
const allowedScopes = new Set(["open", "closed", "all"]);
const allowedStatuses = new Set(["authorized", "assigned", "completed", "cancelled"]);

type ResolutionQueuePageProps = {
  searchParams: Promise<{ scope?: string; status?: string; page?: string }>;
};

function parsePage(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, MAX_PAGE) : 1;
}

function queueHref(scope: string, status: string, page: number) {
  const params = new URLSearchParams();
  if (scope !== "open") params.set("scope", scope);
  if (status) params.set("status", status);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `/operations/claim-resolutions${query ? `?${query}` : ""}`;
}

function resolutionStatus(status: string) {
  if (status === "authorized") return <StatusBadge tone="accent">بانتظار الإسناد</StatusBadge>;
  if (status === "assigned") return <StatusBadge tone="warning">مسند للتنفيذ</StatusBadge>;
  if (status === "completed") return <StatusBadge tone="success">مكتمل</StatusBadge>;
  if (status === "cancelled") return <StatusBadge tone="neutral">أُغلق دون تنفيذ</StatusBadge>;
  return <StatusBadge>غير معروفة</StatusBadge>;
}

function remedyLabel(remedy: string | null) {
  if (remedy === "service_reinstall") return "إعادة تركيب / خدمة";
  if (remedy === "replacement_roll_reinstall") return "استبدال لفة وإعادة تركيب";
  return "لم يُحدد بعد";
}

export default async function ClaimResolutionQueuePage({ searchParams }: ResolutionQueuePageProps) {
  const profile = await requireOperationalProfile();
  if (profile.role !== "admin") redirect("/access-denied");

  const params = await searchParams;
  const scope = allowedScopes.has(params.scope ?? "") ? params.scope! : "open";
  const status = allowedStatuses.has(params.status ?? "") ? params.status! : "";
  const page = parsePage(params.page);
  const offset = (page - 1) * PAGE_SIZE;
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("list_admin_warranty_claim_resolutions", {
    p_limit: PAGE_SIZE + 1,
    p_offset: offset,
    p_scope: scope,
    p_status: status || undefined,
  });

  if (error) {
    if (error.message === "PG_CLAIM_ADMIN_REQUIRED" || error.message === "PG_CLAIM_FORBIDDEN") {
      redirect("/access-denied");
    }
    throw error;
  }

  const rows = data ?? [];
  const hasNext = rows.length > PAGE_SIZE;
  const resolutions = hasNext ? rows.slice(0, PAGE_SIZE) : rows;
  const hasPrevious = page > 1;
  const filtersActive = scope !== "open" || Boolean(status);

  return (
    <>
      <PageHeader
        eyebrow="مطالبات الضمان · التنفيذ"
        title="تنفيذ المطالبات المقبولة"
        description="قائمة الـResolution المعتمدة بعد قرار المطالبة. هنا يتم تحديد أسلوب المعالجة، إسناد مركز التنفيذ، وإدارة مادة الاستبدال عند الحاجة دون تغيير قرار المطالبة نفسه."
        meta={`صفحة ${page.toLocaleString("en-US")} · ${resolutions.length.toLocaleString("en-US")} سجل${hasNext ? " · يوجد المزيد" : ""}`}
        actions={<Link href="/operations/claims" className="button button-ghost">مراجعة المطالبات</Link>}
      />

      <FilterBar label="تصفية تنفيذ المطالبات">
        <form method="get">
          <FilterGrid>
            <FilterField label="النطاق">
              <select name="scope" defaultValue={scope}>
                <option value="open">غير المنتهية</option>
                <option value="closed">المنتهية</option>
                <option value="all">الكل</option>
              </select>
            </FilterField>
            <FilterField label="حالة التنفيذ">
              <select name="status" defaultValue={status}>
                <option value="">كل الحالات</option>
                <option value="authorized">بانتظار الإسناد</option>
                <option value="assigned">مسند للتنفيذ</option>
                <option value="completed">مكتمل</option>
                <option value="cancelled">أُغلق دون تنفيذ</option>
              </select>
            </FilterField>
            <FilterActions>
              <button type="submit" className="button button-primary">تطبيق</button>
              {filtersActive ? <Link href="/operations/claim-resolutions" className="button button-ghost">مسح</Link> : null}
            </FilterActions>
          </FilterGrid>
        </form>
      </FilterBar>

      {resolutions.length === 0 ? (
        <EmptyState
          eyebrow="تنفيذ المطالبات"
          title={hasPrevious ? "لا توجد سجلات في هذه الصفحة" : filtersActive ? "لا توجد سجلات مطابقة" : "لا توجد مطالبات بانتظار التنفيذ"}
          description={hasPrevious
            ? "ارجع للصفحة السابقة أو غيّر معايير التصفية."
            : filtersActive
              ? "غيّر النطاق أو الحالة لعرض سجلات أخرى."
              : "ستظهر هنا الـResolution التي ينشئها قرار قبول المطالبة في Cube Q."}
          action={hasPrevious
            ? <Link href={queueHref(scope, status, page - 1)} className="button button-ghost">الصفحة السابقة</Link>
            : filtersActive
              ? <Link href="/operations/claim-resolutions" className="button button-ghost">عرض غير المنتهية</Link>
              : undefined}
        />
      ) : (
        <RecordList label="سجل تنفيذ المطالبات">
          {resolutions.map((resolution) => {
            const vehicle = [resolution.vehicle_make, resolution.vehicle_model, resolution.vehicle_year]
              .filter(Boolean)
              .join(" ") || "بيانات السيارة غير متاحة";
            const center = resolution.performing_center_name ?? "لم يُسند مركز بعد";
            const milestone = resolution.completed_at ?? resolution.cancelled_at ?? resolution.assigned_at ?? resolution.authorized_at;

            return (
              <RecordItem
                key={resolution.resolution_id}
                kicker={<span dir="ltr">{resolution.claim_number}</span>}
                title={resolution.product_name}
                subtitle={vehicle}
                facts={[
                  { label: "المعالجة", value: remedyLabel(resolution.remedy_kind) },
                  { label: "مركز التنفيذ", value: center },
                  { label: "كود المنتج", value: resolution.product_code, dir: "ltr" as const },
                  { label: "آخر مرحلة", value: <LocalDateTime value={milestone} /> },
                ]}
                status={resolutionStatus(resolution.resolution_status)}
                actions={(
                  <Link href={`/operations/claim-resolutions/${resolution.resolution_id}`} className="button button-secondary">
                    فتح التنفيذ
                  </Link>
                )}
              />
            );
          })}
        </RecordList>
      )}

      {resolutions.length > 0 && (hasPrevious || hasNext) ? (
        <nav className="ui-pagination" aria-label="صفحات تنفيذ مطالبات الضمان">
          {hasPrevious ? <Link href={queueHref(scope, status, page - 1)} className="button button-ghost">السابق</Link> : <span />}
          <span>صفحة {page.toLocaleString("en-US")}</span>
          {hasNext ? <Link href={queueHref(scope, status, page + 1)} className="button button-ghost">التالي</Link> : <span />}
        </nav>
      ) : null}
    </>
  );
}
