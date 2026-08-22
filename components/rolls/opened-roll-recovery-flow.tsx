"use client";

import Link from "next/link";
import { FormEvent, useRef, useState, useTransition } from "react";
import {
  recoverOpenedRoll,
  resolveOpenedRollRecoveryCandidate,
  type OpenedRollRecoveryCandidate,
} from "@/app/operations/rolls/recovery/actions";
import { QrScannerSheet, type ScannerDecodeOutcome } from "@/components/transfers/qr-scanner-sheet";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { normalizeRollSerial, parseRollQrPayload } from "@/lib/rolls/roll-qr";
import styles from "./opened-roll-recovery-flow.module.css";

const errorMessages: Record<string, string> = {
  PG_ROLL_RECOVERY_SERIAL_INVALID: "رقم الرول أو QR غير صالح.",
  PG_ROLL_RECOVERY_NOT_AUTHORIZED: "هذا الحساب غير مخوّل بتنفيذ استرداد رول مفتوح.",
  PG_ROLL_RECOVERY_ACTOR_INACTIVE: "الحساب أو الجهة التشغيلية غير نشطة حاليًا.",
  PG_ROLL_RECOVERY_AGENT_NOT_ENABLED: "صلاحية استرداد اللفات المفتوحة غير مفعلة لهذا الوكيل.",
  PG_ROLL_RECOVERY_ROLL_NOT_FOUND: "لم يتم العثور على هذا الرول.",
  PG_ROLL_RECOVERY_NOT_OPENED: "هذا الرول لم يُسجل كمفتوح، لذلك لا يحتاج مسار الاسترداد الاستثنائي.",
  PG_ROLL_RECOVERY_ALREADY_AT_DESTINATION: "الرول موجود بالفعل في حيازة جهة الاسترداد الحالية.",
  PG_ROLL_RECOVERY_TRANSFER_RESERVED: "الرول مرتبط بتحويل نشط. يجب حسم التحويل أولًا.",
  PG_ROLL_RECOVERY_AGENT_CENTER_REQUIRED: "الوكيل لا يستطيع استخدام هذا المسار إلا لاسترداد رول مفتوح من مركز تركيب داخل شبكته.",
  PG_ROLL_RECOVERY_OUTSIDE_AGENT_SCOPE: "هذا الرول خارج نطاق شبكة الوكيل الحالي.",
  PG_ROLL_RECOVERY_PHYSICAL_RECEIPT_REQUIRED: "يجب تأكيد الاستلام المادي للرول قبل نقل الحيازة.",
  PG_ROLL_RECOVERY_REASON_INVALID: "اكتب سببًا واضحًا للاسترداد من 5 إلى 500 حرف.",
  PG_ROLL_RECOVERY_REQUEST_CONFLICT: "رقم طلب الاسترداد استُخدم لعملية مختلفة. أعد قراءة الرول وابدأ طلبًا جديدًا.",
  PG_ROLL_RECOVERY_PRODUCTION_INVALID: "أصل الإنتاج الخاص بهذا الرول غير صالح للعملية.",
  PG_ROLL_RECOVERY_CANDIDATE_INVALID: "تعذر تحميل بيانات الاسترداد بشكل آمن. أعد المحاولة.",
  PG_ROLL_RECOVERY_FAILED: "تعذر تنفيذ الاسترداد الآن. أعد المحاولة دون تغيير بيانات العملية.",
};

