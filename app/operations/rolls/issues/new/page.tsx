import { redirect } from "next/navigation";
import { RollPreinstallIssueFlow } from "@/components/rolls/roll-preinstall-issue-flow";
import { PageHeader } from "@/components/ui/page-header";
import { TaskBackLink } from "@/components/ui/task-back-link";
import { requireOperationalProfile } from "@/lib/auth/operational-profile";
import { getPublicSiteOrigin } from "@/lib/public-site";
import { normalizeRollSerial } from "@/lib/rolls/roll-qr";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type NewRollPreinstallIssuePageProps = {
  searchParams: Promise<{ roll?: string; task?: string }>;
};

export default async function NewRollPreinstallIssuePage({ searchParams }: NewRollPreinstallIssuePageProps) {
  const profile = await requireOperationalProfile();
  if (profile.role !== "center") redirect("/access-denied");

  const params = await searchParams;
  const initialSerial = normalizeRollSerial(params.roll ?? "") ?? "";
  const taskId = UUID_PATTERN.test(params.task ?? "") ? params.task! : null;
  const taskHref = taskId ? `/operations/claim-resolution-tasks/${taskId}` : null;

  return (
    <>
      <PageHeader
        eyebrow="عمليات المركز"
        title="بلاغ مشكلة قبل التركيب"
        description="أبلغ عن عيب مادي أو تصنيعي ظهر بعد فتح الرول وقبل تفعيل ضمان العميل. البلاغ لا يثبت العيب تلقائيًا، لكنه يوقف التفعيل حتى قرار الشركة."
        actions={<TaskBackLink href={taskHref ?? "/operations/rolls/issues"} label={taskHref ? "العودة إلى مهمة التنفيذ" : "العودة إلى البلاغات"} />}
      />
      <RollPreinstallIssueFlow
        publicSiteOrigin={getPublicSiteOrigin()}
        initialSerial={initialSerial}
        taskId={taskId}
      />
    </>
  );
}
