"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  removeClaimInspectionEvidence,
  submitClaimInspection,
  uploadClaimInspectionEvidence,
  type InspectionEvidenceReference,
} from "@/app/operations/claim-inspections/actions";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import {
  LocalEvidenceReview,
  type LocalEvidenceReviewItem,
} from "@/components/ui/local-evidence-review";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import styles from "./center-claim-inspection-form.module.css";

const MAX_IMAGES = 5;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const EVIDENCE_ACCEPT = "image/jpeg,image/png,image/webp";
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type UploadItem = LocalEvidenceReviewItem & {
  slot: number;
  evidence?: InspectionEvidenceReference;
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

function validateFile(file: File): string | null {
  if (file.size < 1 || file.size > MAX_IMAGE_BYTES) {
    return errorText("PG_CLAIM_INSPECTION_EVIDENCE_SIZE_INVALID");
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return errorText("PG_CLAIM_INSPECTION_EVIDENCE_TYPE_INVALID");
  }
  return null;
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

  const anyUploading = uploads.some((item) => item.status === "uploading");
  const hasAmbiguousEvidence = uploads.some((item) => item.status === "error" && item.evidence);
  const busy = anyUploading || isSubmitting;

  function payloadChanged() {
    requestIdRef.current = null;
    setFeedback(null);
  }

  function addFiles(files: File[]) {
    if (!files.length || busy) return;
    const freeSlots = [1, 2, 3, 4, 5].filter((slot) => !uploads.some((item) => item.slot === slot));
    const selected = files.slice(0, freeSlots.length);
    if (!selected.length) {
      setFeedback({ tone: "error", text: "يمكن إرفاق حتى 5 صور فقط للفحص." });
      return;
    }

    const accepted: UploadItem[] = [];
    let firstError: string | null = null;
    selected.forEach((file) => {
      const error = validateFile(file);
      if (error) {
        firstError ??= error;
        return;
      }
      const slot = freeSlots[accepted.length];
      accepted.push({
        id: crypto.randomUUID(),
        file,
        slot,
        label: `صورة ${slot}`,
        status: "local",
      });
    });

    if (accepted.length) {
      payloadChanged();
      setUploads((current) => [...current, ...accepted].sort((left, right) => left.slot - right.slot));
    }
    if (firstError) setFeedback({ tone: "error", text: firstError });
  }

  async function removeUpload(item: UploadItem) {
    if (busy) return;
    payloadChanged();
    if (!item.evidence) {
      setUploads((current) => current.filter((candidate) => candidate.id !== item.id));
      return;
    }

    setUploads((current) => current.map((candidate) => candidate.id === item.id
      ? { ...candidate, status: "uploading", error: undefined }
      : candidate));
    try {
      const result = await removeClaimInspectionEvidence(inspectionId, item.evidence.storagePath);
      if (!result.ok) {
        setUploads((current) => current.map((candidate) => candidate.id === item.id
          ? { ...candidate, status: "error", error: errorText(result.code ?? "PG_CLAIM_INSPECTION_EVIDENCE_REMOVE_FAILED") }
          : candidate));
        if (result.code === "PG_CLAIM_INSPECTION_NOT_ASSIGNED_CENTER") router.refresh();
        return;
      }
      setUploads((current) => current.filter((candidate) => candidate.id !== item.id));
    } catch {
      setUploads((current) => current.map((candidate) => candidate.id === item.id
        ? { ...candidate, status: "error", error: "انقطع تأكيد حذف الصورة. حاول الإزالة مرة أخرى قبل إرسال الفحص." }
        : candidate));
    }
  }

  async function replaceUpload(item: UploadItem, file: File) {
    if (busy) return;
    const validationError = validateFile(file);
    if (validationError) {
      setFeedback({ tone: "error", text: validationError });
      return;
    }

    payloadChanged();
    if (item.evidence) {
      setUploads((current) => current.map((candidate) => candidate.id === item.id
        ? { ...candidate, status: "uploading", error: undefined }
        : candidate));
      try {
        const result = await removeClaimInspectionEvidence(inspectionId, item.evidence.storagePath);
        if (!result.ok) {
          setUploads((current) => current.map((candidate) => candidate.id === item.id
            ? { ...candidate, status: "error", error: errorText(result.code ?? "PG_CLAIM_INSPECTION_EVIDENCE_REMOVE_FAILED") }
            : candidate));
          if (result.code === "PG_CLAIM_INSPECTION_NOT_ASSIGNED_CENTER") router.refresh();
          return;
        }
      } catch {
        setUploads((current) => current.map((candidate) => candidate.id === item.id
          ? { ...candidate, status: "error", error: "انقطع تأكيد حذف الصورة القديمة. حاول الاستبدال مرة أخرى قبل الإرسال." }
          : candidate));
        return;
      }
    }

    setUploads((current) => current.map((candidate) => candidate.id === item.id
      ? { ...candidate, file, status: "local", evidence: undefined, error: undefined }
      : candidate));
  }

  async function prepareEvidence(): Promise<InspectionEvidenceReference[] | null> {
    const prepared: InspectionEvidenceReference[] = [];
    const ordered = [...uploads].sort((left, right) => left.slot - right.slot);

    for (const item of ordered) {
      if (item.status === "retained" && item.evidence) {
        prepared.push(item.evidence);
        continue;
      }
      if (item.status === "error" && item.evidence) {
        setFeedback({ tone: "warning", text: "أزل أو استبدل أي صورة تعذر تأكيد حالتها قبل إعادة إرسال الفحص." });
        return null;
      }

      setUploads((current) => current.map((candidate) => candidate.id === item.id
        ? { ...candidate, status: "uploading", error: undefined }
        : candidate));
      try {
        const result = await uploadClaimInspectionEvidence(inspectionId, item.slot, item.file);
        if (!result.ok) {
          setUploads((current) => current.map((candidate) => candidate.id === item.id
            ? { ...candidate, status: "error", evidence: result.evidence, error: errorText(result.code) }
            : candidate));
          setFeedback({ tone: "error", text: errorText(result.code) });
          if ([
            "PG_CLAIM_INSPECTION_NOT_ASSIGNED_CENTER",
            "PG_CLAIM_INSPECTION_NOT_FOUND",
            "PG_CLAIM_INSPECTION_CENTER_REQUIRED",
          ].includes(result.code)) router.refresh();
          return null;
        }
        prepared.push(result.evidence);
        setUploads((current) => current.map((candidate) => candidate.id === item.id
          ? { ...candidate, status: "retained", evidence: result.evidence, error: undefined }
          : candidate));
      } catch {
        const message = "انقطع تأكيد رفع الصورة. راجع حالة الملف ثم أعد تأكيد الإرسال.";
        setUploads((current) => current.map((candidate) => candidate.id === item.id
          ? { ...candidate, status: "error", error: message }
          : candidate));
        setFeedback({ tone: "error", text: message });
        return null;
      }
    }

    return prepared;
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
    if (uploads.length < 1) {
      setFeedback({ tone: "error", text: "أرفق صورة فحص واحدة على الأقل قبل الإرسال." });
      return;
    }
    if (anyUploading) {
      setFeedback({ tone: "warning", text: "انتظر حتى تنتهي محاولة رفع الصور الحالية." });
      return;
    }
    if (hasAmbiguousEvidence) {
      setFeedback({ tone: "warning", text: "أزل أو استبدل أي صورة تعذر تأكيد حالتها قبل إرسال الفحص." });
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
        const evidence = await prepareEvidence();
        if (!evidence) return;
        try {
          const result = await submitClaimInspection({
            requestId,
            inspectionId,
            technicalObservation: observation,
            suspectedCause: cause,
            evidencePaths: evidence.map((item) => item.storagePath),
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
            text: "انقطع تأكيد إرسال الفحص. لا تغيّر البيانات أو الصور؛ أعد التأكيد ليستخدم النظام نفس رقم المحاولة بأمان.",
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
        <span className={styles.counter}>{uploads.length}/{MAX_IMAGES} صور محددة</span>
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

        <LocalEvidenceReview
          idPrefix="claim-inspection-evidence"
          title="صور الفحص"
          help="من 1 إلى 5 صور · JPEG / PNG / WebP · حتى 8MB للصورة. راجع الصور هنا قبل أن يبدأ الرفع."
          items={uploads}
          maxFiles={MAX_IMAGES}
          accept={EVIDENCE_ACCEPT}
          disabled={busy}
          addLabel="إضافة صور"
          onAdd={addFiles}
          onRemove={(reviewItem) => {
            const item = uploads.find((candidate) => candidate.id === reviewItem.id);
            if (item) void removeUpload(item);
          }}
          onReplace={(reviewItem, file) => {
            const item = uploads.find((candidate) => candidate.id === reviewItem.id);
            if (item) void replaceUpload(item, file);
          }}
        />

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
          <ConfirmSubmitButton
            title={`إرسال الفحص مع ${uploads.length.toLocaleString("en-US")} صورة؟`}
            description="بعد هذا التأكيد فقط سيبدأ رفع الصور المختارة، ثم تُسجل نتيجة الفحص كسجل ثابت إذا نجحت العملية النهائية."
            confirmLabel="تأكيد وإرسال الفحص"
            tone="primary"
            disabled={busy || uploads.length < 1 || !acknowledged || hasAmbiguousEvidence}
          >
            {isSubmitting ? "جاري إرسال الفحص…" : "إرسال نتيجة الفحص"}
          </ConfirmSubmitButton>
        </div>
      </form>
    </section>
  );
}
