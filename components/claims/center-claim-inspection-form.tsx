"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  removeClaimInspectionEvidence,
  submitClaimInspection,
  uploadClaimInspectionEvidence,
  type InspectionEvidenceReference,
} from "@/app/operations/claim-inspections/actions";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import styles from "./center-claim-inspection-form.module.css";

const MAX_IMAGES = 5;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type UploadItem = {
  localId: string;
  fileName: string;
  slot: number;
  status: "uploading" | "ready" | "error";
  evidence?: InspectionEvidenceReference;
  error?: string;
};

function errorText(code: string): string {
  switch (code) {
    case "PG_CLAIM_INSPECTION_EVIDENCE_SIZE_INVALID":
      return "حجم كل صورة يجب ألا يتجاوز 8 ميجابايت.";
    case "PG_CLAIM_INSPECTION_EVIDENCE_TYPE_INVALID":
      return "صيغة الصورة غير مدعومة. استخدم JPEG أو PNG أو WebP.";
    case "PG_CLAIM_INSPECTION_EVIDENCE_INVALID":
      return "تعذر التحقق من صور الفحص. أعد رفع الصور المطلوبة.";
    case "PG_CLAIM_INSPECTION_EVIDENCE_UPLOAD_AMBIGUOUS":
      return "تعذر تأكيد حالة رفع الصورة. أزل العنصر ثم أعد رفع الصورة قبل إرسال الفحص.";
    case "PG_CLAIM_INSPECTION_EVIDENCE_UPLOAD_FAILED":
      return "تعذر رفع الصورة. تحقق من الاتصال وحاول مرة أخرى.";
    case "PG_CLAIM_INSPECTION_EVIDENCE_REMOVE_FAILED":
      return "تعذر حذف الصورة الآن. حاول مرة أخرى.";
    case "PG_CLAIM_INSPECTION_OBSERVATION_INVALID":
      return "اكتب ملاحظة فنية واضحة من 10 إلى 3000 حرف.";
    case "PG_CLAIM_INSPECTION_CAUSE_INVALID":
      return "السبب المشتبه به يجب أن يكون من 2 إلى 1000 حرف، أو اتركه فارغًا.";
    case "PG_CLAIM_ACTION_REQUEST_CONFLICT":
      return "تغيرت بيانات الفحص بعد بدء محاولة الإرسال. راجع البيانات وابدأ محاولة جديدة.";
    case "PG_CLAIM_INSPECTION_CENTER_INACTIVE":
    case "PG_CLAIM_INSPECTION_CENTER_REQUIRED":
      return "حساب المركز لم يعد صالحًا لتنفيذ الفحص حاليًا.";
    case "PG_CLAIM_INSPECTION_NOT_ASSIGNED_CENTER":
    case "PG_CLAIM_INSPECTION_NOT_FOUND":
    case "PG_CLAIM_INSPECTION_PARENT_STATE_INVALID":
    case "PG_CLAIM_INSPECTION_SUBMIT_STATE_INVALID":
      return "لم يعد هذا الفحص متاحًا لمركزك. ارجع إلى قائمة الفحوصات لتحديث المهام.";
    case "PG_CLAIM_WARRANTY_INVALID":
      return "حالة الضمان لم تعد تسمح بإكمال هذا الفحص.";
    default:
      return "تعذر إكمال العملية الآن. حاول مرة أخرى بدون تكرار الضغط.";
  }
}

function formatBytes(size: number) {
  return size >= 1024 * 1024
    ? `${(size / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(size / 1024))} KB`;
}

