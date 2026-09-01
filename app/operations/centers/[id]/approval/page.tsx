import { notFound, redirect } from "next/navigation";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { FormPanel, FormSection } from "@/components/ui/form-layout";
import { LocalDateTime } from "@/components/ui/local-date-time";
import { PageHeader } from "@/components/ui/page-header";
import { RecordItem, RecordList } from "@/components/ui/record-list";
import { StatusBadge } from "@/components/ui/status-badge";
import { TaskBackLink } from "@/components/ui/task-back-link";
import { requireOperationalProfile } from "@/lib/auth/operational-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import styles from "../center-detail.module.css";
import { approveCenterNetwork, revokeCenterNetworkApproval } from "./actions";

type CenterApprovalPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const eventLabels: Record<string, string> = {
  approved: "تم اعتماد المركز",
  revoked: "تم إلغاء الاعتماد",
  location_changed: "أُلغي الاعتماد بسبب تغير الموقع",
};

function formatCoordinate(value: number) {
  return value.toFixed(6);
}

export default async function CenterApprovalPage({ params, searchParams }: CenterApprovalPageProps) {
  const profile = await requireOperationalProfile();
  if (profile.role !== "admin" && profile.role !== "agent") redirect("/access-denied");

  const { id } = await params;
  const { error: pageError, success } = await searchParams;
  if (!uuidPattern.test(id)) notFound();

  const supabase = await createSupabaseServerClient();
  const [centerResult, historyResult] = await Promise.all([
    supabase
      .from("installation_centers")
      .select("id, code, name, city, country_code, status, dealer_id, country_agent_id, latitude, longitude, location_captured_at, location_source, approval_status, approved_at, approved_by_profile_id")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("center_network_approval_events")
      .select("id, action, actor_profile_id, occurred_at")
      .eq("installation_center_id", id)
      .order("occurred_at", { ascending: false })
      .order("id", { ascending: false }),
  ]);

  if (centerResult.error) throw centerResult.error;
  if (historyResult.error) throw historyResult.error;
  if (!centerResult.data) notFound();

  const center = centerResult.data;
  const hasLocation = center.latitude !== null && center.longitude !== null && center.location_captured_at !== null;
  const isActive = center.status === "active";
  const isApproved = center.approval_status === "approved";
  const canApprove = !isApproved && isActive && hasLocation;

  const [dealerResult, agentResult] = await Promise.all([
    center.dealer_id
      ? supabase.from("dealers").select("id, code, name").eq("id", center.dealer_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    center.country_agent_id
      ? supabase.from("country_agents").select("id, code, name").eq("id", center.country_agent_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (dealerResult.error) throw dealerResult.error;
  if (agentResult.error) throw agentResult.error;

  const parentLabel = dealerResult.data
    ? `${dealerResult.data.name} (${dealerResult.data.code})`
    : agentResult.data
      ? `${agentResult.data.name} (${agentResult.data.code})`
      : "مباشر للشركة";

  const actorIds = profile.role === "admin"
    ? Array.from(new Set([
        ...historyResult.data.map((event) => event.actor_profile_id),
        center.approved_by_profile_id,
      ].filter((value): value is string => Boolean(value))))
    : [];
  const actorResult = actorIds.length > 0
    ? await supabase.from("profiles").select("id, display_name").in("id", actorIds)
    : { data: [], error: null };
  if (actorResult.error) throw actorResult.error;
  const actorNames = new Map(actorResult.data.map((actor) => [actor.id, actor.display_name]));

  function actorLabel(actorProfileId: string | null) {
    if (!actorProfileId) return "حساب سابق";
    if (actorProfileId === profile.id) return "أنت";
    if (profile.role === "admin") return actorNames.get(actorProfileId) ?? "حساب سابق";
    return "مسؤول مخول";
  }

  return (
    <>
      <PageHeader
        eyebrow="اعتماد شبكة Protection Giants"
        title={center.name}
        description="راجع الحالة التشغيلية والموقع أولًا، ثم نفّذ قرار الاعتماد فقط إذا كانت الشروط الحالية واضحة ومكتملة."
        meta={<><span dir="ltr">{center.code}</span> · {center.city} · <span dir="ltr">{center.country_code}</span></>}
        actions={<TaskBackLink href={`/operations/centers/${center.id}/edit`} label="العودة لإدارة المركز" />}
      />

      {pageError === "approve" ? (
        <FeedbackBanner tone="error">تعذر اعتماد المركز. ربما تغير الموقع منذ فتح الصفحة، أو لم يعد المركز نشطًا أو داخل نطاق صلاحيتك. أعد تحميل الصفحة وراجع الموقع الحالي ثم حاول مرة أخرى.</FeedbackBanner>
      ) : null}
      {pageError === "revoke" ? (
        <FeedbackBanner tone="error">تعذر إلغاء اعتماد المركز. تحقق من أن المركز ما زال داخل نطاق صلاحيتك ثم أعد المحاولة.</FeedbackBanner>
      ) : null}
      {success === "approved" ? (
        <FeedbackBanner tone="success">تم اعتماد المركز وتسجيل العملية في سجل الاعتماد.</FeedbackBanner>
      ) : null}
      {success === "revoked" ? (
        <FeedbackBanner tone="success">تم إلغاء الاعتماد وتسجيل العملية دون تغيير الحالة التشغيلية للمركز.</FeedbackBanner>
      ) : null}

      <div className={styles.pageStack}>
        <FormPanel>
          <FormSection
            title="الحالة الحالية"
            description="الحالة التشغيلية واعتماد الشبكة مستقلان عن بعضهما؛ راجعهما قبل أي قرار."
          >
            <div className={styles.stateNote}>
              <div className={styles.stateHeader}>
                <strong>{parentLabel}</strong>
                <StatusBadge tone={isApproved ? "success" : "neutral"}>
                  {isApproved ? "معتمد" : "غير معتمد"}
                </StatusBadge>
              </div>
              <p>الحالة التشغيلية: <strong>{isActive ? "نشط" : "موقوف"}</strong></p>
              <p>اعتماد الشبكة: <strong>{isApproved ? "معتمد" : "غير معتمد"}</strong></p>
              {isApproved && center.approved_at ? (
                <p>آخر اعتماد: <LocalDateTime value={center.approved_at} /></p>
              ) : null}
              {isApproved && center.approved_by_profile_id ? (
                <p>اعتمد بواسطة: {actorLabel(center.approved_by_profile_id)}</p>
              ) : null}
            </div>
          </FormSection>
        </FormPanel>

        <FormPanel>
          <FormSection
            title="الموقع المطلوب للاعتماد"
            description="لا يمكن منح اعتماد جديد قبل وجود موقع جغرافي حالي للمركز. أي تغير لاحق في الإحداثيات يلغي الاعتماد تلقائيًا للمراجعة من جديد."
          >
            {hasLocation ? (
              <div className={styles.stateNote}>
                <div className={styles.stateHeader}>
                  <strong className={styles.coordinate}>{formatCoordinate(center.latitude!)}, {formatCoordinate(center.longitude!)}</strong>
                  <StatusBadge tone="success">موقع مسجل</StatusBadge>
                </div>
                <p>آخر تسجيل: <LocalDateTime value={center.location_captured_at!} /></p>
                <p>المصدر: {center.location_source === "center_device" ? "جهاز المركز" : "تصحيح إداري"}</p>
              </div>
            ) : (
              <FeedbackBanner tone="warning">لا يوجد موقع جغرافي صالح للمركز حتى الآن، ولذلك لا يمكن منحه اعتماد الشبكة.</FeedbackBanner>
            )}
          </FormSection>
        </FormPanel>

        <FormPanel>
          <FormSection
            title="إجراء الاعتماد"
            description="هذا هو الإجراء الأساسي في الصفحة، ولا يغيّر حالة المركز التشغيلية ولا ينشئ صلاحيات تشغيلية جديدة."
          >
            {isApproved ? (
              <form action={revokeCenterNetworkApproval} className="operations-form">
                <input type="hidden" name="center_id" value={center.id} />
                <FeedbackBanner tone="info">يمكن إلغاء الاعتماد حتى لو كان المركز موقوفًا؛ الإلغاء يغيّر حالة اعتماد الشبكة فقط.</FeedbackBanner>
                <div className="operations-form-actions">
                  <ConfirmSubmitButton
                    title="إلغاء اعتماد المركز؟"
                    description="سيصبح المركز غير معتمد داخل الشبكة، مع بقاء سجله وحالته التشغيلية كما هما."
                    confirmLabel="تأكيد إلغاء الاعتماد"
                  >
                    إلغاء الاعتماد
                  </ConfirmSubmitButton>
                </div>
              </form>
            ) : canApprove ? (
              <form action={approveCenterNetwork} className="operations-form">
                <input type="hidden" name="center_id" value={center.id} />
                <input type="hidden" name="location_captured_at" value={center.location_captured_at!} />
                <FeedbackBanner tone="info">المركز نشط وله موقع جغرافي مسجل، لذلك يستوفي شروط منح اعتماد الشبكة الحالية.</FeedbackBanner>
                <div className="operations-form-actions">
                  <button type="submit" className="button button-primary">اعتماد المركز</button>
                </div>
              </form>
            ) : (
              <FeedbackBanner tone="warning">
                {!isActive
                  ? "المركز موقوف تشغيليًا. أعد تفعيله قبل منحه اعتمادًا جديدًا."
                  : "يلزم تسجيل الموقع الجغرافي للمركز قبل منحه اعتمادًا جديدًا."}
              </FeedbackBanner>
            )}
          </FormSection>
        </FormPanel>

        <FormPanel>
          <FormSection
            title="سجل الاعتماد"
            description="سجل زمني غير قابل للتعديل لكل اعتماد أو إلغاء اعتماد أو إلغاء تلقائي بسبب تغير الموقع."
          >
            {historyResult.data.length === 0 ? (
              <p className="ui-form-hint">لا توجد أحداث اعتماد مسجلة لهذا المركز حتى الآن.</p>
            ) : (
              <RecordList label="سجل اعتماد المركز">
                {historyResult.data.map((event) => (
                  <RecordItem
                    key={event.id}
                    kicker={eventLabels[event.action] ?? event.action}
                    title={<LocalDateTime value={event.occurred_at} />}
                    facts={[
                      { label: "بواسطة", value: actorLabel(event.actor_profile_id) },
                    ]}
                  />
                ))}
              </RecordList>
            )}
          </FormSection>
        </FormPanel>
      </div>
    </>
  );
}
