import { redirect } from "next/navigation";
import { OpenedRollRecoveryFlow } from "@/components/rolls/opened-roll-recovery-flow";
import { PageHeader } from "@/components/ui/page-header";
import { TaskBackLink } from "@/components/ui/task-back-link";
import { requireOperationalProfile } from "@/lib/auth/operational-profile";
import { getPublicSiteOrigin } from "@/lib/public-site";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function OpenedRollRecoveryPage() {
  const profile = await requireOperationalProfile();
  if (profile.role !== "admin" && profile.role !== "agent") redirect("/access-denied");

  if (profile.role === "agent") {
    const supabase = await createSupabaseServerClient();
    const { data: agent, error } = await supabase
      .from("country_agents")
      .select("opened_roll_recovery_enabled")
      .eq("id", profile.country_agent_id)
      .maybeSingle();

    if (error) throw error;
    if (!agent?.opened_roll_recovery_enabled) redirect("/access-denied");
  }

  const publicSiteOrigin = getPublicSiteOrigin();

  return (
    <>
      <PageHeader
        eyebrow="استرداد استثنائي"
        title="استرداد رول مفتوح"
        description="استخدم هذه العملية فقط بعد استلام رول مفتوح فعليًا. الاسترداد يغيّر الحيازة المؤكدة لكنه لا يلغي أو يمسح حدث الفتح الأصلي."
        actions={<TaskBackLink href="/operations/rolls" label="العودة إلى اللفات" />}
      />
      <OpenedRollRecoveryFlow publicSiteOrigin={publicSiteOrigin} />
    </>
  );
}
