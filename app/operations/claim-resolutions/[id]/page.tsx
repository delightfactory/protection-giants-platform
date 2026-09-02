import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminClaimResolutionActions } from "@/components/claims/admin-claim-resolution-actions";
import { LocalDateTime } from "@/components/ui/local-date-time";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { TaskBackLink } from "@/components/ui/task-back-link";
import {
  actorKindLabel,
  allocationStatusLabel,
  centerOperationalStatusLabel,
  claimStatusLabel,
  qualityStateLabel,
  resolutionStatusLabel,
} from "@/lib/claims/ui-labels";
import { requireOperationalProfile } from "@/lib/auth/operational-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import styles from "./resolution-detail.module.css";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ResolutionDetailPageProps = {
  params: Promise<{ id: string }>;
};

function statusBadge(status: string) {
  if (status === "authorized") return <StatusBadge tone="accent">{resolutionStatusLabel(status)}</StatusBadge>;
  if (status === "assigned") return <StatusBadge tone="warning">{resolutionStatusLabel(status)}</StatusBadge>;
  if (status === "completed") return <StatusBadge tone="success">{resolutionStatusLabel(status)}</StatusBadge>;
  if (status === "cancelled") return <StatusBadge tone="neutral">{resolutionStatusLabel(status)}</StatusBadge>;
  return <StatusBadge>{resolutionStatusLabel(status)}</StatusBadge>;
}

