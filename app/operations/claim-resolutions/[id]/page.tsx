import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminClaimResolutionActions } from "@/components/claims/admin-claim-resolution-actions";
import { LocalDateTime } from "@/components/ui/local-date-time";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { TaskBackLink } from "@/components/ui/task-back-link";
import { requireOperationalProfile } from "@/lib/auth/operational-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import styles from "./resolution-detail.module.css";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ResolutionDetailPageProps = {
  params: Promise<{ id: string }>;
};

function statusBadge(status: string) {
  if (status === "authorized") return <StatusBadge tone="accent">بانتظار الإسناد</StatusBadge>;
  if (status === "assigned") return <StatusBadge tone="warning">مسند للتنفيذ</StatusBadge>;
  if (status === "completed") return <StatusBadge tone="success">مكتمل</StatusBadge>;
  if (status === "cancelled") return <StatusBadge tone="neutral">أُغلق دون تنفيذ</StatusBadge>;
  return <StatusBadge>غير معروفة</StatusBadge>;
}

function remedyLabel(remedy: string | null) {
  if (remedy === "service_reinstall") return "إعادة تركيب / خدمة";
  if (remedy === "replacement_roll_reinstall") return "استبدال لفة وإعادة تركيب";
  return "لم يُحدد بعد";
}

function allocationLabel(status: string | null) {
  if (status === "reserved") return "محجوزة";
  if (status === "released") return "محررة";
  if (status === "consumed") return "مستهلكة";
  return "لا يوجد تخصيص";
}

function qualityLabel(state: string | null) {
  if (state === "pending") return "بلاغ جودة قيد المراجعة";
  if (state === "return_required") return "Return Required — غير صالحة للاستخدام";
  if (state === "clear_history") return "تاريخ جودة مغلق يسمح بالمتابعة حسب باقي الشروط";
  if (state === "none") return "لا يوجد بلاغ جودة";
  return "غير منطبق";
}

function dateValue(value: string | null) {
  return value ? <LocalDateTime value={value} /> : "—";
}

