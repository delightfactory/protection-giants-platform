import type { CSSProperties } from "react";

import type { OuterRollLabelViewModel } from "@/lib/labels/outer-roll-label-plan";
import {
  buildOuterRollGtinBarcodeGeometry,
  buildOuterRollQrVector,
  type BwipVectorGeometry,
} from "@/lib/labels/outer-roll-machine-codes";
import { OUTER_ROLL_LABEL_TEMPLATE } from "@/lib/labels/outer-roll-label-template";
import styles from "./outer-roll-label-preview.module.css";

type OuterRollLabelPreviewProps = {
  model: OuterRollLabelViewModel;
};

function percentX(mm: number) {
  return `${(mm / OUTER_ROLL_LABEL_TEMPLATE.widthMm) * 100}%`;
}

function percentY(mm: number) {
  return `${(mm / OUTER_ROLL_LABEL_TEMPLATE.heightMm) * 100}%`;
}

function boxStyle(box: { xMm: number; yMm: number; widthMm: number; heightMm: number }): CSSProperties {
  return {
    left: percentX(box.xMm),
    bottom: percentY(box.yMm),
    width: percentX(box.widthMm),
    height: percentY(box.heightMm),
  };
}

function VectorCode({ geometry, label }: { geometry: BwipVectorGeometry; label: string }) {
  return (
    <svg
      viewBox={`0 0 ${geometry.width} ${geometry.height}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={label}
      className={styles.vectorCode}
    >
      {geometry.lines.map((line, index) => (
        <line
          key={`line-${index}`}
          x1={line.x0}
          y1={line.y0}
          x2={line.x1}
          y2={line.y1}
          stroke="currentColor"
          strokeWidth={line.lineWidth}
        />
      ))}
      {geometry.polygons.map((polygon, index) => (
        <polygon
          key={`polygon-${index}`}
          points={polygon.points.map(([x, y]) => `${x},${y}`).join(" ")}
          fill="currentColor"
        />
      ))}
    </svg>
  );
}

export function OuterRollLabelPreview({ model }: OuterRollLabelPreviewProps) {
  const barcode = buildOuterRollGtinBarcodeGeometry(
    model.gtin,
    OUTER_ROLL_LABEL_TEMPLATE.barcodeBox.widthMm,
    OUTER_ROLL_LABEL_TEMPLATE.barcodeBox.heightMm,
  );
  const qr = buildOuterRollQrVector(model.qrPayload);

  return (
    <div className={styles.frame} dir="ltr" aria-label={`معاينة ملصق ${model.rollSerial}`}>
      <div className={styles.header}>
        <div>
          <span>PROTECTION GIANTS</span>
          <strong>{model.productName}</strong>
        </div>
        <div className={styles.headerSide}>
          <span>PPF / OUTER ROLL</span>
          {model.productVersion ? <strong>{model.productVersion}</strong> : null}
        </div>
      </div>

      <div className={`${styles.field} ${styles.sku}`}><span>SKU</span><strong>{model.sku}</strong></div>
      <div className={`${styles.field} ${styles.size}`}><span>SIZE</span><strong>{model.widthMm} mm × {model.lengthM} m</strong></div>
      <div className={`${styles.field} ${styles.thickness}`}><span>THICKNESS</span><strong>{model.thicknessMil} mil</strong></div>
      <div className={`${styles.field} ${styles.lot}`}><span>LOT</span><strong>{model.lotNumber}</strong></div>
      <div className={`${styles.field} ${styles.roll}`}><span>ROLL</span><strong>{model.rollSerial}</strong></div>

      <div className={styles.barcode} style={boxStyle(OUTER_ROLL_LABEL_TEMPLATE.barcodeBox)}>
        <VectorCode geometry={barcode.geometry} label={`GTIN ${barcode.payload}`} />
      </div>
      <span className={styles.gtin}>GTIN {model.gtin}</span>

      <div className={styles.qrLabel}>ROLL QR</div>
      <div className={styles.qr} style={boxStyle(OUTER_ROLL_LABEL_TEMPLATE.qrQuietBox)}>
        <div className={styles.qrInner}>
          <VectorCode geometry={qr.geometry} label={`Roll QR ${qr.payload}`} />
        </div>
      </div>
      <span className={styles.scan}>SCAN ROLL</span>
    </div>
  );
}
