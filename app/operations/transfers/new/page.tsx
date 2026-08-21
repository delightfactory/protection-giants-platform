import { PageHeader } from "@/components/ui/page-header";
import { TaskBackLink } from "@/components/ui/task-back-link";
import { TransferSendFlow } from "@/components/transfers/transfer-send-flow";
import { requireOperationalProfile } from "@/lib/auth/operational-profile";
import { getPublicSiteOrigin } from "@/lib/public-site";
import { getCurrentTransferParty } from "@/lib/transfers/current-party.server";

export default async function NewTransferPage() {
  const profile = await requireOperationalProfile();
  const party = await getCurrentTransferParty(profile);
  const publicSiteOrigin = getPublicSiteOrigin();

  return (
    <>
      <PageHeader
        eyebrow="تحويل اللفات"
        title="إرسال تحويل جديد"
        description="حدد المستلم بدقة، أضف اللفات الموجودة فعليًا في عهدتك، ثم راجع العدد قبل إنشاء التحويل المعلق."
        actions={<TaskBackLink href="/operations/transfers" label="إلغاء والعودة" />}
      />
      <TransferSendFlow
        senderTransferId={party.transferCode}
        publicSiteOrigin={publicSiteOrigin}
      />
    </>
  );
}
