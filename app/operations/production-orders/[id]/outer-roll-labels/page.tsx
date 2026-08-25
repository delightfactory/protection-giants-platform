import Link from "next/link";
import { notFound } from "next/navigation";

import { RollPrintPackPreview } from "@/components/labels/roll-print-pack-preview";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
import {
  OuterRollLabelPlanError,
  buildOuterRollLabelPlan,
  type OuterRollLabelSelection,
} from "@/lib/labels/outer-roll-label-plan";
import { loadOuterRollLabelSource } from "@/lib/labels/outer-roll-label-source.server";
import {
  OuterRollLabelRequestError,
  buildOuterRollLabelSearchParams,
  parseOuterRollLabelSelection,
} from "@/lib/labels/outer-roll-label-request";
import {
  RollPrintPackPlanError,
  buildRollPrintPackPlan,
  type RollPrintPackPlan,
} from "@/lib/labels/roll-print-pack-plan";
import {
  RollPrintPackSourceError,
  loadRollWarrantyPrintIdentities,
} from "@/lib/labels/roll-print-pack-source.server";
import { getPublicSiteOrigin } from "@/lib/public-site";
import styles from "./page.module.css";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SearchValue = string | string[] | undefined;
type RollPrintPackPageProps = {
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
  if (error instanceof RollPrintPackSourceError) {
    return "تعذر تجهيز Roll Print Pack لأن Public Warranty identity غير مكتملة لكل اللفات. تم إيقاف الطباعة لمنع إخراج Pack ناقص.";
  }
  if (error instanceof RollPrintPackPlanError) {
    return "تعذر تجميع Roll Print Pack لأن ربط إحدى اللفات بملصقاتها غير متسق.";
  }
  if (!(error instanceof OuterRollLabelPlanError)) {
    if (error instanceof Error && error.message.includes("NEXT_PUBLIC_SITE_URL")) {
      return "تعذر تجهيز Roll QR التشغيلي لأن عنوان الموقع العام غير مضبوط في البيئة الحالية.";
    }
    return "تعذر تجهيز Roll Print Pack من بيانات أمر الإنتاج الحالية.";
  }

  switch (error.code) {
    case "order-not-generated":
      return "أمر الإنتاج غير صالح للطباعة التشغيلية. الأوامر المبطلة لا يمكن إصدار Packs لفاتها.";
    case "missing-gtin":
      return "المنتج لا يحتوي GTIN رسميًا بعد. أضف GTIN الصحيح للمنتج قبل إصدار الطباعة.";
    case "invalid-gtin":
      return "GTIN المسجل للمنتج غير صالح قياسيًا. صححه قبل إصدار الطباعة.";
    case "source-incomplete":
      return "بيانات اللفات المحملة لا تطابق إجمالي أمر الإنتاج والـLots. تم إيقاف الطباعة لمنع إخراج ملف ناقص.";
    case "selection-not-found":
    case "invalid-range":
      return "اختيار اللفات غير صالح لهذا أمر الإنتاج. راجع الـLot أو حدود النطاق.";
    default:
      return error.message;
  }
}

function selectionLabel(selection: OuterRollLabelSelection, plan: RollPrintPackPlan) {
  if (selection.mode === "order") return `كل أمر الإنتاج — ${plan.packCount.toLocaleString("en-US")} Roll Pack`;
  if (selection.mode === "lot") return `Lot محدد — ${plan.packCount.toLocaleString("en-US")} Roll Pack`;
  return `نطاق Rolls — ${plan.packCount.toLocaleString("en-US")} Roll Pack`;
}