export function CenterClaimInspectionForm({ inspectionId }: { inspectionId: string }) {
  const router = useRouter();
  const [technicalObservation, setTechnicalObservation] = useState("");
  const [suspectedCause, setSuspectedCause] = useState("");
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [acknowledged, setAcknowledged] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "error" | "warning" | "info" | "success"; text: string } | null>(null);
  const [isSubmitting, startSubmit] = useTransition();
  const requestIdRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const readyEvidence = useMemo(
    () => uploads
      .filter((item) => item.status === "ready" && item.evidence)
      .sort((a, b) => a.slot - b.slot)
      .map((item) => item.evidence!),
    [uploads],
  );
  const anyUploading = uploads.some((item) => item.status === "uploading");
  const hasAmbiguousEvidence = uploads.some((item) => item.status === "error" && item.evidence);
  const busy = anyUploading || isSubmitting;

  function payloadChanged() {
    requestIdRef.current = null;
    setFeedback(null);
  }

  async function uploadFiles(files: FileList | null) {
    if (!files?.length || busy) return;
    const currentReserved = uploads.filter((item) => item.status !== "error" || item.evidence).length;
    const remaining = MAX_IMAGES - currentReserved;
    const selected = Array.from(files).slice(0, Math.max(0, remaining));
    if (selected.length === 0) {
      setFeedback({ tone: "error", text: "يمكن إرفاق حتى 5 صور فقط للفحص." });
      return;
    }

    const usedSlots = new Set(uploads.map((item) => item.slot));
    payloadChanged();

    for (const file of selected) {
      if (file.size < 1 || file.size > MAX_IMAGE_BYTES) {
        setFeedback({ tone: "error", text: errorText("PG_CLAIM_INSPECTION_EVIDENCE_SIZE_INVALID") });
        continue;
      }
      if (!ALLOWED_TYPES.has(file.type)) {
        setFeedback({ tone: "error", text: errorText("PG_CLAIM_INSPECTION_EVIDENCE_TYPE_INVALID") });
        continue;
      }

      const slot = [1, 2, 3, 4, 5].find((candidate) => !usedSlots.has(candidate));
      if (!slot) break;
      usedSlots.add(slot);
      const localId = crypto.randomUUID();
      setUploads((current) => [...current, { localId, fileName: file.name, slot, status: "uploading" }]);

      try {
        const result = await uploadClaimInspectionEvidence(inspectionId, slot, file);
        if (!result.ok) {
          setUploads((current) => current.map((item) => item.localId === localId
            ? { ...item, status: "error", evidence: result.evidence, error: errorText(result.code) }
            : item));
          if ([
            "PG_CLAIM_INSPECTION_NOT_ASSIGNED_CENTER",
            "PG_CLAIM_INSPECTION_NOT_FOUND",
            "PG_CLAIM_INSPECTION_CENTER_REQUIRED",
          ].includes(result.code)) router.refresh();
          continue;
        }
        setUploads((current) => current.map((item) => item.localId === localId
          ? { ...item, status: "ready", evidence: result.evidence }
          : item));
      } catch {
        setUploads((current) => current.map((item) => item.localId === localId
          ? { ...item, status: "error", error: "انقطع تأكيد رفع الصورة. أزل العنصر وأعد رفع نفس الصورة." }
          : item));
      }
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function removeUpload(item: UploadItem) {
    if (busy) return;
    payloadChanged();
    if (!item.evidence) {
      setUploads((current) => current.filter((candidate) => candidate.localId !== item.localId));
      return;
    }

    setUploads((current) => current.map((candidate) => candidate.localId === item.localId
      ? { ...candidate, status: "uploading" }
      : candidate));
    try {
      const result = await removeClaimInspectionEvidence(inspectionId, item.evidence.storagePath);
      if (!result.ok) {
        setUploads((current) => current.map((candidate) => candidate.localId === item.localId
          ? { ...candidate, status: "error", error: errorText(result.code ?? "PG_CLAIM_INSPECTION_EVIDENCE_REMOVE_FAILED") }
          : candidate));
        if (result.code === "PG_CLAIM_INSPECTION_NOT_ASSIGNED_CENTER") router.refresh();
        return;
      }
      setUploads((current) => current.filter((candidate) => candidate.localId !== item.localId));
    } catch {
      setUploads((current) => current.map((candidate) => candidate.localId === item.localId
        ? { ...candidate, status: "error", error: "انقطع تأكيد حذف الصورة. حاول الإزالة مرة أخرى قبل إرسال الفحص." }
        : candidate));
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    const observation = technicalObservation.trim();
    const cause = suspectedCause.trim();

    if (observation.length < 10 || observation.length > 3000) {
      setFeedback({ tone: "error", text: errorText("PG_CLAIM_INSPECTION_OBSERVATION_INVALID") });
      return;
    }
    if (cause && (cause.length < 2 || cause.length > 1000)) {
      setFeedback({ tone: "error", text: errorText("PG_CLAIM_INSPECTION_CAUSE_INVALID") });
      return;
    }
    if (readyEvidence.length < 1) {
      setFeedback({ tone: "error", text: "أرفق صورة فحص واحدة على الأقل قبل الإرسال." });
      return;
    }
    if (anyUploading) {
      setFeedback({ tone: "warning", text: "انتظر حتى يكتمل رفع الصور أولًا." });
      return;
    }
    if (hasAmbiguousEvidence) {
      setFeedback({ tone: "warning", text: "أزل أي صورة تعذر تأكيد رفعها ثم أعد رفعها قبل إرسال الفحص." });
      return;
    }
    if (!acknowledged) {
      setFeedback({ tone: "warning", text: "أكد مراجعة البيانات والصور قبل إرسال الفحص النهائي." });
      return;
    }

    if (!requestIdRef.current) requestIdRef.current = crypto.randomUUID();
    const requestId = requestIdRef.current;
    startSubmit(() => {
      void (async () => {
        try {
          const result = await submitClaimInspection({
            requestId,
            inspectionId,
            technicalObservation: observation,
            suspectedCause: cause,
            evidencePaths: readyEvidence.map((item) => item.storagePath),
          });
          if (!result.ok) {
            setFeedback({ tone: "error", text: errorText(result.code) });
            if (result.code === "PG_CLAIM_ACTION_REQUEST_CONFLICT") requestIdRef.current = null;
            if ([
              "PG_CLAIM_INSPECTION_NOT_ASSIGNED_CENTER",
              "PG_CLAIM_INSPECTION_NOT_FOUND",
              "PG_CLAIM_INSPECTION_PARENT_STATE_INVALID",
              "PG_CLAIM_INSPECTION_SUBMIT_STATE_INVALID",
            ].includes(result.code)) router.refresh();
            return;
          }
          requestIdRef.current = null;
          router.push("/operations/claim-inspections?notice=submitted");
          router.refresh();
        } catch {
          setFeedback({
            tone: "error",
            text: "انقطع تأكيد إرسال الفحص. لا تغيّر البيانات أو الصور؛ أعد الضغط على الإرسال ليستخدم النظام نفس رقم المحاولة بأمان.",
          });
        }
      })();
    });
  }

  return (
    <section className={styles.card} aria-label="إرسال نتيجة الفحص الفني">
      <div className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>نتيجة المركز الفنية</span>
          <h2>تسجيل الفحص</h2>
        </div>
        <span className={styles.counter}>{readyEvidence.length}/{MAX_IMAGES} صور جاهزة</span>
      </div>
      <p className={styles.note}>
        سجّل ما شاهدته فنيًا فقط. المركز يقدم الدليل والملاحظة ولا يقرر قبول أو رفض المطالبة.
      </p>

      {feedback ? <FeedbackBanner tone={feedback.tone}>{feedback.text}</FeedbackBanner> : null}

      <form className={styles.form} onSubmit={submit}>
        <label>
          <span>الملاحظة الفنية</span>
          <textarea
            value={technicalObservation}
            minLength={10}
            maxLength={3000}
            rows={6}
            required
            disabled={busy}
            placeholder="صف حالة الفيلم، موضع المشكلة، شكلها ومدى انتشارها كما ظهر أثناء الفحص."
            onChange={(event) => {
              payloadChanged();
              setTechnicalObservation(event.target.value);
            }}
          />
          <small>{technicalObservation.length.toLocaleString("en-US")}/3000</small>
        </label>

        <label>
          <span>السبب المشتبه به — اختياري</span>
          <textarea
            value={suspectedCause}
            maxLength={1000}
            rows={3}
            disabled={busy}
            placeholder="اكتب السبب الفني المحتمل فقط إذا كانت لديك ملاحظة تدعمه."
            onChange={(event) => {
              payloadChanged();
              setSuspectedCause(event.target.value);
            }}
          />
        </label>

        <div className={styles.uploadBlock}>
          <div>
            <strong>صور الفحص</strong>
            <p>من 1 إلى 5 صور · JPEG / PNG / WebP · حتى 8MB للصورة.</p>
          </div>
          <label className={`button button-secondary ${styles.fileButton}`}>
            إضافة صور
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              disabled={busy || uploads.length >= MAX_IMAGES}
              onChange={(event) => void uploadFiles(event.target.files)}
            />
          </label>
        </div>

        {uploads.length > 0 ? (
          <div className={styles.uploadList} aria-live="polite">
            {[...uploads].sort((a, b) => a.slot - b.slot).map((item) => (
              <div className={styles.uploadItem} key={item.localId}>
                <div>
                  <strong>صورة {item.slot}: {item.fileName}</strong>
                  <span>
                    {item.status === "uploading"
                      ? "جاري المعالجة…"
                      : item.status === "ready" && item.evidence
                        ? `جاهزة · ${formatBytes(item.evidence.sizeBytes)}`
                        : item.error ?? "تعذر تجهيز الصورة"}
                  </span>
                </div>
                {item.status !== "uploading" ? (
                  <button type="button" className="button button-ghost" disabled={busy} onClick={() => void removeUpload(item)}>
                    إزالة
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        <label className={styles.acknowledgement}>
          <input
            type="checkbox"
            checked={acknowledged}
            disabled={busy}
            onChange={(event) => {
              payloadChanged();
              setAcknowledged(event.target.checked);
            }}
          />
          <span>راجعت الملاحظة والصور وأفهم أن نتيجة الفحص تصبح سجلًا ثابتًا بعد الإرسال ولا يمكن تعديلها من المركز.</span>
        </label>

        <div className={styles.actions}>
          <button type="submit" className="button button-primary" disabled={busy || readyEvidence.length < 1 || !acknowledged}>
            {isSubmitting ? "جاري إرسال الفحص…" : "إرسال نتيجة الفحص"}
          </button>
        </div>
      </form>
    </section>
  );
}
