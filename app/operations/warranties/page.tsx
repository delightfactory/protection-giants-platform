import Link from "next/link";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { FilterActions, FilterBar, FilterField, FilterGrid } from "@/components/ui/filter-bar";
import { LocalDateTime } from "@/components/ui/local-date-time";
import { PageHeader } from "@/components/ui/page-header";
import { RecordItem, RecordList } from "@/components/ui/record-list";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireOperationalProfile } from "@/lib/auth/operational-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const PAGE_SIZE = 25;
const MAX_PAGE = 400;
const allowedStates = new Set(["issued", "voided_in_error"]);

type WarrantiesPageProps = {
  searchParams: Promise<{ q?: string; state?: string; page?: string }>;
};

function parsePage(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, MAX_PAGE) : 1;
}

function warrantiesHref(search: string, state: string, page: number) {
  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (state) params.set("state", state);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `/operations/warranties${query ? `?${query}` : ""}`;
}

function warrantyStatus(state: string) {
  if (state === "active") return <StatusBadge tone="success">ساري</StatusBadge>;
  if (state === "expired") return <StatusBadge tone="warning">منتهي</StatusBadge>;
  if (state === "voided") return <StatusBadge tone="danger">ملغى كخطأ</StatusBadge>;
  return <StatusBadge>غير معروف</StatusBadge>;
}

