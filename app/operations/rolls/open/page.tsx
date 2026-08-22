import { redirect } from "next/navigation";
import { RollOpeningFlow } from "@/components/rolls/roll-opening-flow";
import { PageHeader } from "@/components/ui/page-header";
import { TaskBackLink } from "@/components/ui/task-back-link";
import { requireOperationalProfile } from "@/lib/auth/operational-profile";

export default async function RollOpeningPage() {
  const profile = await requireOperationalProfile();
  if (profile.role !== "center") redirect("/access-denied");

  return (
    <>
      <PageHeader
        eyebrow="عمليات المركز"
        title="فتح رول"
        description="سجّل لحظة فتح الرول فعليًا قبل استخدامه في التركيب. العملية دائمة ومنفصلة عن تفعيل ضمان العميل."
        actions={<TaskBackLink href="/operations/rolls" label="العودة إلى اللفات" />}
      />
      <RollOpeningFlow />
    </>
  );
}