export default async function RollPrintPackPage({ params, searchParams }: RollPrintPackPageProps) {
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
  let plan: RollPrintPackPlan | null = null;
  let blockingMessage: string | null = null;

  try {
    selection = parseOuterRollLabelSelection(requestValues);
    const outerPlan = buildOuterRollLabelPlan({
      publicSiteOrigin: getPublicSiteOrigin(),
      product: source.product,
      order: source.order,
      lots: source.lots,
      rolls: source.rolls,
      selection,
    });
    const warrantyIdentities = await loadRollWarrantyPrintIdentities(
      source.order.id,
      source.rolls.map((roll) => roll.id),
    );
    plan = buildRollPrintPackPlan({ outerPlan, warrantyIdentities });
  } catch (error) {
    blockingMessage = planErrorMessage(error);
  }

  const firstPreview = plan?.chunks[0]?.packs[0] ?? null;

  return (
    <>
      <PageHeader
        eyebrow="طباعة اللفات"
        title="Roll Print Pack"
        description={`${source.order.orderNumber} · ${source.order.productCodeSnapshot} — ${source.order.productNameSnapshot}`}
        meta="V1 · كل Roll = Outer ×2 + Warranty ×3 · الأبعاد المادية النهائية Pending Validation"
        actions={
          <Link href={`/operations/production-orders/${source.order.id}`} className="button button-ghost">
            العودة لأمر الإنتاج
          </Link>
        }
      />

      {blockingMessage ? <FeedbackBanner tone="error">{blockingMessage}</FeedbackBanner> : null}

      <section className={styles.readiness} aria-label="جاهزية Roll Print Pack">
        <div>
          <span className="eyebrow">Preflight</span>
          <h2>Pack كامل لكل Roll</h2>
          <p>الـOuter يعتمد Snapshot الإنتاج وRoll Serial، والـWarranty QR يعتمد Public Code الدائم لنفس الـRoll. لا يخرج أي Pack إذا كانت إحدى الهويتين ناقصة.</p>
        </div>
        <dl>
          <div><dt>حالة الأمر</dt><dd>{source.order.status === "generated" ? "Generated" : source.order.status}</dd></div>
          <div><dt>GTIN</dt><dd dir="ltr">{source.product.gtin ?? "—"}</dd></div>
          <div><dt>إجمالي Rolls</dt><dd dir="ltr">{source.order.totalRolls.toLocaleString("en-US")}</dd></div>
          <div><dt>قطع لكل Roll</dt><dd dir="ltr">5</dd></div>
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
            <h2>حدد نطاق إصدار الـPacks</h2>
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
                <h2>Roll واحد كـPack كامل قبل القص</h2>
              </div>
              <span dir="ltr">{firstPreview.rollSerial}</span>
            </div>
            <RollPrintPackPreview pack={firstPreview} packOrdinal={1} totalPackCount={plan.packCount} />
            <p className={styles.note}>الـPDF يحافظ على نفس التجميع: صف Outer ×2، وصف Warranty ×3، مع Guide واضح للرول خارج مناطق القص. المقاسات الحالية Proof فقط حتى اختبار الماكينة والخامة فعليًا.</p>
          </section>

          <section className={styles.outputSection}>
            <div className={styles.sectionHeading}>
              <div>
                <span className="eyebrow">الإخراج</span>
                <h2>ملفات PDF مقسمة فقط بين Packs كاملة</h2>
              </div>
              <strong>{plan.physicalLabelCount.toLocaleString("en-US")} قطعة</strong>
            </div>

            <div className={styles.outputFacts}>
              <div><span>Roll Packs</span><strong dir="ltr">{plan.packCount.toLocaleString("en-US")}</strong></div>
              <div><span>Outer / Roll</span><strong dir="ltr">2</strong></div>
              <div><span>Warranty / Roll</span><strong dir="ltr">3</strong></div>
              <div><span>عدد الملفات</span><strong dir="ltr">{plan.chunks.length.toLocaleString("en-US")}</strong></div>
            </div>

            <FeedbackBanner tone="info">
              الـMaster Pack الحالي مخصص للتحقق والتنظيم: صفحة واحدة لكل Roll، ولا يتم تقسيم Roll بين ملفين. الـWarranty QR داخل كل Pack يستخدم دائمًا protectiongiants.com، بينما الـOuter Roll QR يظل QR تشغيليًا منفصلًا كما هو. الـimposition النهائي للماكينة/RIP مؤجل فقط حتى استلام مواصفات الطابعة والخامة واختبارها.
            </FeedbackBanner>

            <div className={styles.chunkList}>
              {plan.chunks.map((chunk) => {
                const params = buildOuterRollLabelSearchParams(selection, chunk.chunkNumber);
                return (
                  <div key={chunk.chunkNumber} className={styles.chunkCard}>
                    <div>
                      <span>ملف {chunk.chunkNumber.toLocaleString("en-US")} / {plan.chunks.length.toLocaleString("en-US")}</span>
                      <strong>{chunk.packCount.toLocaleString("en-US")} Roll Pack · {chunk.physicalLabelCount.toLocaleString("en-US")} قطعة</strong>
                      <small dir="ltr">{chunk.firstRollSerial} → {chunk.lastRollSerial}</small>
                    </div>
                    <a
                      href={`/print/production-orders/${source.order.id}/outer-roll-labels?${params.toString()}`}
                      className="button button-primary"
                    >
                      تنزيل Roll Pack PDF
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
