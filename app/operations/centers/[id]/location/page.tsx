import { notFound } from "next/navigation";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { FormField } from "@/components/ui/form-field";
import { FormGrid, FormPanel, FormSection } from "@/components/ui/form-layout";
import { LocalDateTime } from "@/components/ui/local-date-time";
import { PageHeader } from "@/components/ui/page-header";
import { RecordItem, RecordList } from "@/components/ui/record-list";
import { StatusBadge } from "@/components/ui/status-badge";
import { TaskBackLink } from "@/components/ui/task-back-link";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import styles from "../center-detail.module.css";
import { correctCenterLocation } from "./actions";

type CenterLocationAdminPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function formatCoordinate(value: number) {
  return value.toFixed(6);
}

export default async function CenterLocationAdminPage({ params, searchParams }: CenterLocationAdminPageProps) {
  await requireAdminProfile();

  const { id } = await params;
  const { error: pageError, success } = await searchParams;
  if (!uuidPattern.test(id)) notFound();

  const supabase = await createSupabaseServerClient();
  const [centerResult, historyResult] = await Promise.all([
    supabase
      .from("installation_centers")
      .select("id, code, name, city, country_code, status, latitude, longitude, location_accuracy_m, location_captured_at, location_source, location_updated_by_profile_id")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("center_location_events")
      .select("id, latitude, longitude, accuracy_m, source, actor_profile_id, captured_at")
      .eq("installation_center_id", id)
      .order("captured_at", { ascending: false }),
  ]);

  if (centerResult.error) throw centerResult.error;
  if (historyResult.error) throw historyResult.error;
  if (!centerResult.data) notFound();

  const center = centerResult.data;
  const actorIds = Array.from(new Set(
    historyResult.data
      .map((event) => event.actor_profile_id)
      .filter((actorId): actorId is string => Boolean(actorId)),
  ));

  const actorResult = actorIds.length > 0
    ? await supabase.from("profiles").select("id, display_name").in("id", actorIds)
    : { data: [], error: null };
  if (actorResult.error) throw actorResult.error;

  const actorNames = new Map(actorResult.data.map((profile) => [profile.id, profile.display_name]));
  const hasCurrentLocation = center.latitude !== null && center.longitude !== null && center.location_captured_at !== null;

  return (
    <>
      <PageHeader
        eyebrow="إدارة موقع المركز"
        title={center.name}
        description="راجع الموقع الحالي أولًا، ثم استخدم التصحيح الإداري فقط عند وجود إحداثيات معروفة تحتاج تصحيحًا موثقًا."
        meta={<><span dir="ltr">{center.code}</span> · {center.city} · <span dir="ltr">{center.country_code}</span></>}
        actions={<TaskBackLink href={`/operations/centers/${center.id}/edit`} label="العودة لإدارة المركز" />}
      />

      {pageError === "invalid" ? (
        <FeedbackBanner tone="error">راجع قيم خط العرض والطول. يجب أن تكون إحداثيات رقمية صحيحة داخل النطاق الجغرافي.</FeedbackBanner>
      ) : null}
      {pageError === "failed" ? (
        <FeedbackBanner tone="error">تعذر حفظ التصحيح الإداري. لم يتم تغيير الموقع أو سجل التاريخ.</FeedbackBanner>
      ) : null}
      {success === "corrected" ? (
        <FeedbackBanner tone="success">تم حفظ التصحيح وإضافة حدث جديد إلى سجل الموقع.</FeedbackBanner>
      ) : null}

      <div className={styles.pageStack}>
        <FormPanel>
          <FormSection
            title="الموقع الحالي"
            description="هذه هي القراءة الحالية المستخدمة كمرجع تشغيلي للمركز قبل أي تغيير."
          >
            {hasCurrentLocation ? (
              <div className={styles.stateNote}>
                <div className={styles.stateHeader}>
                  <strong className={styles.coordinate}>{formatCoordinate(center.latitude!)}, {formatCoordinate(center.longitude!)}</strong>
                  <StatusBadge tone={center.status === "active" ? "success" : "neutral"}>
                    {center.status === "active" ? "المركز نشط" : "المركز موقوف"}
                  </StatusBadge>
                </div>
                <p>
                  المصدر: {center.location_source === "center_device" ? "التقاط من جهاز المركز" : "تصحيح إداري"}
                  {center.location_accuracy_m !== null ? ` · الدقة ${Math.round(center.location_accuracy_m * 10) / 10} م` : ""}
                </p>
                <p>آخر تحديث: <LocalDateTime value={center.location_captured_at!} /></p>
              </div>
            ) : (
              <FeedbackBanner tone="warning">لم يتم تسجيل موقع جغرافي لهذا المركز حتى الآن.</FeedbackBanner>
            )}
          </FormSection>
        </FormPanel>

        <FormPanel>
          <form action={correctCenterLocation} className="operations-form">
            <input type="hidden" name="center_id" value={center.id} />
            <FormSection
              title="تصحيح إداري"
              description="استخدم هذا المسار فقط لتصحيح موقع معروف. الحفظ ينشئ حدثًا جديدًا ولا يعدّل أي حدث تاريخي سابق."
            >
              <FeedbackBanner tone="warning">
                التصحيح الإداري لا يحمل دقة GPS لأنه ليس قراءة من جهاز المركز. تأكد من الإحداثيات قبل الحفظ.
              </FeedbackBanner>
              <FormGrid>
                <FormField label="خط العرض" hint="من -90 إلى 90">
                  <input
                    className="input"
                    name="latitude"
                    type="number"
                    inputMode="decimal"
                    min="-90"
                    max="90"
                    step="any"
                    required
                    dir="ltr"
                    defaultValue={center.latitude ?? ""}
                  />
                </FormField>
                <FormField label="خط الطول" hint="من -180 إلى 180">
                  <input
                    className="input"
                    name="longitude"
                    type="number"
                    inputMode="decimal"
                    min="-180"
                    max="180"
                    step="any"
                    required
                    dir="ltr"
                    defaultValue={center.longitude ?? ""}
                  />
                </FormField>
              </FormGrid>
            </FormSection>
            <div className="operations-form-actions">
              <button type="submit" className="button button-primary">حفظ التصحيح</button>
            </div>
          </form>
        </FormPanel>

        <FormPanel>
          <FormSection
            title="سجل الموقع"
            description="سجل زمني غير قابل للتعديل لكل قراءة أو تصحيح تم حفظه."
          >
            {historyResult.data.length === 0 ? (
              <p className="ui-form-hint">لا توجد أحداث موقع مسجلة حتى الآن.</p>
            ) : (
              <RecordList label="سجل تغييرات موقع المركز">
                {historyResult.data.map((event) => (
                  <RecordItem
                    key={event.id}
                    kicker={event.source === "center_device" ? "التقاط من المركز" : "تصحيح إداري"}
                    title={<span className={styles.coordinate}>{formatCoordinate(event.latitude)}, {formatCoordinate(event.longitude)}</span>}
                    facts={[
                      { label: "الوقت", value: <LocalDateTime value={event.captured_at} /> },
                      { label: "الدقة", value: event.accuracy_m === null ? "غير مطبقة" : `${Math.round(event.accuracy_m * 10) / 10} م` },
                      { label: "بواسطة", value: event.actor_profile_id ? actorNames.get(event.actor_profile_id) ?? "حساب سابق" : "حساب سابق" },
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
