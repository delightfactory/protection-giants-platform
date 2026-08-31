/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CenterClaimResolutionCompletionForm } from "@/components/claims/center-claim-resolution-completion-form";
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

function remedyLabel(remedy: string) {
  return remedy === "replacement_roll_reinstall" ? "إعادة تركيب برول بديل" : "إعادة تنفيذ الخدمة";
}

function qualityLabel(state: string | null) {
  if (state === "pending") return "بلاغ جودة قيد المراجعة";
  if (state === "return_required") return "الرول غير صالح للاستخدام";
  if (state === "clear_history") return "لا يوجد حظر جودة حالي";
  return "لا يوجد بلاغ جودة";
}

export default async function ClaimResolutionTaskDetailPage({ params }: PageProps) {
  const profile = await requireOperationalProfile();
  if (profile.role !== "center") redirect("/access-denied");

  const { id } = await params;
  if (!UUID_PATTERN.test(id)) notFound();

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_center_warranty_claim_resolution_task", {
    p_resolution_id: id,
  });
  if (error) {
    if (error.message === "PG_CLAIM_RESOLUTION_CENTER_REQUIRED") redirect("/access-denied");
    if (error.message === "PG_CLAIM_RESOLUTION_TASK_NOT_FOUND") redirect("/operations/claim-resolution-tasks");
    throw error;
  }
  if (!data || data.length !== 1) redirect("/operations/claim-resolution-tasks");
  const task = data[0];

  const evidenceResult = await supabase.rpc("list_center_warranty_claim_resolution_evidence", {
    p_resolution_id: id,
  });
  if (evidenceResult.error) {
    if (evidenceResult.error.message === "PG_CLAIM_RESOLUTION_CENTER_REQUIRED") redirect("/access-denied");
    if (evidenceResult.error.message === "PG_CLAIM_RESOLUTION_TASK_NOT_FOUND") redirect("/operations/claim-resolution-tasks");
    throw evidenceResult.error;
  }

  const admin = createSupabaseAdminClient();
  const evidence = await Promise.all((evidenceResult.data ?? []).map(async (item, index) => {
    const { data: signed, error: signedError } = await admin.storage
      .from("warranty-claim-evidence")
      .createSignedUrl(item.storage_path, EVIDENCE_URL_TTL_SECONDS);
    return {
      ...item,
      displayOrder: index + 1,
      signedUrl: signedError ? null : signed.signedUrl,
    };
  }));

  const customerEvidence = evidence.filter((item) => item.evidence_scope === "customer_submission");
  const inspectionEvidence = evidence.filter((item) => item.evidence_scope === "inspection");
  const vehicle = [task.vehicle_make, task.vehicle_model, task.vehicle_year].filter(Boolean).join(" · ");
  const isReplacement = task.remedy_kind === "replacement_roll_reinstall";
  const hasReplacementRoll = Boolean(task.replacement_roll_serial);
  const replacementOpened = Boolean(task.replacement_roll_opened_at);
  const replacementBlocked = task.replacement_quality_state === "pending"
    || task.replacement_quality_state === "return_required";
  const canComplete = !isReplacement || (hasReplacementRoll && replacementOpened && !replacementBlocked);

  return (
    <>
      <PageHeader
        eyebrow="تنفيذ مطالبة ضمان"
        title={task.claim_number}
        description="هذه الصفحة تعرض فقط سياق العمل المطلوب من مركزك. نفّذ العلاج المحدد، واستخدم الرول المعين فقط عند الاستبدال، ثم ارفع دليل الإكمال."
        meta={`الإسناد: ${new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Cairo" }).format(new Date(task.assigned_at))}`}
        actions={<TaskBackLink href="/operations/claim-resolution-tasks" label="العودة إلى مهام التنفيذ" />}
      />

      <div className={styles.stack}>
        <section className={styles.card} aria-label="سياق مهمة التنفيذ">
          <div className={styles.heading}>
            <div><span className={styles.eyebrow}>المهمة الحالية</span><h2>{task.product_name}</h2></div>
            <StatusBadge tone="warning">تنفيذ مطلوب</StatusBadge>
          </div>
          <dl className={styles.grid}>
            <div><dt>رقم المطالبة</dt><dd dir="ltr">{task.claim_number}</dd></div>
            <div><dt>العلاج المعتمد</dt><dd>{remedyLabel(task.remedy_kind)}</dd></div>
            <div><dt>المنتج</dt><dd>{task.product_name}</dd></div>
            <div><dt>إصدار المنتج</dt><dd>{task.product_version ?? "—"}</dd></div>
            <div><dt>كود المنتج</dt><dd dir="ltr">{task.product_code}</dd></div>
            <div><dt>السيارة</dt><dd>{vehicle || "—"}</dd></div>
            <div><dt>رقم اللوحة</dt><dd>{task.vehicle_plate ?? "—"}</dd></div>
            <div><dt>اللون</dt><dd>{task.vehicle_color ?? "—"}</dd></div>
            <div><dt>VIN / الشاسيه</dt><dd dir="ltr">{task.vehicle_vin ?? "—"}</dd></div>
            <div><dt>المنطقة المتأثرة</dt><dd>{task.affected_area}</dd></div>
          </dl>
        </section>

        <section className={styles.card} aria-label="وصف المشكلة وسياق الضمان">
          <div className={styles.heading}><h2>المشكلة وسياق العمل</h2></div>
          <div className={styles.prose}>
            <h3>وصف العميل</h3><p>{task.description}</p>
            <h3>نطاق التغطية المثبت</h3><p>{task.warranty_coverage}</p>
            <h3>تعليمات العناية المثبتة</h3><p>{task.care_instructions}</p>
          </div>
        </section>

        {task.inspection_status === "submitted" ? (
          <section className={styles.card} aria-label="نتيجة الفحص الفني">
            <div className={styles.heading}><h2>نتيجة الفحص السابقة</h2></div>
            <div className={styles.prose}>
              <h3>الملاحظة الفنية</h3><p>{task.inspection_technical_observation ?? "—"}</p>
              <h3>السبب المشتبه به</h3><p>{task.inspection_suspected_cause ?? "لم يسجل المركز سببًا مشتبهًا به."}</p>
            </div>
          </section>
        ) : null}

        <section className={styles.card} aria-label="أدلة المطالبة والفحص">
          <div className={styles.heading}>
            <div><span className={styles.eyebrow}>دليل العمل</span><h2>الصور المتاحة للمركز</h2></div>
            <span className={styles.count}>{evidence.length.toLocaleString("en-US")} صورة</span>
          </div>

          {customerEvidence.length > 0 ? (
            <>
              <h3 className={styles.sectionTitle}>صور العميل</h3>
              <div className={styles.evidenceGrid}>
                {customerEvidence.map((item) => (
                  <article className={styles.evidenceItem} key={`${item.storage_path}-${item.displayOrder}`}>
                    {item.signedUrl ? (
                      <a href={item.signedUrl} target="_blank" rel="noreferrer" className={styles.imageLink}>
                        <img src={item.signedUrl} alt={`صورة العميل ${item.displayOrder}`} loading="lazy" />
                      </a>
                    ) : <div className={styles.imageUnavailable}>تعذر إنشاء رابط عرض مؤقت</div>}
                    <div className={styles.evidenceMeta}>
                      <span>{item.mime_type}</span><span>{formatBytes(item.size_bytes)}</span><LocalDateTime value={item.created_at} />
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : <p className={styles.muted}>لا توجد صور عميل متاحة لهذه المطالبة.</p>}

          {inspectionEvidence.length > 0 ? (
            <>
              <h3 className={styles.sectionTitle}>صور الفحص</h3>
              <div className={styles.evidenceGrid}>
                {inspectionEvidence.map((item) => (
                  <article className={styles.evidenceItem} key={`${item.storage_path}-${item.displayOrder}`}>
                    {item.signedUrl ? (
                      <a href={item.signedUrl} target="_blank" rel="noreferrer" className={styles.imageLink}>
                        <img src={item.signedUrl} alt={`صورة الفحص ${item.displayOrder}`} loading="lazy" />
                      </a>
                    ) : <div className={styles.imageUnavailable}>تعذر إنشاء رابط عرض مؤقت</div>}
                    <div className={styles.evidenceMeta}>
                      <span>{item.mime_type}</span><span>{formatBytes(item.size_bytes)}</span><LocalDateTime value={item.created_at} />
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : null}
        </section>

        {isReplacement ? (
          <section className={styles.card} aria-label="الرول البديل المعين">
            <div className={styles.heading}>
              <div><span className={styles.eyebrow}>مادة الاستبدال</span><h2>الرول المحدد لهذه المهمة فقط</h2></div>
              <StatusBadge tone={replacementBlocked ? "danger" : replacementOpened ? "success" : "warning"}>
                {replacementBlocked ? "متوقف" : replacementOpened ? "جاهز للإكمال" : "يحتاج فتح"}
              </StatusBadge>
            </div>

            {hasReplacementRoll ? (
              <>
                <dl className={styles.grid}>
                  <div><dt>Serial الرول</dt><dd dir="ltr">{task.replacement_roll_serial}</dd></div>
                  <div><dt>كود المنتج</dt><dd dir="ltr">{task.replacement_roll_product_code ?? "—"}</dd></div>
                  <div><dt>المنتج</dt><dd>{task.replacement_roll_product_name ?? "—"}</dd></div>
                  <div><dt>الإصدار</dt><dd>{task.replacement_roll_product_version ?? "—"}</dd></div>
                  <div><dt>حالة الفتح</dt><dd>{replacementOpened ? <LocalDateTime value={task.replacement_roll_opened_at!} /> : "لم يُفتح بعد"}</dd></div>
                  <div><dt>حالة الجودة</dt><dd>{qualityLabel(task.replacement_quality_state)}</dd></div>
                </dl>

                <div className={styles.guidance}>
                  <strong>التسلسل المطلوب</strong>
                  <p>افتح نفس الرول المسند عبر Cube J. إذا اكتشفت مشكلة قبل التركيب استخدم بلاغات ما قبل التركيب (Cube K). لا تستخدم رولًا مختلفًا، ولا تكمل المهمة أثناء وجود بلاغ جودة معلق أو قرار إرجاع.</p>
                </div>

                <div className={styles.actions}>
                  {!replacementOpened ? (
                    <Link href="/operations/rolls/open" className="button button-primary">فتح الرول عبر المسار المعتمد</Link>
                  ) : null}
                  {replacementOpened ? (
                    <Link href="/operations/rolls/issues/new" className="button button-secondary">تسجيل مشكلة قبل التركيب</Link>
                  ) : null}
                  <Link href="/operations/rolls/issues" className="button button-ghost">متابعة بلاغات الرولات</Link>
                </div>

                {task.replacement_quality_state === "pending" ? (
                  <p className={styles.blocked}>لا يمكن إغلاق المهمة قبل حسم بلاغ الجودة الحالي.</p>
                ) : null}
                {task.replacement_quality_state === "return_required" ? (
                  <p className={styles.blocked}>هذا الرول صدر له قرار إرجاع ولا يمكن استهلاكه في المطالبة. تظل المهمة مفتوحة حتى تقوم الشركة بتحريره وتعيين رول صالح آخر.</p>
                ) : null}
              </>
            ) : (
              <p className={styles.blocked}>لم تخصص الشركة رولًا بديلًا لهذه المهمة بعد. لا تبدأ استخدام مادة بديلة من مخزونك؛ انتظر ظهور الرول المحدد هنا.</p>
            )}
          </section>
        ) : null}

        {canComplete ? (
          <CenterClaimResolutionCompletionForm
            resolutionId={task.resolution_id}
            remedyKind={task.remedy_kind}
            expectedRollSerial={task.replacement_roll_serial}
          />
        ) : (
          <section className={styles.card} aria-label="حالة الإكمال">
            <div className={styles.heading}><h2>إغلاق المهمة</h2></div>
            <p className={styles.muted}>نموذج الإكمال سيصبح متاحًا عندما تكتمل المتطلبات التشغيلية أعلاه.</p>
          </section>
        )}
      </div>
    </>
  );
}
