import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { LocalDateTime } from "@/components/ui/local-date-time";
import { ModuleCard } from "@/components/ui/module-card";
import { PageHeader } from "@/components/ui/page-header";
import { RecordItem, RecordList } from "@/components/ui/record-list";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireOperationalProfile } from "@/lib/auth/operational-profile";
import { getHomeDestinations } from "@/lib/navigation/operations-navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTransferAttentionCounts } from "@/lib/transfers/receipt.server";
import styles from "./page.module.css";

type AdminClaimAttention = {
  claim_id: string;
  claim_number: string;
  product_name: string;
  status: string;
  submitted_at: string;
  inspection_status: string | null;
};

type AdminResolutionAttention = {
  resolution_id: string;
  claim_number: string;
  product_name: string;
  authorized_at: string;
};

type AdminAttention = {
  incomingActionCount: number;
  submittedClaims: AdminClaimAttention[];
  reviewClaims: AdminClaimAttention[];
  unassignedResolutions: AdminResolutionAttention[];
};

type CenterAttention = {
  incomingActionCount: number;
  inspections: Array<{
    inspection_id: string;
    claim_number: string;
    product_name: string;
    affected_area: string;
    requested_at: string;
  }>;
  resolutionTasks: Array<{
    resolution_id: string;
    claim_number: string;
    product_name: string;
    remedy_kind: string;
    affected_area: string;
    assigned_at: string;
  }>;
};

type AgentCenterAttention = {
  id: string;
  code: string;
  name: string;
  city: string;
  country_code: string;
  location_captured_at: string | null;
};

type PartnerAttention = {
  incomingActionCount: number;
  approvalReadyCenters: AgentCenterAttention[];
  locationPendingCenters: AgentCenterAttention[];
};

function remedyLabel(remedy: string) {
  return remedy === "replacement_roll_reinstall" ? "إعادة تركيب برول بديل" : "إعادة تنفيذ الخدمة";
}

