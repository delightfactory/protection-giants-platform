"use client";

import { useEffect, useRef, useState } from "react";
import { AccessibleDialog } from "@/components/ui/accessible-dialog";
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

type ActiveQrScanner = {
  stop: () => void;
  destroy: () => void;
  hasFlash: () => Promise<boolean>;
  isFlashOn: () => boolean;
  toggleFlash: () => Promise<void>;
};

const MAX_QR_PAYLOAD_LENGTH = 4096;

function decodedText(result: unknown): string {
  if (typeof result === "string") return result;
  if (result && typeof result === "object" && "data" in result && typeof result.data === "string") {
    return result.data;
  }
  return "";
}

function cameraFailureMessage(error: unknown): string {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return "المتصفح منع الكاميرا لأن الصفحة غير مؤمنة. افتح المنصة عبر HTTPS أو localhost ثم أعد المحاولة.";
  }
  if (typeof navigator !== "undefined" && !navigator.mediaDevices?.getUserMedia) {
    return "هذا المتصفح لا يوفّر وصولًا متوافقًا للكاميرا. استخدم متصفحًا حديثًا أو اقرأ QR من صورة.";
  }

  const name = error instanceof DOMException ? error.name : "";
  const text = error instanceof Error ? error.message : String(error ?? "");
  if (name === "NotAllowedError" || /permission|denied|notallowed/i.test(text)) {
    return "صلاحية الكاميرا مرفوضة. اسمح للمنصة باستخدام الكاميرا من إعدادات المتصفح ثم أعد المحاولة.";
  }
  if (name === "NotFoundError" || /camera not found|notfound/i.test(text)) {
    return "لم يتم العثور على كاميرا متاحة على هذا الجهاز. يمكنك قراءة QR من صورة أو استخدام الإدخال اليدوي.";
  }
  if (name === "NotReadableError" || /notreadable|could not start/i.test(text)) {
    return "الكاميرا مستخدمة بواسطة تطبيق آخر أو تعذر تشغيلها. أغلق التطبيق الآخر ثم أعد المحاولة.";
  }
  return "تعذر تشغيل الكاميرا الآن. يمكنك قراءة QR من صورة أو استخدام الإدخال اليدوي بدون تعطيل العملية.";
}

export function QrScannerSheet({ open, title, instruction, onClose, onDecode }: QrScannerSheetProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<ActiveQrScanner | null>(null);
  const busyRef = useRef(false);
  const lastPayloadRef = useRef<{ payload: string; at: number } | null>(null);
  const onCloseRef = useRef(onClose);
  const onDecodeRef = useRef(onDecode);
  const [cameraState, setCameraState] = useState<"starting" | "ready" | "error">("starting");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [flashAvailable, setFlashAvailable] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
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
    setCameraState("starting");
    setCameraError(null);
    setFlashAvailable(false);
    setFlashOn(false);
    setFeedback(null);

    async function handlePayload(payload: string) {
      const trimmed = payload.trim();
      if (!trimmed || busyRef.current) return;
      if (trimmed.length > MAX_QR_PAYLOAD_LENGTH) {
        setFeedback({ text: "تمت قراءة QR لكن محتواه أكبر من الحد التشغيلي المسموح.", tone: "error" });
        return;
      }

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
            maxScansPerSecond: 12,
          },
        );
        scannerRef.current = scanner;
        await scanner.start();
        if (cancelled) return;

        setCameraState("ready");
        const canUseFlash = await scanner.hasFlash().catch(() => false);
        if (!cancelled) setFlashAvailable(canUseFlash);
      } catch (error) {
        if (!cancelled) {
          setCameraError(cameraFailureMessage(error));
          setCameraState("error");
        }
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
    };
  }, [open]);

  async function scanImage(file: File | undefined) {
    if (!file) return;
    setFeedback(null);
    try {
      const { default: QrScanner } = await import("qr-scanner");
      const result = await QrScanner.scanImage(file, { returnDetailedScanResult: true });
      const payload = decodedText(result).trim();
      if (!payload || payload.length > MAX_QR_PAYLOAD_LENGTH) {
        setFeedback({ text: "تعذر قراءة محتوى QR صالح من هذه الصورة.", tone: "error" });
        return;
      }
      const outcome = await onDecodeRef.current(payload);
      if (outcome.message) setFeedback({ text: outcome.message, tone: outcome.tone ?? "warning" });
      if (outcome.action === "close") onCloseRef.current();
    } catch {
      setFeedback({
        text: "تعذر قراءة أو التحقق من QR في هذه الصورة. جرّب صورة أوضح أو استخدم الإدخال اليدوي.",
        tone: "error",
      });
    }
  }

  async function toggleFlash() {
    const scanner = scannerRef.current;
    if (!scanner || !flashAvailable) return;

    try {
      await scanner.toggleFlash();
      setFlashOn(scanner.isFlashOn());
    } catch {
      setFeedback({
        text: "تعذر التحكم في فلاش الكاميرا على هذا الجهاز.",
        tone: "warning",
      });
    }
  }

  if (!open) return null;

  return (
    <AccessibleDialog
      open={open}
      onClose={onClose}
      titleId="scanner-title"
      descriptionId="scanner-instruction"
      placement="responsive"
    >
      <section className={styles.scannerSheet}>
        <header className={styles.scannerHeader}>
          <div>
            <p>المسح بالكاميرا</p>
            <h2 id="scanner-title">{title}</h2>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="إغلاق الماسح" data-dialog-initial-focus>×</button>
        </header>

        <div className={styles.cameraFrame} data-state={cameraState}>
          <video ref={videoRef} muted playsInline />
          {cameraState === "starting" ? <div className={styles.cameraMessage}>جارٍ تشغيل الكاميرا…</div> : null}
          {cameraState === "error" ? (
            <div className={styles.cameraMessage}>
              <strong>تعذر تشغيل الكاميرا</strong>
              <span>{cameraError ?? "يمكنك اختيار صورة QR أو استخدام الإدخال اليدوي بدون تعطيل العملية."}</span>
            </div>
          ) : null}
        </div>

        <p id="scanner-instruction" className={styles.scannerInstruction}>{instruction}</p>

        {feedback ? (
          <div className={styles.scannerFeedback} data-tone={feedback.tone} role="status">{feedback.text}</div>
        ) : null}

        <div className={styles.scannerFallbacks}>
          {flashAvailable && cameraState === "ready" ? (
            <button type="button" className="button button-ghost" onClick={() => { void toggleFlash(); }}>
              {flashOn ? "إطفاء الفلاش" : "تشغيل الفلاش"}
            </button>
          ) : null}
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
    </AccessibleDialog>
  );
}
