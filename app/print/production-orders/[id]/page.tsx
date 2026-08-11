import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/ui/print-button";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
import { brandConfig } from "@/lib/brand-config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import styles from "./print.module.css";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PrintProductionOrderPageProps = {
  params: Promise<{ id: string }>;
};

export default async function PrintProductionOrderPage({ params }: PrintProductionOrderPageProps) {
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

  const [productResult, creatorResult, lotsResult] = await Promise.all([
    supabase
      .from("products")
      .select("code, name, version_name, width_mm, length_m, thickness_mil, weight_kg, origin_country")
      .eq("id", order.product_id)
      .maybeSingle(),
    supabase.from("profiles").select("display_name").eq("id", order.created_by).maybeSingle(),
    supabase
      .from("production_lots")
      .select("lot_sequence, lot_number, source_lot_reference, roll_count")
      .eq("production_order_id", order.id)
      .order("lot_sequence", { ascending: true }),
  ]);

  if (productResult.error) throw productResult.error;
  if (creatorResult.error) throw creatorResult.error;
  if (lotsResult.error) throw lotsResult.error;

  const product = productResult.data;
  const creator = creatorResult.data;
  const lots = lotsResult.data;
  const createdAt = new Date(order.created_at).toISOString().slice(0, 16).replace("T", " ");

  return (
    <main className={styles.screen}>
      <div className={styles.toolbar}>
        <Link href={`/operations/production-orders/${order.id}`} className="button button-ghost">العودة للأمر</Link>
        <PrintButton label="طباعة أمر الإنتاج" />
      </div>

      <article className={styles.sheet}>
        <header className={styles.header}>
          <div className={styles.brand}>
            <strong>{brandConfig.name}</strong>
            <span dir="ltr">{brandConfig.englishName}</span>
          </div>
          <div className={styles.orderIdentity}>
            <span className={styles.muted}>PRODUCTION ORDER</span>
            <strong>{order.order_number}</strong>
          </div>
        </header>

        <section className={styles.title}>
          <h1>أمر إنتاج أفلام حماية الطلاء</h1>
          <p>{product ? `${product.code} — ${product.name}` : "بيانات المنتج"}</p>
        </section>

        <dl className={styles.facts}>
          <div className={styles.fact}><dt>SKU</dt><dd dir="ltr">{product?.code ?? "—"}</dd></div>
          <div className={styles.fact}><dt>اسم المنتج</dt><dd>{product?.name ?? "—"}</dd></div>
          <div className={styles.fact}><dt>الإصدار / الموديل</dt><dd>{product?.version_name ?? "—"}</dd></div>
          <div className={styles.fact}><dt>تاريخ الإنتاج</dt><dd dir="ltr">{order.production_date}</dd></div>
          <div className={styles.fact}><dt>إجمالي اللفات</dt><dd dir="ltr">{order.total_rolls.toLocaleString("en-US")}</dd></div>
          <div className={styles.fact}><dt>عدد الـLots</dt><dd dir="ltr">{lots.length.toLocaleString("en-US")}</dd></div>
          <div className={styles.fact}><dt>المقاس الاسمي</dt><dd dir="ltr">{product?.width_mm && product?.length_m ? `${product.width_mm} mm × ${product.length_m} m` : "—"}</dd></div>
          <div className={styles.fact}><dt>السمك</dt><dd dir="ltr">{product?.thickness_mil ? `${product.thickness_mil} mil` : "—"}</dd></div>
          <div className={styles.fact}><dt>الوزن الاسمي</dt><dd dir="ltr">{product?.weight_kg ? `${product.weight_kg} kg` : "—"}</dd></div>
          <div className={styles.fact}><dt>بلد المنشأ</dt><dd>{product?.origin_country ?? "—"}</dd></div>
          <div className={styles.fact}><dt>مرجع المصدر</dt><dd dir="ltr">{order.source_reference ?? "—"}</dd></div>
          <div className={styles.fact}><dt>أنشأه</dt><dd>{creator?.display_name ?? "—"}</dd></div>
        </dl>

        <section className={styles.section}>
          <h2>تقسيم الـLots</h2>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>#</th>
                <th>رقم Lot بالنظام</th>
                <th>مرجع Lot من المصدر</th>
                <th>عدد اللفات</th>
              </tr>
            </thead>
            <tbody>
              {lots.map((lot) => (
                <tr key={lot.lot_number}>
                  <td dir="ltr">{lot.lot_sequence}</td>
                  <td dir="ltr">{lot.lot_number}</td>
                  <td dir="ltr">{lot.source_lot_reference ?? "—"}</td>
                  <td dir="ltr">{lot.roll_count.toLocaleString("en-US")}</td>
                </tr>
              ))}
              <tr>
                <th colSpan={3}>الإجمالي</th>
                <th dir="ltr">{order.total_rolls.toLocaleString("en-US")}</th>
              </tr>
            </tbody>
          </table>
        </section>

        {order.notes ? (
          <section className={styles.section}>
            <h2>ملاحظات</h2>
            <div className={styles.notes}>{order.notes}</div>
          </section>
        ) : null}

        <footer className={styles.footer}>
          تم إنشاء هذا الأمر آليًا داخل منصة {brandConfig.name} بتاريخ <span dir="ltr">{createdAt} UTC</span>. هويات اللفات محفوظة في سجل اللفات المرتبط بالأمر.
        </footer>
      </article>
    </main>
  );
}
