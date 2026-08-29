"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  completeAssignedWarrantyClaimResolution,
  removeClaimResolutionCompletionEvidence,
  uploadClaimResolutionCompletionEvidence,
  type CompletionEvidenceReference,
} from "@/app/operations/claim-resolutions/actions";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import styles from "./center-claim-resolution-completion-form.module.css";

const MAX_IMAGES = 5;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type UploadItem = {
  localId: string;
  fileName: string;
  slot: number;
  status: "uploading" | "ready" | "error";
  evidence?: CompletionEvidenceReference;
  error?: string;
};

type Props = {
  resolutionId: string;
  remedyKind: string;
  expectedRollSerial: string | null;
};

function errorText(code: string): string {
  switch (code) {
    case "PG_CLAIM_RESOLUTION_EVIDENCE_SIZE_INVALID":
      return "حجم كل صورة يجب ألا يتجاوز 8 ميجابايت.";
    case "PG_CLAIM_RESOLUTION_EVIDENCE_TYPE_INVALID":
      return "صيغة الصورة غير مدعومة. استخدم JPEG أو PNG أو WebP.";
    case "PG_CLAIM_RESOLUTION_EVIDENCE_INVALID":
      return "تعذر التحقق من صور الإكمال. أعد رفع الصور المطلوبة.";
    case "PG_CLAIM_RESOLUTION_EVIDENCE_UPLOAD_AMBIGUOUS":
      return "تعذر تأكيد حالة رفع الصورة. أزل العنصر ثم أعد رفع الصورة قبل الإغلاق.";
    case "PG_CLAIM_RESOLUTION_EVIDENCE_UPLOAD_FAILED":
      return "تعذر رفع الصورة. تحقق من الاتصال وحاول مرة أخرى.";
    case "PG_CLAIM_RESOLUTION_EVIDENCE_REMOVE_FAILED":
      return "تعذر حذف الصورة الآن. حاول مرة أخرى.";
    case "PG_CLAIM_RESOLUTION_COMPLETION_NOTE_INVALID":
      return "اكتب ملاحظة إكمال واضحة من 10 إلى 2000 حرف.";
    case "PG_CLAIM_RESOLUTION_REPLACEMENT_SCAN_MISMATCH":
      return "الرول الذي تم تأكيده لا يطابق الرول المخصص لهذه المطالبة.";
    case "PG_CLAIM_RESOLUTION_REPLACEMENT_SCAN_INVALID":
      return "أكد Serial الرول البديل الصحيح قبل الإغلاق.";
    case "PG_CLAIM_CONSUMPTION_OPENING_INVALID":
      return "الرول البديل لم يسجل فتحه بالشكل المطلوب بعد.";
    case "PG_CLAIM_CONSUMPTION_QUALITY_PENDING":
      return "يوجد بلاغ جودة قيد المراجعة يمنع إغلاق المهمة.";
    case "PG_CLAIM_CONSUMPTION_QUALITY_RETURN_REQUIRED":
      return "الرول البديل صدر له قرار إرجاع ولا يمكن استخدامه لإغلاق المطالبة.";
    case "PG_CLAIM_RESOLUTION_NOT_ASSIGNED_CENTER":
    case "PG_CLAIM_RESOLUTION_COMPLETE_STATE_INVALID":
    case "PG_CLAIM_RESOLUTION_NOT_FOUND":
      return "لم تعد هذه المهمة متاحة لمركزك. ارجع إلى قائمة مهام التنفيذ لتحديث الحالة.";
    case "PG_CLAIM_RESOLUTION_CENTER_INACTIVE":
    case "PG_CLAIM_RESOLUTION_CENTER_REQUIRED":
      return "حساب المركز لم يعد صالحًا لإكمال هذه المهمة حاليًا.";
    case "PG_CLAIM_RESOLUTION_ACTION_REQUEST_CONFLICT":
    case "PG_CLAIM_ACTION_REQUEST_CONFLICT":
      return "تغيرت بيانات الإكمال بعد بدء المحاولة. راجع البيانات وابدأ محاولة جديدة.";
    default:
      return "تعذر إغلاق المهمة الآن. راجع حالتها وحاول مرة أخرى بدون تكرار الضغط.";
  }
}

function formatBytes(size: number) {
  return size >= 1024 * 1024
    ? `${(size / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(size / 1024))} KB`;
}

