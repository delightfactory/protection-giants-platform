"use client";

import { FormEvent, useRef, useState, useTransition } from "react";
import {
  openRoll,
  resolveRollOpeningCandidate,
  type RollOpeningCandidate,
} from "@/app/operations/rolls/open/actions";
import { QrScannerSheet, type ScannerDecodeOutcome } from "@/components/transfers/qr-scanner-sheet";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { normalizeRollSerial, parseRollQrPayload } from "@/lib/rolls/roll-qr";
import styles from "./roll-opening-flow.module.css";

const errorMessages: Record<string, string> = {
  PG_ROLL_OPENING_SERIAL_INVALID: "رقم الرول أو QR غير صالح. امسح QR الأصلي على الرول أو أدخل السيريال الكامل.",
  PG_ROLL_OPENING_CENTER_REQUIRED: "فتح الرول متاح من حساب مركز تركيب فقط.",
  PG_ROLL_OPENING_CENTER_INACTIVE: "حساب المركز أو المركز نفسه غير نشط حاليًا.",
  PG_ROLL_OPENING_ROLL_NOT_FOUND: "لم يتم العثور على هذا الرول في سجل Protection Giants.",
  PG_ROLL_OPENING_NOT_CURRENT_CUSTODIAN: "هذا الرول ليس في الحيازة المؤكدة الحالية لهذا المركز.",
  PG_ROLL_OPENING_TRANSFER_RESERVED: "الرول مرتبط بتحويل نشط. يجب حسم التحويل أولًا قبل فتح الرول.",
  PG_ROLL_ALREADY_OPENED: "تم تسجيل فتح هذا الرول من قبل، ولا يمكن إنشاء فتح جديد.",
  PG_ROLL_OPENING_PRODUCTION_INVALID: "أصل الإنتاج الخاص بهذا الرول غير صالح للاستخدام التشغيلي.",
  PG_ROLL_OPENING_REQUEST_CONFLICT: "تعذر تأكيد المحاولة لأن نفس رقم الطلب استُخدم لعملية مختلفة. أعد قراءة الرول.",
  PG_ROLL_OPENING_CANDIDATE_INVALID: "تعذر التحقق من بيانات الرول الآن. أعد المحاولة.",
  PG_ROLL_OPENING_CONFIRMATION_FAILED: "تم تنفيذ العملية لكن تعذر تحميل تأكيدها. ارجع إلى الرول وأعد التحقق قبل أي محاولة أخرى.",
  PG_ROLL_OPENING_FAILED: "تعذر تنفيذ فتح الرول الآن. أعد المحاولة دون تغيير الرول.",
};

