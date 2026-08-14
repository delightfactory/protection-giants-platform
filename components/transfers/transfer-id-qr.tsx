import { buildTransferIdQrGeometry } from "@/lib/transfers/transfer-id-qr";
import styles from "./transfer-surfaces.module.css";

export function TransferIdQr({ transferCode }: { transferCode: string }) {
  const geometry = buildTransferIdQrGeometry(transferCode);

  return (
    <div className={styles.qrFrame} aria-label={`QR الخاص بـ Transfer ID ${transferCode}`}>
      <svg
        viewBox={`0 0 ${geometry.width} ${geometry.height}`}
        role="img"
        aria-label="Transfer ID QR"
        preserveAspectRatio="xMidYMid meet"
      >
        <rect x="0" y="0" width={geometry.width} height={geometry.height} fill="#fff" />
        {geometry.polygons.map((polygon, index) => (
          <polygon
            key={index}
            points={polygon.points.map(([x, y]) => `${x},${y}`).join(" ")}
            fill="#000"
          />
        ))}
      </svg>
    </div>
  );
}
