/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { LocalDateTime } from "@/components/ui/local-date-time";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { TaskBackLink } from "@/components/ui/task-back-link";
import {
  actorKindLabel,
  claimStatusLabel,
  inspectionStatusLabel,
  resolutionStatusLabel,
  warrantyRecordStateLabel,
} from "@/lib/claims/ui-labels";
import { requireOperationalProfile } from "@/lib/auth/operational-profile";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import styles from "./claim-detail.module.css";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVIDENCE_URL_TTL_SECONDS = 10 * 60;

type ClaimDetailPageProps = {
  params: Promise<{ id: string }>;
};

function claimStatus(status: string) {
  if (status === "submitted") return <StatusBadge tone="accent">{claimStatusLabel(status)}</StatusBadge>;
  if (status === "under_review") return <StatusBadge tone="warning">{claimStatusLabel(status)}</StatusBadge>;
  if (status === "awaiting_inspection") return <StatusBadge tone="warning">{claimStatusLabel(status)}</StatusBadge>;
  if (status === "approved") return <StatusBadge tone="success">{claimStatusLabel(status)}</StatusBadge>;
  if (status === "rejected") return <StatusBadge tone="danger">{claimStatusLabel(status)}</StatusBadge>;
  if (status === "cancelled") return <StatusBadge tone="neutral">{claimStatusLabel(status)}</StatusBadge>;
  return <StatusBadge>{claimStatusLabel(status)}</StatusBadge>;
}

function categoryLabel(category: string) {
  const labels: Record<string, string> = {
    cracking: "تشققات",
    yellowing: "اصفرار",
    discoloration: "تغير لون",
    peeling: "تقشر",
    delamination: "انفصال طبقات",
    adhesive_issue: "مشكلة لاصق",
    bubbling: "فقاعات",
    other: "أخرى",
  };
  return labels[category] ?? "غير مصنف";
}

function eventLabel(kind: string) {
  const labels: Record<string, string> = {
    submitted: "إرسال المطالبة",
    review_started: "بدء المراجعة",
    inspection_requested: "طلب فحص بالمركز",
    inspection_reassigned: "إعادة تعيين مركز الفحص",
    inspection_submitted: "استلام نتيجة الفحص",
    approved: "قبول المطالبة",
    rejected: "رفض المطالبة",
    cancelled: "إلغاء المطالبة",
    approval_cancelled_before_execution: "إلغاء قبول قبل التنفيذ",
    decision_reopened_for_correction: "إعادة فتح القرار للتصحيح",
  };
  return labels[kind] ?? "حدث مسجل";
}

function inspectionStatus(status: string | null) {
  if (status === "requested") return <StatusBadge tone="warning">{inspectionStatusLabel(status)}</StatusBadge>;
  if (status === "submitted") return <StatusBadge tone="success">{inspectionStatusLabel(status)}</StatusBadge>;
  return <StatusBadge tone="neutral">{inspectionStatusLabel(status)}</StatusBadge>;
}

function resolutionStatus(status: string | null) {
  if (status === "authorized") return <StatusBadge tone="accent">{resolutionStatusLabel(status)}</StatusBadge>;
  if (status === "assigned") return <StatusBadge tone="warning">{resolutionStatusLabel(status)}</StatusBadge>;
  if (status === "completed") return <StatusBadge tone="success">{resolutionStatusLabel(status)}</StatusBadge>;
  if (status === "cancelled") return <StatusBadge tone="neutral">{resolutionStatusLabel(status)}</StatusBadge>;
  return <StatusBadge>{resolutionStatusLabel(status)}</StatusBadge>;
}

function formatBytes(size: number) {
  if (size < 1024) return `${size.toLocaleString("en-US")} B`;
  const kib = size / 1024;
  if (kib < 1024) return `${kib.toFixed(kib >= 100 ? 0 : 1)} KB`;
  return `${(kib / 1024).toFixed(1)} MB`;
}

