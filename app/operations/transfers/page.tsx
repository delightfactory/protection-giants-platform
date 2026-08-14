import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { CopyTransferIdButton } from "@/components/transfers/copy-transfer-id-button";
import { TransferIdQr } from "@/components/transfers/transfer-id-qr";
import styles from "@/components/transfers/transfer-surfaces.module.css";
import { requireOperationalProfile } from "@/lib/auth/operational-profile";
import { getCurrentTransferParty } from "@/lib/transfers/current-party.server";
import { transferPartyTypeLabel } from "@/lib/transfers/transfer-id";

export default async function TransfersPage() {
  const profile = await requireOperationalProfile();
  const party = await getCurrentTransferParty(profile);

  return (
    <>
      <PageHeader
        eyebrow="تحويل اللفات"
        title="التحويلات"
        description="أرسل لفات من عهدة جهتك إلى جهة تشغيلية أخرى باستخدام Transfer ID الدقيق. إنشاء التحويل يحجز اللفات فقط إلى أن يؤكد المستلم الاستلام."
      />

      <div className={styles.landingGrid}>
        <section className={styles.identityPanel} aria-labelledby="party-transfer-id-title">
          <div className={styles.identityCopy}>
            <p className={styles.kicker}>{transferPartyTypeLabel(party.partyType)}</p>
            <h2 id="party-transfer-id-title">Transfer ID الخاص بجهتك</h2>
            <p>
              شارك هذا المعرّف أو الـQR عندما تريد من جهة أخرى إرسال لفات إلى عهدة جهتك. المعرّف يحدد المستلم فقط ولا يمنح صلاحية أو ينقل عهدة بمفرده.
            </p>
            <code className={styles.code}>{party.transferCode}</code>
            <div className={styles.actions}>
              <CopyTransferIdButton transferCode={party.transferCode} />
            </div>
          </div>
          <TransferIdQr transferCode={party.transferCode} />
        </section>

        <section className={styles.actionPanel} aria-labelledby="new-transfer-title">
          <div>
            <p className={styles.kicker}>إجراء تشغيلي</p>
            <h2 id="new-transfer-title">إرسال لفات</h2>
            <p>
              تحقق من Transfer ID للمستلم، اختر اللفات بالمسح أو من العهدة أو بالـLot، ثم راجع العدد قبل الإرسال.
            </p>
          </div>
          <Link href="/operations/transfers/new" className={`button button-primary ${styles.primary}`}>
            إرسال تحويل جديد
          </Link>
        </section>
      </div>

      <div className={styles.note}>
        التحويل المرسل يظل في حالة معلقة وتبقى العهدة المؤكدة لدى المرسل حتى الاستلام. الاستلام وتغيير العهدة خطوة مستقلة.
      </div>
    </>
  );
}
