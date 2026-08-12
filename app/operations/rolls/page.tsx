import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterActions, FilterBar, FilterField, FilterGrid } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { RecordItem, RecordList } from "@/components/ui/record-list";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 100;
const MAX_PAGE = 100000;

type RollsPageProps = {
  searchParams: Promise<{ q?: string; order?: string; page?: string }>;
};

const orderFields = "id, order_number, production_date, product_id, product_code_snapshot, product_name_snapshot, status";

function parsePage(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, MAX_PAGE) : 1;
}

function rollsHref(search: string, orderFilter: string, page: number) {
  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (orderFilter) params.set("order", orderFilter);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `/operations/rolls${query ? `?${query}` : ""}`;
}

export default async function RollsPage({ searchParams }: RollsPageProps) {
  await requireAdminProfile();
  const params = await searchParams;
  const search = (params.q ?? "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 80);
  const orderFilter = uuidPattern.test(params.order ?? "") ? params.order ?? "" : "";
  const page = parsePage(params.page);
  const offset = (page - 1) * PAGE_SIZE;
  const supabase = await createSupabaseServerClient();

  const { data: recentOrders, error: ordersError } = await supabase
    .from("production_orders")
    .select(orderFields)
    .order("created_at", { ascending: false })
    .order("order_number", { ascending: false })
    .limit(100);
  if (ordersError) throw ordersError;

  let rollsQuery = supabase
    .from("rolls")
    .select("id, product_id, production_order_id, production_lot_id, roll_index, serial_number, erp_serial, created_at")
    .order("created_at", { ascending: false })
    .order("serial_number", { ascending: true });

  if (search) {
    rollsQuery = rollsQuery.or(`serial_number.ilike.%${search}%,erp_serial.ilike.%${search}%`);
  }
  if (orderFilter) rollsQuery = rollsQuery.eq("production_order_id", orderFilter);

  const { data: rollRows, error } = await rollsQuery.range(offset, offset + PAGE_SIZE);
  if (error) throw error;

  const hasNext = rollRows.length > PAGE_SIZE;
  const rolls = hasNext ? rollRows.slice(0, PAGE_SIZE) : rollRows;
  const hasPrevious = page > 1;
  const lotIds = [...new Set(rolls.map((roll) => roll.production_lot_id))];
  const referencedOrderIds = [...new Set(rolls.map((roll) => roll.production_order_id))];
  const selectedOrderIsRecent = Boolean(orderFilter && recentOrders.some((order) => order.id === orderFilter));

  const [lotsResult, referencedOrdersResult, selectedOrderResult] = await Promise.all([
    lotIds.length
      ? supabase.from("production_lots").select("id, lot_number").in("id", lotIds)
      : Promise.resolve({ data: [], error: null }),
    referencedOrderIds.length
      ? supabase
          .from("production_orders")
          .select(orderFields)
          .in("id", referencedOrderIds)
      : Promise.resolve({ data: [], error: null }),
    orderFilter && !selectedOrderIsRecent
      ? supabase
          .from("production_orders")
          .select(orderFields)
          .eq("id", orderFilter)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (lotsResult.error) throw lotsResult.error;
  if (referencedOrdersResult.error) throw referencedOrdersResult.error;
  if (selectedOrderResult.error) throw selectedOrderResult.error;

  const allKnownOrders = [
    ...recentOrders,
    ...referencedOrdersResult.data,
    ...(selectedOrderResult.data ? [selectedOrderResult.data] : []),
  ];
  const ordersById = new Map(allKnownOrders.map((order) => [order.id, order]));
  const dropdownOrders = [...ordersById.values()]
    .sort((a, b) => b.production_date.localeCompare(a.production_date) || b.order_number.localeCompare(a.order_number))
    .slice(0, selectedOrderResult.data ? 101 : 100);
  const lotsById = new Map(lotsResult.data.map((lot) => [lot.id, lot]));
  const filtersActive = Boolean(search || orderFilter);

  return (
    <>
      <PageHeader
        eyebrow="الإنتاج"
        title="سجل اللفات"
        description="ابحث بالرقم الداخلي للفة أو ERP Serial، أو اعرض لفات أمر إنتاج محدد."
        meta={`صفحة ${page.toLocaleString("en-US")} · ${rolls.length.toLocaleString("en-US")} لفة${hasNext ? " · يوجد المزيد" : ""}`}
        actions={<Link href="/operations/production-orders" className="button button-ghost">أوامر الإنتاج</Link>}
      />

      <FilterBar label="البحث في اللفات">
        <form method="get">
          <FilterGrid>
            <FilterField label="Serial / ERP Serial" wide>
              <input name="q" type="search" defaultValue={search} placeholder="PG-R-... أو ERP-..." dir="ltr" />
            </FilterField>
            <FilterField label="أمر الإنتاج">
              <select name="order" defaultValue={orderFilter}>
                <option value="">كل الأوامر</option>
                {dropdownOrders.map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.order_number}{order.status === "voided" ? " — مُبطل" : ""}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterActions>
              <button type="submit" className="button button-primary">بحث</button>
              {filtersActive ? <Link href="/operations/rolls" className="button button-ghost">مسح</Link> : null}
            </FilterActions>
          </FilterGrid>
        </form>
      </FilterBar>

      {rolls.length === 0 ? (
        <EmptyState
          eyebrow="سجل اللفات"
          title={hasPrevious ? "لا توجد لفات في هذه الصفحة" : filtersActive ? "لم يتم العثور على لفة مطابقة" : "لا توجد لفات مولّدة بعد"}
          description={hasPrevious
            ? "ارجع للصفحة السابقة أو غيّر معايير البحث."
            : filtersActive ? "راجع الرقم أو أمر الإنتاج ثم أعد البحث." : "تظهر اللفات هنا تلقائيًا بعد إنشاء أول أمر إنتاج."}
          action={hasPrevious
            ? <Link href={rollsHref(search, orderFilter, page - 1)} className="button button-ghost">الصفحة السابقة</Link>
            : filtersActive
              ? <Link href="/operations/rolls" className="button button-ghost">عرض أحدث اللفات</Link>
              : <Link href="/operations/production-orders/new" className="button button-primary">إنشاء أمر إنتاج</Link>}
        />
      ) : (
        <>
          <RecordList label="قائمة اللفات">
            {rolls.map((roll) => {
              const order = ordersById.get(roll.production_order_id);
              const lot = lotsById.get(roll.production_lot_id);
              const isVoided = order?.status === "voided";

              return (
                <RecordItem
                  key={roll.id}
                  kicker={order ? <span dir="ltr">{order.product_code_snapshot}</span> : undefined}
                  title={<span dir="ltr">{roll.serial_number}</span>}
                  subtitle={order?.product_name_snapshot}
                  facts={[
                    { label: "ERP Serial", value: roll.erp_serial, dir: "ltr" },
                    { label: "Lot", value: lot?.lot_number ?? "—", dir: lot ? "ltr" : "rtl" },
                    { label: "أمر الإنتاج", value: order?.order_number ?? "—", dir: order ? "ltr" : "rtl" },
                    { label: "ترتيب اللفة", value: roll.roll_index.toLocaleString("en-US"), dir: "ltr" },
                  ]}
                  status={order ? <StatusBadge tone={isVoided ? "danger" : "success"}>{isVoided ? "أمر مُبطل" : "صالح تشغيليًا"}</StatusBadge> : undefined}
                  actions={order ? <Link href={`/operations/production-orders/${order.id}`} className="button button-ghost">فتح الأمر</Link> : undefined}
                />
              );
            })}
          </RecordList>

          {(hasPrevious || hasNext) ? (
            <nav className="production-pagination" aria-label="صفحات سجل اللفات">
              {hasPrevious ? <Link href={rollsHref(search, orderFilter, page - 1)} className="button button-ghost">السابق</Link> : <span />}
              <span>صفحة {page.toLocaleString("en-US")}</span>
              {hasNext ? <Link href={rollsHref(search, orderFilter, page + 1)} className="button button-ghost">التالي</Link> : <span />}
            </nav>
          ) : null}
        </>
      )}
    </>
  );
}
