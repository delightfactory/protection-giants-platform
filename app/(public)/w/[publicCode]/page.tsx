import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import styles from "./page.module.css";
import {
  resolvePublicWarranty,
  type PublicWarrantyView,
} from "@/lib/warranty/public-warranty";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "التحقق من الضمان",
  description: "التحقق من حالة ضمان Protection Giants عبر رابط الضمان الرسمي.",
  referrer: "no-referrer",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

type PublicWarrantyPageProps = {
  params: Promise<{ publicCode: string }>;
};

const dateFormatter = new Intl.DateTimeFormat("ar-EG", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

function formatWarrantyDate(value: string) {
  return dateFormatter.format(new Date(value));
}

function stateCopy(view: Exclude<PublicWarrantyView, { kind: "not_found" }>) {
  switch (view.kind) {
    case "active":
      return {
        tone: "success",
        status: "ساري",
        eyebrow: "ضمان موثّق",
        title: "الضمان ساري",
        description: "تم التحقق من سجل الضمان الرسمي لدى Protection Giants.",
      } as const;
    case "expired":
      return {
        tone: "warning",
        status: "منتهي",
        eyebrow: "ضمان موثّق",
        title: "انتهت مدة الضمان",
        description: "هذا ضمان صحيح ومسجل، وقد انتهت مدة تغطيته المسجلة.",
      } as const;
    case "not_activated":
      return {
        tone: "accent",
        status: "غير مفعّل",
        eyebrow: "منتج مسجل",
        title: "لم يتم تفعيل الضمان بعد",
        description: "هذا المنتج أصلي ومسجل لدى Protection Giants، ولم يتم تفعيل ضمان العميل عليه حتى الآن.",
      } as const;
    case "no_current_warranty_after_void":
      return {
        tone: "neutral",
        status: "لا يوجد ضمان حالي",
        eyebrow: "منتج مسجل",
        title: "لا يوجد ضمان حالي على هذا الرول",
        description: "هوية المنتج صحيحة ومسجلة، ولا يوجد حاليًا ضمان عميل فعلي مرتبط به.",
      } as const;
    case "unavailable_for_warranty":
      return {
        tone: "danger",
        status: "غير متاح",
        eyebrow: "منتج مسجل",
        title: "هذا الرول غير متاح لتفعيل الضمان",
        description: "هوية المنتج صحيحة ومسجلة، لكن هذا الرول غير متاح لتفعيل ضمان عميل عليه.",
      } as const;
    case "temporarily_unavailable":
      return {
        tone: "neutral",
        status: "غير متاح مؤقتًا",
        eyebrow: "التحقق من الضمان",
        title: "بيانات الضمان غير متاحة مؤقتًا",
        description: "تعذر إكمال التحقق الآن. استخدم نفس الرابط مرة أخرى لاحقًا.",
      } as const;
  }
}

function WarrantyFacts({ view }: { view: Extract<PublicWarrantyView, { kind: "active" | "expired" }> }) {
  return (
    <dl className={styles.facts} aria-label="بيانات الضمان">
      <div className={`${styles.fact} ${styles.reference}`}>
        <dt>رقم الضمان</dt>
        <dd><bdi dir="ltr">{view.warrantyNumber}</bdi></dd>
      </div>
      <div className={styles.fact}>
        <dt>المنتج</dt>
        <dd dir="auto">{view.productName}</dd>
      </div>
      <div className={styles.fact}>
        <dt>تاريخ التفعيل</dt>
        <dd>{formatWarrantyDate(view.activatedAt)}</dd>
      </div>
      <div className={styles.fact}>
        <dt>نهاية التغطية</dt>
        <dd>{formatWarrantyDate(view.coverageExpiresAt)}</dd>
      </div>
      <div className={styles.fact}>
        <dt>مركز التركيب</dt>
        <dd dir="auto">{view.activatingCenterName}</dd>
      </div>
      <div className={styles.fact}>
        <dt>السيارة</dt>
        <dd dir="auto">
          {view.vehicleMake} {view.vehicleModel}
          {view.vehicleYear !== null ? ` · ${view.vehicleYear}` : ""}
        </dd>
      </div>
    </dl>
  );
}

function ProductIdentity({ productName }: { productName: string }) {
  return (
    <div className={styles.product}>
      <span>المنتج المسجل</span>
      <strong dir="auto">{productName}</strong>
    </div>
  );
}

export default async function PublicWarrantyPage({ params }: PublicWarrantyPageProps) {
  const { publicCode } = await params;
  const view = await resolvePublicWarranty(publicCode);

  if (view.kind === "not_found") notFound();

  const copy = stateCopy(view);
  const hasWarranty = view.kind === "active" || view.kind === "expired";
  const hasProduct =
    view.kind === "not_activated"
    || view.kind === "no_current_warranty_after_void"
    || view.kind === "unavailable_for_warranty";

  return (
    <section className={styles.page} aria-labelledby="warranty-public-title">
      <div className={styles.wrap}>
        <article className={`${styles.panel} ${styles[copy.tone]}`}>
          <header className={styles.header}>
            <div className={styles.heading}>
              <span className="eyebrow">{copy.eyebrow}</span>
              <h1 id="warranty-public-title">{copy.title}</h1>
              <p>{copy.description}</p>
            </div>
            <span className={`ui-status ui-status-${copy.tone}`}>{copy.status}</span>
          </header>

          {hasWarranty ? <WarrantyFacts view={view} /> : null}
          {hasProduct ? <ProductIdentity productName={view.productName} /> : null}

          {view.kind === "active" || view.kind === "expired" ? (
            <div className={styles.claimAction}>
              <div>
                <strong>{view.kind === "active" ? "تحتاج مساعدة تحت الضمان؟" : "لديك مطالبة مسجلة؟"}</strong>
                <p>
                  {view.kind === "active"
                    ? "يمكنك إرسال مطالبة ضمان بعد التحقق من رقم الهاتف المسجل."
                    : "يمكنك متابعة المطالبات السابقة بعد التحقق من رقم الهاتف المسجل."}
                </p>
              </div>
              <Link href={`/w/${publicCode}/claim`}>
                {view.kind === "active" ? "طلب خدمة الضمان" : "متابعة المطالبات"}
              </Link>
            </div>
          ) : null}

          <footer className={styles.trust}>
            <span className={styles.trustMark} aria-hidden="true">PG</span>
            <p>
              يتم عرض هذه الحالة مباشرة من سجل Protection Giants الرسمي عبر رابط الضمان المرتبط بالرول.
            </p>
          </footer>
        </article>
      </div>
    </section>
  );
}
