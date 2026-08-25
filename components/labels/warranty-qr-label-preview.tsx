import type { CSSProperties } from "react";

import { buildQrVectorGeometry } from "@/lib/qr/qr-vector";
import type { WarrantyQrLabelViewModel } from "@/lib/labels/warranty-qr-label-plan";
import { WARRANTY_QR_LABEL_TEMPLATE } from "@/lib/labels/warranty-qr-label-template";
import styles from "./warranty-qr-label-preview.module.css";

type Props = {
  model: WarrantyQrLabelViewModel;
};

function percentX(mm: number) {
  return `${(mm / WARRANTY_QR_LABEL_TEMPLATE.widthMm) * 100}%`;
}

function percentY(mm: number) {
  return `${(mm / WARRANTY_QR_LABEL_TEMPLATE.heightMm) * 100}%`;
}

function boxStyle(box: { xMm: number; yMm: number; widthMm: number; heightMm: number }): CSSProperties {
  return {
    left: percentX(box.xMm),
    bottom: percentY(box.yMm),
    width: percentX(box.widthMm),
    height: percentY(box.heightMm),
  };
}

export function WarrantyQrLabelPreview({ model }: Props) {
  const geometry = buildQrVectorGeometry(model.qrPayload);

  return (
    <div className={styles.frame} dir="ltr" aria-label="معاينة ملصق التحقق من الضمان">
      <div className={styles.brandBand} aria-hidden="true" />
      <strong className={styles.brand}>PROTECTION GIANTS</strong>
      <strong className={styles.title}>WARRANTY</strong>
      <span className={styles.instruction}>SCAN TO VERIFY</span>
      <span className={styles.product}>{model.productName}</span>
      <div className={styles.qr} style={boxStyle(WARRANTY_QR_LABEL_TEMPLATE.qrQuietBox)}>
        <svg
          viewBox={`0 0 ${geometry.width} ${geometry.height}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="Warranty verification QR"
          shapeRendering="crispEdges"
        >
          <rect width={geometry.width} height={geometry.height} fill="#fff" />
          {geometry.fills.map((fill, index) => (
            <path
              key={index}
              d={fill.path}
              fill={`#${fill.color}`}
              fillRule="nonzero"
            />
          ))}
        </svg>
      </div>
      <span className={styles.domain}>protectiongiants.com</span>
    </div>
  );
}
