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

type TemplatePosition = {
  xMm: number;
  yMm: number;
  widthMm: number;
};

function percentX(mm: number) {
  return `${(mm / OUTER_ROLL_LABEL_TEMPLATE.widthMm) * 100}%`;
}

function percentY(mm: number) {
  return `${(mm / OUTER_ROLL_LABEL_TEMPLATE.heightMm) * 100}%`;
}

function positionStyle(position: TemplatePosition): CSSProperties {
  return {
    left: percentX(position.xMm),
    bottom: percentY(position.yMm),
    width: percentX(position.widthMm),
  };
}

function boxStyle(box: TemplatePosition & { heightMm: number }): CSSProperties {
  return {
    ...positionStyle(box),
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
  const template = OUTER_ROLL_LABEL_TEMPLATE;
  const barcode = buildOuterRollGtinBarcodeGeometry(
    model.gtin,
    template.barcodeBox.widthMm,
    template.barcodeBox.heightMm,
  );
  const qr = buildOuterRollQrVector(model.qrPayload);
  const headerHeightMm = template.heightMm - template.headerDividerYMm;

  return (
    <div className={styles.frame} dir="ltr" aria-label={`معاينة ملصق ${model.rollSerial}`}>
      <div
        className={styles.header}
        style={{ height: percentY(headerHeightMm) }}
        aria-hidden="true"
      />
      <span className={styles.brandLabel} style={positionStyle(template.brandLabel)}>PROTECTION GIANTS</span>
      <strong className={styles.productName} style={positionStyle(template.productName)}>{model.productName}</strong>
      <span className={styles.sideLabel} style={positionStyle(template.sideLabel)}>PPF / OUTER ROLL</span>
      {model.productVersion ? (
        <strong className={styles.productVersion} style={positionStyle(template.productVersion)}>{model.productVersion}</strong>
      ) : null}

      <div className={styles.field} style={positionStyle(template.fields.sku)}><span>SKU</span><strong>{model.sku}</strong></div>
      <div className={styles.field} style={positionStyle(template.fields.size)}><span>SIZE</span><strong>{model.widthMm} mm × {model.lengthM} m</strong></div>
      <div className={styles.field} style={positionStyle(template.fields.thickness)}><span>THICKNESS</span><strong>{model.thicknessMil} mil</strong></div>
      <div className={styles.field} style={positionStyle(template.fields.lot)}><span>LOT</span><strong>{model.lotNumber}</strong></div>
      <div className={styles.field} style={positionStyle(template.fields.roll)}><span>ROLL</span><strong>{model.rollSerial}</strong></div>

      <div className={styles.barcode} style={boxStyle(template.barcodeBox)}>
        <VectorCode geometry={barcode.geometry} label={`GTIN ${barcode.payload}`} />
      </div>
      <span className={styles.gtin} style={positionStyle(template.gtinLabel)}>GTIN {model.gtin}</span>

      <div className={styles.qrLabel} style={positionStyle(template.qrLabel)}>ROLL QR</div>
      <div className={styles.qr} style={boxStyle(template.qrQuietBox)}>
        <div className={styles.qrInner}>
          <VectorCode geometry={qr.geometry} label={`Roll QR ${qr.payload}`} />
        </div>
      </div>
      <span className={styles.scan} style={positionStyle(template.scanLabel)}>SCAN ROLL</span>
    </div>
  );
}
