"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  completeAssignedWarrantyClaimResolution,
  removeClaimResolutionCompletionEvidence,
  uploadClaimResolutionCompletionEvidence,
  type CompletionEvidenceReference,
} from "@/app/operations/claim-resolutions/actions";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import {
  LocalEvidenceReview,
  type LocalEvidenceReviewItem,
} from "@/components/ui/local-evidence-review";
import styles from "./center-claim-resolution-completion-form.module.css";

const MAX_IMAGES = 5;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const EVIDENCE_ACCEPT = "image/jpeg,image/png,image/webp";
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type UploadItem = LocalEvidenceReviewItem & {
  slot: number;
  evidence?: CompletionEvidenceReference;
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

function validateFile(file: File): string | null {
  if (file.size < 1 || file.size > MAX_IMAGE_BYTES) {
    return errorText("PG_CLAIM_RESOLUTION_EVIDENCE_SIZE_INVALID");
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return errorText("PG_CLAIM_RESOLUTION_EVIDENCE_TYPE_INVALID");
  }
  return null;
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
      setFeedback({ tone: "error", text: "يمكن إرفاق حتى 5 صور فقط لإثبات الإكمال." });
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
      const result = await removeClaimResolutionCompletionEvidence(resolutionId, item.evidence.storagePath);
      if (!result.ok) {
        setUploads((current) => current.map((candidate) => candidate.id === item.id
          ? { ...candidate, status: "error", error: errorText(result.code ?? "PG_CLAIM_RESOLUTION_EVIDENCE_REMOVE_FAILED") }
          : candidate));
        if (result.code === "PG_CLAIM_RESOLUTION_NOT_ASSIGNED_CENTER") router.refresh();
        return;
      }
      setUploads((current) => current.filter((candidate) => candidate.id !== item.id));
    } catch {
      setUploads((current) => current.map((candidate) => candidate.id === item.id
        ? { ...candidate, status: "error", error: "انقطع تأكيد حذف الصورة. حاول الإزالة مرة أخرى قبل الإغلاق." }
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
        const result = await removeClaimResolutionCompletionEvidence(resolutionId, item.evidence.storagePath);
        if (!result.ok) {
          setUploads((current) => current.map((candidate) => candidate.id === item.id
            ? { ...candidate, status: "error", error: errorText(result.code ?? "PG_CLAIM_RESOLUTION_EVIDENCE_REMOVE_FAILED") }
            : candidate));
          if (result.code === "PG_CLAIM_RESOLUTION_NOT_ASSIGNED_CENTER") router.refresh();
          return;
        }
      } catch {
        setUploads((current) => current.map((candidate) => candidate.id === item.id
          ? { ...candidate, status: "error", error: "انقطع تأكيد حذف الصورة القديمة. حاول الاستبدال مرة أخرى قبل الإغلاق." }
          : candidate));
        return;
      }
    }

    setUploads((current) => current.map((candidate) => candidate.id === item.id
      ? { ...candidate, file, status: "local", evidence: undefined, error: undefined }
      : candidate));
  }

  async function prepareEvidence(): Promise<CompletionEvidenceReference[] | null> {
    const prepared: CompletionEvidenceReference[] = [];
    const ordered = [...uploads].sort((left, right) => left.slot - right.slot);

    for (const item of ordered) {
      if (item.status === "retained" && item.evidence) {
        prepared.push(item.evidence);
        continue;
      }
      if (item.status === "error" && item.evidence) {
        setFeedback({ tone: "warning", text: "أزل أو استبدل أي صورة تعذر تأكيد حالتها قبل إعادة إغلاق المهمة." });
        return null;
      }

      setUploads((current) => current.map((candidate) => candidate.id === item.id
        ? { ...candidate, status: "uploading", error: undefined }
        : candidate));
      try {
        const result = await uploadClaimResolutionCompletionEvidence(resolutionId, item.slot, item.file);
        if (!result.ok) {
          setUploads((current) => current.map((candidate) => candidate.id === item.id
            ? { ...candidate, status: "error", evidence: result.evidence, error: errorText(result.code) }
            : candidate));
          setFeedback({ tone: "error", text: errorText(result.code) });
          if (result.code === "PG_CLAIM_RESOLUTION_NOT_ASSIGNED_CENTER") router.refresh();
          return null;
        }
        prepared.push(result.evidence);
        setUploads((current) => current.map((candidate) => candidate.id === item.id
          ? { ...candidate, status: "retained", evidence: result.evidence, error: undefined }
          : candidate));
      } catch {
        const message = "انقطع تأكيد رفع الصورة. راجع حالة الملف ثم أعد تأكيد الإغلاق.";
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
    const note = completionNote.trim();
    const scan = rollSerial.trim();

    if (note.length < 10 || note.length > 2000) {
      setFeedback({ tone: "error", text: errorText("PG_CLAIM_RESOLUTION_COMPLETION_NOTE_INVALID") });
      return;
    }
    if (uploads.length < 1) {
      setFeedback({ tone: "error", text: "أرفق صورة إكمال واحدة على الأقل قبل الإغلاق." });
      return;
    }
    if (anyUploading) {
      setFeedback({ tone: "warning", text: "انتظر حتى تنتهي محاولة رفع الصور الحالية." });
      return;
    }
    if (hasAmbiguousEvidence) {
      setFeedback({ tone: "warning", text: "أزل أو استبدل أي صورة تعذر تأكيد حالتها قبل الإغلاق." });
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
        const evidence = await prepareEvidence();
        if (!evidence) return;
        try {
          const result = await completeAssignedWarrantyClaimResolution({
            requestId,
            resolutionId,
            completionNote: note,
            evidencePaths: evidence.map((item) => item.storagePath),
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
            text: "انقطع تأكيد إغلاق المهمة. لا تغيّر الملاحظة أو الصور أو Serial الرول؛ أعد التأكيد ليستخدم النظام نفس رقم المحاولة بأمان.",
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
        <span className={styles.counter}>{uploads.length}/{MAX_IMAGES} صور محددة</span>
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

        <LocalEvidenceReview
          idPrefix="claim-resolution-completion-evidence"
          title="صور الإكمال"
          help="من 1 إلى 5 صور · JPEG / PNG / WebP · حتى 8MB للصورة. راجع الصور قبل أن يبدأ الرفع."
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
          <span>أؤكد أن العلاج المحدد لهذه المطالبة تم فعليًا، وأن صور الإكمال تخص نفس السيارة ونفس المهمة.</span>
        </label>

        <div className={styles.actions}>
          <ConfirmSubmitButton
            title={`إغلاق المطالبة مع ${uploads.length.toLocaleString("en-US")} صورة إكمال؟`}
            description="بعد هذا التأكيد فقط سيبدأ رفع الصور المختارة، ثم تنفذ عملية الإكمال النهائية الموثوقة. عند الاستبدال سيظل التحقق والاستهلاك داخل نفس العملية authoritative."
            confirmLabel="تأكيد الإكمال والإغلاق"
            tone="primary"
            disabled={busy || uploads.length < 1 || !acknowledged || hasAmbiguousEvidence}
          >
            {isSubmitting ? "جارٍ الإغلاق..." : "تأكيد الإكمال وإغلاق المطالبة"}
          </ConfirmSubmitButton>
        </div>
      </form>
    </section>
  );
}
