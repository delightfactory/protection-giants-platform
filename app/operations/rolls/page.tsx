import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterActions, FilterBar, FilterField, FilterGrid } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { RecordItem, RecordList } from "@/components/ui/record-list";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RollsPageProps = {
  searchParams: Promise<{ q?: string; order?: string }>;
};

export default async function RollsPage({ searchParams }: RollsPageProps) {
  await requireAdminProfile();
  const params = await searchParams;
  const search = (params.q ?? "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 80);
  const orderFilter = uuidPattern.test(params.order ?? "") ? params.order ?? "" : "";
  const supabase = await createSupabaseServerClient();

  const [{ data: products, error: productsError }, { data: orders, error: ordersError }] = await Promise.all([
    supabase.from("products").select("id, code, name").order("name", { ascending: true }),
    supabase
      .from("production_orders")
      .select("id, order_number, production_date, product_id")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  if (productsError) throw productsError;
  if (ordersError) throw ordersError;

  let rollsQuery = supabase
    .from("rolls")
    .select("id, product_id, production_order_id, production_lot_id, roll_index, serial_number, erp_serial, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (search) {
    rollsQuery = rollsQuery.or(`serial_number.ilike.%${search}%,erp_serial.ilike.%${search}%`);
  }
  if (orderFilter) rollsQuery = rollsQuery.eq("production_order_id", orderFilter);

  const { data: rolls, error } = await rollsQuery;
  if (error) throw error;

  const lotIds = [...new Set(rolls.map((roll) => roll.production_lot_id))];
  const lots = lotIds.length
    ? await supabase.from("production_lots").select("id, lot_number").in("id", lotIds)
    : { data: [], error: null };
  if (lots.error) throw lots.error;

  const productsById = new Map(products.map((product) => [product.id, product]));
  const ordersById = new Map(orders.map((order) => [order.id, order]));
  const lotsById = new Map((lots.data ?? []).map((lot) => [lot.id, lot]));
  const filtersActive = Boolean(search || orderFilter);

  return (
    <>
      <PageHeader
        eyebrow="الإنتاج"
        title="سجل اللفات"
        description="ابحث بالرقم الداخلي للفة أو ERP Serial، أو اعرض لفات أمر إنتاج محدد."
        meta={`${rolls.length} نتيجة · الحد الأقصى 100`}
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
                {orders.map((order) => (
                  <option key={order.id} value={order.id}>{order.order_number}</option>
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
          title={filtersActive ? "لم يتم العثور على لفة مطابقة" : "لا توجد لفات مولّدة بعد"}
          description={filtersActive ? "راجع الرقم أو أمر الإنتاج ثم أعد البحث." : "تظهر اللفات هنا تلقائيًا بعد إنشاء أول أمر إنتاج."}
          action={filtersActive
            ? <Link href="/operations/rolls" className="button button-ghost">عرض أحدث اللفات</Link>
            : <Link href="/operations/production-orders/new" className="button button-primary">إنشاء أمر إنتاج</Link>}
        />
      ) : (
        <RecordList label="قائمة اللفات">
          {rolls.map((roll) => {
            const product = productsById.get(roll.product_id);
            const order = ordersById.get(roll.production_order_id);
            const lot = lotsById.get(roll.production_lot_id);

            return (
              <RecordItem
                key={roll.id}
                kicker={product ? <span dir="ltr">{product.code}</span> : undefined}
                title={<span dir="ltr">{roll.serial_number}</span>}
                subtitle={product?.name}
                facts={[
                  { label: "ERP Serial", value: roll.erp_serial, dir: "ltr" },
                  { label: "Lot", value: lot?.lot_number ?? "—", dir: lot ? "ltr" : "rtl" },
                  { label: "أمر الإنتاج", value: order?.order_number ?? "—", dir: order ? "ltr" : "rtl" },
                  { label: "ترتيب اللفة", value: roll.roll_index.toLocaleString("en-US"), dir: "ltr" },
                ]}
                actions={order ? <Link href={`/operations/production-orders/${order.id}`} className="button button-ghost">فتح الأمر</Link> : undefined}
              />
            );
          })}
        </RecordList>
      )}
    </>
  );
}
