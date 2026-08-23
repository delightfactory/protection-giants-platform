"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState, useTransition } from "react";
import {
  resolveRollPreinstallIssueCandidate,
  submitRollPreinstallIssue,
  type RollPreinstallIssueCandidate,
} from "@/app/operations/rolls/issues/actions";
import { QrScannerSheet, type ScannerDecodeOutcome } from "@/components/transfers/qr-scanner-sheet";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { LocalDateTime } from "@/components/ui/local-date-time";
import { normalizeRollSerial, parseRollQrPayload } from "@/lib/rolls/roll-qr";
import styles from "./roll-preinstall-issue-flow.module.css";

const categoryOptions = [
  { value: "manufacturing_defect", label: "عيب تصنيع" },
  { value: "physical_damage", label: "تلف مادي" },
  { value: "contamination_or_packaging", label: "تلوث أو مشكلة تغليف" },
  { value: "other", label: "أخرى" },
] as const;

const errorMessages: Record<string, string> = {
  PG_ROLL_ISSUE_SERIAL_INVALID: "رقم الرول أو QR غير صالح.",
  PG_ROLL_ISSUE_CENTER_REQUIRED: "الإبلاغ عن مشكلة متاح من حساب مركز تركيب فقط.",
  PG_ROLL_ISSUE_CENTER_INACTIVE: "حساب المركز أو المركز نفسه غير نشط حاليًا.",
  PG_ROLL_ISSUE_ROLL_NOT_FOUND: "لم يتم العثور على هذا الرول.",
  PG_ROLL_ISSUE_ROLL_NOT_OPENED: "يجب تسجيل فتح الرول أولًا قبل إنشاء بلاغ ما قبل التركيب.",
  PG_ROLL_ISSUE_NOT_CURRENT_CUSTODIAN: "هذا الرول ليس في الحيازة المؤكدة الحالية لهذا المركز.",
  PG_ROLL_ISSUE_ACTIVE_ISSUE_EXISTS: "يوجد بالفعل بلاغ لهذا الرول قيد مراجعة الشركة.",
  PG_ROLL_ISSUE_RETURN_REQUIRED_ALREADY: "سبق أن قررت الشركة ضرورة إرجاع هذا الرول، لذلك لا يمكن إنشاء بلاغ جديد عليه.",
  PG_ROLL_ISSUE_INVALID_CATEGORY: "اختر نوع المشكلة من القائمة.",
  PG_ROLL_ISSUE_INVALID_DESCRIPTION: "اكتب وصفًا واضحًا للمشكلة من 10 إلى 2000 حرف.",
  PG_ROLL_ISSUE_INVALID_EVIDENCE: "راجع الصور المرفقة. الحد الأقصى 5 صور، وحجم الصورة 8 ميجابايت، والصيغ JPEG/PNG/WebP فقط.",
  PG_ROLL_ISSUE_EVIDENCE_UPLOAD_FAILED: "تعذر رفع الصور الآن. أعد المحاولة بنفس البيانات.",
  PG_ROLL_ISSUE_REQUEST_CONFLICT: "هذه المحاولة لم تعد تطابق بيانات البلاغ الحالية. أعد قراءة الرول وابدأ بلاغًا جديدًا.",
  PG_ROLL_ISSUE_PRODUCTION_INVALID: "أصل الإنتاج الخاص بهذا الرول غير صالح للعملية.",
  PG_ROLL_ISSUE_CANDIDATE_INVALID: "تعذر تحميل بيانات الرول بشكل آمن. أعد المحاولة.",
  PG_ROLL_ISSUE_FAILED: "تعذر تسجيل البلاغ الآن. أعد المحاولة بنفس البيانات.",
};

function issueError(code: string): string {
  return errorMessages[code] ?? "تعذر إكمال البلاغ. أعد المحاولة أو راجع مسؤول النظام إذا استمرت المشكلة.";
}

function formatSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024)).toLocaleString("en-US")} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function RollPreinstallIssueFlow({ publicSiteOrigin }: { publicSiteOrigin: string }) {
  const [serialInput, setSerialInput] = useState("");
  const [candidate, setCandidate] = useState<RollPreinstallIssueCandidate | null>(null);
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<Array<{ file: File; url: string }>>([]);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "error" | "warning" | "success"; text: string } | null>(null);
  const [completedIssueId, setCompletedIssueId] = useState<string | null>(null);
  const [isResolving, startResolve] = useTransition();
  const [isSubmitting, startSubmit] = useTransition();
  const requestIdRef = useRef<string | null>(null);
  const issueIdRef = useRef<string | null>(null);

  useEffect(() => {
    const nextPreviews = images.map((file) => ({ file, url: URL.createObjectURL(file) }));
    setImagePreviews(nextPreviews);
    return () => {
      for (const preview of nextPreviews) URL.revokeObjectURL(preview.url);
    };
  }, [images]);

  function resetAttempt() {
    requestIdRef.current = null;
    issueIdRef.current = null;
  }

  function resetReport() {
    setCandidate(null);
    setCategory("");
    setDescription("");
    setImages([]);
    setFeedback(null);
    setCompletedIssueId(null);
    resetAttempt();
  }

  async function resolveSerial(serial: string): Promise<boolean> {
    const normalized = normalizeRollSerial(serial);
    if (!normalized) {
      resetReport();
      setSerialInput(serial);
      setFeedback({ tone: "error", text: errorMessages.PG_ROLL_ISSUE_SERIAL_INVALID });
      return false;
    }

    const result = await resolveRollPreinstallIssueCandidate(normalized);
    if (!result.ok) {
      resetReport();
      setSerialInput(normalized);
      setFeedback({ tone: "error", text: issueError(result.code) });
      return false;
    }

    resetAttempt();
    setCompletedIssueId(null);
    setCategory("");
    setDescription("");
    setImages([]);
    setSerialInput(result.candidate.serialNumber);
    setCandidate(result.candidate);

    if (result.candidate.eligibility === "active_issue") {
      setFeedback({ tone: "warning", text: "يوجد بلاغ قائم لهذا الرول قيد مراجعة الشركة. لا يمكن إنشاء بلاغ ثانٍ الآن." });
    } else if (result.candidate.eligibility === "return_required") {
      setFeedback({ tone: "warning", text: "هذا الرول عليه قرار نهائي بإرجاعه، لذلك يظل غير قابل لتفعيل الضمان ولا يقبل بلاغًا جديدًا." });
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
    const serial = parseRollQrPayload(payload, publicSiteOrigin);
    if (!serial) {
      return { action: "continue", tone: "error", message: "هذا QR ليس QR رول صالحًا لهذه المنصة." };
    }
    try {
      const resolved = await resolveSerial(serial);
      return resolved
        ? { action: "close", tone: "success", message: "تم التعرف على الرول." }
        : { action: "continue", tone: "warning", message: "تمت قراءة الرول لكن لا يمكن إنشاء البلاغ الآن." };
    } catch {
      return { action: "continue", tone: "error", message: "تعذر التحقق من الرول الآن. أعد المحاولة أو استخدم الإدخال اليدوي." };
    }
  }

  function handleImages(files: FileList | null) {
    const selected = Array.from(files ?? []);
    if (selected.length > 5) {
      setFeedback({ tone: "error", text: errorMessages.PG_ROLL_ISSUE_INVALID_EVIDENCE });
      return;
    }
    const invalid = selected.some((file) =>
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size <= 0 || file.size > 8 * 1024 * 1024,
    );
    if (invalid) {
      setFeedback({ tone: "error", text: errorMessages.PG_ROLL_ISSUE_INVALID_EVIDENCE });
      return;
    }
    setImages(selected);
    setFeedback(null);
    resetAttempt();
  }

  function submitIssue() {
    if (!candidate || candidate.eligibility !== "eligible" || isSubmitting) return;
    const trimmedDescription = description.trim();
    if (!category) {
      setFeedback({ tone: "error", text: errorMessages.PG_ROLL_ISSUE_INVALID_CATEGORY });
      return;
    }
    if (trimmedDescription.length < 10 || trimmedDescription.length > 2000) {
      setFeedback({ tone: "error", text: errorMessages.PG_ROLL_ISSUE_INVALID_DESCRIPTION });
      return;
    }

    if (!requestIdRef.current) requestIdRef.current = crypto.randomUUID();
    if (!issueIdRef.current) issueIdRef.current = crypto.randomUUID();
    const formData = new FormData();
    formData.set("request_id", requestIdRef.current);
    formData.set("issue_id", issueIdRef.current);
    formData.set("serial_number", candidate.serialNumber);
    formData.set("category", category);
    formData.set("description", trimmedDescription);
    for (const image of images) formData.append("issue_images", image);

    startSubmit(() => {
      void (async () => {
        try {
          const result = await submitRollPreinstallIssue(formData);
          if (!result.ok) {
            setFeedback({ tone: "error", text: issueError(result.code) });
            if (["PG_ROLL_ISSUE_ACTIVE_ISSUE_EXISTS", "PG_ROLL_ISSUE_RETURN_REQUIRED_ALREADY", "PG_ROLL_ISSUE_NOT_CURRENT_CUSTODIAN"].includes(result.code)) {
              resetAttempt();
              await resolveSerial(candidate.serialNumber);
            }
            return;
          }
          setCompletedIssueId(result.issueId);
          setFeedback(null);
          resetAttempt();
        } catch {
          setFeedback({
            tone: "error",
            text: "انقطع تأكيد البلاغ. أعد الضغط على الإرسال بنفس البيانات؛ النظام سيستخدم نفس هوية المحاولة بأمان ولن ينشئ بلاغًا مكررًا.",
          });
        }
      })();
    });
  }

  if (completedIssueId && candidate) {
    return (
      <div className={styles.flow}>
        <section className={styles.successCard} aria-live="polite">
          <div className={styles.successMark}>✓</div>
          <div>
            <h2>تم إرسال البلاغ للشركة</h2>
            <p>حالة البلاغ الآن: <strong>قيد مراجعة الشركة</strong>.</p>
          </div>
          <div className={styles.holdNotice}>
            <strong>تفعيل الضمان متوقف مؤقتًا</strong>
            <p>من لحظة تسجيل البلاغ لا يمكن تفعيل ضمان على هذا الرول حتى تحسم الشركة الحالة.</p>
          </div>
          <div className={styles.identity}>
            <strong>{candidate.productName}</strong>
            <span>{candidate.centerName}</span>
            <span dir="ltr">SKU: {candidate.productCode}</span>
            <code>{candidate.serialNumber}</code>
          </div>
          <div className={styles.actions}>
            <Link href={`/operations/rolls/issues/${completedIssueId}`} className="button button-primary">فتح البلاغ</Link>
            <Link href="/operations/rolls/issues" className="button button-ghost">كل البلاغات</Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.flow}>
      <section className={styles.card}>
        <div className={styles.heading}>
          <h2>حدد الرول المفتوح</h2>
          <p>امسح QR الموجود على الرول أو أدخل السيريال. النظام يتحقق من الفتح والحيازة الحالية قبل السماح بالبلاغ.</p>
        </div>
        <button type="button" className={`button button-primary ${styles.scanAction}`} onClick={() => setScannerOpen(true)}>
          مسح QR الرول
        </button>
        <form className={styles.manualForm} onSubmit={handleManualSubmit}>
          <label htmlFor="issue-roll-serial">أو أدخل سيريال الرول</label>
          <div className={styles.manualRow}>
            <input
              id="issue-roll-serial"
              className="input"
              dir="ltr"
              autoComplete="off"
              placeholder="PG-R-YYYYMMDD-00000000-00-0000"
              value={serialInput}
              onChange={(event) => { setSerialInput(event.target.value); resetReport(); }}
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
            <span>{candidate.centerName}</span>
            <span dir="ltr">SKU: {candidate.productCode}</span>
            <code>{candidate.serialNumber}</code>
            <span dir="ltr">Lot: {candidate.lotNumber}</span>
            <span>تم فتحه: <LocalDateTime value={candidate.openedAt} /></span>
          </div>

          {candidate.eligibility === "eligible" ? (
            <div className={styles.reportForm}>
              <div className={styles.holdNotice}>
                <strong>تنبيه قبل الإرسال</strong>
                <p>إرسال البلاغ يوقف تفعيل الضمان على هذا الرول فورًا، بدون انتظار تأكيد من الشركة، إلى أن يتم حسم البلاغ.</p>
              </div>

              <label htmlFor="issue-category">نوع المشكلة</label>
              <select id="issue-category" className="input" value={category} onChange={(event) => { setCategory(event.target.value); resetAttempt(); }}>
                <option value="">اختر نوع المشكلة</option>
                {categoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>

              <label htmlFor="issue-description">وصف المشكلة</label>
              <textarea
                id="issue-description"
                className={`input ${styles.description}`}
                value={description}
                maxLength={2000}
                placeholder="اشرح ما ظهر في الرول قبل بدء التركيب…"
                onChange={(event) => { setDescription(event.target.value); resetAttempt(); }}
              />
              <span className={styles.counter}>{description.trim().length.toLocaleString("en-US")} / 2000</span>

              <label htmlFor="issue-images">صور اختيارية</label>
              <input id="issue-images" className={`input ${styles.fileInput}`} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => handleImages(event.target.files)} />
              <p className={styles.help}>حتى 5 صور، بحد أقصى 8 MB للصورة. الصور ليست إلزامية. راجع المعاينات قبل الإرسال.</p>
              {imagePreviews.length ? (
                <ul className={styles.fileList} aria-label="معاينة الصور المختارة">
                  {imagePreviews.map(({ file, url }, index) => (
                    <li key={`${file.name}-${file.lastModified}-${index}`}>
                      <img src={url} alt={`معاينة الصورة ${index + 1}: ${file.name}`} />
                      <div className={styles.fileMeta}>
                        <span>{file.name}</span>
                        <span dir="ltr">{formatSize(file.size)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className={styles.actions}>
                <button type="button" className="button button-primary" onClick={submitIssue} disabled={isSubmitting}>
                  {isSubmitting ? "جارٍ إرسال البلاغ…" : "إرسال البلاغ وإيقاف التفعيل مؤقتًا"}
                </button>
                <button type="button" className="button button-ghost" onClick={() => { setSerialInput(""); resetReport(); }} disabled={isSubmitting}>اختيار رول آخر</button>
              </div>
            </div>
          ) : (
            <div className={styles.actions}><Link href="/operations/rolls/issues" className="button button-secondary">عرض البلاغات</Link></div>
          )}
        </section>
      ) : null}

      <QrScannerSheet open={scannerOpen} title="مسح QR الرول" instruction="وجّه الكاميرا إلى QR الموجود على ملصق الرول الخارجي." onClose={() => setScannerOpen(false)} onDecode={handleQrDecode} />
    </div>
  );
}
