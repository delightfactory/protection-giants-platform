import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterActions, FilterBar, FilterField, FilterGrid } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { RecordItem, RecordList } from "@/components/ui/record-list";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ProductionOrdersPageProps = {
  searchParams: Promise<{ q?: string; product?: string }>;
};

export default async function ProductionOrdersPage({ searchParams }: ProductionOrdersPageProps) {
  await requireAdminProfile();
  const params = await searchParams;
  const search = (params.q ?? "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 60);
  const productFilter = uuidPattern.test(params.product ?? "") ? params.product ?? "" : "";
  const supabase = await createSupabaseServerClient();

  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id, code, name")
    .order("name", { ascending: true });
  if (productsError) throw productsError;

  let ordersQuery = supabase
    .from("production_orders")
    .select("id, order_number, product_id, product_code_snapshot, product_name_snapshot, production_date, source_reference, total_rolls, status, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (search) ordersQuery = ordersQuery.ilike("order_number", `%${search}%`);
  if (productFilter) ordersQuery = ordersQuery.eq("product_id", productFilter);

  const { data: orders, error } = await ordersQuery;
  if (error) throw error;

  const filtersActive = Boolean(search || productFilter);

  return (
    <>
      <PageHeader
        eyebrow="الإنتاج"
        title="أوامر الإنتاج"
        description="السجل المعتمد لأوامر إنتاج PPF والـLots واللفات الناتجة عنها."
        meta={`أحدث ${orders.length} أمر مطابق`}
        actions={
          <>
            <Link href="/operations/rolls" className="button button-ghost">سجل اللفات</Link>
            <Link href="/operations/production-orders/new" className="button button-primary">أمر إنتاج جديد</Link>
          </>
        }
      />

      <FilterBar label="تصفية أوامر الإنتاج">
        <form method="get">
          <FilterGrid>
            <FilterField label="رقم أمر الإنتاج" wide>
              <input name="q" type="search" defaultValue={search} placeholder="PG-PO-..." dir="ltr" />
            </FilterField>
            <FilterField label="المنتج">
              <select name="product" defaultValue={productFilter}>
                <option value="">كل المنتجات</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>{product.code} — {product.name}</option>
                ))}
              </select>
            </FilterField>
            <FilterActions>
              <button type="submit" className="button button-primary">تطبيق</button>
              {filtersActive ? <Link href="/operations/production-orders" className="button button-ghost">مسح</Link> : null}
            </FilterActions>
          </FilterGrid>
        </form>
      </FilterBar>

      {orders.length === 0 ? (
        <EmptyState
          eyebrow="أوامر الإنتاج"
          title={filtersActive ? "لا توجد نتائج مطابقة" : "لا توجد أوامر إنتاج بعد"}
          description={filtersActive ? "غيّر رقم الأمر أو المنتج ثم أعد المحاولة." : "أنشئ أول أمر إنتاج لتوليد الـLots واللفات وهوياتها التشغيلية."}
          action={filtersActive
            ? <Link href="/operations/production-orders" className="button button-ghost">عرض كل الأوامر</Link>
            : <Link href="/operations/production-orders/new" className="button button-primary">إنشاء أول أمر</Link>}
        />
      ) : (
        <RecordList label="قائمة أوامر الإنتاج">
          {orders.map((order) => {
            const isVoided = order.status === "voided";
            return (
              <RecordItem
                key={order.id}
                kicker={<span dir="ltr">{order.order_number}</span>}
                title={order.product_name_snapshot}
                subtitle={<span dir="ltr">{order.product_code_snapshot}</span>}
                facts={[
                  { label: "تاريخ الإنتاج", value: order.production_date, dir: "ltr" },
                  { label: "عدد اللفات", value: order.total_rolls.toLocaleString("en-US"), dir: "ltr" },
                  { label: "مرجع المصدر", value: order.source_reference ?? "—", dir: order.source_reference ? "ltr" : "rtl" },
                ]}
                status={<StatusBadge tone={isVoided ? "danger" : "success"}>{isVoided ? "أمر مُبطل" : "تم التوليد"}</StatusBadge>}
                actions={
                  <>
                    <Link href={`/operations/production-orders/${order.id}`} className="button button-primary">فتح</Link>
                    <Link href={`/print/production-orders/${order.id}`} className="button button-ghost">طباعة</Link>
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
