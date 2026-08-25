import { OuterRollLabelPreview } from "./outer-roll-label-preview";
import { WarrantyQrLabelPreview } from "./warranty-qr-label-preview";
import type { RollPrintPack } from "@/lib/labels/roll-print-pack-plan";
import styles from "./roll-print-pack-preview.module.css";

type Props = {
  pack: RollPrintPack;
  packOrdinal?: number;
  totalPackCount?: number;
};

export function RollPrintPackPreview({ pack, packOrdinal = 1, totalPackCount = 1 }: Props) {
  return (
    <section className={styles.pack} aria-label={`معاينة حزمة ملصقات الرول ${pack.rollSerial}`}>
      <header className={styles.guide}>
        <div>
          <span>ROLL PACK</span>
          <strong dir="ltr">{pack.rollSerial}</strong>
        </div>
        <div className={styles.guideMeta}>
          <span dir="ltr">Roll {packOrdinal} / {totalPackCount}</span>
          <strong>Outer ×2 · Warranty ×3</strong>
        </div>
      </header>

      <div className={styles.outerRow}>
        {pack.outerCopies.map((copy) => (
          <div key={copy.copyNumber} className={styles.piece}>
            <div className={styles.pieceGuide}>Outer {copy.copyNumber}</div>
            <OuterRollLabelPreview model={copy.model} />
          </div>
        ))}
      </div>

      <div className={styles.warrantyRow}>
        {pack.warrantyCopies.map((copy) => (
          <div key={copy.copyNumber} className={styles.piece}>
            <div className={styles.pieceGuide}>Warranty {copy.copyNumber}</div>
            <WarrantyQrLabelPreview model={copy.model} />
          </div>
        ))}
      </div>
    </section>
  );
}
