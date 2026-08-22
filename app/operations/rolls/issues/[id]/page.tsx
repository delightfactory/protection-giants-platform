import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { RollPreinstallIssueDecisionPanel } from "@/components/rolls/roll-preinstall-issue-decision-panel";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { TaskBackLink } from "@/components/ui/task-back-link";
import { requireOperationalProfile } from "@/lib/auth/operational-profile";
import {
  rollPreinstallIssueCategoryLabel,
  rollPreinstallIssueStatusLabel,
  rollPreinstallIssueStatusTone,
} from "@/lib/rolls/preinstall-issue-presenters";
import { ROLL_PREINSTALL_ISSUE_EVIDENCE_BUCKET } from "@/lib/rolls/preinstall-issues";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import styles from "./page.module.css";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type IssueDetailPageProps = {
  params: Promise<{ id: string }>;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024)).toLocaleString("en-US")} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function eventLabel(kind: string) {
  switch (kind) {
    case "submitted": return "تم إرسال البلاغ";
    case "cleared_for_use": return "سمحت الشركة باستخدام الرول";
    case "return_required": return "قررت الشركة إرجاع الرول";
    case "reported_in_error": return "سجلت الشركة أن البلاغ أُنشئ بالخطأ";
    default: return "حدث في البلاغ";
  }
}

