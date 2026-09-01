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

function remedyLabel(remedy: string) {
  return remedy === "replacement_roll_reinstall" ? "إعادة تركيب برول بديل" : "إعادة تنفيذ الخدمة";
}

export default async function OperationsPage() {
  const profile = await requireOperationalProfile();
  const modules = getHomeDestinations(profile.role);

  let centerApprovalStatus: string | null = null;
  let centerAttention: CenterAttention | null = null;

  if (profile.role === "center") {
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
  }

  const centerHasAttention = Boolean(centerAttention && (
    centerAttention.incomingActionCount > 0
    || centerAttention.inspections.length > 0
    || centerAttention.resolutionTasks.length > 0
  ));

  return (
    <>
      <PageHeader
        eyebrow="بوابة التشغيل"
        title={<>مرحبًا، <span className="ui-heading-accent">{profile.display_name}</span></>}
        description={profile.role === "admin"
          ? "الأعمال الإدارية والتشغيلية المتاحة حاليًا في المنصة، مرتبة من نفس خريطة الوصول المستخدمة في التنقل."
          : profile.role === "center"
            ? "ابدأ بما يحتاج تدخلك الآن، ثم استخدم أدوات المركز والمراجع لباقي الأعمال."
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

      {profile.role === "center" ? (
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
