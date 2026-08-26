import { notFound, redirect } from "next/navigation";
import { AdminClaimDecisionActions } from "@/components/claims/admin-claim-decision-actions";
import { LocalDateTime } from "@/components/ui/local-date-time";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { TaskBackLink } from "@/components/ui/task-back-link";
import { requireOperationalProfile } from "@/lib/auth/operational-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import styles from "../review/review.module.css";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ClaimDecisionPageProps = {
  params: Promise<{ id: string }>;
};

function claimStatus(status: string) {
  if (status === "submitted") return <StatusBadge tone="accent">جديدة</StatusBadge>;
  if (status === "under_review") return <StatusBadge tone="warning">قيد المراجعة</StatusBadge>;
  if (status === "awaiting_inspection") return <StatusBadge tone="warning">مطلوب فحص</StatusBadge>;
  if (status === "approved") return <StatusBadge tone="success">مقبولة</StatusBadge>;
  if (status === "rejected") return <StatusBadge tone="danger">مرفوضة</StatusBadge>;
  if (status === "cancelled") return <StatusBadge tone="neutral">ملغاة</StatusBadge>;
  return <StatusBadge>غير معروفة</StatusBadge>;
}

export default async function ClaimDecisionPage({ params }: ClaimDecisionPageProps) {
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

  return (
    <>
      <PageHeader
        eyebrow="مطالبات الضمان · القرار النهائي"
        title={`قرار ${claim.claim_number}`}
        description="مساحة Admin منفصلة لتنفيذ القبول أو الرفض أو الإلغاء أو تصحيح PD-078 فقط. راجع سجل المطالبة والمرفقات والـTimeline في صفحة التفاصيل قبل تنفيذ أي قرار."
        meta={`الضمان: ${claim.warranty_number}`}
        actions={<TaskBackLink href={`/operations/claims/${claim.claim_id}`} label="العودة إلى سجل المطالبة" />}
      />

      <section className={styles.summary} aria-label="ملخص المطالبة قبل القرار">
        <div><span>الحالة الحالية</span><strong>{claimStatus(claim.claim_status)}</strong></div>
        <div><span>المنتج</span><strong>{claim.product_name}</strong></div>
        <div><span>السيارة</span><strong>{claim.vehicle_make} {claim.vehicle_model}</strong></div>
        <div><span>تاريخ التقديم</span><strong><LocalDateTime value={claim.submitted_at} /></strong></div>
        <div><span>الفحص الرسمي</span><strong>{claim.inspection_status ?? "لا يوجد"}</strong></div>
        <div><span>Resolution</span><strong>{claim.resolution_status ?? "لا يوجد"}</strong></div>
      </section>

      <AdminClaimDecisionActions
        claimId={claim.claim_id}
        claimNumber={claim.claim_number}
        claimStatus={claim.claim_status}
        inspectionStatus={claim.inspection_status}
        resolutionId={claim.resolution_id}
        resolutionStatus={claim.resolution_status}
      />
    </>
  );
}