export function CenterClaimResolutionCompletionForm({ resolutionId, remedyKind, expectedRollSerial }: Props) {
  const router = useRouter();
  const isReplacement = remedyKind === "replacement_roll_reinstall";
  const [completionNote, setCompletionNote] = useState("");
  const [rollSerial, setRollSerial] = useState("");
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
      setFeedback({ tone: "error", text: "يمكن إرفاق حتى 5 صور فقط لإثبات الإكمال." });
      return;
    }

    const usedSlots = new Set(uploads.map((item) => item.slot));
    payloadChanged();

    for (const file of selected) {
      if (file.size < 1 || file.size > MAX_IMAGE_BYTES) {
        setFeedback({ tone: "error", text: errorText("PG_CLAIM_RESOLUTION_EVIDENCE_SIZE_INVALID") });
        continue;
      }
      if (!ALLOWED_TYPES.has(file.type)) {
        setFeedback({ tone: "error", text: errorText("PG_CLAIM_RESOLUTION_EVIDENCE_TYPE_INVALID") });
        continue;
      }

      const slot = [1, 2, 3, 4, 5].find((candidate) => !usedSlots.has(candidate));
      if (!slot) break;
      usedSlots.add(slot);
      const localId = crypto.randomUUID();
      setUploads((current) => [...current, { localId, fileName: file.name, slot, status: "uploading" }]);

      try {
        const result = await uploadClaimResolutionCompletionEvidence(resolutionId, slot, file);
        if (!result.ok) {
          setUploads((current) => current.map((item) => item.localId === localId
            ? { ...item, status: "error", evidence: result.evidence, error: errorText(result.code) }
            : item));
          if (result.code === "PG_CLAIM_RESOLUTION_NOT_ASSIGNED_CENTER") router.refresh();
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
      const result = await removeClaimResolutionCompletionEvidence(resolutionId, item.evidence.storagePath);
      if (!result.ok) {
        setUploads((current) => current.map((candidate) => candidate.localId === item.localId
          ? { ...candidate, status: "error", error: errorText(result.code ?? "PG_CLAIM_RESOLUTION_EVIDENCE_REMOVE_FAILED") }
          : candidate));
        if (result.code === "PG_CLAIM_RESOLUTION_NOT_ASSIGNED_CENTER") router.refresh();
        return;
      }
      setUploads((current) => current.filter((candidate) => candidate.localId !== item.localId));
    } catch {
      setUploads((current) => current.map((candidate) => candidate.localId === item.localId
        ? { ...candidate, status: "error", error: "انقطع تأكيد حذف الصورة. حاول الإزالة مرة أخرى قبل الإغلاق." }
        : candidate));
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    const note = completionNote.trim();
    const scan = rollSerial.trim();

    if (note.length < 10 || note.length > 2000) {
      setFeedback({ tone: "error", text: errorText("PG_CLAIM_RESOLUTION_COMPLETION_NOTE_INVALID") });
      return;
    }
    if (readyEvidence.length < 1) {
      setFeedback({ tone: "error", text: "أرفق صورة إكمال واحدة على الأقل قبل الإغلاق." });
      return;
    }
    if (anyUploading) {
      setFeedback({ tone: "warning", text: "انتظر حتى يكتمل رفع الصور أولًا." });
      return;
    }
    if (hasAmbiguousEvidence) {
      setFeedback({ tone: "warning", text: "أزل أي صورة تعذر تأكيد رفعها ثم أعد رفعها قبل الإغلاق." });
      return;
    }
    if (isReplacement) {
      if (!expectedRollSerial || !scan) {
        setFeedback({ tone: "error", text: errorText("PG_CLAIM_RESOLUTION_REPLACEMENT_SCAN_INVALID") });
        return;
      }
      if (scan !== expectedRollSerial) {
        setFeedback({ tone: "error", text: errorText("PG_CLAIM_RESOLUTION_REPLACEMENT_SCAN_MISMATCH") });
        return;
      }
    }
    if (!acknowledged) {
      setFeedback({ tone: "warning", text: "أكد أن العمل تم فعليًا وأن الصور تخص هذه المهمة قبل الإغلاق النهائي." });
      return;
    }

    if (!requestIdRef.current) requestIdRef.current = crypto.randomUUID();
    const requestId = requestIdRef.current;
    startSubmit(() => {
      void (async () => {
        try {
          const result = await completeAssignedWarrantyClaimResolution({
            requestId,
            resolutionId,
            completionNote: note,
            evidencePaths: readyEvidence.map((item) => item.storagePath),
            replacementRollSerial: isReplacement ? scan : null,
          });
          if (!result.ok) {
            setFeedback({ tone: "error", text: errorText(result.code) });
            if (["PG_CLAIM_RESOLUTION_ACTION_REQUEST_CONFLICT", "PG_CLAIM_ACTION_REQUEST_CONFLICT"].includes(result.code)) {
              requestIdRef.current = null;
            }
            if ([
              "PG_CLAIM_RESOLUTION_NOT_ASSIGNED_CENTER",
              "PG_CLAIM_RESOLUTION_COMPLETE_STATE_INVALID",
              "PG_CLAIM_RESOLUTION_NOT_FOUND",
            ].includes(result.code)) router.refresh();
            return;
          }
          requestIdRef.current = null;
          router.push("/operations/claim-resolution-tasks?notice=completed");
          router.refresh();
        } catch {
          setFeedback({
            tone: "error",
            text: "انقطع تأكيد إغلاق المهمة. لا تغيّر الملاحظة أو الصور أو Serial الرول؛ أعد الضغط على الإغلاق ليستخدم النظام نفس رقم المحاولة بأمان.",
          });
        }
      })();
    });
  }

  return (
    <section className={styles.card} aria-label="توثيق إكمال مطالبة الضمان">
      <div className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>إثبات التنفيذ</span>
          <h2>إغلاق المهمة بعد التنفيذ الفعلي</h2>
        </div>
        <span className={styles.counter}>{readyEvidence.length}/{MAX_IMAGES} صور جاهزة</span>
      </div>
      <p className={styles.note}>
        الإغلاق نهائي: يسجل إتمام العلاج ويغلق المطالبة. عند الاستبدال سيستهلك النظام نفس الرول المخصص داخل نفس العملية.
      </p>

      {feedback ? <FeedbackBanner tone={feedback.tone}>{feedback.text}</FeedbackBanner> : null}

      <form className={styles.form} onSubmit={submit}>
        <label>
          <span>ملاحظة الإكمال</span>
          <textarea
            value={completionNote}
            minLength={10}
            maxLength={2000}
            rows={5}
            required
            disabled={busy}
            placeholder="اكتب ما تم تنفيذه فعليًا وحالة العمل بعد الإكمال."
            onChange={(event) => {
              payloadChanged();
              setCompletionNote(event.target.value);
            }}
          />
          <small>{completionNote.length.toLocaleString("en-US")}/2000</small>
        </label>

        {isReplacement ? (
          <label>
            <span>تأكيد Serial الرول البديل</span>
            <input
              value={rollSerial}
              dir="ltr"
              autoComplete="off"
              spellCheck={false}
              required
              disabled={busy}
              placeholder={expectedRollSerial ?? "Serial الرول المخصص"}
              onChange={(event) => {
                payloadChanged();
                setRollSerial(event.target.value);
              }}
            />
            <small>أكد الرول الفعلي المستخدم. المطابقة هنا مساعدة فقط، والتحقق النهائي يتم داخل العملية الموثوقة.</small>
          </label>
        ) : null}

        <div className={styles.uploadBlock}>
          <div>
            <strong>صور الإكمال</strong>
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
          <div className={styles.uploadList} aria-label="صور الإكمال المرفوعة">
            {uploads.map((item) => (
              <div className={styles.uploadItem} key={item.localId}>
                <div>
                  <strong>{item.fileName}</strong>
                  <span>
                    {item.status === "uploading"
                      ? "جارٍ التنفيذ..."
                      : item.status === "ready" && item.evidence
                        ? `جاهزة · ${formatBytes(item.evidence.sizeBytes)}`
                        : item.error ?? "تعذر تأكيد الصورة"}
                  </span>
                </div>
                <button
                  type="button"
                  className="button button-ghost"
                  disabled={busy || item.status === "uploading"}
                  onClick={() => void removeUpload(item)}
                >
                  إزالة
                </button>
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
          <span>أؤكد أن العلاج المحدد لهذه المطالبة تم فعليًا، وأن صور الإكمال تخص نفس السيارة ونفس المهمة.</span>
        </label>

        <div className={styles.actions}>
          <button type="submit" className="button button-primary" disabled={busy}>
            {isSubmitting ? "جارٍ الإغلاق..." : "تأكيد الإكمال وإغلاق المطالبة"}
          </button>
        </div>
      </form>
    </section>
  );
}