function recoveryError(code: string): string {
  return errorMessages[code] ?? "تعذر إكمال الاسترداد. راجع بيانات الرول أو مسؤول النظام إذا استمرت المشكلة.";
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function OpenedRollRecoveryFlow() {
  const [serialInput, setSerialInput] = useState("");
  const [candidate, setCandidate] = useState<OpenedRollRecoveryCandidate | null>(null);
  const [reason, setReason] = useState("");
  const [confirmedReceipt, setConfirmedReceipt] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "error" | "warning" | "success"; text: string } | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [completed, setCompleted] = useState<{ candidate: OpenedRollRecoveryCandidate; transferId: string } | null>(null);
  const [isResolving, startResolve] = useTransition();
  const [isRecovering, startRecovering] = useTransition();
  const requestIdRef = useRef<string | null>(null);

  function resetOperation() {
    setCandidate(null);
    setReason("");
    setConfirmedReceipt(false);
    setFeedback(null);
    setCompleted(null);
    requestIdRef.current = null;
  }

  async function resolveSerial(serial: string): Promise<boolean> {
    const normalized = normalizeRollSerial(serial);
    if (!normalized) {
      resetOperation();
      setFeedback({ tone: "error", text: errorMessages.PG_ROLL_RECOVERY_SERIAL_INVALID });
      return false;
    }

    const result = await resolveOpenedRollRecoveryCandidate(normalized);
    if (!result.ok) {
      resetOperation();
      setSerialInput(normalized);
      setFeedback({ tone: "error", text: recoveryError(result.code) });
      return false;
    }

    requestIdRef.current = null;
    setCompleted(null);
    setReason("");
    setConfirmedReceipt(false);
    setSerialInput(result.candidate.serialNumber);
    setCandidate(result.candidate);

    if (result.candidate.eligibility === "transfer_reserved") {
      setFeedback({ tone: "warning", text: "الرول مفتوح لكن مرتبط بتحويل نشط. حسم التحويل أولًا ثم أعد الفحص." });
    } else if (result.candidate.eligibility === "already_at_destination") {
      setFeedback({ tone: "warning", text: `الرول موجود بالفعل لدى ${result.candidate.recoveryDestinationName}. لا يوجد تغيير حيازة مطلوب.` });
    } else {
      setFeedback(null);
    }

    return true;
  }

  function handleManualSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startResolve(() => { void resolveSerial(serialInput); });
  }

  async function handleQrDecode(payload: string): Promise<ScannerDecodeOutcome> {
    const serial = parseRollQrPayload(payload, window.location.origin);
    if (!serial) {
      return { action: "continue", tone: "error", message: "هذا QR ليس QR رول صالحًا لهذه المنصة." };
    }

    try {
      const resolved = await resolveSerial(serial);
      return resolved
        ? { action: "close", tone: "success", message: "تم التعرف على الرول." }
        : { action: "continue", tone: "warning", message: "تمت قراءة الرول لكن لا يمكن استرداده من هذا الحساب الآن." };
    } catch {
      return { action: "continue", tone: "error", message: "تعذر التحقق من الرول الآن. أعد المحاولة أو استخدم الإدخال اليدوي." };
    }
  }

  function confirmRecovery() {
    if (!candidate || candidate.eligibility !== "eligible" || isRecovering) return;
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 5 || trimmedReason.length > 500) {
      setFeedback({ tone: "error", text: errorMessages.PG_ROLL_RECOVERY_REASON_INVALID });
      return;
    }
    if (!confirmedReceipt) {
      setFeedback({ tone: "error", text: errorMessages.PG_ROLL_RECOVERY_PHYSICAL_RECEIPT_REQUIRED });
      return;
    }

    if (!requestIdRef.current) requestIdRef.current = crypto.randomUUID();
    const requestId = requestIdRef.current;

    startRecovering(() => {
      void (async () => {
        try {
          const result = await recoverOpenedRoll({
            requestId,
            serialNumber: candidate.serialNumber,
            reason: trimmedReason,
            confirmPhysicalReceipt: true,
          });

          if (!result.ok) {
            setFeedback({ tone: "error", text: recoveryError(result.code) });
            if (["PG_ROLL_RECOVERY_TRANSFER_RESERVED", "PG_ROLL_RECOVERY_ALREADY_AT_DESTINATION"].includes(result.code)) {
              requestIdRef.current = null;
              await resolveSerial(candidate.serialNumber);
            }
            return;
          }

          requestIdRef.current = null;
          setFeedback(null);
          setCompleted({ candidate, transferId: result.transferId });
        } catch {
          setFeedback({
            tone: "error",
            text: "انقطع تأكيد الاسترداد. أعد الضغط على التأكيد بنفس البيانات؛ النظام سيعيد استخدام نفس رقم الطلب ولن يكرر نقل الحيازة.",
          });
        }
      })();
    });
  }

  function startAnother() {
    setSerialInput("");
    resetOperation();
  }

  if (completed) {
    return (
      <div className={styles.flow}>
        <section className={styles.successCard} aria-live="polite">
          <div className={styles.successMark}>✓</div>
          <div>
            <h2>تم استرداد الرول وتأكيد الحيازة</h2>
            <p>انتقلت الحيازة المؤكدة إلى {completed.candidate.recoveryDestinationName}، مع الاحتفاظ بحدث الفتح الأصلي بدون أي تعديل.</p>
          </div>
          <div className={styles.identity}>
            <strong>{completed.candidate.productName}</strong>
            <span dir="ltr">SKU: {completed.candidate.productCode}</span>
            <code>{completed.candidate.serialNumber}</code>
          </div>
          <div className={styles.actions}>
            <Link href={`/operations/transfers/${completed.transferId}`} className="button button-secondary">فتح سجل الاسترداد</Link>
            <button type="button" className="button button-ghost" onClick={startAnother}>استرداد رول آخر</button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.flow}>
      <section className={styles.card}>
        <div className={styles.heading}>
          <h2>حدد الرول المستلم فعليًا</h2>
          <p>المسار استثنائي للرول المفتوح فقط. لن تتغير الحيازة إلا بعد تأكيد أنك استلمت الرول ماديًا.</p>
        </div>
        <button type="button" className={`button button-primary ${styles.scanAction}`} onClick={() => setScannerOpen(true)}>
          مسح QR الرول
        </button>
        <form className={styles.manualForm} onSubmit={handleManualSubmit}>
          <label htmlFor="recovery-roll-serial">أو أدخل سيريال الرول</label>
          <div className={styles.manualRow}>
            <input
              id="recovery-roll-serial"
              className="input"
              dir="ltr"
              autoComplete="off"
              placeholder="PG-R-YYYYMMDD-00000000-00-0000"
              value={serialInput}
              onChange={(event) => {
                setSerialInput(event.target.value);
                resetOperation();
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
        <section className={styles.card}>
          <div className={styles.identity}>
            <strong>{candidate.productName}</strong>
            <span dir="ltr">SKU: {candidate.productCode}</span>
            <code>{candidate.serialNumber}</code>
            <span dir="ltr">Lot: {candidate.lotNumber}</span>
          </div>

          <div className={styles.metaGrid}>
            <div className={styles.metaItem}>
              <span>مركز الفتح الأصلي</span>
              <strong>{candidate.openingCenterName}</strong>
            </div>
            <div className={styles.metaItem}>
              <span>وقت الفتح</span>
              <strong>{formatDate(candidate.openedAt)}</strong>
            </div>
          </div>

          <div className={styles.route} aria-label="مسار انتقال الحيازة">
            <strong>{candidate.currentCustodianName}</strong>
            <span className={styles.routeArrow}>→</span>
            <strong>{candidate.recoveryDestinationName}</strong>
          </div>

          {candidate.eligibility === "eligible" ? (
            <div className={styles.recoveryForm}>
              <label htmlFor="opened-roll-recovery-reason">سبب الاسترداد</label>
              <textarea
                id="opened-roll-recovery-reason"
                className={`input ${styles.reasonField}`}
                maxLength={500}
                placeholder="مثال: ظهر عيب مادي في الرول بعد الفتح وتم استلامه من المركز للفحص."
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
              <label className={styles.checkRow}>
                <input
                  type="checkbox"
                  checked={confirmedReceipt}
                  onChange={(event) => setConfirmedReceipt(event.target.checked)}
                />
                <span>أؤكد أن الرول موجود معي فعليًا الآن، وأفهم أن التأكيد سينقل الحيازة فورًا إلى {candidate.recoveryDestinationName}.</span>
              </label>
              <div className={styles.actions}>
                <button type="button" className="button button-primary" onClick={confirmRecovery} disabled={isRecovering}>
                  {isRecovering ? "جارٍ تأكيد الاسترداد…" : "تأكيد استلام واسترداد الرول"}
                </button>
                <button type="button" className="button button-ghost" onClick={startAnother} disabled={isRecovering}>اختيار رول آخر</button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <QrScannerSheet
        open={scannerOpen}
        title="مسح QR رول مفتوح"
        instruction="وجّه الكاميرا إلى QR الموجود على ملصق الرول الذي استلمته فعليًا."
        onClose={() => setScannerOpen(false)}
        onDecode={handleQrDecode}
      />
    </div>
  );
}
