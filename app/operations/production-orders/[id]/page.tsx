import Link from "next/link";
import { notFound } from "next/navigation";
import { voidProductionOrder } from "@/app/operations/production-orders/actions";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { PageHeader } from "@/components/ui/page-header";
import { RecordItem, RecordList } from "@/components/ui/record-list";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ProductionOrderDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; status?: string }>;
};

const errorMessages: Record<string, string> = {
  "void-invalid": "اكتب سببًا واضحًا للإبطال من 5 إلى 500 حرف.",
  "void-failed": "تعذر إبطال أمر الإنتاج. لم تتغير بيانات الأمر أو هويات اللفات.",
};

function cairoDateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export default async function ProductionOrderDetailPage({ params, searchParams }: ProductionOrderDetailPageProps) {
  await requireAdminProfile();
  const [{ id }, feedback] = await Promise.all([params, searchParams]);
  if (!uuidPattern.test(id)) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: order, error } = await supabase
    .from("production_orders")
    .select("id, order_number, product_id, production_date, source_reference, notes, total_rolls, created_by, created_at, status, void_reason, voided_by, voided_at, product_code_snapshot, product_name_snapshot, product_version_snapshot, width_mm_snapshot, length_m_snapshot, thickness_mil_snapshot, weight_kg_snapshot, origin_country_snapshot")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!order) notFound();

  const [creatorResult, lotsResult, rollsResult] = await Promise.all([
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

  if (creatorResult.error) throw creatorResult.error;
  if (lotsResult.error) throw lotsResult.error;
  if (rollsResult.error) throw rollsResult.error;

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
  const rolls = rollsResult.data;
  const lotById = new Map(lots.map((lot) => [lot.id, lot]));
  const isVoided = order.status === "voided";

  return (
    <>
      <PageHeader
        eyebrow="أمر إنتاج"
        title={<span dir="ltr">{order.order_number}</span>}
        description={`${order.product_code_snapshot} — ${order.product_name_snapshot}`}
        meta={`${order.total_rolls.toLocaleString("en-US")} لفة · ${lots.length} Lot`}
        actions={
          <>
            <Link href="/operations/production-orders" className="button button-ghost">كل الأوامر</Link>
            <Link href={`/operations/rolls?order=${order.id}`} className="button button-ghost">كل اللفات</Link>
            <Link href={`/print/production-orders/${order.id}`} className="button button-primary">طباعة الأمر</Link>
          </>
        }
      />

      {feedback.status === "voided" ? (
        <FeedbackBanner tone="success">تم إبطال أمر الإنتاج مع الاحتفاظ بالسجل والـLots وهويات اللفات للتدقيق.</FeedbackBanner>
      ) : null}
      {feedback.status === "recovered" ? (
        <FeedbackBanner tone="success">تم العثور على أمر الإنتاج الذي نُفذ أثناء المحاولة السابقة. لم يتم إنشاء أمر أو سيريالات مكررة.</FeedbackBanner>
      ) : null}
      {feedback.error ? (
        <FeedbackBanner tone="error">{errorMessages[feedback.error] ?? errorMessages["void-failed"]}</FeedbackBanner>
      ) : null}

      {isVoided ? (
        <section className="production-void-audit" aria-label="بيانات إبطال أمر الإنتاج">
          <div>
            <span className="eyebrow">سجل تدقيق</span>
            <h2>أمر إنتاج مُبطل — غير صالح للاستخدام التشغيلي</h2>
            <p>{order.void_reason}</p>
          </div>
          <dl>
            <div><dt>أبطله</dt><dd>{voidedByName ?? "—"}</dd></div>
            <div><dt>وقت الإبطال</dt><dd dir="ltr">{cairoDateTime(order.voided_at)} Cairo</dd></div>
          </dl>
        </section>
      ) : null}

      <section className="production-order-overview">
        <div className="production-order-overview-head">
          <div>
            <span className="eyebrow">ملخص الأمر</span>
            <h2>{order.product_name_snapshot}</h2>
            <p>{isVoided
              ? "الهويات المولّدة محفوظة للتدقيق ولن يعاد استخدامها، لكن الأمر غير صالح لأي حركة تشغيلية لاحقة."
              : "أمر مولّد ومعتمد داخل النظام؛ لا يوجد تعديل مباشر بعد توليد هويات اللفات."}</p>
          </div>
          <StatusBadge tone={isVoided ? "danger" : "success"}>{isVoided ? "أمر مُبطل" : "تم التوليد"}</StatusBadge>
        </div>

        <dl className="production-order-facts">
          <div><dt>SKU وقت الإنتاج</dt><dd dir="ltr">{order.product_code_snapshot}</dd></div>
          <div><dt>تاريخ الإنتاج</dt><dd dir="ltr">{order.production_date}</dd></div>
          <div><dt>عدد اللفات</dt><dd dir="ltr">{order.total_rolls.toLocaleString("en-US")}</dd></div>
          <div><dt>عدد الـLots</dt><dd dir="ltr">{lots.length.toLocaleString("en-US")}</dd></div>
          <div><dt>الإصدار / الموديل</dt><dd>{order.product_version_snapshot ?? "—"}</dd></div>
          <div><dt>المقاس الاسمي</dt><dd dir="ltr">{`${order.width_mm_snapshot} mm × ${order.length_m_snapshot} m`}</dd></div>
          <div><dt>السمك</dt><dd dir="ltr">{`${order.thickness_mil_snapshot} mil`}</dd></div>
          <div><dt>الوزن الاسمي</dt><dd dir="ltr">{`${order.weight_kg_snapshot} kg`}</dd></div>
          <div><dt>بلد المنشأ</dt><dd>{order.origin_country_snapshot}</dd></div>
          <div><dt>مرجع المصدر</dt><dd dir="ltr">{order.source_reference ?? "—"}</dd></div>
          <div><dt>أنشأه</dt><dd>{creator?.display_name ?? "—"}</dd></div>
          <div><dt>وقت الإنشاء</dt><dd dir="ltr">{cairoDateTime(order.created_at)} Cairo</dd></div>
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

      {!isVoided ? (
        <section className="production-void-panel">
          <div>
            <span className="eyebrow">تصحيح تشغيلي</span>
            <h2>إبطال أمر الإنتاج</h2>
            <p>استخدم الإبطال فقط إذا كان الأمر أُنشئ بالخطأ أو لم يمثل إنتاجًا فعليًا. لا يتم حذف الأمر أو إعادة استخدام سيريالاته بعد الإبطال.</p>
          </div>
          <form action={voidProductionOrder} className="production-void-form">
            <input type="hidden" name="order_id" value={order.id} />
            <label>
              <span>سبب الإبطال</span>
              <textarea name="reason" minLength={5} maxLength={500} rows={3} required placeholder="مثال: تم اختيار المنتج الخطأ ولم يبدأ الإنتاج الفعلي." />
            </label>
            <ConfirmSubmitButton
              title="إبطال أمر الإنتاج؟"
              description={`سيصبح ${order.order_number} غير صالح تشغيليًا مع بقاء كل الـLots والسيريالات محفوظة للتدقيق. لا يمكن التراجع عن الإبطال.`}
              confirmLabel="تأكيد إبطال الأمر"
              tone="danger"
            >
              إبطال أمر الإنتاج
            </ConfirmSubmitButton>
          </form>
        </section>
      ) : null}
    </>
  );
}
