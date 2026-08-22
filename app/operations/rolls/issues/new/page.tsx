import { redirect } from "next/navigation";
import { RollPreinstallIssueFlow } from "@/components/rolls/roll-preinstall-issue-flow";
import { PageHeader } from "@/components/ui/page-header";
import { TaskBackLink } from "@/components/ui/task-back-link";
import { requireOperationalProfile } from "@/lib/auth/operational-profile";
import { getPublicSiteOrigin } from "@/lib/public-site";

export default async function NewRollPreinstallIssuePage() {
  const profile = await requireOperationalProfile();
  if (profile.role !== "center") redirect("/access-denied");

  return (
    <>
      <PageHeader
        eyebrow="عمليات المركز"
        title="بلاغ مشكلة قبل التركيب"
        description="أبلغ عن عيب مادي أو تصنيعي ظهر بعد فتح الرول وقبل تفعيل ضمان العميل. البلاغ لا يثبت العيب تلقائيًا، لكنه يوقف التفعيل حتى قرار الشركة."
        actions={<TaskBackLink href="/operations/rolls/issues" label="العودة إلى البلاغات" />}
      />
      <RollPreinstallIssueFlow publicSiteOrigin={getPublicSiteOrigin()} />
    </>
  );
}
