import Link from "next/link";
import { notFound } from "next/navigation";
import { BusinessDate } from "@/components/ui/business-date";
import { LocalDateTime } from "@/components/ui/local-date-time";
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
    .select("id, order_number, product_id, production_date, source_reference, notes, total_rolls, created_by, created_at, status, void_reason, voided_by, voided_at, product_code_snapshot, product_name_snapshot, product_version_snapshot, width_mm_snapshot, length_m_snapshot, thickness_mil_snapshot, weight_kg_snapshot, origin_country_snapshot")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!order) notFound();

  const [creatorResult, lotsResult] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", order.created_by).maybeSingle(),
    supabase
      .from("production_lots")
      .select("lot_sequence, lot_number, source_lot_reference, roll_count")
      .eq("production_order_id", order.id)
      .order("lot_sequence", { ascending: true }),
  ]);

  if (creatorResult.error) throw creatorResult.error;
  if (lotsResult.error) throw lotsResult.error;

  let voidedByName: string | null = null;
  if (order.voided_by) {
    const { data: voider, error: voiderError } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", order.voided_by)
      .maybeSingle();
    if (voiderError) throw voiderError;
    voidedByName = voider?.display_name ?? null;
  }

  const creator = creatorResult.data;
  const lots = lotsResult.data;
  const isVoided = order.status === "voided";

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

        {isVoided ? (
          <section className={styles.voidBanner}>
            <strong>أمر إنتاج مُبطل — غير صالح للاستخدام التشغيلي</strong>
            <p>{order.void_reason}</p>
            <small>
              أبطله: {voidedByName ?? "—"} · <LocalDateTime value={order.voided_at} />
            </small>
          </section>
        ) : null}

        <section className={styles.title}>
          <h1>أمر إنتاج أفلام حماية الطلاء</h1>
          <p>{order.product_code_snapshot} — {order.product_name_snapshot}</p>
        </section>

        <dl className={styles.facts}>
          <div className={styles.fact}><dt>SKU وقت الإنتاج</dt><dd dir="ltr">{order.product_code_snapshot}</dd></div>
          <div className={styles.fact}><dt>اسم المنتج وقت الإنتاج</dt><dd>{order.product_name_snapshot}</dd></div>
          <div className={styles.fact}><dt>الإصدار / الموديل</dt><dd>{order.product_version_snapshot ?? "—"}</dd></div>
          <div className={styles.fact}><dt>تاريخ الإنتاج</dt><dd><BusinessDate value={order.production_date} /></dd></div>
          <div className={styles.fact}><dt>إجمالي اللفات</dt><dd dir="ltr">{order.total_rolls.toLocaleString("en-US")}</dd></div>
          <div className={styles.fact}><dt>عدد الـLots</dt><dd dir="ltr">{lots.length.toLocaleString("en-US")}</dd></div>
          <div className={styles.fact}><dt>المقاس الاسمي</dt><dd dir="ltr">{`${order.width_mm_snapshot} mm × ${order.length_m_snapshot} m`}</dd></div>
          <div className={styles.fact}><dt>السمك</dt><dd dir="ltr">{`${order.thickness_mil_snapshot} mil`}</dd></div>
          <div className={styles.fact}><dt>الوزن الاسمي</dt><dd dir="ltr">{`${order.weight_kg_snapshot} kg`}</dd></div>
          <div className={styles.fact}><dt>بلد المنشأ</dt><dd>{order.origin_country_snapshot}</dd></div>
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
          تم إنشاء هذا الأمر آليًا داخل منصة {brandConfig.name} بتاريخ <LocalDateTime value={order.created_at} />. مواصفات المنتج أعلاه هي النسخة التاريخية المثبتة وقت التوليد، وهويات اللفات محفوظة في سجل اللفات المرتبط بالأمر.
        </footer>
      </article>
    </main>
  );
}
