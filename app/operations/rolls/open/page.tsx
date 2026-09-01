import { redirect } from "next/navigation";
import { RollOpeningFlow } from "@/components/rolls/roll-opening-flow";
import { PageHeader } from "@/components/ui/page-header";
import { TaskBackLink } from "@/components/ui/task-back-link";
import { requireOperationalProfile } from "@/lib/auth/operational-profile";
import { getPublicSiteOrigin } from "@/lib/public-site";
import { normalizeRollSerial } from "@/lib/rolls/roll-qr";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RollOpeningPageProps = {
  searchParams: Promise<{ roll?: string; task?: string }>;
};

export default async function RollOpeningPage({ searchParams }: RollOpeningPageProps) {
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

  const params = await searchParams;
  const initialSerial = normalizeRollSerial(params.roll ?? "") ?? "";
  const taskId = UUID_PATTERN.test(params.task ?? "") ? params.task! : null;
  const taskHref = taskId ? `/operations/claim-resolution-tasks/${taskId}` : null;
  const publicSiteOrigin = getPublicSiteOrigin();

  return (
    <>
      <PageHeader
        eyebrow="عمليات المركز"
        title="فتح رول"
        description="سجّل لحظة فتح الرول فعليًا قبل استخدامه في التركيب. العملية دائمة ومنفصلة عن تفعيل ضمان العميل."
        meta={`المركز: ${center.name}`}
        actions={<TaskBackLink href={taskHref ?? "/operations/rolls"} label={taskHref ? "العودة إلى مهمة التنفيذ" : "العودة إلى اللفات"} />}
      />
      <RollOpeningFlow
        publicSiteOrigin={publicSiteOrigin}
        centerName={center.name}
        initialSerial={initialSerial}
        taskId={taskId}
      />
    </>
  );
}
