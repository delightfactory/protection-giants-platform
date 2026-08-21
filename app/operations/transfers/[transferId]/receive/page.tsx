import { notFound, redirect } from "next/navigation";
import { TransferReceiptFlow } from "@/components/transfers/transfer-receipt-flow";
import { PageHeader } from "@/components/ui/page-header";
import { TaskBackLink } from "@/components/ui/task-back-link";
import { requireOperationalProfile } from "@/lib/auth/operational-profile";
import { getPublicSiteOrigin } from "@/lib/public-site";
import { getTransferDetail } from "@/lib/transfers/receipt.server";

export default async function ReceiveTransferPage({
  params,
}: {
  params: Promise<{ transferId: string }>;
}) {
  await requireOperationalProfile();
  const { transferId } = await params;
  const detail = await getTransferDetail(transferId);
  if (!detail) notFound();
  if (!detail.can_receive) redirect(`/operations/transfers/${transferId}`);

  return (
    <>
      <PageHeader
        eyebrow="استلام ميداني"
        title={detail.status === "partially_received" ? "استكمال استلام التحويل" : "استلام التحويل"}
        description="تحقق فقط من اللفات الموجودة أمامك فعليًا. العهدة ستنتقل لللفات التي تؤكد استلامها فقط."
        actions={<TaskBackLink href={`/operations/transfers/${transferId}`} label="العودة للتفاصيل" />}
      />
      <TransferReceiptFlow detail={detail} publicSiteOrigin={getPublicSiteOrigin()} />
    </>
  );
}