function remedyLabel(remedy: string | null) {
  if (remedy === "service_reinstall") return "إعادة تركيب / خدمة";
  if (remedy === "replacement_roll_reinstall") return "استبدال لفة وإعادة تركيب";
  return "لم يُحدد بعد";
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
  const recoveryAllowed = resolution.resolution_status === "assigned"
    && (resolution.performing_center_status === "suspended" || activeOperatorCount === 0);
  const replacementNeedsAllocation = resolution.resolution_status === "assigned"
    && resolution.remedy_kind === "replacement_roll_reinstall"
    && !hasActiveAllocation;
  const vehicle = [resolution.vehicle_make, resolution.vehicle_model, resolution.vehicle_year]
    .filter(Boolean)
    .join(" ") || "غير متاح";

  let currentStepTitle = "راجع الحالة التشغيلية";
  let currentStepDescription = "استخدم ملخص الحالة وإجراءات التنفيذ لتحديد الخطوة التالية دون تغيير قرار المطالبة أو الضمان.";
  let currentStepBadge = <StatusBadge tone="neutral">متابعة</StatusBadge>;
  let currentStepActionLabel = "مراجعة إجراءات الإدارة";
  let currentStepActionPrimary = false;

  if (resolution.resolution_status === "authorized") {
    currentStepTitle = "إسناد التنفيذ إلى مركز";
    currentStepDescription = "المعالجة معتمدة ولم تُسند بعد. الخطوة المطلوبة من الإدارة هي اختيار مركز التنفيذ وأسلوب المعالجة قبل بدء العمل الميداني.";
    currentStepBadge = <StatusBadge tone="accent">مطلوب من الإدارة</StatusBadge>;
    currentStepActionLabel = "فتح إجراءات الإسناد";
    currentStepActionPrimary = true;
  } else if (recoveryAllowed) {
    currentStepTitle = "تدخل إدارة مطلوب لاستكمال التنفيذ";
    currentStepDescription = "المركز المسند موقوف أو لا يملك مستخدم مركز نشطًا. راجع مسار الإكمال الاستثنائي فقط بعد التحقق من فقد قدرة المركز على الإكمال الطبيعي.";
    currentStepBadge = <StatusBadge tone="warning">استثناء يحتاج تدخل</StatusBadge>;
    currentStepActionLabel = "فتح إجراءات التدخل";
    currentStepActionPrimary = true;
  } else if (replacementNeedsAllocation && rollCandidates.length > 0) {
    currentStepTitle = "حجز لفة الاستبدال";
    currentStepDescription = "المهمة مسندة إلى المركز ولا توجد مادة نشطة بعد. توجد لفة مؤهلة في عهدة مركز التنفيذ ويمكن حجزها من إجراءات التنفيذ.";
    currentStepBadge = <StatusBadge tone="accent">مطلوب من الإدارة</StatusBadge>;
    currentStepActionLabel = "فتح إجراءات المادة";
    currentStepActionPrimary = true;
  } else if (replacementNeedsAllocation) {
    currentStepTitle = "توفير مادة مؤهلة لمركز التنفيذ";
    currentStepDescription = "لا توجد حاليًا لفة مؤهلة غير مفتوحة في عهدة مركز التنفيذ. استخدم مسار التحويل التشغيلي المعتاد عند الحاجة ثم ارجع لهذه المعالجة.";
    currentStepBadge = <StatusBadge tone="warning">المادة غير جاهزة</StatusBadge>;
  } else if (resolution.resolution_status === "assigned" && resolution.allocation_status === "reserved") {
    currentStepTitle = "المادة محجوزة — التنفيذ عند المركز";
    currentStepDescription = "الإسناد والمادة جاهزان. لا يلزم إجراء إداري أساسي الآن ما لم تتغير مسؤولية المركز أو تظهر حالة استثنائية.";
    currentStepBadge = <StatusBadge tone="warning">بانتظار المركز</StatusBadge>;
  } else if (resolution.resolution_status === "assigned" && resolution.allocation_status === "consumed") {
    currentStepTitle = "المادة استُهلكت — بانتظار تسجيل الإكمال";
    currentStepDescription = "حقيقة استهلاك المادة ثبتت. المسار الطبيعي الآن هو إكمال المهمة من المركز وتسجيل إثبات التنفيذ، ما لم تتوفر شروط التدخل الاستثنائي.";
    currentStepBadge = <StatusBadge tone="warning">بانتظار الإكمال</StatusBadge>;
  } else if (resolution.resolution_status === "assigned") {
    currentStepTitle = "التنفيذ الآن عند المركز";
    currentStepDescription = "المهمة مسندة ولا توجد خطوة إدارية أساسية مطلوبة الآن. استخدم إجراءات الإدارة فقط للتصحيح أو الاستثناء عند وجود سبب تشغيلي حقيقي.";
    currentStepBadge = <StatusBadge tone="warning">بانتظار المركز</StatusBadge>;
  } else if (resolution.resolution_status === "completed") {
    currentStepTitle = "التنفيذ مكتمل";
    currentStepDescription = "لا توجد إجراءات تشغيلية متبقية. راجع حقائق الإكمال وسجل المطالبة عند الحاجة للتدقيق أو الدعم.";
    currentStepBadge = <StatusBadge tone="success">لا يوجد إجراء</StatusBadge>;
  } else if (resolution.resolution_status === "cancelled") {
    currentStepTitle = "التنفيذ مغلق دون إكمال";
    currentStepDescription = "لا توجد إجراءات تشغيلية متبقية. راجع سبب الإغلاق ورسالة العميل وسجل المطالبة عند الحاجة.";
    currentStepBadge = <StatusBadge tone="neutral">لا يوجد إجراء</StatusBadge>;
  }

  return (
    <>
      <PageHeader
        eyebrow="مطالبات الضمان · التنفيذ"
        title={`تنفيذ ${resolution.claim_number}`}
        description="السجل التشغيلي للمعالجة بعد قبول المطالبة. قرارات الإسناد والمادة والإغلاق تمر عبر الإجراءات المؤهلة فقط؛ هذه الصفحة لا تغير قرار المطالبة ولا الضمان الأصلي."
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
            <div><span className={styles.eyebrow}>التنفيذ</span><h2>الحالة التشغيلية</h2></div>
            {statusBadge(resolution.resolution_status)}
          </div>
          <dl className={styles.grid}>
            <div><dt>أسلوب المعالجة</dt><dd>{remedyLabel(resolution.remedy_kind)}</dd></div>
            <div><dt>مركز التنفيذ</dt><dd>{resolution.performing_center_name ?? "لم يُسند بعد"}</dd></div>
            <div><dt>حالة المركز</dt><dd>{centerOperationalStatusLabel(resolution.performing_center_status)} · {activeOperatorCount.toLocaleString("en-US")} مستخدم مركز نشط</dd></div>
            <div><dt>اعتماد المعالجة</dt><dd>{dateValue(resolution.authorized_at)}</dd></div>
            <div><dt>الإسناد</dt><dd>{dateValue(resolution.assigned_at)}</dd></div>
            <div><dt>الإكمال</dt><dd>{dateValue(resolution.completed_at)}</dd></div>
          </dl>
        </section>

        <section className={`${styles.card} ${styles.focusCard}`} aria-label="الخطوة الحالية">
          <div className={styles.header}>
            <div className={styles.focusCopy}>
              <span className={styles.eyebrow}>ما الذي يحتاج متابعة الآن؟</span>
              <h2>{currentStepTitle}</h2>
              <p>{currentStepDescription}</p>
            </div>
            {currentStepBadge}
          </div>
          {openForAdminAction ? (
            <div className={styles.focusActions}>
              <a
                href="#resolution-actions"
                className={currentStepActionPrimary ? "button button-primary" : "button button-ghost"}
              >
                {currentStepActionLabel}
              </a>
            </div>
          ) : null}
        </section>

        <div id="resolution-actions" className={styles.actionWorkspace}>
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

        <div className={styles.referenceHeading}>
          <span className={styles.eyebrow}>تفاصيل مرجعية</span>
          <h2>السياق والسجل المرتبط</h2>
          <p>استخدم البيانات التالية لفهم الخلفية أو التدقيق، بعد تحديد الخطوة التشغيلية الحالية أعلاه.</p>
        </div>

        <section className={styles.card} aria-label="سياق المطالبة والضمان">
          <div className={styles.header}><div><span className={styles.eyebrow}>المطالبة والضمان</span><h2>السياق المرتبط</h2></div></div>
          <dl className={styles.grid}>
            <div><dt>رقم المطالبة</dt><dd dir="ltr">{resolution.claim_number}</dd></div>
            <div><dt>حالة المطالبة</dt><dd>{claimStatusLabel(resolution.claim_status)}</dd></div>
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
            <div className={styles.header}><div><span className={styles.eyebrow}>مادة الاستبدال</span><h2>لفة الاستبدال</h2></div></div>
            <dl className={styles.grid}>
              <div><dt>حالة التخصيص</dt><dd>{allocationStatusLabel(resolution.allocation_status)}</dd></div>
              <div><dt>أساس الأهلية</dt><dd>{resolution.product_eligibility_basis ?? "—"}</dd></div>
              <div><dt>الرقم التسلسلي</dt><dd dir="ltr">{resolution.replacement_roll_serial ?? "—"}</dd></div>
              <div><dt>المنتج الفعلي</dt><dd>{resolution.replacement_roll_product_name ?? "—"} {resolution.replacement_roll_product_code ? <span dir="ltr">({resolution.replacement_roll_product_code})</span> : null}</dd></div>
              <div><dt>وقت فتح اللفة</dt><dd>{dateValue(resolution.replacement_opened_at)}</dd></div>
              <div><dt>الجودة</dt><dd>{qualityStateLabel(resolution.replacement_quality_state)}</dd></div>
              <div><dt>الحجز</dt><dd>{dateValue(resolution.allocation_reserved_at)}</dd></div>
              <div><dt>الاستهلاك</dt><dd>{dateValue(resolution.allocation_consumed_at)}</dd></div>
            </dl>
          </section>
        ) : null}

        {resolution.resolution_status === "completed" ? (
          <section className={styles.card} aria-label="حقائق الإكمال">
            <div className={styles.header}><div><span className={styles.eyebrow}>الإكمال</span><h2>الإكمال النهائي</h2></div></div>
            <dl className={styles.grid}>
              <div><dt>منفذ الإكمال</dt><dd>{actorKindLabel(resolution.completion_actor_kind)}</dd></div>
              <div><dt>وقت الإكمال</dt><dd>{dateValue(resolution.completed_at)}</dd></div>
              <div><dt>عدد صور الإثبات</dt><dd>{Number(resolution.completion_evidence_count ?? 0).toLocaleString("en-US")}</dd></div>
              <div><dt>إغلاق المطالبة</dt><dd>{dateValue(resolution.claim_closed_at)}</dd></div>
            </dl>
            <div><span className={styles.eyebrow}>ملاحظة الإكمال</span><p className={styles.prose}>{resolution.completion_note ?? "—"}</p></div>
          </section>
        ) : null}

        {resolution.resolution_status === "cancelled" ? (
          <section className={styles.card} aria-label="إغلاق التنفيذ دون إكمال">
            <div className={styles.header}><div><span className={styles.eyebrow}>إغلاق بطلب العميل</span><h2>إغلاق التنفيذ بناءً على رغبة العميل</h2></div></div>
            <dl className={styles.grid}>
              <div><dt>وقت الإغلاق</dt><dd>{dateValue(resolution.cancelled_at)}</dd></div>
              <div><dt>إغلاق المطالبة</dt><dd>{dateValue(resolution.claim_closed_at)}</dd></div>
            </dl>
            <div><span className={styles.eyebrow}>السبب الداخلي</span><p className={styles.prose}>{resolution.cancellation_reason ?? "—"}</p></div>
            <div><span className={styles.eyebrow}>رسالة العميل</span><p className={styles.prose}>{resolution.customer_cancellation_message ?? "—"}</p></div>
          </section>
        ) : null}
      </div>
    </>
  );
}
