/* eslint-disable @next/next/no-img-element */
import { notFound, redirect } from "next/navigation";
import { CenterClaimInspectionForm } from "@/components/claims/center-claim-inspection-form";
import { LocalDateTime } from "@/components/ui/local-date-time";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { TaskBackLink } from "@/components/ui/task-back-link";
import { requireOperationalProfile } from "@/lib/auth/operational-profile";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import styles from "./page.module.css";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVIDENCE_URL_TTL_SECONDS = 10 * 60;

type PageProps = {
  params: Promise<{ id: string }>;
};

function formatBytes(size: number) {
  if (size < 1024) return `${size.toLocaleString("en-US")} B`;
  const kib = size / 1024;
  if (kib < 1024) return `${kib.toFixed(kib >= 100 ? 0 : 1)} KB`;
  return `${(kib / 1024).toFixed(1)} MB`;
}

export default async function ClaimInspectionDetailPage({ params }: PageProps) {
  const profile = await requireOperationalProfile();
  if (profile.role !== "center") redirect("/access-denied");

  const { id } = await params;
  if (!UUID_PATTERN.test(id)) notFound();

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_center_claim_inspection_detail", {
    p_inspection_id: id,
  });
  if (error) {
    if (error.message === "PG_CLAIM_INSPECTION_CENTER_REQUIRED") redirect("/access-denied");
    if (error.message === "PG_CLAIM_INSPECTION_NOT_FOUND") notFound();
    throw error;
  }
  if (!data || data.length !== 1) notFound();
  const inspection = data[0];

  const evidenceResult = await supabase.rpc("list_warranty_claim_evidence_for_role", {
    p_claim_id: inspection.claim_id,
    p_inspection_id: inspection.inspection_id,
  });
  if (evidenceResult.error) {
    if (
      evidenceResult.error.message === "PG_CLAIM_INSPECTION_CENTER_REQUIRED"
      || evidenceResult.error.message === "PG_CLAIM_FORBIDDEN"
      || evidenceResult.error.message === "PG_CLAIM_INSPECTION_NOT_FOUND"
    ) notFound();
    throw evidenceResult.error;
  }

  const customerEvidenceMetadata = (evidenceResult.data ?? [])
    .filter((item) => item.evidence_scope === "customer_submission");
  const admin = createSupabaseAdminClient();
  const customerEvidence = await Promise.all(customerEvidenceMetadata.map(async (item, index) => {
    const { data: signed, error: signedError } = await admin.storage
      .from("warranty-claim-evidence")
      .createSignedUrl(item.storage_path, EVIDENCE_URL_TTL_SECONDS);
    return {
      ...item,
      displayOrder: index + 1,
      signedUrl: signedError ? null : signed.signedUrl,
    };
  }));

  const vehicle = [inspection.vehicle_make, inspection.vehicle_model, inspection.vehicle_year]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <PageHeader
        eyebrow="فحص مطالبة ضمان"
        title={inspection.claim_number}
        description="راجع المشكلة والأدلة المتاحة وسياق المنتج والسيارة، ثم سجّل الملاحظة الفنية لمركزك. بيانات اتصال العميل وقرار الشركة غير معروضين في هذه المهمة."
        meta={<span>طلب الفحص: <LocalDateTime value={inspection.requested_at} /></span>}
        actions={<TaskBackLink href="/operations/claim-inspections" label="العودة إلى الفحوصات" />}
      />

      <div className={styles.stack}>
        <section className={styles.card} aria-label="سياق الفحص">
          <div className={styles.heading}>
            <div><span className={styles.eyebrow}>المهمة الحالية</span><h2>{inspection.product_name}</h2></div>
            <StatusBadge tone="warning">فحص مطلوب</StatusBadge>
          </div>
          <dl className={styles.grid}>
            <div><dt>رقم المطالبة</dt><dd dir="ltr">{inspection.claim_number}</dd></div>
            <div><dt>طلب الفحص</dt><dd><LocalDateTime value={inspection.requested_at} /></dd></div>
            <div><dt>كود المنتج</dt><dd dir="ltr">{inspection.product_code}</dd></div>
            <div><dt>إصدار المنتج</dt><dd>{inspection.product_version ?? "—"}</dd></div>
            <div><dt>السيارة</dt><dd>{vehicle || "—"}</dd></div>
            <div><dt>رقم اللوحة</dt><dd>{inspection.vehicle_plate ?? "—"}</dd></div>
            <div><dt>اللون</dt><dd>{inspection.vehicle_color ?? "—"}</dd></div>
            <div><dt>VIN / الشاسيه</dt><dd dir="ltr">{inspection.vehicle_vin}</dd></div>
          </dl>
        </section>

        <section className={styles.card} aria-label="المشكلة المطلوب فحصها">
          <div className={styles.heading}><h2>المشكلة المبلغ عنها</h2></div>
          <dl className={styles.grid}>
            <div><dt>المنطقة المتأثرة</dt><dd>{inspection.affected_area}</dd></div>
          </dl>
          <div className={styles.prose}><h3>وصف المشكلة</h3><p>{inspection.description}</p></div>
        </section>

        <section className={styles.card} aria-label="سياق الضمان الفني">
          <div className={styles.heading}><h2>سياق المنتج والضمان</h2></div>
          <div className={styles.prose}>
            <h3>نطاق التغطية المثبت</h3><p>{inspection.warranty_coverage}</p>
            <h3>تعليمات العناية المثبتة</h3><p>{inspection.care_instructions}</p>
          </div>
        </section>

        <section className={styles.card} aria-label="صور العميل المتاحة للفحص">
          <div className={styles.heading}>
            <div><span className={styles.eyebrow}>دليل العميل</span><h2>الصور المرفقة بالمطالبة</h2></div>
            <span className={styles.count}>{customerEvidence.length.toLocaleString("en-US")} صورة</span>
          </div>
          {customerEvidence.length > 0 ? (
            <div className={styles.evidenceGrid}>
              {customerEvidence.map((item) => (
                <article className={styles.evidenceItem} key={`${item.storage_path}-${item.displayOrder}`}>
                  {item.signedUrl ? (
                    <a href={item.signedUrl} target="_blank" rel="noreferrer" className={styles.imageLink}>
                      <img src={item.signedUrl} alt={`صورة العميل ${item.displayOrder}`} loading="lazy" />
                    </a>
                  ) : <div className={styles.imageUnavailable}>تعذر إنشاء رابط عرض مؤقت</div>}
                  <div className={styles.evidenceMeta}>
                    <span>{item.mime_type}</span>
                    <span>{formatBytes(item.size_bytes)}</span>
                    <LocalDateTime value={item.created_at} />
                  </div>
                </article>
              ))}
            </div>
          ) : <p className={styles.muted}>لا توجد صور عميل متاحة لهذه المطالبة.</p>}
        </section>

        <CenterClaimInspectionForm inspectionId={inspection.inspection_id} />
      </div>
    </>
  );
}
