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

type ProductionOrdersPageProps = {
  searchParams: Promise<{ q?: string; product?: string; page?: string }>;
};

function parsePage(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, MAX_PAGE) : 1;
}

function registryHref(search: string, productFilter: string, page: number) {
  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (productFilter) params.set("product", productFilter);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `/operations/production-orders${query ? `?${query}` : ""}`;
}

export default async function ProductionOrdersPage({ searchParams }: ProductionOrdersPageProps) {
  await requireAdminProfile();
  const params = await searchParams;
  const search = (params.q ?? "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 60);
  const productFilter = uuidPattern.test(params.product ?? "") ? params.product ?? "" : "";
  const page = parsePage(params.page);
  const offset = (page - 1) * PAGE_SIZE;
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
    .order("order_number", { ascending: false });

  if (search) ordersQuery = ordersQuery.ilike("order_number", `%${search}%`);
  if (productFilter) ordersQuery = ordersQuery.eq("product_id", productFilter);

  const { data: orderRows, error } = await ordersQuery.range(offset, offset + PAGE_SIZE);
  if (error) throw error;

  const hasNext = orderRows.length > PAGE_SIZE;
  const orders = hasNext ? orderRows.slice(0, PAGE_SIZE) : orderRows;
  const hasPrevious = page > 1;
  const filtersActive = Boolean(search || productFilter);

  return (
    <>
      <PageHeader
        eyebrow="الإنتاج"
        title="أوامر الإنتاج"
        description="السجل المعتمد لأوامر إنتاج PPF والـLots واللفات الناتجة عنها."
        meta={`صفحة ${page.toLocaleString("en-US")} · ${orders.length.toLocaleString("en-US")} أمر${hasNext ? " · يوجد المزيد" : ""}`}
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
          title={hasPrevious ? "لا توجد أوامر في هذه الصفحة" : filtersActive ? "لا توجد نتائج مطابقة" : "لا توجد أوامر إنتاج بعد"}
          description={hasPrevious
            ? "ارجع للصفحة السابقة أو غيّر معايير البحث."
            : filtersActive ? "غيّر رقم الأمر أو المنتج ثم أعد المحاولة." : "أنشئ أول أمر إنتاج لتوليد الـLots واللفات وهوياتها التشغيلية."}
          action={hasPrevious
            ? <Link href={registryHref(search, productFilter, page - 1)} className="button button-ghost">الصفحة السابقة</Link>
            : filtersActive
              ? <Link href="/operations/production-orders" className="button button-ghost">عرض كل الأوامر</Link>
              : <Link href="/operations/production-orders/new" className="button button-primary">إنشاء أول أمر</Link>}
        />
      ) : (
        <>
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

          {(hasPrevious || hasNext) ? (
            <nav className="production-pagination" aria-label="صفحات أوامر الإنتاج">
              {hasPrevious ? <Link href={registryHref(search, productFilter, page - 1)} className="button button-ghost">السابق</Link> : <span />}
              <span>صفحة {page.toLocaleString("en-US")}</span>
              {hasNext ? <Link href={registryHref(search, productFilter, page + 1)} className="button button-ghost">التالي</Link> : <span />}
            </nav>
          ) : null}
        </>
      )}
    </>
  );
}
