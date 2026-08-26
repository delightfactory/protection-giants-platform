import { notFound, redirect } from "next/navigation";
import { AdminClaimReviewActions, type ClaimInspectionCenterOption } from "@/components/claims/admin-claim-review-actions";
import { LocalDateTime } from "@/components/ui/local-date-time";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { TaskBackLink } from "@/components/ui/task-back-link";
import { requireOperationalProfile } from "@/lib/auth/operational-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import styles from "./review.module.css";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ClaimReviewPageProps = {
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

export default async function ClaimReviewPage({ params }: ClaimReviewPageProps) {
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
  const needsCenterOptions =
    (claim.claim_status === "under_review" && !claim.inspection_id)
    || (claim.claim_status === "awaiting_inspection" && claim.inspection_status === "requested");

  let centers: ClaimInspectionCenterOption[] = [];
  if (needsCenterOptions) {
    const { data: centerData, error: centerError } = await supabase.rpc("list_actionable_claim_inspection_centers");
    if (centerError) {
      if (centerError.message === "PG_CLAIM_ADMIN_REQUIRED" || centerError.message === "PG_CLAIM_FORBIDDEN") {
        redirect("/access-denied");
      }
      throw centerError;
    }

    centers = (centerData ?? []).map((center) => ({
      centerPartyId: center.center_party_id,
      centerName: center.center_name,
      countryCode: center.country_code,
      city: center.city,
      approvalStatus: center.approval_status,
      activeOperatorCount: center.active_operator_count,
    }));
  }

  return (
    <>
      <PageHeader
        eyebrow="مطالبات الضمان · المراجعة"
        title={`إجراءات ${claim.claim_number}`}
        description="مساحة تنفيذ انتقالات المراجعة والتكليف بالفحص فقط. سجل المطالبة والمرفقات والـTimeline يظل في صفحة التفاصيل المنفصلة لتقليل مخاطر التنفيذ أثناء القراءة."
        meta={`الضمان: ${claim.warranty_number}`}
        actions={<TaskBackLink href={`/operations/claims/${claim.claim_id}`} label="العودة إلى سجل المطالبة" />}
      />

      <section className={styles.summary} aria-label="ملخص المطالبة قبل الإجراء">
        <div><span>الحالة الحالية</span><strong>{claimStatus(claim.claim_status)}</strong></div>
        <div><span>المنتج</span><strong>{claim.product_name}</strong></div>
        <div><span>السيارة</span><strong>{claim.vehicle_make} {claim.vehicle_model}</strong></div>
        <div><span>تاريخ التقديم</span><strong><LocalDateTime value={claim.submitted_at} /></strong></div>
        <div><span>الفحص</span><strong>{claim.inspection_status ?? "لا يوجد"}</strong></div>
        <div><span>مركز الفحص</span><strong>{claim.inspection_center_name ?? "—"}</strong></div>
      </section>

      <AdminClaimReviewActions
        claimId={claim.claim_id}
        claimNumber={claim.claim_number}
        claimStatus={claim.claim_status}
        inspectionId={claim.inspection_id}
        inspectionStatus={claim.inspection_status}
        currentCenterPartyId={claim.inspection_center_party_id}
        currentCenterName={claim.inspection_center_name}
        centers={centers}
      />
    </>
  );
}
