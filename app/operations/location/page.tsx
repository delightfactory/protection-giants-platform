import { redirect } from "next/navigation";
import { CenterLocationCapture } from "@/components/center-location-capture";
import { FormPanel, FormSection } from "@/components/ui/form-layout";
import { PageHeader } from "@/components/ui/page-header";
import { TaskBackLink } from "@/components/ui/task-back-link";
import { requireOperationalProfile } from "@/lib/auth/operational-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function CenterLocationPage() {
  const profile = await requireOperationalProfile();
  if (profile.role !== "center") redirect("/access-denied");

  const supabase = await createSupabaseServerClient();
  const { data: center, error } = await supabase
    .from("installation_centers")
    .select("id, code, name, city, country_code, latitude, longitude, location_accuracy_m, location_captured_at, location_source")
    .eq("id", profile.installation_center_id)
    .maybeSingle();

  if (error) throw error;
  if (!center) redirect("/access-denied");

  const initialLocation = (
    center.latitude !== null &&
    center.longitude !== null &&
    center.location_captured_at !== null &&
    (center.location_source === "center_device" || center.location_source === "admin")
  ) ? {
      latitude: center.latitude,
      longitude: center.longitude,
      accuracyM: center.location_accuracy_m,
      capturedAt: center.location_captured_at,
      source: center.location_source,
    }
    : null;

  return (
    <>
      <PageHeader
        eyebrow="مركز التركيب"
        title="موقع المركز"
        description="سجّل الموقع الفعلي من جهاز موجود داخل المركز. لا تحتاج إلى كتابة إحداثيات أو تحريك علامة على خريطة."
        meta={<><span dir="ltr">{center.code}</span> · {center.name} · {center.city} · <span dir="ltr">{center.country_code}</span></>}
        actions={<TaskBackLink href="/operations" label="العودة لبوابة التشغيل" />}
      />

      <FormPanel>
        <FormSection
          title="تسجيل الموقع من الجهاز"
          description="اضغط الزر وأنت داخل مقر المركز. سيطلب المتصفح إذن الموقع مرة واحدة حسب إعدادات جهازك، ولن يقبل النظام قراءة أسوأ من 50 مترًا."
        >
          <CenterLocationCapture initialLocation={initialLocation} />
        </FormSection>
      </FormPanel>
    </>
  );
}