export default async function ResolutionDetailPage({ params }: ResolutionDetailPageProps) {
  const profile = await requireOperationalProfile();
  if (profile.role !== "admin") redirect("/access-denied");

  const { id } = await params;
  if (!uuidPattern.test(id)) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: detailData, error: detailError } = await supabase.rpc("get_admin_warranty_claim_resolution_detail", {
    p_resolution_id: id,
  });

  if (detailError) {
    if (detailError.message === "PG_CLAIM_RESOLUTION_NOT_FOUND") notFound();
    if (detailError.message === "PG_CLAIM_ADMIN_REQUIRED" || detailError.message === "PG_CLAIM_FORBIDDEN") {
      redirect("/access-denied");
    }
    throw detailError;
  }

  if (!detailData || detailData.length !== 1) notFound();
  const resolution = detailData[0];
  const openForAdminAction = resolution.resolution_status === "authorized" || resolution.resolution_status === "assigned";

  const centers: Array<{ partyId: string; code: string; name: string }> = [];
  if (openForAdminAction) {
    const [centersResult, partiesResult, operatorsResult] = await Promise.all([
      supabase
        .from("installation_centers")
        .select("id, code, name")
        .eq("status", "active")
        .order("name", { ascending: true })
        .limit(200),
      supabase
        .from("operational_parties")
        .select("id, installation_center_id")
        .eq("party_type", "center"),
      supabase
        .from("profiles")
        .select("installation_center_id")
        .eq("role", "center")
        .eq("status", "active"),
    ]);

    if (centersResult.error) throw centersResult.error;
    if (partiesResult.error) throw partiesResult.error;
    if (operatorsResult.error) throw operatorsResult.error;

    const partyByCenter = new Map(
      partiesResult.data
        .filter((party) => party.installation_center_id)
        .map((party) => [party.installation_center_id as string, party.id]),
    );
    const actionableCenterIds = new Set(
      operatorsResult.data
        .map((operator) => operator.installation_center_id)
        .filter((centerId): centerId is string => Boolean(centerId)),
    );

    for (const center of centersResult.data) {
      const partyId = partyByCenter.get(center.id);
      if (partyId && actionableCenterIds.has(center.id)) {
        centers.push({ partyId, code: center.code, name: center.name });
      }
    }
  }

  let rollCandidates: Array<{
    rollId: string;
    serialNumber: string;
    erpSerial: string | null;
    productCode: string;
    productName: string;
    productVersion: string;
  }> = [];

  const hasActiveAllocation = resolution.allocation_status === "reserved" || resolution.allocation_status === "consumed";
  if (
    resolution.resolution_status === "assigned"
    && resolution.remedy_kind === "replacement_roll_reinstall"
    && !hasActiveAllocation
  ) {
    const { data: candidates, error: candidateError } = await supabase.rpc(
      "list_admin_claim_resolution_replacement_roll_candidates",
      { p_resolution_id: resolution.resolution_id, p_limit: 50, p_offset: 0 },
    );
    if (candidateError && candidateError.message !== "PG_CLAIM_REPLACEMENT_CANDIDATES_STATE_INVALID") {
      throw candidateError;
    }
    rollCandidates = (candidates ?? []).map((candidate) => ({
      rollId: candidate.roll_id,
      serialNumber: candidate.serial_number,
      erpSerial: candidate.erp_serial,
      productCode: candidate.product_code,
      productName: candidate.product_name,
      productVersion: candidate.product_version ?? "",
    }));
  }

  const activeOperatorCount = Number(resolution.active_operator_count ?? 0);
  const vehicle = [resolution.vehicle_make, resolution.vehicle_model, resolution.vehicle_year]
    .filter(Boolean)
    .join(" ") || "غير متاح";

  return (
    <>
      <PageHeader
        eyebrow="مطالبات الضمان · التنفيذ"
        title={`تنفيذ ${resolution.claim_number}`}
        description="السجل التشغيلي للمعالجة بعد قبول المطالبة. قرارات الإسناد والمادة والإغلاق تمر فقط عبر حدود Cube R المؤهلة؛ هذه الصفحة لا تغير قرار المطالبة ولا الضمان الأصلي."
        meta={`الضمان: ${resolution.warranty_number}`}
        actions={(
          <>
            <TaskBackLink href="/operations/claim-resolutions" label="العودة إلى قائمة التنفيذ" />
            <Link href={`/operations/claims/${resolution.claim_id}`} className="button button-ghost">سجل المطالبة</Link>
          </>
        )}
      />

      <div className={styles.stack}>
        <section className={styles.card} aria-label="ملخص التنفيذ">
          <div className={styles.header}>
            <div><span className={styles.eyebrow}>Resolution</span><h2>الحالة التشغيلية</h2></div>
            {statusBadge(resolution.resolution_status)}
          </div>
          <dl className={styles.grid}>
            <div><dt>أسلوب المعالجة</dt><dd>{remedyLabel(resolution.remedy_kind)}</dd></div>
            <div><dt>مركز التنفيذ</dt><dd>{resolution.performing_center_name ?? "لم يُسند بعد"}</dd></div>
            <div><dt>حالة المركز</dt><dd>{resolution.performing_center_status ?? "غير منطبق"} · {activeOperatorCount.toLocaleString("en-US")} مستخدم Center نشط</dd></div>
            <div><dt>اعتماد Resolution</dt><dd>{dateValue(resolution.authorized_at)}</dd></div>
            <div><dt>الإسناد</dt><dd>{dateValue(resolution.assigned_at)}</dd></div>
            <div><dt>الإكمال</dt><dd>{dateValue(resolution.completed_at)}</dd></div>
          </dl>
        </section>

        <section className={styles.card} aria-label="سياق المطالبة والضمان">
          <div className={styles.header}><div><span className={styles.eyebrow}>Claim / Warranty</span><h2>السياق المرتبط</h2></div></div>
          <dl className={styles.grid}>
            <div><dt>رقم المطالبة</dt><dd dir="ltr">{resolution.claim_number}</dd></div>
            <div><dt>حالة المطالبة</dt><dd>{resolution.claim_status}</dd></div>
            <div><dt>المنتج</dt><dd>{resolution.product_name} · <span dir="ltr">{resolution.product_code}</span></dd></div>
            <div><dt>السيارة</dt><dd>{vehicle}</dd></div>
            <div><dt>العميل</dt><dd>{resolution.customer_name}</dd></div>
            <div><dt>الهاتف</dt><dd dir="ltr">{resolution.customer_phone}</dd></div>
            <div><dt>البريد</dt><dd dir="ltr">{resolution.customer_email ?? "—"}</dd></div>
            <div><dt>رقم اللوحة</dt><dd>{resolution.vehicle_plate ?? "—"}</dd></div>
          </dl>
          <div>
            <span className={styles.eyebrow}>وصف المشكلة</span>
            <p className={styles.prose}>{resolution.description}</p>
          </div>
        </section>

        {resolution.remedy_kind === "replacement_roll_reinstall" || resolution.allocation_id ? (
          <section className={styles.card} aria-label="مادة الاستبدال">
            <div className={styles.header}><div><span className={styles.eyebrow}>Replacement material</span><h2>لفة الاستبدال</h2></div></div>
            <dl className={styles.grid}>
              <div><dt>حالة التخصيص</dt><dd>{allocationLabel(resolution.allocation_status)}</dd></div>
              <div><dt>أساس الأهلية</dt><dd>{resolution.product_eligibility_basis ?? "—"}</dd></div>
              <div><dt>Serial</dt><dd dir="ltr">{resolution.replacement_roll_serial ?? "—"}</dd></div>
              <div><dt>المنتج الفعلي</dt><dd>{resolution.replacement_roll_product_name ?? "—"} {resolution.replacement_roll_product_code ? <span dir="ltr">({resolution.replacement_roll_product_code})</span> : null}</dd></div>
              <div><dt>Opening</dt><dd>{dateValue(resolution.replacement_opened_at)}</dd></div>
              <div><dt>الجودة</dt><dd>{qualityLabel(resolution.replacement_quality_state)}</dd></div>
              <div><dt>الحجز</dt><dd>{dateValue(resolution.allocation_reserved_at)}</dd></div>
              <div><dt>الاستهلاك</dt><dd>{dateValue(resolution.allocation_consumed_at)}</dd></div>
            </dl>
          </section>
        ) : null}

        {resolution.resolution_status === "completed" ? (
          <section className={styles.card} aria-label="حقائق الإكمال">
            <div className={styles.header}><div><span className={styles.eyebrow}>Completion</span><h2>الإكمال النهائي</h2></div></div>
            <dl className={styles.grid}>
              <div><dt>منفذ الإكمال</dt><dd>{resolution.completion_actor_kind === "admin_recovery" ? "Admin recovery" : "مركز التنفيذ"}</dd></div>
              <div><dt>وقت الإكمال</dt><dd>{dateValue(resolution.completed_at)}</dd></div>
              <div><dt>عدد صور الإثبات</dt><dd>{Number(resolution.completion_evidence_count ?? 0).toLocaleString("en-US")}</dd></div>
              <div><dt>إغلاق المطالبة</dt><dd>{dateValue(resolution.claim_closed_at)}</dd></div>
            </dl>
            <div><span className={styles.eyebrow}>ملاحظة الإكمال</span><p className={styles.prose}>{resolution.completion_note ?? "—"}</p></div>
          </section>
        ) : null}

        {resolution.resolution_status === "cancelled" ? (
          <section className={styles.card} aria-label="إغلاق التنفيذ دون إكمال">
            <div className={styles.header}><div><span className={styles.eyebrow}>PD-079</span><h2>إغلاق التنفيذ بناءً على رغبة العميل</h2></div></div>
            <dl className={styles.grid}>
              <div><dt>وقت الإغلاق</dt><dd>{dateValue(resolution.cancelled_at)}</dd></div>
              <div><dt>إغلاق المطالبة</dt><dd>{dateValue(resolution.claim_closed_at)}</dd></div>
            </dl>
            <div><span className={styles.eyebrow}>السبب الداخلي</span><p className={styles.prose}>{resolution.cancellation_reason ?? "—"}</p></div>
            <div><span className={styles.eyebrow}>رسالة العميل</span><p className={styles.prose}>{resolution.customer_cancellation_message ?? "—"}</p></div>
          </section>
        ) : null}

        <AdminClaimResolutionActions
          resolutionId={resolution.resolution_id}
          resolutionStatus={resolution.resolution_status}
          remedyKind={resolution.remedy_kind}
          performingCenterPartyId={resolution.performing_center_party_id}
          performingCenterStatus={resolution.performing_center_status}
          activeOperatorCount={activeOperatorCount}
          allocationId={resolution.allocation_id}
          allocationStatus={resolution.allocation_status}
          replacementRollSerial={resolution.replacement_roll_serial}
          centers={centers}
          rollCandidates={rollCandidates}
        />
      </div>
    </>
  );
}
