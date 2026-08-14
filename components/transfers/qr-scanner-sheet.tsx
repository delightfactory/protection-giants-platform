"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./transfer-send-flow.module.css";

export type ScannerDecodeOutcome = {
  action: "close" | "continue";
  message?: string;
  tone?: "success" | "warning" | "error";
};

type QrScannerSheetProps = {
  open: boolean;
  title: string;
  instruction: string;
  onClose: () => void;
  onDecode: (payload: string) => Promise<ScannerDecodeOutcome>;
};

function decodedText(result: unknown): string {
  if (typeof result === "string") return result;
  if (result && typeof result === "object" && "data" in result && typeof result.data === "string") {
    return result.data;
  }
  return "";
}

export function QrScannerSheet({ open, title, instruction, onClose, onDecode }: QrScannerSheetProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<{ stop: () => void; destroy: () => void } | null>(null);
  const busyRef = useRef(false);
  const lastPayloadRef = useRef<{ payload: string; at: number } | null>(null);
  const onCloseRef = useRef(onClose);
  const onDecodeRef = useRef(onDecode);
  const [cameraState, setCameraState] = useState<"starting" | "ready" | "error">("starting");
  const [feedback, setFeedback] = useState<{ text: string; tone: "success" | "warning" | "error" } | null>(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    onDecodeRef.current = onDecode;
  }, [onDecode]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setCameraState("starting");
    setFeedback(null);

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onCloseRef.current();
    }
    window.addEventListener("keydown", handleEscape);

    async function handlePayload(payload: string) {
      const trimmed = payload.trim();
      if (!trimmed || busyRef.current) return;

      const now = Date.now();
      const last = lastPayloadRef.current;
      if (last && last.payload === trimmed && now - last.at < 1200) return;
      lastPayloadRef.current = { payload: trimmed, at: now };

      busyRef.current = true;
      try {
        const outcome = await onDecodeRef.current(trimmed);
        if (outcome.message) {
          setFeedback({ text: outcome.message, tone: outcome.tone ?? "warning" });
        }
        if (outcome.action === "close") onCloseRef.current();
      } catch {
        setFeedback({
          text: "تمت قراءة QR لكن تعذر التحقق منه الآن. تحقق من الاتصال ثم أعد المسح.",
          tone: "error",
        });
      } finally {
        busyRef.current = false;
      }
    }

    async function start() {
      try {
        const { default: QrScanner } = await import("qr-scanner");
        if (cancelled || !videoRef.current) return;

        const scanner = new QrScanner(
          videoRef.current,
          (result) => { void handlePayload(decodedText(result)); },
          {
            preferredCamera: "environment",
            returnDetailedScanResult: true,
            highlightScanRegion: true,
            highlightCodeOutline: true,
            maxScansPerSecond: 8,
          },
        );
        scannerRef.current = scanner;
        await scanner.start();
        if (!cancelled) setCameraState("ready");
      } catch {
        if (!cancelled) setCameraState("error");
      }
    }

    void start();

    return () => {
      cancelled = true;
      busyRef.current = false;
      lastPayloadRef.current = null;
      scannerRef.current?.stop();
      scannerRef.current?.destroy();
      scannerRef.current = null;
      document.body.style.overflow = previousBodyOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  async function scanImage(file: File | undefined) {
    if (!file) return;
    setFeedback(null);
    try {
      const { default: QrScanner } = await import("qr-scanner");
      const result = await QrScanner.scanImage(file, { returnDetailedScanResult: true });
      const outcome = await onDecodeRef.current(decodedText(result));
      if (outcome.message) setFeedback({ text: outcome.message, tone: outcome.tone ?? "warning" });
      if (outcome.action === "close") onCloseRef.current();
    } catch {
      setFeedback({
        text: "تعذر قراءة أو التحقق من QR في هذه الصورة. جرّب صورة أوضح أو استخدم الإدخال اليدوي.",
        tone: "error",
      });
    }
  }

  if (!open) return null;

  return (
    <div className={styles.scannerBackdrop} role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className={styles.scannerSheet} role="dialog" aria-modal="true" aria-labelledby="scanner-title">
        <header className={styles.scannerHeader}>
          <div>
            <p>المسح بالكاميرا</p>
            <h2 id="scanner-title">{title}</h2>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="إغلاق الماسح">×</button>
        </header>

        <div className={styles.cameraFrame} data-state={cameraState}>
          <video ref={videoRef} muted playsInline />
          {cameraState === "starting" ? <div className={styles.cameraMessage}>جارٍ تشغيل الكاميرا…</div> : null}
          {cameraState === "error" ? (
            <div className={styles.cameraMessage}>
              <strong>تعذر تشغيل الكاميرا</strong>
              <span>يمكنك اختيار صورة QR أو استخدام الإدخال اليدوي بدون تعطيل العملية.</span>
            </div>
          ) : null}
        </div>

        <p className={styles.scannerInstruction}>{instruction}</p>

        {feedback ? (
          <div className={styles.scannerFeedback} data-tone={feedback.tone} role="status">{feedback.text}</div>
        ) : null}

        <div className={styles.scannerFallbacks}>
          <label className="button">
            قراءة QR من صورة
            <input
              type="file"
              accept="image/*"
              className={styles.hiddenFileInput}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                void scanImage(file);
                event.currentTarget.value = "";
              }}
            />
          </label>
          <button type="button" className="button button-ghost" onClick={onClose}>إدخال يدوي</button>
        </div>
      </section>
    </div>
  );
}
