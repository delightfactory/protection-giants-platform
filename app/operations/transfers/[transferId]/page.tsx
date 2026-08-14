import Link from "next/link";
import { notFound } from "next/navigation";
import { TransferDetailActions } from "@/components/transfers/transfer-detail-actions";
import { UnresolvedResolutionPanel } from "@/components/transfers/unresolved-resolution-panel";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { TaskBackLink } from "@/components/ui/task-back-link";
import { requireOperationalProfile } from "@/lib/auth/operational-profile";
import {
  transferStatusLabel,
  transferTimelineLabel,
  type TransferStatus,
} from "@/lib/transfers/receipt";
import { getTransferDetail } from "@/lib/transfers/receipt.server";
import { transferPartyTypeLabel } from "@/lib/transfers/transfer-id";
import styles from "@/components/transfers/transfer-detail.module.css";

const dateFormatter = new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Cairo",
});

function tone(status: TransferStatus): "success" | "neutral" | "warning" | "danger" | "accent" {
  switch (status) {
    case "received": return "success";
    case "pending": return "accent";
    case "partially_received":
    case "partially_completed": return "warning";
    case "cancelled":
    case "rejected": return "neutral";
  }
}

export default async function TransferDetailPage({
  params,
}: {
  params: Promise<{ transferId: string }>;
}) {
  await requireOperationalProfile();
  const { transferId } = await params;
  const detail = await getTransferDetail(transferId);
  if (!detail) notFound();

  const counterpartyName = detail.viewer_is_recipient ? detail.sender_name : detail.recipient_name;
  const counterpartyType = detail.viewer_is_recipient ? detail.sender_party_type : detail.recipient_party_type;

  return (
    <>
      <PageHeader
        eyebrow="تفاصيل التحويل"
        title={detail.transfer_number}
        description="مرجع واحد لحالة اللفات والعهدة والاستلام الفعلي."
        actions={<TaskBackLink href="/operations/transfers" label="العودة للتحويلات" />}
      />

      <main className={styles.page}>
        <section className={styles.hero}>
          <div className={styles.heroTop}>
            <div>
              <p className={styles.number}>{detail.transfer_number}</p>
              <div className={styles.counterparty}>
                <span>{detail.viewer_is_recipient ? "مرسل من" : "موجّه إلى"}</span>
                <strong>{counterpartyName}</strong>
                <span>{transferPartyTypeLabel(counterpartyType)}</span>
              </div>
            </div>
            <StatusBadge tone={tone(detail.status)}>{transferStatusLabel(detail.status)}</StatusBadge>
          </div>

          <div className={styles.metrics}>
            <div className={styles.metric}><span>إجمالي اللفات</span><strong>{detail.roll_count}</strong></div>
            <div className={styles.metric}><span>تم استلامه</span><strong>{detail.received_count}</strong></div>
            <div className={styles.metric}><span>ما زال معلقًا</span><strong>{detail.pending_count}</strong></div>
            <div className={styles.metric}><span>بقي لدى المرسل</span><strong>{detail.released_to_sender_count}</strong></div>
          </div>

          <div className={styles.meta}>أُنشئ في {dateFormatter.format(new Date(detail.created_at))}</div>

          {detail.can_receive ? (
            <div className={styles.primaryArea}>
              <Link className="button button-primary" href={`/operations/transfers/${detail.transfer_id}/receive`}>
                {detail.status === "partially_received" ? "استكمال الاستلام" : "بدء الاستلام"}
              </Link>
            </div>
          ) : null}
        </section>

        <section className={styles.panel}>
          <h2>المنتجات ومجموعات Lot</h2>
          <p className={styles.panelIntro}>الأعداد هنا تخص ما دخل في هذا التحويل فعليًا، مع توضيح إذا كان التحويل يشمل Lot كاملًا أم جزءًا منه.</p>
          <div className={styles.lotList}>
            {detail.lot_groups.map((lot) => (
              <article className={styles.lotCard} key={lot.lot_id}>
                <div className={styles.lotTop}>
                  <div>
                    <strong>{lot.product_name}</strong>
                    <code>{lot.product_code} · {lot.lot_number}</code>
                  </div>
                  <StatusBadge tone={lot.transfer_contains_full_lot ? "success" : "neutral"}>
                    {lot.transfer_contains_full_lot ? "Lot كامل" : "جزء من Lot"}
                  </StatusBadge>
                </div>
                <div className={styles.lotMetrics}>
                  <span>داخل التحويل: {lot.transfer_count}</span>
                  <span>مستلم: {lot.received_count}</span>
                  <span>متبقي: {lot.pending_count}</span>
                  <span>لدى المرسل: {lot.released_to_sender_count}</span>
                </div>
              </article>
            ))}
          </div>
        </section>

        {detail.can_resolve_unreceived ? (
          <UnresolvedResolutionPanel transferId={detail.transfer_id} lotGroups={detail.lot_groups} adminMode={false} />
        ) : null}
        {!detail.can_resolve_unreceived && detail.can_admin_resolve_unreceived ? (
          <UnresolvedResolutionPanel transferId={detail.transfer_id} lotGroups={detail.lot_groups} adminMode />
        ) : null}

        <TransferDetailActions
          transferId={detail.transfer_id}
          canCancel={detail.can_cancel}
          canReject={detail.can_reject}
          canAdminRecoveryCancel={detail.can_admin_recovery_cancel && !detail.can_cancel}
        />

        <section className={styles.panel}>
          <h2>سجل التحويل</h2>
          <p className={styles.panelIntro}>أحداث غير قابلة للتعديل توضح ما حدث للتحويل بترتيبه الزمني.</p>
          <div className={styles.timeline}>
            {detail.timeline.map((event) => (
              <div className={styles.event} key={`${event.event_sequence}-${event.event_type}`}>
                <span className={styles.eventDot} aria-hidden="true" />
                <div>
                  <strong>{transferTimelineLabel(event)}</strong>
                  <time dateTime={event.occurred_at}>{dateFormatter.format(new Date(event.occurred_at))}</time>
                  {event.reason ? <p>{event.reason}</p> : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
