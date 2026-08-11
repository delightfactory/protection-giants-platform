import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { RecordItem, RecordList } from "@/components/ui/record-list";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ProductionOrderDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProductionOrderDetailPage({ params }: ProductionOrderDetailPageProps) {
  await requireAdminProfile();
  const { id } = await params;
  if (!uuidPattern.test(id)) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: order, error } = await supabase
    .from("production_orders")
    .select("id, order_number, product_id, production_date, source_reference, notes, total_rolls, created_by, created_at")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!order) notFound();

  const [productResult, creatorResult, lotsResult, rollsResult] = await Promise.all([
    supabase
      .from("products")
      .select("code, name, width_mm, length_m, thickness_mil, version_name")
      .eq("id", order.product_id)
      .maybeSingle(),
    supabase.from("profiles").select("display_name").eq("id", order.created_by).maybeSingle(),
    supabase
      .from("production_lots")
      .select("id, lot_number, lot_sequence, source_lot_reference, roll_count")
      .eq("production_order_id", order.id)
      .order("lot_sequence", { ascending: true }),
    supabase
      .from("rolls")
      .select("id, serial_number, erp_serial, roll_index, production_lot_id")
      .eq("production_order_id", order.id)
      .order("serial_number", { ascending: true })
      .limit(12),
  ]);

  if (productResult.error) throw productResult.error;
  if (creatorResult.error) throw creatorResult.error;
  if (lotsResult.error) throw lotsResult.error;
  if (rollsResult.error) throw rollsResult.error;

  const product = productResult.data;
  const creator = creatorResult.data;
  const lots = lotsResult.data;
  const rolls = rollsResult.data;
  const lotById = new Map(lots.map((lot) => [lot.id, lot]));

  return (
    <>
      <PageHeader
        eyebrow="أمر إنتاج"
        title={<span dir="ltr">{order.order_number}</span>}
        description={product ? `${product.code} — ${product.name}` : "تفاصيل أمر الإنتاج"}
        meta={`${order.total_rolls.toLocaleString("en-US")} لفة · ${lots.length} Lot`}
        actions={
          <>
            <Link href="/operations/production-orders" className="button button-ghost">كل الأوامر</Link>
            <Link href={`/operations/rolls?order=${order.id}`} className="button button-ghost">كل اللفات</Link>
            <Link href={`/print/production-orders/${order.id}`} className="button button-primary">طباعة الأمر</Link>
          </>
        }
      />

      <section className="production-order-overview">
        <div className="production-order-overview-head">
          <div>
            <span className="eyebrow">ملخص الأمر</span>
            <h2>{product?.name ?? "المنتج"}</h2>
            <p>أمر مولّد ومعتمد داخل النظام؛ لا يوجد تعديل مباشر بعد توليد هويات اللفات.</p>
          </div>
          <StatusBadge tone="success">تم التوليد</StatusBadge>
        </div>

        <dl className="production-order-facts">
          <div><dt>SKU</dt><dd dir="ltr">{product?.code ?? "—"}</dd></div>
          <div><dt>تاريخ الإنتاج</dt><dd dir="ltr">{order.production_date}</dd></div>
          <div><dt>عدد اللفات</dt><dd dir="ltr">{order.total_rolls.toLocaleString("en-US")}</dd></div>
          <div><dt>عدد الـLots</dt><dd dir="ltr">{lots.length.toLocaleString("en-US")}</dd></div>
          <div><dt>المقاس الاسمي</dt><dd dir="ltr">{product?.width_mm && product?.length_m ? `${product.width_mm} mm × ${product.length_m} m` : "—"}</dd></div>
          <div><dt>السمك</dt><dd dir="ltr">{product?.thickness_mil ? `${product.thickness_mil} mil` : "—"}</dd></div>
          <div><dt>مرجع المصدر</dt><dd dir="ltr">{order.source_reference ?? "—"}</dd></div>
          <div><dt>أنشأه</dt><dd>{creator?.display_name ?? "—"}</dd></div>
        </dl>

        {order.notes ? <p className="production-order-notes">{order.notes}</p> : null}
      </section>

      <section className="production-detail-section">
        <div className="production-section-heading">
          <div>
            <span className="eyebrow">التقسيم</span>
            <h2>Lots الأمر</h2>
          </div>
          <span>{lots.reduce((sum, lot) => sum + lot.roll_count, 0).toLocaleString("en-US")} لفة</span>
        </div>
        <RecordList label="Lots أمر الإنتاج">
          {lots.map((lot) => (
            <RecordItem
              key={lot.id}
              kicker={`Lot ${lot.lot_sequence}`}
              title={<span dir="ltr">{lot.lot_number}</span>}
              facts={[
                { label: "عدد اللفات", value: lot.roll_count.toLocaleString("en-US"), dir: "ltr" },
                { label: "مرجع المصدر", value: lot.source_lot_reference ?? "—", dir: lot.source_lot_reference ? "ltr" : "rtl" },
              ]}
            />
          ))}
        </RecordList>
      </section>

      <section className="production-detail-section">
        <div className="production-section-heading">
          <div>
            <span className="eyebrow">معاينة الهوية</span>
            <h2>أول {Math.min(12, order.total_rolls).toLocaleString("en-US")} لفة</h2>
          </div>
          <Link href={`/operations/rolls?order=${order.id}`} className="button button-ghost">فتح سجل اللفات</Link>
        </div>
        <RecordList label="معاينة لفات أمر الإنتاج">
          {rolls.map((roll) => {
            const lot = lotById.get(roll.production_lot_id);
            return (
              <RecordItem
                key={roll.id}
                kicker={lot ? <span dir="ltr">{lot.lot_number}</span> : undefined}
                title={<span dir="ltr">{roll.serial_number}</span>}
                facts={[
                  { label: "ERP Serial", value: roll.erp_serial, dir: "ltr" },
                  { label: "ترتيب داخل الـLot", value: roll.roll_index.toLocaleString("en-US"), dir: "ltr" },
                ]}
              />
            );
          })}
        </RecordList>
      </section>
    </>
  );
}
