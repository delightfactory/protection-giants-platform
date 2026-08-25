import { notFound, redirect } from "next/navigation";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { LocalDateTime } from "@/components/ui/local-date-time";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { TaskBackLink } from "@/components/ui/task-back-link";
import { requireOperationalProfile } from "@/lib/auth/operational-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import styles from "./warranty-detail.module.css";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type WarrantyDetailPageProps = {
  params: Promise<{ id: string }>;
};

function statusBadge(state: string) {
  if (state === "active") return <StatusBadge tone="success">ساري</StatusBadge>;
  if (state === "expired") return <StatusBadge tone="warning">منتهي</StatusBadge>;
  if (state === "voided") return <StatusBadge tone="danger">ملغى كخطأ</StatusBadge>;
  return <StatusBadge>غير معروف</StatusBadge>;
}

export default async function WarrantyDetailPage({ params }: WarrantyDetailPageProps) {
  const profile = await requireOperationalProfile();
  if (profile.role !== "center") redirect("/access-denied");

  const { id } = await params;
  if (!uuidPattern.test(id)) notFound();

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_internal_warranty_detail", { p_warranty_id: id });

  if (error) {
    if (error.message === "PG_WARRANTY_NOT_FOUND") notFound();
    if (error.message === "PG_WARRANTY_CENTER_INACTIVE" || error.message === "PG_WARRANTY_FORBIDDEN") {
      redirect("/access-denied");
    }
    throw error;
  }

  if (!data || data.length !== 1) notFound();
  const warranty = data[0];

  return (
    <>
      <PageHeader
        eyebrow="ضمانات العملاء"
        title={warranty.warranty_number}
        description="السجل الداخلي للضمان كما تم تثبيته وقت التفعيل. بيانات المنتج وسياسة الضمان والتوقيتات الأساسية لا يعاد كتابتها لاحقًا."
        meta={`العميل: ${warranty.customer_name}`}
        actions={<TaskBackLink href="/operations/warranties" label="العودة إلى الضمانات" />}
      />

      <div className={styles.stack}>
        {warranty.derived_state === "voided" ? (
          <FeedbackBanner tone="warning">
            هذا سجل تاريخي لتفعيل أُلغي كخطأ إداري، ولم يعد ضمانًا فعّالًا. يظل السجل ورقم الضمان محفوظين للمراجعة والتدقيق.
          </FeedbackBanner>
        ) : null}

        <section className={styles.card} aria-label="حالة الضمان">
          <div className={styles.header}>
            <div>
              <span className={styles.eyebrow}>الحالة</span>
              <h2>{statusBadge(warranty.derived_state)}</h2>
            </div>
          </div>
          <dl className={styles.grid}>
            <div><dt>رقم الضمان</dt><dd dir="ltr">{warranty.warranty_number}</dd></div>
            <div><dt>وقت التفعيل</dt><dd><LocalDateTime value={warranty.activated_at} /></dd></div>
            <div><dt>نهاية التغطية</dt><dd><LocalDateTime value={warranty.coverage_expires_at} /></dd></div>
            <div><dt>مدة الضمان</dt><dd>{warranty.warranty_months} شهر</dd></div>
          </dl>
        </section>

        <section className={styles.card} aria-label="بيانات العميل">
          <div className={styles.header}><h2>العميل</h2></div>
          <dl className={styles.grid}>
            <div><dt>الاسم الكامل</dt><dd>{warranty.customer_name}</dd></div>
            <div><dt>الهاتف</dt><dd dir="ltr">{warranty.customer_phone}</dd></div>
            <div><dt>البريد الإلكتروني</dt><dd dir="ltr">{warranty.customer_email ?? "—"}</dd></div>
          </dl>
        </section>

        <section className={styles.card} aria-label="بيانات السيارة">
          <div className={styles.header}><h2>السيارة</h2></div>
          <dl className={styles.grid}>
            <div><dt>الماركة</dt><dd>{warranty.vehicle_make}</dd></div>
            <div><dt>الموديل</dt><dd>{warranty.vehicle_model}</dd></div>
            <div><dt>VIN / رقم الشاسيه</dt><dd dir="ltr">{warranty.vehicle_vin}</dd></div>
            <div><dt>سنة الموديل</dt><dd>{warranty.vehicle_year ?? "—"}</dd></div>
            <div><dt>رقم اللوحة</dt><dd>{warranty.vehicle_plate ?? "—"}</dd></div>
            <div><dt>اللون</dt><dd>{warranty.vehicle_color ?? "—"}</dd></div>
          </dl>
        </section>

        <section className={styles.card} aria-label="المنتج والرول">
          <div className={styles.header}><h2>المنتج والرول</h2></div>
          <dl className={styles.grid}>
            <div><dt>المنتج</dt><dd>{warranty.product_name}</dd></div>
            <div><dt>SKU</dt><dd dir="ltr">{warranty.product_code}</dd></div>
            <div><dt>الإصدار</dt><dd>{warranty.product_version ?? "—"}</dd></div>
            <div><dt>Roll Serial</dt><dd dir="ltr">{warranty.roll_serial}</dd></div>
            <div><dt>مركز التفعيل</dt><dd>{warranty.activating_center_name}</dd></div>
          </dl>
        </section>

        <section className={styles.card} aria-label="سياسة الضمان المثبتة">
          <div className={styles.header}>
            <div>
              <span className={styles.eyebrow}>Snapshot وقت التفعيل</span>
              <h2>سياسة الضمان والعناية</h2>
            </div>
          </div>
          <div className={styles.prose}>
            <h3>التغطية</h3>
            <p>{warranty.warranty_coverage}</p>
            <h3>تعليمات العناية</h3>
            <p>{warranty.care_instructions}</p>
          </div>
        </section>

        <FeedbackBanner tone="info">
          المركز لا يستطيع تعديل بيانات هذا الضمان أو إلغاءه من هذه الشاشة. التصحيحات الحقيقية بعد التفعيل لها مسار Admin مسجل في سجل التدقيق.
        </FeedbackBanner>
      </div>
    </>
  );
}