export default async function WarrantiesPage({ searchParams }: WarrantiesPageProps) {
  const profile = await requireOperationalProfile();
  if (profile.role !== "center" && profile.role !== "admin") redirect("/access-denied");
  const isAdmin = profile.role === "admin";

  const params = await searchParams;
  const rawSearch = (params.q ?? "").trim();
  const search = rawSearch.slice(0, 80);
  const searchInvalid = Boolean(rawSearch) && (rawSearch.length < 3 || rawSearch.length > 80);
  const state = allowedStates.has(params.state ?? "") ? params.state ?? "" : "";
  const page = parsePage(params.page);
  const offset = (page - 1) * PAGE_SIZE;
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("list_internal_warranties", {
    p_limit: PAGE_SIZE + 1,
    p_offset: offset,
    p_search: searchInvalid ? undefined : (search || undefined),
    p_record_state: state || undefined,
  });

  if (error) {
    if (error.message === "PG_WARRANTY_CENTER_INACTIVE" || error.message === "PG_WARRANTY_FORBIDDEN") {
      redirect("/access-denied");
    }
    throw error;
  }

  const rows = searchInvalid ? [] : (data ?? []);
  const hasNext = rows.length > PAGE_SIZE;
  const warranties = hasNext ? rows.slice(0, PAGE_SIZE) : rows;
  const hasPrevious = page > 1;
  const filtersActive = Boolean(search || state);

  return (
    <>
      <PageHeader
        eyebrow="ضمانات العملاء"
        title={isAdmin ? "سجل ضمانات العملاء" : "ضمانات المركز"}
        description={isAdmin
          ? "راجع ضمانات العملاء الصادرة من كل مراكز التركيب، وابحث بالقيم التشغيلية الدقيقة قبل فتح السجل أو تنفيذ دعم إداري مسجل."
          : "فعّل ضمان العميل من رول مفتوح وراجع الضمانات التي أصدرها هذا المركز. رقم الضمان والسجل هنا للاستخدام التشغيلي الداخلي."}
        meta={`صفحة ${page.toLocaleString("en-US")} · ${warranties.length.toLocaleString("en-US")} ضمان${hasNext ? " · يوجد المزيد" : ""}`}
        actions={isAdmin
          ? undefined
          : <Link href="/operations/warranties/activate" className="button button-primary">تفعيل ضمان عميل</Link>}
      />

      <FilterBar label={isAdmin ? "البحث في سجل ضمانات العملاء" : "البحث في ضمانات المركز"}>
        <form method="get">
          <FilterGrid>
            <FilterField label="بحث مطابق" wide>
              <input
                name="q"
                type="search"
                defaultValue={search}
                placeholder="رقم الضمان أو Roll Serial أو VIN أو الهاتف"
                dir="auto"
                maxLength={80}
              />
            </FilterField>
            <FilterField label="حالة السجل">
              <select name="state" defaultValue={state}>
                <option value="">كل السجلات</option>
                <option value="issued">الضمانات الفعالة/المنتهية</option>
                <option value="voided_in_error">الملغاة كخطأ</option>
              </select>
            </FilterField>
            <FilterActions>
              <button type="submit" className="button button-primary">بحث</button>
              {filtersActive ? <Link href="/operations/warranties" className="button button-ghost">مسح</Link> : null}
            </FilterActions>
          </FilterGrid>
        </form>
      </FilterBar>

      {searchInvalid ? (
        <FeedbackBanner tone="warning">
          البحث الداخلي هنا مطابق وليس بحثًا جزئيًا. أدخل قيمة من 3 إلى 80 حرفًا: رقم ضمان، Roll Serial، VIN/شاسيه، أو رقم هاتف كامل.
        </FeedbackBanner>
      ) : null}

      {!searchInvalid && warranties.length === 0 ? (
        <EmptyState
          eyebrow="ضمانات العملاء"
          title={hasPrevious
            ? "لا توجد ضمانات في هذه الصفحة"
            : filtersActive
              ? "لم يتم العثور على ضمان مطابق"
              : isAdmin
                ? "لا توجد ضمانات عملاء مسجلة بعد"
                : "لم يتم تفعيل أي ضمان من هذا المركز بعد"}
          description={hasPrevious
            ? "ارجع للصفحة السابقة أو غيّر معايير البحث."
            : filtersActive
              ? "راجع القيمة المدخلة؛ البحث يطابق رقم الضمان أو الرول أو VIN أو الهاتف بدقة."
              : isAdmin
                ? "ستظهر هنا الضمانات بمجرد إصدارها من مراكز التركيب."
                : "ابدأ بتحديد رول مفتوح ومؤهل ثم سجّل بيانات العميل والسيارة."}
          action={hasPrevious
            ? <Link href={warrantiesHref(search, state, page - 1)} className="button button-ghost">الصفحة السابقة</Link>
            : filtersActive
              ? <Link href="/operations/warranties" className="button button-ghost">عرض كل الضمانات</Link>
              : isAdmin
                ? undefined
                : <Link href="/operations/warranties/activate" className="button button-primary">تفعيل أول ضمان</Link>}
        />
      ) : null}

      {!searchInvalid && warranties.length > 0 ? (
        <RecordList label={isAdmin ? "سجل ضمانات العملاء" : "سجل ضمانات المركز"}>
          {warranties.map((warranty) => {
            const facts = [
              { label: "المنتج", value: warranty.product_name },
              { label: "Roll Serial", value: warranty.roll_serial, dir: "ltr" as const },
              { label: "VIN / الشاسيه", value: warranty.vehicle_vin, dir: "ltr" as const },
              ...(isAdmin ? [{ label: "مركز التفعيل", value: warranty.activating_center_name }] : []),
              { label: "التفعيل", value: <LocalDateTime value={warranty.activated_at} /> },
              { label: "نهاية التغطية", value: <LocalDateTime value={warranty.coverage_expires_at} /> },
            ];

            return (
              <RecordItem
                key={warranty.warranty_id}
                kicker={<span dir="ltr">{warranty.warranty_number}</span>}
                title={warranty.customer_name}
                subtitle={`${warranty.vehicle_make} ${warranty.vehicle_model}`}
                facts={facts}
                status={warrantyStatus(warranty.derived_state)}
                actions={(
                  <Link href={`/operations/warranties/${warranty.warranty_id}`} className="button button-secondary">
                    فتح الضمان
                  </Link>
                )}
              />
            );
          })}
        </RecordList>
      ) : null}

      {!searchInvalid && warranties.length > 0 && (hasPrevious || hasNext) ? (
        <nav className="ui-pagination" aria-label={isAdmin ? "صفحات سجل ضمانات العملاء" : "صفحات ضمانات المركز"}>
          {hasPrevious ? (
            <Link href={warrantiesHref(search, state, page - 1)} className="button button-ghost">السابق</Link>
          ) : <span />}
          <span>صفحة {page.toLocaleString("en-US")}</span>
          {hasNext ? (
            <Link href={warrantiesHref(search, state, page + 1)} className="button button-ghost">التالي</Link>
          ) : <span />}
        </nav>
      ) : null}
    </>
  );
}