export default async function RollPreinstallIssueDetailPage({ params }: IssueDetailPageProps) {
  const profile = await requireOperationalProfile();
  if (profile.role !== "admin" && profile.role !== "center") redirect("/access-denied");

  const issueId = (await params).id;
  if (!uuidPattern.test(issueId)) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: detailRows, error: detailError } = await supabase.rpc("get_roll_preinstall_issue_detail", {
    p_issue_id: issueId,
  });

  if (detailError || !Array.isArray(detailRows) || detailRows.length !== 1) notFound();
  const issue = detailRows[0];

  const [eventsResult, evidenceResult] = await Promise.all([
    supabase
      .from("roll_preinstall_issue_events")
      .select("id, event_kind, actor_profile_id, reason, created_at")
      .eq("issue_id", issueId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
    supabase
      .from("roll_preinstall_issue_evidence")
      .select("id, storage_path, mime_type, size_bytes, created_at")
      .eq("issue_id", issueId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
  ]);

  if (eventsResult.error) throw eventsResult.error;
  if (evidenceResult.error) throw evidenceResult.error;

  const adminStorage = createSupabaseAdminClient();
  const evidence = await Promise.all(evidenceResult.data.map(async (item, index) => {
    const { data, error } = await adminStorage.storage
      .from(ROLL_PREINSTALL_ISSUE_EVIDENCE_BUCKET)
      .createSignedUrl(item.storage_path, 600);
    if (error || !data?.signedUrl) {
      return { ...item, index: index + 1, signedUrl: null };
    }
    return { ...item, index: index + 1, signedUrl: data.signedUrl };
  }));

  const isAdmin = profile.role === "admin";

  return (
    <>
      <PageHeader
        eyebrow={isAdmin ? "مراجعة الجودة" : "بلاغ ما قبل التركيب"}
        title="تفاصيل البلاغ"
        description="هذا السجل يحفظ البلاغ والقرار والأدلة كما حدثت، ولا يغيّر عهدة الرول أو حدث الفتح."
        meta={`الرول: ${issue.serial_number}`}
        actions={<TaskBackLink href="/operations/rolls/issues" label="العودة إلى البلاغات" />}
      />

      <div className={styles.layout}>
        <section className={styles.card}>
          <div className={styles.actions}>
            <StatusBadge tone={rollPreinstallIssueStatusTone(issue.status)}>{rollPreinstallIssueStatusLabel(issue.status)}</StatusBadge>
          </div>

          <div className={styles.identity}>
            <strong>{issue.product_name}</strong>
            <span>{issue.center_name}</span>
            <span dir="ltr">SKU: {issue.product_code}</span>
            <code>{issue.serial_number}</code>
            <span dir="ltr">Lot: {issue.lot_number}</span>
          </div>

          <div className={styles.facts}>
            <div className={styles.fact}><span>نوع المشكلة</span><strong>{rollPreinstallIssueCategoryLabel(issue.category)}</strong></div>
            <div className={styles.fact}><span>وقت فتح الرول</span><strong dir="ltr">{formatDate(issue.opened_at)}</strong></div>
            <div className={styles.fact}><span>وقت إرسال البلاغ</span><strong dir="ltr">{formatDate(issue.created_at)}</strong></div>
            <div className={styles.fact}><span>وقت القرار</span><strong dir="ltr">{formatDate(issue.resolved_at)}</strong></div>
          </div>

          <div>
            <h2>وصف المركز</h2>
            <div className={styles.description}>{issue.description}</div>
          </div>
        </section>

        <section className={styles.card}>
          <div>
            <h2>الأدلة المرفقة</h2>
            <p>{evidence.length ? "الصور خاصة وتُفتح بروابط مؤقتة بعد التحقق من صلاحية الحساب." : "لم يرفق المركز صورًا مع هذا البلاغ، وهو مسموح في الإصدار الحالي."}</p>
          </div>
          {evidence.length ? (
            <ul className={styles.evidenceList}>
              {evidence.map((item) => (
                <li key={item.id} className={styles.evidenceItem}>
                  <strong>صورة {item.index.toLocaleString("en-US")}</strong>
                  <div className={styles.evidenceMeta}>
                    <span dir="ltr">{item.mime_type}</span>
                    <span dir="ltr">{formatSize(item.size_bytes)}</span>
                    <span dir="ltr">{formatDate(item.created_at)}</span>
                  </div>
                  {item.signedUrl
                    ? <a href={item.signedUrl} className="button button-ghost" target="_blank" rel="noreferrer">عرض الصورة</a>
                    : <span>تعذر إنشاء رابط العرض المؤقت لهذه الصورة.</span>}
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className={styles.card}>
          <div>
            <h2>السجل الزمني</h2>
            <p>الأحداث أدناه غير قابلة للتعديل أو الحذف.</p>
          </div>
          <ol className={styles.timeline}>
            {eventsResult.data.map((event) => (
              <li key={event.id} className={styles.timelineItem}>
                <strong>{eventLabel(event.event_kind)}</strong>
                <div className={styles.timelineMeta}>
                  <span>{event.event_kind === "submitted" ? issue.center_name : issue.resolved_by_name ?? "Protection Giants"}</span>
                  <span dir="ltr">{formatDate(event.created_at)}</span>
                </div>
                {event.reason ? <p>{event.reason}</p> : null}
              </li>
            ))}
          </ol>
        </section>

        {issue.status === "submitted" ? (
          isAdmin ? (
            <RollPreinstallIssueDecisionPanel issueId={issue.issue_id} />
          ) : (
            <section className={styles.card}>
              <div className={styles.outcomeNote}>
                <strong>البلاغ قيد مراجعة الشركة</strong>
                <p>تفعيل الضمان على هذا الرول متوقف مؤقتًا، كما لا يمكن تنفيذ Recovery قبل صدور القرار.</p>
              </div>
            </section>
          )
        ) : (
          <section className={styles.card}>
            <div className={styles.outcomeNote}>
              <strong>{rollPreinstallIssueStatusLabel(issue.status)}</strong>
              {issue.resolution_reason ? <p>{issue.resolution_reason}</p> : null}
              {issue.status === "cleared_for_use" ? (
                <p>هذا البلاغ لم يعد يمنع التفعيل، مع بقاء أي شروط تشغيلية أخرى للمكعبات اللاحقة واجبة التحقق.</p>
              ) : null}
              {issue.status === "return_required" ? (
                <p>الرول يظل محظورًا من التفعيل. قرار الإرجاع لا ينقل العهدة؛ يتم Recovery فقط عند الاستلام المادي.</p>
              ) : null}
              {issue.status === "reported_in_error" ? (
                <p>تم إغلاق الـhold الخاص بهذا البلاغ كتصحيح إداري، مع بقاء البلاغ والأدلة محفوظة في التاريخ.</p>
              ) : null}
            </div>
            {isAdmin && issue.status === "return_required" ? (
              <div className={styles.actions}>
                <Link href="/operations/rolls/recovery" className="button button-primary">فتح مسار الاسترداد عند الاستلام</Link>
              </div>
            ) : null}
          </section>
        )}
      </div>
    </>
  );
}
