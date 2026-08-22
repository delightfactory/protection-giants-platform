import { redirect } from "next/navigation";
import { OpenedRollRecoveryFlow } from "@/components/rolls/opened-roll-recovery-flow";
import { PageHeader } from "@/components/ui/page-header";
import { TaskBackLink } from "@/components/ui/task-back-link";
import { requireOperationalProfile } from "@/lib/auth/operational-profile";

export default async function OpenedRollRecoveryPage() {
  const profile = await requireOperationalProfile();
  if (profile.role !== "admin" && profile.role !== "agent") redirect("/access-denied");

  return (
    <>
      <PageHeader
        eyebrow="استرداد استثنائي"
        title="استرداد رول مفتوح"
        description="استخدم هذه العملية فقط بعد استلام رول مفتوح فعليًا. الاسترداد يغيّر الحيازة المؤكدة لكنه لا يلغي أو يمسح حدث الفتح الأصلي."
        actions={<TaskBackLink href="/operations/rolls" label="العودة إلى اللفات" />}
      />
      <OpenedRollRecoveryFlow />
    </>
  );
}
