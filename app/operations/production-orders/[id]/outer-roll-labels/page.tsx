import Link from "next/link";
import { notFound } from "next/navigation";

import { OuterRollLabelPreview } from "@/components/labels/outer-roll-label-preview";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
import {
  OuterRollLabelPlanError,
  buildOuterRollLabelPlan,
  type OuterRollLabelPlan,
  type OuterRollLabelSelection,
} from "@/lib/labels/outer-roll-label-plan";
import { loadOuterRollLabelSource } from "@/lib/labels/outer-roll-label-source.server";
import {
  OuterRollLabelRequestError,
  buildOuterRollLabelSearchParams,
  parseOuterRollLabelSelection,
} from "@/lib/labels/outer-roll-label-request";
import { getPublicSiteOrigin } from "@/lib/public-site";
import styles from "./page.module.css";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SearchValue = string | string[] | undefined;
type OuterRollLabelsPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    mode?: SearchValue;
    lot?: SearchValue;
    from?: SearchValue;
    to?: SearchValue;
  }>;
};

function first(value: SearchValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function planErrorMessage(error: unknown): string {
  if (error instanceof OuterRollLabelRequestError) return error.message;
  if (!(error instanceof OuterRollLabelPlanError)) {
    if (error instanceof Error && error.message.includes("NEXT_PUBLIC_SITE_URL")) {
      return "تعذر تجهيز Roll QR لأن عنوان الموقع العام غير مضبوط في البيئة الحالية.";
    }
    return "تعذر تجهيز الملصقات من بيانات أمر الإنتاج الحالية.";
  }

  switch (error.code) {
    case "order-not-generated":
      return "أمر الإنتاج غير صالح للطباعة التشغيلية. الأوامر المبطلة لا يمكن إصدار ملصقات لفاتها.";
    case "missing-gtin":
      return "المنتج لا يحتوي GTIN رسميًا بعد. أضف GTIN الصحيح للمنتج قبل إصدار الملصقات.";
    case "invalid-gtin":
      return "GTIN المسجل للمنتج غير صالح قياسيًا. صححه قبل إصدار الملصقات.";
    case "source-incomplete":
      return "بيانات اللفات المحملة لا تطابق إجمالي أمر الإنتاج والـLots. تم إيقاف الطباعة لمنع إخراج ملف ناقص.";
    case "selection-not-found":
    case "invalid-range":
      return "اختيار اللفات غير صالح لهذا أمر الإنتاج. راجع الـLot أو حدود النطاق.";
    default:
      return error.message;
  }
}

function selectionLabel(selection: OuterRollLabelSelection, plan: OuterRollLabelPlan) {
  if (selection.mode === "order") return `كل أمر الإنتاج — ${plan.rollCount.toLocaleString("en-US")} لفة`;
  if (selection.mode === "lot") return `Lot محدد — ${plan.rollCount.toLocaleString("en-US")} لفة`;
  return `نطاق Rolls — ${plan.rollCount.toLocaleString("en-US")} لفة`;
}

export default async function OuterRollLabelsPage({ params, searchParams }: OuterRollLabelsPageProps) {
  await requireAdminProfile();
  const [{ id }, rawSearch] = await Promise.all([params, searchParams]);
  if (!uuidPattern.test(id)) notFound();

  const source = await loadOuterRollLabelSource(id);
  if (!source) notFound();

  const requestValues = {
    mode: first(rawSearch.mode),
    lot: first(rawSearch.lot),
    from: first(rawSearch.from),
    to: first(rawSearch.to),
  };

  let selection: OuterRollLabelSelection = { mode: "order" };
  let plan: OuterRollLabelPlan | null = null;
  let blockingMessage: string | null = null;

  try {
    selection = parseOuterRollLabelSelection(requestValues);
    plan = buildOuterRollLabelPlan({
      publicSiteOrigin: getPublicSiteOrigin(),
      product: source.product,
      order: source.order,
      lots: source.lots,
      rolls: source.rolls,
      selection,
    });
  } catch (error) {
    blockingMessage = planErrorMessage(error);
  }

  const firstPreview = plan?.chunks[0]?.items[0] ?? null;

  return (
    <>
      <PageHeader
        eyebrow="ملصقات اللفات"
        title="Outer Roll Label"
        description={`${source.order.orderNumber} · ${source.order.productCodeSnapshot} — ${source.order.productNameSnapshot}`}
        meta="V1 · نسختان متطابقتان لكل Roll · 150×100 mm قيد التحقق المادي"
        actions={
          <Link href={`/operations/production-orders/${source.order.id}`} className="button button-ghost">
            العودة لأمر الإنتاج
          </Link>
        }
      />

      {blockingMessage ? (
        <FeedbackBanner tone="error">{blockingMessage}</FeedbackBanner>
      ) : null}

      <section className={styles.readiness} aria-label="جاهزية ملصقات اللفات">
        <div>
          <span className="eyebrow">Preflight</span>
          <h2>هوية المنتج وأمر الإنتاج</h2>
          <p>الطباعة تستخدم Snapshot الإنتاج للمواصفات، وGTIN الرسمي الحالي للمنتج، وRoll Serial المولّد داخل النظام.</p>
        </div>
        <dl>
          <div><dt>حالة الأمر</dt><dd>{source.order.status === "generated" ? "Generated" : source.order.status}</dd></div>
          <div><dt>GTIN</dt><dd dir="ltr">{source.product.gtin ?? "—"}</dd></div>
          <div><dt>إجمالي Rolls</dt><dd dir="ltr">{source.order.totalRolls.toLocaleString("en-US")}</dd></div>
          <div><dt>البيانات المحملة</dt><dd dir="ltr">{source.rolls.length.toLocaleString("en-US")}</dd></div>
        </dl>
        {!source.product.gtin ? (
          <Link href={`/operations/products/${source.product.id}/edit`} className="button button-ghost">
            إضافة GTIN للمنتج
          </Link>
        ) : null}
      </section>

      <section className={styles.selector}>
        <div className={styles.sectionHeading}>
          <div>
            <span className="eyebrow">اختيار اللفات</span>
            <h2>حدد نطاق الإصدار</h2>
          </div>
          {plan ? <strong>{selectionLabel(selection, plan)}</strong> : null}
        </div>

        <div className={styles.selectionGrid}>
          <Link
            href={`?${buildOuterRollLabelSearchParams({ mode: "order" }).toString()}`}
            className={`${styles.selectionCard} ${selection.mode === "order" ? styles.activeCard : ""}`}
          >
            <span>Whole Order</span>
            <strong>كل أمر الإنتاج</strong>
            <small>{source.order.totalRolls.toLocaleString("en-US")} Roll</small>
          </Link>

          <div className={styles.selectionCard}>
            <span>Lot</span>
            <strong>Lot واحد</strong>
            <div className={styles.lotLinks}>
              {source.lots.map((lot) => (
                <Link
                  key={lot.id}
                  href={`?${buildOuterRollLabelSearchParams({ mode: "lot", lotId: lot.id }).toString()}`}
                  className={selection.mode === "lot" && selection.lotId === lot.id ? styles.activeLot : undefined}
                >
                  <span dir="ltr">Lot {lot.lotSequence}</span>
                  <small>{lot.rollCount.toLocaleString("en-US")} Roll</small>
                </Link>
              ))}
            </div>
          </div>

          <form method="get" className={styles.selectionCard}>
            <input type="hidden" name="mode" value="roll-range" />
            <span>Roll Range</span>
            <strong>نطاق سيريالات</strong>
            <label>
              <span>من Roll</span>
              <input name="from" dir="ltr" required defaultValue={selection.mode === "roll-range" ? selection.fromSerial : ""} placeholder="PG-R-..." />
            </label>
            <label>
              <span>إلى Roll</span>
              <input name="to" dir="ltr" required defaultValue={selection.mode === "roll-range" ? selection.toSerial : ""} placeholder="PG-R-..." />
            </label>
            <button type="submit" className="button button-ghost">تطبيق النطاق</button>
          </form>
        </div>
      </section>

      {plan && firstPreview ? (
        <>
          <section className={styles.previewSection}>
            <div className={styles.sectionHeading}>
              <div>
                <span className="eyebrow">معاينة ممثلة</span>
                <h2>نفس V1 geometry المستخدمة في الـPDF</h2>
              </div>
              <span dir="ltr">{firstPreview.rollSerial}</span>
            </div>
            <OuterRollLabelPreview model={firstPreview} />
            <p className={styles.note}>المعاينة للتحقق البصري من المحتوى والترتيب. دقة المسح والمقاس النهائي لا تُعتمد إلا بعد اختبار طباعة ومسح حقيقي.</p>
          </section>

          <section className={styles.outputSection}>
            <div className={styles.sectionHeading}>
              <div>
                <span className="eyebrow">الإخراج</span>
                <h2>ملفات PDF محدودة الحجم</h2>
              </div>
              <strong>{plan.labelCount.toLocaleString("en-US")} ملصق</strong>
            </div>

            <div className={styles.outputFacts}>
              <div><span>Rolls المختارة</span><strong dir="ltr">{plan.rollCount.toLocaleString("en-US")}</strong></div>
              <div><span>نسخ لكل Roll</span><strong dir="ltr">2</strong></div>
              <div><span>Rolls لكل ملف</span><strong dir="ltr">حتى {plan.rollChunkSize.toLocaleString("en-US")}</strong></div>
              <div><span>عدد الملفات</span><strong dir="ltr">{plan.chunks.length.toLocaleString("en-US")}</strong></div>
            </div>

            <FeedbackBanner tone="info">
              لا يوجد Print Profile إنتاجي مجمّد للماكينة/RIP حتى الآن. لذلك كل ملف يخرج كصفحات Master مستقلة 150×100 mm، صفحة لكل نسخة، مع نسختين متتاليتين لكل Roll. الـsheet imposition النهائي يُجمّد فقط بعد معرفة الماكينة واختبارها فعليًا.
            </FeedbackBanner>

            <div className={styles.chunkList}>
              {plan.chunks.map((chunk) => {
                const params = buildOuterRollLabelSearchParams(selection, chunk.chunkNumber);
                return (
                  <div key={chunk.chunkNumber} className={styles.chunkCard}>
                    <div>
                      <span>ملف {chunk.chunkNumber.toLocaleString("en-US")} / {plan.chunks.length.toLocaleString("en-US")}</span>
                      <strong>{chunk.rollCount.toLocaleString("en-US")} Roll · {chunk.labelCount.toLocaleString("en-US")} صفحة/نسخة</strong>
                      <small dir="ltr">{chunk.firstRollSerial} → {chunk.lastRollSerial}</small>
                    </div>
                    <a
                      href={`/print/production-orders/${source.order.id}/outer-roll-labels?${params.toString()}`}
                      className="button button-primary"
                    >
                      تنزيل PDF
                    </a>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      ) : null}
    </>
  );
}
