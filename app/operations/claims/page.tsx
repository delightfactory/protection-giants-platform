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
const allowedStatuses = new Set([
  "submitted",
  "under_review",
  "awaiting_inspection",
  "approved",
  "rejected",
  "cancelled",
]);

type ClaimsPageProps = {
  searchParams: Promise<{ scope?: string; status?: string; page?: string }>;
};

function parsePage(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, MAX_PAGE) : 1;
}

function claimsHref(scope: string, status: string, page: number) {
  const params = new URLSearchParams();
  if (scope !== "open") params.set("scope", scope);
  if (status) params.set("status", status);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `/operations/claims${query ? `?${query}` : ""}`;
}

function claimStatus(status: string) {
  if (status === "submitted") return <StatusBadge tone="accent">جديدة</StatusBadge>;
  if (status === "under_review") return <StatusBadge tone="warning">قيد المراجعة</StatusBadge>;
  if (status === "awaiting_inspection") return <StatusBadge tone="warning">مطلوب فحص</StatusBadge>;
  if (status === "approved") return <StatusBadge tone="success">مقبولة</StatusBadge>;
  if (status === "rejected") return <StatusBadge tone="danger">مرفوضة</StatusBadge>;
  if (status === "cancelled") return <StatusBadge tone="neutral">ملغاة</StatusBadge>;
  return <StatusBadge>غير معروفة</StatusBadge>;
}

function inspectionLabel(status: string | null) {
  if (status === "requested") return "بانتظار الفحص";
  if (status === "submitted") return "تم الفحص";
  return "لا يوجد فحص رسمي";
}

export default async function ClaimsPage({ searchParams }: ClaimsPageProps) {
  const profile = await requireOperationalProfile();
  if (profile.role !== "admin") redirect("/access-denied");

  const params = await searchParams;
  const scope = allowedScopes.has(params.scope ?? "") ? params.scope! : "open";
  const status = allowedStatuses.has(params.status ?? "") ? params.status! : "";
  const page = parsePage(params.page);
  const offset = (page - 1) * PAGE_SIZE;
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("list_admin_warranty_claims", {
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
  const claims = hasNext ? rows.slice(0, PAGE_SIZE) : rows;
  const hasPrevious = page > 1;
  const filtersActive = scope !== "open" || Boolean(status);

  return (
    <>
      <PageHeader
        eyebrow="مطالبات الضمان"
        title="مراجعة مطالبات العملاء"
        description="سجل مطالبات الضمان المرسلة من العملاء. افتح المطالبة لمراجعة بياناتها، سياق الضمان، المرفقات، الفحص وسجل الأحداث قبل تنفيذ أي قرار."
        meta={`صفحة ${page.toLocaleString("en-US")} · ${claims.length.toLocaleString("en-US")} مطالبة${hasNext ? " · يوجد المزيد" : ""}`}
      />

      <FilterBar label="تصفية مطالبات الضمان">
        <form method="get">
          <FilterGrid>
            <FilterField label="النطاق">
              <select name="scope" defaultValue={scope}>
                <option value="open">المفتوحة</option>
                <option value="closed">المغلقة</option>
                <option value="all">الكل</option>
              </select>
            </FilterField>
            <FilterField label="الحالة">
              <select name="status" defaultValue={status}>
                <option value="">كل الحالات</option>
                <option value="submitted">جديدة</option>
                <option value="under_review">قيد المراجعة</option>
                <option value="awaiting_inspection">مطلوب فحص</option>
                <option value="approved">مقبولة</option>
                <option value="rejected">مرفوضة</option>
                <option value="cancelled">ملغاة</option>
              </select>
            </FilterField>
            <FilterActions>
              <button type="submit" className="button button-primary">تطبيق</button>
              {filtersActive ? <Link href="/operations/claims" className="button button-ghost">مسح</Link> : null}
            </FilterActions>
          </FilterGrid>
        </form>
      </FilterBar>

      {claims.length === 0 ? (
        <EmptyState
          eyebrow="مطالبات الضمان"
          title={hasPrevious
            ? "لا توجد مطالبات في هذه الصفحة"
            : filtersActive
              ? "لا توجد مطالبات مطابقة"
              : "لا توجد مطالبات مفتوحة حاليًا"}
          description={hasPrevious
            ? "ارجع للصفحة السابقة أو غيّر معايير التصفية."
            : filtersActive
              ? "غيّر النطاق أو الحالة لعرض سجلات أخرى."
              : "ستظهر هنا أي مطالبة جديدة يرسلها عميل من صفحة الضمان الموثقة."}
          action={hasPrevious
            ? <Link href={claimsHref(scope, status, page - 1)} className="button button-ghost">الصفحة السابقة</Link>
            : filtersActive
              ? <Link href="/operations/claims" className="button button-ghost">عرض المطالبات المفتوحة</Link>
              : undefined}
        />
      ) : (
        <RecordList label="سجل مطالبات الضمان">
          {claims.map((claim) => {
            const vehicle = [claim.vehicle_make, claim.vehicle_model].filter(Boolean).join(" ") || "بيانات السيارة غير متاحة";
            const inspection = claim.inspection_center_name
              ? `${inspectionLabel(claim.inspection_status)} · ${claim.inspection_center_name}`
              : inspectionLabel(claim.inspection_status);

            return (
              <RecordItem
                key={claim.claim_id}
                kicker={<span dir="ltr">{claim.claim_number}</span>}
                title={claim.product_name}
                subtitle={vehicle}
                facts={[
                  { label: "كود المنتج", value: claim.product_code, dir: "ltr" as const },
                  { label: "مركز التفعيل", value: claim.activating_center_name },
                  { label: "الفحص", value: inspection },
                  { label: "تاريخ التقديم", value: <LocalDateTime value={claim.submitted_at} /> },
                ]}
                status={claimStatus(claim.status)}
                actions={(
                  <Link href={`/operations/claims/${claim.claim_id}`} className="button button-secondary">
                    فتح المطالبة
                  </Link>
                )}
              />
            );
          })}
        </RecordList>
      )}

      {claims.length > 0 && (hasPrevious || hasNext) ? (
        <nav className="ui-pagination" aria-label="صفحات مطالبات الضمان">
          {hasPrevious ? (
            <Link href={claimsHref(scope, status, page - 1)} className="button button-ghost">السابق</Link>
          ) : <span />}
          <span>صفحة {page.toLocaleString("en-US")}</span>
          {hasNext ? (
            <Link href={claimsHref(scope, status, page + 1)} className="button button-ghost">التالي</Link>
          ) : <span />}
        </nav>
      ) : null}
    </>
  );
}