function openingError(code: string): string {
  return errorMessages[code] ?? "تعذر إكمال العملية. أعد المحاولة أو راجع مسؤول النظام إذا استمرت المشكلة.";
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function RollOpeningFlow() {
  const [serialInput, setSerialInput] = useState("");
  const [candidate, setCandidate] = useState<RollOpeningCandidate | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "error" | "warning" | "success"; text: string } | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [success, setSuccess] = useState<RollOpeningCandidate | null>(null);
  const [isResolving, startResolve] = useTransition();
  const [isOpening, startOpening] = useTransition();
  const requestIdRef = useRef<string | null>(null);

  function clearResolvedState() {
    setCandidate(null);
    setSuccess(null);
    setFeedback(null);
    requestIdRef.current = null;
  }

  async function resolveSerial(serial: string): Promise<boolean> {
    const normalized = normalizeRollSerial(serial);
    if (!normalized) {
      clearResolvedState();
      setFeedback({ tone: "error", text: errorMessages.PG_ROLL_OPENING_SERIAL_INVALID });
      return false;
    }

    const result = await resolveRollOpeningCandidate(normalized);
    if (!result.ok) {
      clearResolvedState();
      setSerialInput(normalized);
      setFeedback({ tone: "error", text: openingError(result.code) });
      return false;
    }

    requestIdRef.current = null;
    setSuccess(null);
    setSerialInput(result.candidate.serialNumber);
    setCandidate(result.candidate);

    if (result.candidate.eligibility === "already_opened") {
      setFeedback({
        tone: "warning",
        text: `هذا الرول مسجل كمفتوح بالفعل منذ ${formatDate(result.candidate.openedAt)}. لا يوجد Undo لحدث الفتح.`,
      });
    } else if (result.candidate.eligibility === "transfer_reserved") {
      setFeedback({
        tone: "warning",
        text: "الرول في حيازة المركز لكنه محجوز داخل تحويل نشط. حسم التحويل أولًا ثم أعد الفحص.",
      });
    } else {
      setFeedback(null);
    }

    return true;
  }

  function handleManualSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startResolve(() => {
      void resolveSerial(serialInput);
    });
  }

  async function handleQrDecode(payload: string): Promise<ScannerDecodeOutcome> {
    const serial = parseRollQrPayload(payload, window.location.origin);
    if (!serial) {
      return {
        action: "continue",
        tone: "error",
        message: "هذا QR ليس QR رول صالحًا لهذه المنصة. وجّه الكاميرا إلى QR الموجود على ملصق الرول الخارجي.",
      };
    }

    try {
      const resolved = await resolveSerial(serial);
      return resolved
        ? { action: "close", tone: "success", message: "تم التعرف على الرول." }
        : { action: "continue", tone: "warning", message: "تمت قراءة الرول لكن لا يمكن فتحه من هذا الحساب الآن." };
    } catch {
      return {
        action: "continue",
        tone: "error",
        message: "تعذر التحقق من الرول الآن. أعد المحاولة أو استخدم الإدخال اليدوي.",
      };
    }
  }

  function confirmOpening() {
    if (!candidate || candidate.eligibility !== "eligible" || isOpening) return;
    if (!requestIdRef.current) requestIdRef.current = crypto.randomUUID();
    const requestId = requestIdRef.current;

    startOpening(() => {
      void (async () => {
        try {
          const result = await openRoll({
            requestId,
            serialNumber: candidate.serialNumber,
          });

          if (!result.ok) {
            setFeedback({ tone: "error", text: openingError(result.code) });
            if (result.code === "PG_ROLL_OPENING_TRANSFER_RESERVED" || result.code === "PG_ROLL_ALREADY_OPENED") {
              requestIdRef.current = null;
              await resolveSerial(candidate.serialNumber);
            }
            return;
          }

          requestIdRef.current = null;
          setCandidate(result.candidate);
          setSuccess(result.candidate);
          setFeedback(null);
        } catch {
          setFeedback({
            tone: "error",
            text: "انقطع تأكيد العملية. أعد الضغط على تأكيد فتح الرول؛ سيستخدم النظام نفس رقم الطلب بأمان ولن ينشئ فتحًا مكررًا.",
          });
        }
      })();
    });
  }

  function startAnother() {
    setSerialInput("");
    clearResolvedState();
  }

  if (success) {
    return (
      <div className={styles.flow}>
        <section className={styles.successCard} aria-live="polite">
          <div className={styles.successMark}>✓</div>
          <div>
            <h2>تم فتح الرول بنجاح</h2>
            <p>تم تسجيل الفتح كحدث دائم، مع بقاء الحيازة الحالية للمركز بدون تغيير.</p>
          </div>
          <div className={styles.identity}>
            <strong>{success.productName}</strong>
            <span dir="ltr">SKU: {success.productCode}</span>
            <code>{success.serialNumber}</code>
            <div className={styles.meta}>
              <span dir="ltr">Lot: {success.lotNumber}</span>
              <span>وقت الفتح: {formatDate(success.openedAt)}</span>
            </div>
          </div>
          <div className={styles.nextNote}>
            <strong>الخطوة التالية</strong>
            <p>لو ظهر عيب مادي أو تصنيعي قبل التركيب، سيتم التعامل معه من مسار بلاغ ما قبل التركيب عند تفعيله. تفعيل ضمان العميل يظل خطوة مستقلة بعد التركيب.</p>
          </div>
          <button type="button" className="button button-secondary" onClick={startAnother}>فتح رول آخر</button>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.flow}>
      <section className={styles.entryCard}>
        <div className={styles.entryHero}>
          <h2>حدد الرول الموجود أمامك</h2>
          <p>الأفضل مسح QR الخارجي. وجود QR وحده لا يمنح صلاحية؛ النظام سيتحقق من الحيازة والحالة قبل السماح بالفتح.</p>
        </div>

        <button
          type="button"
          className={`button button-primary ${styles.scanAction}`}
          onClick={() => setScannerOpen(true)}
        >
          مسح QR الرول
        </button>

        <form className={styles.manualForm} onSubmit={handleManualSubmit}>
          <label htmlFor="roll-opening-serial">أو أدخل سيريال الرول</label>
          <div className={styles.manualRow}>
            <input
              id="roll-opening-serial"
              className="input"
              dir="ltr"
              inputMode="text"
              autoComplete="off"
              placeholder="PG-R-YYYYMMDD-00000000-00-0000"
              value={serialInput}
              onChange={(event) => {
                setSerialInput(event.target.value);
                clearResolvedState();
              }}
            />
            <button type="submit" className="button button-secondary" disabled={isResolving || !serialInput.trim()}>
              {isResolving ? "جارٍ التحقق…" : "تحقق من الرول"}
            </button>
          </div>
        </form>
      </section>

      {feedback ? <FeedbackBanner tone={feedback.tone}>{feedback.text}</FeedbackBanner> : null}

      {candidate ? (
        <section className={styles.candidateCard}>
          <div>
            <h2>{candidate.productName}</h2>
            <p>راجع الهوية قبل تسجيل الحدث المادي.</p>
          </div>

          <div className={styles.identity}>
            <span dir="ltr">SKU: {candidate.productCode}</span>
            <code>{candidate.serialNumber}</code>
            <div className={styles.meta}>
              <span dir="ltr">Lot: {candidate.lotNumber}</span>
              {candidate.openedAt ? <span>فتح سابق: {formatDate(candidate.openedAt)}</span> : null}
            </div>
          </div>

          {candidate.eligibility === "eligible" ? (
            <>
              <div className={styles.permanentNotice}>
                <strong>تأكيد مادي دائم</strong>
                <p>اضغط التأكيد فقط بعد فتح الرول فعليًا. بعد التسجيل لن يظهر للمركز زر Undo ولن يدخل الرول في التحويلات العادية.</p>
              </div>
              <div className={styles.actions}>
                <button type="button" className="button button-primary" onClick={confirmOpening} disabled={isOpening}>
                  {isOpening ? "جارٍ تسجيل الفتح…" : "تأكيد فتح الرول"}
                </button>
                <button type="button" className="button button-ghost" onClick={startAnother} disabled={isOpening}>
                  اختيار رول آخر
                </button>
              </div>
            </>
          ) : null}
        </section>
      ) : null}

      <QrScannerSheet
        open={scannerOpen}
        title="مسح QR الرول"
        instruction="وجّه الكاميرا إلى QR الموجود على ملصق الرول الخارجي."
        onClose={() => setScannerOpen(false)}
        onDecode={handleQrDecode}
      />
    </div>
  );
}