export default async function OperationsPage() {
  const profile = await requireOperationalProfile();
  const modules = getHomeDestinations(profile.role);

  let adminAttention: AdminAttention | null = null;
  let centerApprovalStatus: string | null = null;
  let centerAttention: CenterAttention | null = null;
  let partnerAttention: PartnerAttention | null = null;

  if (profile.role === "admin") {
    const supabase = await createSupabaseServerClient();
    const [transferAttention, submittedResult, reviewResult, resolutionsResult] = await Promise.all([
      getTransferAttentionCounts(),
      supabase.rpc("list_admin_warranty_claims", {
        p_limit: 4,
        p_offset: 0,
        p_scope: "open",
        p_status: "submitted",
      }),
      supabase.rpc("list_admin_warranty_claims", {
        p_limit: 4,
        p_offset: 0,
        p_scope: "open",
        p_status: "under_review",
      }),
      supabase.rpc("list_admin_warranty_claim_resolutions", {
        p_limit: 4,
        p_offset: 0,
        p_scope: "open",
        p_status: "authorized",
      }),
    ]);

    if (submittedResult.error) throw submittedResult.error;
    if (reviewResult.error) throw reviewResult.error;
    if (resolutionsResult.error) throw resolutionsResult.error;

    const mapClaim = (claim: NonNullable<typeof submittedResult.data>[number]): AdminClaimAttention => ({
      claim_id: claim.claim_id,
      claim_number: claim.claim_number,
      product_name: claim.product_name,
      status: claim.status,
      submitted_at: claim.submitted_at,
      inspection_status: claim.inspection_status,
    });

    adminAttention = {
      incomingActionCount: transferAttention.incomingActionCount,
      submittedClaims: (submittedResult.data ?? []).map(mapClaim),
      reviewClaims: (reviewResult.data ?? []).map(mapClaim),
      unassignedResolutions: (resolutionsResult.data ?? []).map((resolution) => ({
        resolution_id: resolution.resolution_id,
        claim_number: resolution.claim_number,
        product_name: resolution.product_name,
        authorized_at: resolution.authorized_at,
      })),
    };
  } else if (profile.role === "center") {
    const supabase = await createSupabaseServerClient();
    const [centerResult, transferAttention, inspectionsResult, resolutionTasksResult] = await Promise.all([
      supabase
        .from("installation_centers")
        .select("approval_status")
        .eq("id", profile.installation_center_id)
        .maybeSingle(),
      getTransferAttentionCounts(),
      supabase.rpc("list_center_pending_claim_inspections", {
        p_limit: 4,
        p_offset: 0,
      }),
      supabase.rpc("list_center_assigned_warranty_claim_resolution_tasks", {
        p_limit: 4,
        p_offset: 0,
      }),
    ]);

    if (centerResult.error) throw centerResult.error;
    if (inspectionsResult.error) throw inspectionsResult.error;
    if (resolutionTasksResult.error) throw resolutionTasksResult.error;

    centerApprovalStatus = centerResult.data?.approval_status ?? null;
    centerAttention = {
      incomingActionCount: transferAttention.incomingActionCount,
      inspections: (inspectionsResult.data ?? []).map((inspection) => ({
        inspection_id: inspection.inspection_id,
        claim_number: inspection.claim_number,
        product_name: inspection.product_name,
        affected_area: inspection.affected_area,
        requested_at: inspection.requested_at,
      })),
      resolutionTasks: (resolutionTasksResult.data ?? []).map((task) => ({
        resolution_id: task.resolution_id,
        claim_number: task.claim_number,
        product_name: task.product_name,
        remedy_kind: task.remedy_kind,
        affected_area: task.affected_area,
        assigned_at: task.assigned_at,
      })),
    };
  } else if (profile.role === "agent") {
    const supabase = await createSupabaseServerClient();
    const [transferAttention, approvalReadyResult, locationPendingResult] = await Promise.all([
      getTransferAttentionCounts(),
      supabase
        .from("installation_centers")
        .select("id, code, name, city, country_code, location_captured_at")
        .eq("status", "active")
        .eq("approval_status", "unapproved")
        .not("latitude", "is", null)
        .not("longitude", "is", null)
        .not("location_captured_at", "is", null)
        .not("location_source", "is", null)
        .not("location_updated_by_profile_id", "is", null)
        .order("name", { ascending: true })
        .limit(4),
      supabase
        .from("installation_centers")
        .select("id, code, name, city, country_code, location_captured_at")
        .eq("status", "active")
        .eq("approval_status", "unapproved")
        .is("location_captured_at", null)
        .order("name", { ascending: true })
        .limit(4),
    ]);

    if (approvalReadyResult.error) throw approvalReadyResult.error;
    if (locationPendingResult.error) throw locationPendingResult.error;

    partnerAttention = {
      incomingActionCount: transferAttention.incomingActionCount,
      approvalReadyCenters: approvalReadyResult.data ?? [],
      locationPendingCenters: locationPendingResult.data ?? [],
    };
  } else if (profile.role === "dealer") {
    const transferAttention = await getTransferAttentionCounts();
    partnerAttention = {
      incomingActionCount: transferAttention.incomingActionCount,
      approvalReadyCenters: [],
      locationPendingCenters: [],
    };
  }

  const adminHasAttention = Boolean(adminAttention && (
    adminAttention.incomingActionCount > 0
    || adminAttention.submittedClaims.length > 0
    || adminAttention.reviewClaims.length > 0
    || adminAttention.unassignedResolutions.length > 0
  ));
  const centerHasAttention = Boolean(centerAttention && (
    centerAttention.incomingActionCount > 0
    || centerAttention.inspections.length > 0
    || centerAttention.resolutionTasks.length > 0
  ));
  const partnerHasAttention = Boolean(partnerAttention && (
    partnerAttention.incomingActionCount > 0
    || partnerAttention.approvalReadyCenters.length > 0
    || partnerAttention.locationPendingCenters.length > 0
  ));
  const isPartner = profile.role === "agent" || profile.role === "dealer";

  return (
    <>
      <PageHeader
        eyebrow="بوابة التشغيل"
        title={<>مرحبًا، <span className="ui-heading-accent">{profile.display_name}</span></>}
        description={profile.role === "admin"
          ? "ابدأ بالتحويلات الواردة والقرارات والإسنادات التي تنتظر الشركة الآن، ثم استخدم أدوات الإدارة والمراجع لباقي الأعمال."
          : profile.role === "center"
            ? "ابدأ بما يحتاج تدخلك الآن، ثم استخدم أدوات المركز والمراجع لباقي الأعمال."
            : profile.role === "agent"
              ? "ابدأ بالتحويلات الواردة وما يحتاج متابعة داخل شبكة وكالتك، ثم استخدم أدوات الشبكة لباقي الأعمال."
              : profile.role === "dealer"
                ? "ابدأ بالتحويلات الواردة التي تحتاج استلامًا، ثم استخدم أدوات الموزع والمراجع لباقي الأعمال."
                : "الأعمال التشغيلية المتاحة لدورك ونطاقك الحالي، من نفس خريطة الوصول المستخدمة في التنقل."}
      />

      {profile.role === "center" && centerApprovalStatus === "approved" ? (
        <FeedbackBanner tone="success">
          مركزك معتمد ضمن شبكة Protection Giants. الاعتماد تصنيف ثقة للشبكة، وليس شرطًا لاستلام اللفات أو فتحها أو تفعيل الضمان.
        </FeedbackBanner>
      ) : null}
      {profile.role === "center" && centerApprovalStatus !== "approved" ? (
        <FeedbackBanner tone="info">
          مركزك مسجل داخل المنصة لكنه غير معتمد ضمن الشبكة حاليًا. عدم الاعتماد لا يمنع تلقائيًا استلام اللفات أو فتحها أو تفعيل الضمان؛ لكل عملية شروطها المستقلة.
        </FeedbackBanner>
      ) : null}

      {profile.role === "admin" && adminAttention ? (
        <section className={styles.section} aria-labelledby="admin-attention-title">
          <div className={styles.sectionHeader}>
            <h2 id="admin-attention-title">يحتاج تدخل الشركة الآن</h2>
            <p>هذه حالات من قوائم التحويلات والمطالبات والتنفيذ المعتمدة نفسها. لا نعرض هنا ما ينتظر المركز، ولا نحول السجل التشغيلي إلى مؤشرات تحليلية.</p>
          </div>

          {adminHasAttention ? (
            <RecordList label="الأعمال الحالية التي تنتظر تدخل الشركة">
              {adminAttention.incomingActionCount > 0 ? (
                <RecordItem
                  kicker="تحويلات واردة"
                  title="يوجد استلام أو حسم مطلوب على تحويلات واردة"
                  subtitle="العهدة لا تنتقل إلا لللفات التي تؤكد الشركة استلامها فعليًا."
                  facts={[
                    { label: "تحتاج إجراء", value: adminAttention.incomingActionCount.toLocaleString("en-US") },
                  ]}
                  status={<StatusBadge tone="warning">إجراء مطلوب</StatusBadge>}
                  actions={<Link href="/operations/transfers?direction=incoming&scope=active" className="button button-primary">فتح الوارد</Link>}
                />
              ) : null}

              {adminAttention.submittedClaims.slice(0, 3).map((claim) => (
                <RecordItem
                  key={`submitted-${claim.claim_id}`}
                  kicker={<span dir="ltr">{claim.claim_number}</span>}
                  title={claim.product_name}
                  subtitle="مطالبة جديدة تنتظر بدء مراجعة الشركة"
                  facts={[
                    { label: "الحالة", value: "جديدة" },
                    { label: "تاريخ التقديم", value: <LocalDateTime value={claim.submitted_at} /> },
                  ]}
                  status={<StatusBadge tone="accent">بدء مراجعة</StatusBadge>}
                  actions={<Link href={`/operations/claims/${claim.claim_id}/review`} className="button button-primary">بدء المراجعة</Link>}
                />
              ))}

              {adminAttention.reviewClaims.slice(0, 3).map((claim) => (
                <RecordItem
                  key={`review-${claim.claim_id}`}
                  kicker={<span dir="ltr">{claim.claim_number}</span>}
                  title={claim.product_name}
                  subtitle={claim.inspection_status === "submitted"
                    ? "عاد الفحص الرسمي للشركة وتنتظر المطالبة استكمال المراجعة والقرار"
                    : "المطالبة لدى الشركة وتنتظر استكمال المراجعة"}
                  facts={[
                    { label: "الفحص", value: claim.inspection_status === "submitted" ? "تم الفحص" : "لا يوجد فحص معلّق" },
                    { label: "تاريخ التقديم", value: <LocalDateTime value={claim.submitted_at} /> },
                  ]}
                  status={<StatusBadge tone="warning">قرار الشركة</StatusBadge>}
                  actions={<Link href={`/operations/claims/${claim.claim_id}/review`} className="button button-primary">استكمال المراجعة</Link>}
                />
              ))}

              {adminAttention.unassignedResolutions.slice(0, 3).map((resolution) => (
                <RecordItem
                  key={`resolution-${resolution.resolution_id}`}
                  kicker={<span dir="ltr">{resolution.claim_number}</span>}
                  title={resolution.product_name}
                  subtitle="تم قبول المطالبة وأصبح التنفيذ بانتظار تحديد المعالجة ومركز التنفيذ"
                  facts={[
                    { label: "الحالة", value: "بانتظار الإسناد" },
                    { label: "تم اعتماد التنفيذ", value: <LocalDateTime value={resolution.authorized_at} /> },
                  ]}
                  status={<StatusBadge tone="warning">إسناد مطلوب</StatusBadge>}
                  actions={<Link href={`/operations/claim-resolutions/${resolution.resolution_id}`} className="button button-primary">إسناد التنفيذ</Link>}
                />
              ))}
            </RecordList>
          ) : (
            <EmptyState
              eyebrow="عمل الشركة الحالي"
              title="لا توجد أعمال تحتاج تدخل الشركة الآن"
              description="لا توجد تحويلات واردة تحتاج إجراء ولا قرارات أو إسنادات معلقة على الشركة. ما ينتظر فحص مركز أو تنفيذًا تم إسناده يظل خارج هذه القائمة، وتبقى السجلات الكاملة متاحة من الأدوات أدناه."
              action={<Link href="/operations/transfers?direction=incoming&scope=active" className="button button-primary">مراجعة التحويلات الواردة</Link>}
            />
          )}
        </section>
      ) : null}

      {profile.role === "center" && centerAttention ? (
        <section className={styles.section} aria-labelledby="center-attention-title">
          <div className={styles.sectionHeader}>
            <h2 id="center-attention-title">يحتاج انتباهك الآن</h2>
            <p>هذه إشارات من قوائم العمل المعتمدة نفسها، وليست أرقامًا تحليلية. نعرض عينة محدودة من المهام الحالية، وتظل القوائم الأصلية المرجع الكامل.</p>
          </div>

          {centerHasAttention ? (
            <RecordList label="الأعمال الحالية التي تحتاج تدخل المركز">
              {centerAttention.incomingActionCount > 0 ? (
                <RecordItem
                  kicker="تحويلات واردة"
                  title="يوجد استلام أو حسم مطلوب على تحويلات واردة"
                  subtitle="العهدة لا تنتقل إلا عند تأكيد الاستلام الفعلي لللفات التي وصلت."
                  facts={[
                    { label: "تحتاج إجراء", value: centerAttention.incomingActionCount.toLocaleString("en-US") },
                  ]}
                  status={<StatusBadge tone="warning">إجراء مطلوب</StatusBadge>}
                  actions={<Link href="/operations/transfers?direction=incoming&scope=active" className="button button-primary">فتح الوارد</Link>}
                />
              ) : null}

              {centerAttention.inspections.slice(0, 3).map((inspection) => (
                <RecordItem
                  key={inspection.inspection_id}
                  kicker={<span dir="ltr">{inspection.claim_number}</span>}
                  title={inspection.product_name}
                  subtitle="فحص مطالبة ضمان مسند إلى مركزك"
                  facts={[
                    { label: "المنطقة المتأثرة", value: inspection.affected_area },
                    { label: "طلب الفحص", value: <LocalDateTime value={inspection.requested_at} /> },
                  ]}
                  status={<StatusBadge tone="warning">فحص مطلوب</StatusBadge>}
                  actions={<Link href={`/operations/claim-inspections/${inspection.inspection_id}`} className="button button-primary">فتح الفحص</Link>}
                />
              ))}

              {centerAttention.resolutionTasks.slice(0, 3).map((task) => (
                <RecordItem
                  key={task.resolution_id}
                  kicker={<span dir="ltr">{task.claim_number}</span>}
                  title={task.product_name}
                  subtitle="تنفيذ مطالبة مقبولة مسند إلى مركزك"
                  facts={[
                    { label: "العلاج", value: remedyLabel(task.remedy_kind) },
                    { label: "المنطقة المتأثرة", value: task.affected_area },
                    { label: "تم الإسناد", value: <LocalDateTime value={task.assigned_at} /> },
                  ]}
                  status={<StatusBadge tone="warning">تنفيذ مطلوب</StatusBadge>}
                  actions={<Link href={`/operations/claim-resolution-tasks/${task.resolution_id}`} className="button button-primary">فتح المهمة</Link>}
                />
              ))}
            </RecordList>
          ) : (
            <EmptyState
              eyebrow="العمل الحالي"
              title="لا توجد مهام تحتاج تدخلك الآن"
              description="عند وصول تحويل أو إسناد فحص أو تنفيذ مطالبة سيظهر هنا. وإذا بدأ تركيب فعلي جديد، ابدأ بفتح الرول الذي ستستخدمه."
              action={<Link href="/operations/rolls/open" className="button button-primary">فتح رول عند بدء تركيب</Link>}
            />
          )}
        </section>
      ) : null}

      {isPartner && partnerAttention ? (
        <section className={styles.section} aria-labelledby="partner-attention-title">
          <div className={styles.sectionHeader}>
            <h2 id="partner-attention-title">يحتاج انتباهك الآن</h2>
            <p>نعرض فقط العمل المستند إلى حالة تشغيلية حالية داخل نطاقك، بدون مؤشرات تحليلية أو أرقام مصطنعة.</p>
          </div>

          {partnerHasAttention ? (
            <RecordList label={profile.role === "agent" ? "الأعمال الحالية في نطاق الوكيل" : "الأعمال الحالية في نطاق الموزع"}>
              {partnerAttention.incomingActionCount > 0 ? (
                <RecordItem
                  kicker="تحويلات واردة"
                  title="يوجد استلام أو حسم مطلوب على تحويلات واردة"
                  subtitle="العهدة لا تنتقل إلا لللفات التي تؤكد جهتك استلامها فعليًا."
                  facts={[
                    { label: "تحتاج إجراء", value: partnerAttention.incomingActionCount.toLocaleString("en-US") },
                  ]}
                  status={<StatusBadge tone="warning">استلام مطلوب</StatusBadge>}
                  actions={<Link href="/operations/transfers?direction=incoming&scope=active" className="button button-primary">فتح الوارد</Link>}
                />
              ) : null}

              {profile.role === "agent" ? partnerAttention.approvalReadyCenters.slice(0, 3).map((center) => (
                <RecordItem
                  key={`approval-${center.id}`}
                  kicker={<span dir="ltr">{center.code}</span>}
                  title={center.name}
                  subtitle="مركز نشط اكتمل تسجيل موقعه وأصبح جاهزًا لمراجعة اعتماد الشبكة."
                  facts={[
                    { label: "الموقع", value: <>{center.city} · <span dir="ltr">{center.country_code}</span></> },
                    { label: "تم تسجيل الموقع", value: center.location_captured_at ? <LocalDateTime value={center.location_captured_at} /> : "غير متاح" },
                  ]}
                  status={<StatusBadge tone="warning">مراجعة اعتماد</StatusBadge>}
                  actions={<Link href={`/operations/centers/${center.id}/approval`} className="button button-primary">مراجعة الاعتماد</Link>}
                />
              )) : null}

              {profile.role === "agent" ? partnerAttention.locationPendingCenters.slice(0, 3).map((center) => (
                <RecordItem
                  key={`setup-${center.id}`}
                  kicker={<span dir="ltr">{center.code}</span>}
                  title={center.name}
                  subtitle="المركز نشط وغير معتمد، لكن الاعتماد متوقف حتى يسجل المركز موقعه الجغرافي الحالي."
                  facts={[
                    { label: "الموقع", value: <>{center.city} · <span dir="ltr">{center.country_code}</span></> },
                    { label: "الموقع الجغرافي", value: "غير مسجل" },
                  ]}
                  status={<StatusBadge tone="neutral">إعداد غير مكتمل</StatusBadge>}
                  actions={<Link href={`/operations/centers/${center.id}/approval`} className="button button-ghost">فتح حالة الاعتماد</Link>}
                />
              )) : null}
            </RecordList>
          ) : (
            <EmptyState
              eyebrow="العمل الحالي"
              title="لا توجد أعمال تحتاج تدخلك الآن"
              description={profile.role === "agent"
                ? "لا توجد تحويلات واردة تحتاج استلامًا ولا مراكز نشطة في نطاقك تنتظر خطوة اعتماد أو استكمال موقع حاليًا."
                : "لا توجد تحويلات واردة تحتاج استلامًا حاليًا. تظل المراكز والعهدة والمنتجات متاحة من أدوات الموزع أدناه."}
              action={<Link href="/operations/transfers?direction=incoming&scope=active" className="button button-primary">مراجعة التحويلات</Link>}
            />
          )}
        </section>
      ) : null}

      {profile.role === "admin" ? (
        <section className={styles.moduleSection} aria-labelledby="admin-modules-title">
          <div className={styles.sectionHeader}>
            <h2 id="admin-modules-title">أدوات الإدارة والمراجع</h2>
            <p>استخدمها للوصول إلى التشغيل الكامل والسجلات والإعدادات التي لا تمثل عملًا عاجلًا الآن. كل الوجهات تظل من خريطة S03R نفسها.</p>
          </div>
          <div className="ui-module-grid" aria-label="أدوات الإدارة والمراجع">
            {modules.map((module) => (
              <ModuleCard
                key={module.id}
                href={module.href}
                title={module.title}
                description={module.description}
                icon={module.icon}
              />
            ))}
          </div>
        </section>
      ) : profile.role === "center" ? (
        <section className={styles.moduleSection} aria-labelledby="center-modules-title">
          <div className={styles.sectionHeader}>
            <h2 id="center-modules-title">أدوات ومراجع المركز</h2>
            <p>استخدمها لبدء إجراء جديد أو مراجعة حالة لا تظهر كعمل عاجل. تظل كل الوجهات الصحيحة لدورك متاحة هنا وفي التنقل.</p>
          </div>
          <div className="ui-module-grid" aria-label="أدوات ومراجع المركز">
            {modules.map((module) => (
              <ModuleCard
                key={module.id}
                href={module.href}
                title={module.title}
                description={module.description}
                icon={module.icon}
              />
            ))}
          </div>
        </section>
      ) : isPartner ? (
        <section className={styles.moduleSection} aria-labelledby="partner-modules-title">
          <div className={styles.sectionHeader}>
            <h2 id="partner-modules-title">{profile.role === "agent" ? "أدوات ومراجع شبكة الوكيل" : "أدوات ومراجع الموزع"}</h2>
            <p>استخدمها لإدارة الشبكة والعهدة أو الرجوع إلى معلومات لا تمثل عملًا عاجلًا الآن. كل الوجهات المسموحة لدورك تظل من خريطة S03R نفسها.</p>
          </div>
          <div className="ui-module-grid" aria-label={profile.role === "agent" ? "أدوات ومراجع شبكة الوكيل" : "أدوات ومراجع الموزع"}>
            {modules.map((module) => (
              <ModuleCard
                key={module.id}
                href={module.href}
                title={module.title}
                description={module.description}
                icon={module.icon}
              />
            ))}
          </div>
        </section>
      ) : (
        <section className="ui-module-grid" aria-label="الأعمال التشغيلية المتاحة">
          {modules.map((module) => (
            <ModuleCard
              key={module.id}
              href={module.href}
              title={module.title}
              description={module.description}
              icon={module.icon}
            />
          ))}
        </section>
      )}
    </>
  );
}
