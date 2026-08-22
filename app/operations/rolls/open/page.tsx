import { redirect } from "next/navigation";
import { RollOpeningFlow } from "@/components/rolls/roll-opening-flow";
import { PageHeader } from "@/components/ui/page-header";
import { TaskBackLink } from "@/components/ui/task-back-link";
import { requireOperationalProfile } from "@/lib/auth/operational-profile";
import { getPublicSiteOrigin } from "@/lib/public-site";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function RollOpeningPage() {
  const profile = await requireOperationalProfile();
  if (profile.role !== "center") redirect("/access-denied");

  const supabase = await createSupabaseServerClient();
  const { data: center, error } = await supabase
    .from("installation_centers")
    .select("name")
    .eq("id", profile.installation_center_id)
    .maybeSingle();

  if (error) throw error;
  if (!center) redirect("/access-denied");

  const publicSiteOrigin = getPublicSiteOrigin();

  return (
    <>
      <PageHeader
        eyebrow="عمليات المركز"
        title="فتح رول"
        description="سجّل لحظة فتح الرول فعليًا قبل استخدامه في التركيب. العملية دائمة ومنفصلة عن تفعيل ضمان العميل."
        meta={`المركز: ${center.name}`}
        actions={<TaskBackLink href="/operations/rolls" label="العودة إلى اللفات" />}
      />
      <RollOpeningFlow publicSiteOrigin={publicSiteOrigin} centerName={center.name} />
    </>
  );
}