export default async function ClaimDetailPage({ params }: ClaimDetailPageProps) {
  const profile = await requireOperationalProfile();
  if (profile.role !== "admin") redirect("/access-denied");

  const { id } = await params;
  if (!uuidPattern.test(id)) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: detailData, error: detailError } = await supabase.rpc("get_admin_warranty_claim_detail", {
    p_claim_id: id,
  });

  if (detailError) {
    if (detailError.message === "PG_CLAIM_NOT_FOUND") notFound();
    if (detailError.message === "PG_CLAIM_ADMIN_REQUIRED" || detailError.message === "PG_CLAIM_FORBIDDEN") {
      redirect("/access-denied");
    }
    throw detailError;
  }

  if (!detailData || detailData.length !== 1) notFound();
  const claim = detailData[0];

  const [timelineResult, historyResult, evidenceResult] = await Promise.all([
    supabase.rpc("list_admin_warranty_claim_timeline", { p_claim_id: claim.claim_id }),
    supabase.rpc("list_admin_warranty_claim_history", {
      p_warranty_id: claim.warranty_id,
      p_exclude_claim_id: claim.claim_id,
      p_limit: 10,
    }),
    supabase.rpc("list_warranty_claim_evidence_for_role", { p_claim_id: claim.claim_id }),
  ]);

  for (const result of [timelineResult, historyResult, evidenceResult]) {
    if (result.error) {
      if (result.error.message === "PG_CLAIM_ADMIN_REQUIRED" || result.error.message === "PG_CLAIM_FORBIDDEN") {
        redirect("/access-denied");
      }
      if (result.error.message === "PG_CLAIM_NOT_FOUND") notFound();
      throw result.error;
    }
  }

  const timeline = timelineResult.data ?? [];
  const history = historyResult.data ?? [];
  const evidenceMetadata = evidenceResult.data ?? [];
  const adminSupabase = createSupabaseAdminClient();
  const evidence = await Promise.all(evidenceMetadata.map(async (item, index) => {
    const { data, error } = await adminSupabase.storage
      .from("warranty-claim-evidence")
      .createSignedUrl(item.storage_path, EVIDENCE_URL_TTL_SECONDS);

    return {
      ...item,
      displayOrder: index + 1,
      signedUrl: error ? null : data.signedUrl,
    };
  }));

  const customerEvidence = evidence.filter((item) => item.evidence_scope === "customer_submission");
  const inspectionEvidence = evidence.filter((item) => item.evidence_scope === "inspection");

  return (
    <>
      <PageHeader
        eyebrow="مطالبات الضمان"
        title={claim.claim_number}
        description="سجل مراجعة المطالبة كما استلمته الشركة، مرتبط بالضمان الصحيح وسياسته المثبتة وقت التفعيل. هذه الشاشة للقراءة والمراجعة فقط في هذه المرحلة."
        meta={`الضمان: ${claim.warranty_number}`}
        actions={<TaskBackLink href="/operations/claims" label="العودة إلى المطالبات" />}
      />

      <div className={styles.stack}>
        {claim.claim_status === "approved" ? (
          <FeedbackBanner tone="success">تم قبول المطالبة، وتظل مفتوحة حتى اكتمال المعالجة المسندة وتنفيذها.</FeedbackBanner>
        ) : claim.closed_at ? (
          <FeedbackBanner tone="info">هذه المطالبة مغلقة حاليًا، ويظل سجلها ومرفقاتها وأحداثها محفوظة للتدقيق.</FeedbackBanner>
        ) : null}

        <section className={styles.card} aria-label="حالة المطالبة">
          <div className={styles.header}>
            <div>
              <span className={styles.eyebrow}>الحالة الحالية</span>
              <h2>{claimStatus(claim.claim_status)}</h2>
            </div>
          </div>
          <dl className={styles.grid}>
            <div><dt>رقم المطالبة</dt><dd dir="ltr">{claim.claim_number}</dd></div>
            <div><dt>تاريخ التقديم</dt><dd><LocalDateTime value={claim.submitted_at} /></dd></div>
            <div><dt>تاريخ القرار</dt><dd>{claim.decided_at ? <LocalDateTime value={claim.decided_at} /> : "—"}</dd></div>
            <div><dt>تاريخ الإغلاق</dt><dd>{claim.closed_at ? <LocalDateTime value={claim.closed_at} /> : "مفتوحة"}</dd></div>
          </dl>
          {claim.decision_reason || claim.customer_decision_message ? (
            <div className={styles.prose}>
              {claim.decision_reason ? <><h3>سبب القرار الداخلي</h3><p>{claim.decision_reason}</p></> : null}
              {claim.customer_decision_message ? <><h3>رسالة العميل</h3><p>{claim.customer_decision_message}</p></> : null}
            </div>
          ) : null}
        </section>

        <section className={styles.card} aria-label="بيانات المشكلة">
          <div className={styles.header}><h2>المشكلة المبلغ عنها</h2></div>
          <dl className={styles.grid}>
            <div><dt>التصنيف</dt><dd>{categoryLabel(claim.category)}</dd></div>
            <div><dt>الجزء المتأثر</dt><dd>{claim.affected_area}</dd></div>
          </dl>
          <div className={styles.prose}><h3>وصف العميل</h3><p>{claim.description}</p></div>
        </section>

        <section className={styles.card} aria-label="بيانات العميل والسيارة">
          <div className={styles.header}><h2>العميل والسيارة</h2></div>
          <dl className={styles.grid}>
            <div><dt>اسم العميل</dt><dd>{claim.customer_name}</dd></div>
            <div><dt>الهاتف</dt><dd dir="ltr">{claim.customer_phone}</dd></div>
            <div><dt>البريد الإلكتروني</dt><dd dir="ltr">{claim.customer_email ?? "—"}</dd></div>
            <div><dt>السيارة</dt><dd>{claim.vehicle_make} {claim.vehicle_model}</dd></div>
            <div><dt>سنة الموديل</dt><dd>{claim.vehicle_year ?? "—"}</dd></div>
            <div><dt>رقم اللوحة</dt><dd>{claim.vehicle_plate ?? "—"}</dd></div>
            <div><dt>اللون</dt><dd>{claim.vehicle_color ?? "—"}</dd></div>
            <div><dt>VIN / الشاسيه</dt><dd dir="ltr">{claim.vehicle_vin}</dd></div>
          </dl>
        </section>

        <section className={styles.card} aria-label="سياق الضمان المثبت">
          <div className={styles.header}>
            <div>
              <span className={styles.eyebrow}>بيانات مثبتة وقت التفعيل</span>
              <h2>الضمان والمنتج</h2>
            </div>
          </div>
          <dl className={styles.grid}>
            <div><dt>رقم الضمان</dt><dd><Link href={`/operations/warranties/${claim.warranty_id}`} dir="ltr">{claim.warranty_number}</Link></dd></div>
            <div><dt>حالة سجل الضمان</dt><dd>{warrantyRecordStateLabel(claim.warranty_record_state)}</dd></div>
            <div><dt>المنتج</dt><dd>{claim.product_name}</dd></div>
            <div><dt>كود المنتج</dt><dd dir="ltr">{claim.product_code}</dd></div>
            <div><dt>الإصدار</dt><dd>{claim.product_version ?? "—"}</dd></div>
            <div><dt>مدة الضمان</dt><dd>{claim.warranty_months} شهر</dd></div>
            <div><dt>مركز التفعيل</dt><dd>{claim.activating_center_name}</dd></div>
            <div><dt>وقت التفعيل</dt><dd><LocalDateTime value={claim.activated_at} /></dd></div>
            <div><dt>نهاية التغطية</dt><dd><LocalDateTime value={claim.coverage_expires_at} /></dd></div>
          </dl>
          <div className={styles.prose}>
            <h3>نطاق التغطية المثبت</h3><p>{claim.warranty_coverage}</p>
            <h3>تعليمات العناية المثبتة</h3><p>{claim.care_instructions}</p>
          </div>
        </section>

        <section className={styles.card} aria-label="مرفقات المطالبة">
          <div className={styles.header}>
            <div>
              <span className={styles.eyebrow}>مرفقات خاصة</span>
              <h2>صور العميل</h2>
            </div>
            <span className={styles.count}>{customerEvidence.length.toLocaleString("en-US")} صورة</span>
          </div>
          {customerEvidence.length > 0 ? (
            <div className={styles.evidenceGrid}>
              {customerEvidence.map((item) => (
                <article className={styles.evidenceItem} key={`${item.evidence_scope}-${item.displayOrder}`}>
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
          ) : <p className={styles.muted}>لا توجد صور عميل متاحة في سجل المطالبة.</p>}
        </section>

        <section className={styles.card} aria-label="الفحص الفني">
          <div className={styles.header}>
            <div><span className={styles.eyebrow}>الفحص الرسمي</span><h2>{inspectionStatus(claim.inspection_status)}</h2></div>
          </div>
          {claim.inspection_id ? (
            <>
              <dl className={styles.grid}>
                <div><dt>مركز الفحص</dt><dd>{claim.inspection_center_name ?? "—"}</dd></div>
                <div><dt>طلب الفحص</dt><dd>{claim.inspection_requested_at ? <LocalDateTime value={claim.inspection_requested_at} /> : "—"}</dd></div>
                <div><dt>تقديم الفحص</dt><dd>{claim.inspection_submitted_at ? <LocalDateTime value={claim.inspection_submitted_at} /> : "—"}</dd></div>
                <div><dt>حالة الفحص</dt><dd>{inspectionStatusLabel(claim.inspection_status)}</dd></div>
              </dl>
              {claim.technical_observation || claim.suspected_cause ? (
                <div className={styles.prose}>
                  {claim.technical_observation ? <><h3>الملاحظة الفنية</h3><p>{claim.technical_observation}</p></> : null}
                  {claim.suspected_cause ? <><h3>السبب المشتبه به</h3><p>{claim.suspected_cause}</p></> : null}
                </div>
              ) : null}
              {inspectionEvidence.length > 0 ? (
                <div className={styles.evidenceGrid}>
                  {inspectionEvidence.map((item) => (
                    <article className={styles.evidenceItem} key={`${item.evidence_scope}-${item.displayOrder}`}>
                      {item.signedUrl ? (
                        <a href={item.signedUrl} target="_blank" rel="noreferrer" className={styles.imageLink}>
                          <img src={item.signedUrl} alt={`صورة الفحص ${item.displayOrder}`} loading="lazy" />
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
              ) : null}
            </>
          ) : <p className={styles.muted}>لم تطلب الشركة فحصًا رسميًا لهذه المطالبة.</p>}
        </section>

        <section className={styles.card} aria-label="تسليم القرار إلى المعالجة">
          <div className={styles.header}><h2>التنفيذ المرتبط</h2></div>
          {claim.resolution_id ? (
            <dl className={styles.grid}>
              <div><dt>معرف التنفيذ</dt><dd dir="ltr">{claim.resolution_id}</dd></div>
              <div><dt>الحالة</dt><dd>{resolutionStatus(claim.resolution_status)}</dd></div>
            </dl>
          ) : <p className={styles.muted}>لم يتم إنشاء مهمة تنفيذ لهذه المطالبة.</p>}
        </section>

        <section className={styles.card} aria-label="سجل أحداث المطالبة">
          <div className={styles.header}><h2>السجل الزمني</h2></div>
          {timeline.length > 0 ? (
            <ol className={styles.timeline}>
              {timeline.map((event) => (
                <li key={event.event_id}>
                  <div className={styles.timelineTop}>
                    <strong>{eventLabel(event.event_kind)}</strong>
                    <LocalDateTime value={event.created_at} />
                  </div>
                  <span className={styles.muted}>الجهة: {actorKindLabel(event.actor_kind)}</span>
                  {event.reason ? <p>{event.reason}</p> : null}
                </li>
              ))}
            </ol>
          ) : <p className={styles.muted}>لا توجد أحداث مسجلة.</p>}
        </section>

        <section className={styles.card} aria-label="مطالبات سابقة على نفس الضمان">
          <div className={styles.header}><h2>مطالبات سابقة لنفس الضمان</h2></div>
          {history.length > 0 ? (
            <div className={styles.historyList}>
              {history.map((item) => (
                <Link key={item.claim_id} href={`/operations/claims/${item.claim_id}`} className={styles.historyItem}>
                  <span dir="ltr">{item.claim_number}</span>
                  <span>{claimStatus(item.status)}</span>
                  <span><LocalDateTime value={item.closed_at} /></span>
                </Link>
              ))}
            </div>
          ) : <p className={styles.muted}>لا توجد مطالبات مغلقة أخرى على هذا الضمان.</p>}
        </section>
      </div>
    </>
  );
}
