"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  endWarrantyClaimAccess,
  removeWarrantyClaimEvidence,
  submitWarrantyClaim,
  uploadWarrantyClaimEvidence,
  verifyWarrantyClaimPhone,
} from "./actions";
import {
  claimStatusLabel,
  WARRANTY_CLAIM_CATEGORIES,
  WARRANTY_CLAIM_CATEGORY_LABELS,
  WARRANTY_CLAIM_MAX_IMAGES,
  type CustomerClaimSummary,
  type CustomerWarrantyClaimContext,
  type WarrantyClaimEvidenceReference,
} from "@/lib/warranty/claim-intake";
import styles from "./page.module.css";

type UploadItem = {
  localId: string;
  fileName: string;
  status: "uploading" | "ready" | "error";
  evidence?: WarrantyClaimEvidenceReference;
  error?: string;
};

type Props = {
  publicCode: string;
  initialContext: CustomerWarrantyClaimContext | null;
  publicProductName: string | null;
  publicState: string | null;
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Cairo",
  }).format(new Date(value));
}

function errorText(code: string): string {
  switch (code) {
    case "PG_CLAIM_VERIFICATION_FAILED":
      return "تعذر التحقق. تأكد أن الرقم هو نفس الرقم المسجل على الضمان.";
    case "PG_CLAIM_SERVICE_UNAVAILABLE":
      return "خدمة المطالبات غير متاحة مؤقتًا. حاول مرة أخرى.";
    case "PG_CLAIM_VERIFICATION_REQUIRED":
    case "PG_CLAIM_VERIFICATION_STALE":
      return "انتهت صلاحية التحقق أو تغيرت بيانات الضمان. تحقق من رقم الهاتف مرة أخرى.";
    case "PG_CLAIM_WARRANTY_EXPIRED":
    case "PG_CLAIM_NOT_SUBMITTABLE":
      return "لا يمكن إنشاء مطالبة جديدة على هذا الضمان حاليًا.";
    case "PG_CLAIM_OPEN_EXISTS":
      return "توجد مطالبة مفتوحة بالفعل على هذا الضمان.";
    case "PG_CLAIM_EVIDENCE_TYPE_INVALID":
      return "صيغة الصورة غير مدعومة. استخدم JPEG أو PNG أو WebP.";
    case "PG_CLAIM_EVIDENCE_SIZE_INVALID":
      return "حجم الصورة يجب ألا يتجاوز 8 ميجابايت.";
    case "PG_CLAIM_EVIDENCE_COUNT_INVALID":
      return "يمكن إرفاق حتى 5 صور فقط.";
    case "PG_CLAIM_EVIDENCE_INVALID":
      return "تعذر التحقق من الصور المرفقة. أعد رفع الصور المطلوبة.";
    case "PG_CLAIM_EVIDENCE_UPLOAD_FAILED":
      return "تعذر رفع الصورة. تحقق من الاتصال وحاول مرة أخرى.";
    case "PG_CLAIM_EVIDENCE_REMOVE_FAILED":
      return "تعذر حذف الصورة الآن. حاول مرة أخرى.";
    case "PG_CLAIM_EVIDENCE_COMPENSATION_FAILED":
      return "تعذر إكمال الإرسال بأمان. لا تعاود الإرسال الآن وتواصل مع الدعم.";
    case "PG_CLAIM_CATEGORY_INVALID":
      return "اختر نوع المشكلة.";
    case "PG_CLAIM_AFFECTED_AREA_INVALID":
      return "اكتب الجزء أو المنطقة المتأثرة بوضوح.";
    case "PG_CLAIM_DESCRIPTION_INVALID":
      return "اكتب وصفًا أوضح للمشكلة (10 أحرف على الأقل).";
    case "PG_CLAIM_REQUEST_CONFLICT":
      return "تغيرت بيانات الطلب بعد بدء الإرسال. راجع البيانات ثم أعد المحاولة.";
    default:
      return "تعذر إكمال العملية الآن. حاول مرة أخرى بدون تكرار الضغط.";
  }
}

function ClaimSummaryCard({ claim, historical = false }: { claim: CustomerClaimSummary; historical?: boolean }) {
  return (
    <article className={styles.claimCard}>
      <div className={styles.claimCardHeader}>
        <div>
          <span className={styles.eyebrow}>{historical ? "مطالبة سابقة" : "المطالبة الحالية"}</span>
          <strong dir="ltr">{claim.claimNumber}</strong>
        </div>
        <span className={styles.statusChip}>{claimStatusLabel(claim.status)}</span>
      </div>
      <dl className={styles.claimFacts}>
        <div><dt>تاريخ الإرسال</dt><dd>{formatDate(claim.submittedAt)}</dd></div>
        <div><dt>نوع المشكلة</dt><dd>{WARRANTY_CLAIM_CATEGORY_LABELS[claim.category] ?? "أخرى"}</dd></div>
        <div><dt>المنطقة المتأثرة</dt><dd>{claim.affectedArea}</dd></div>
        <div><dt>الصور المستلمة</dt><dd>{claim.evidenceCount}</dd></div>
      </dl>
      <p className={styles.customerDescription}>{claim.description}</p>
    </article>
  );
}

export default function CustomerClaimIntake({ publicCode, initialContext, publicProductName, publicState }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [phone, setPhone] = useState("");
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [affectedArea, setAffectedArea] = useState("");
  const [description, setDescription] = useState("");
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successNumber, setSuccessNumber] = useState<string | null>(null);
  const requestIdRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const readyEvidence = useMemo(
    () => uploads.filter((item) => item.status === "ready" && item.evidence).map((item) => item.evidence!),
    [uploads],
  );
  const anyUploading = uploads.some((item) => item.status === "uploading");

  function payloadChanged() {
    requestIdRef.current = null;
    setSubmitError(null);
  }

  function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setVerificationError(null);
    startTransition(async () => {
      const result = await verifyWarrantyClaimPhone(publicCode, phone);
      if (!result.ok) {
        setVerificationError(errorText(result.code));
        return;
      }
      setPhone("");
      router.refresh();
    });
  }

  async function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const remaining = WARRANTY_CLAIM_MAX_IMAGES - uploads.filter((item) => item.status !== "error").length;
    const selected = Array.from(files).slice(0, Math.max(0, remaining));
    if (selected.length === 0) {
      setSubmitError(errorText("PG_CLAIM_EVIDENCE_COUNT_INVALID"));
      return;
    }

    payloadChanged();
    for (const file of selected) {
      const localId = crypto.randomUUID();
      setUploads((current) => [...current, { localId, fileName: file.name, status: "uploading" }]);
      const result = await uploadWarrantyClaimEvidence(publicCode, file);
      if (!result.ok) {
        setUploads((current) => current.map((item) => item.localId === localId
          ? { ...item, status: "error", error: errorText(result.code) }
          : item));
        continue;
      }
      setUploads((current) => current.map((item) => item.localId === localId
        ? { ...item, status: "ready", evidence: result.evidence }
        : item));
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function removeUpload(item: UploadItem) {
    payloadChanged();
    if (!item.evidence) {
      setUploads((current) => current.filter((candidate) => candidate.localId !== item.localId));
      return;
    }

    setUploads((current) => current.map((candidate) => candidate.localId === item.localId
      ? { ...candidate, status: "uploading" }
      : candidate));
    const result = await removeWarrantyClaimEvidence(publicCode, item.evidence.storagePath);
    if (!result.ok) {
      setUploads((current) => current.map((candidate) => candidate.localId === item.localId
        ? { ...candidate, status: "error", error: errorText(result.code ?? "PG_CLAIM_EVIDENCE_REMOVE_FAILED") }
        : candidate));
      return;
    }
    setUploads((current) => current.filter((candidate) => candidate.localId !== item.localId));
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);
    if (readyEvidence.length < 1) {
      setSubmitError("أرفق صورة واحدة على الأقل قبل الإرسال.");
      return;
    }
    if (anyUploading) {
      setSubmitError("انتظر حتى يكتمل رفع الصور أولًا.");
      return;
    }

    if (!requestIdRef.current) requestIdRef.current = crypto.randomUUID();
    const requestId = requestIdRef.current;

    startTransition(async () => {
      const result = await submitWarrantyClaim({
        publicCode,
        requestId,
        category,
        affectedArea,
        description,
        evidencePaths: readyEvidence.map((item) => item.storagePath),
      });
      if (!result.ok) {
        setSubmitError(errorText(result.code));
        return;
      }
      setSuccessNumber(result.claimNumber);
      router.refresh();
    });
  }

  function leaveVerifiedAccess() {
    startTransition(async () => {
      await endWarrantyClaimAccess(publicCode);
      setUploads([]);
      router.refresh();
    });
  }

  if (!initialContext) {
    return (
      <section className={styles.panel}>
        <div className={styles.headingBlock}>
          <span className={styles.eyebrow}>خدمة الضمان</span>
          <h1>تحقق من رقم الهاتف</h1>
          <p>لإنشاء مطالبة أو متابعة مطالبة سابقة، أدخل نفس رقم الهاتف المسجل على الضمان.</p>
          {publicProductName ? <span className={styles.productLine}>{publicProductName}</span> : null}
        </div>
        <form className={styles.verifyForm} onSubmit={verify}>
          <label htmlFor="claim-phone">رقم الهاتف المسجل</label>
          <input
            id="claim-phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            minLength={5}
            maxLength={32}
            required
            dir="ltr"
            placeholder="01xxxxxxxxx"
          />
          {verificationError ? <p className={styles.errorText} role="alert">{verificationError}</p> : null}
          <button className={styles.primaryButton} type="submit" disabled={isPending}>
            {isPending ? "جارٍ التحقق…" : "متابعة"}
          </button>
        </form>
        {publicState && publicState !== "active" && publicState !== "expired" ? (
          <p className={styles.quietNotice}>لا توجد مطالبة ضمان متاحة من حالة الضمان الحالية.</p>
        ) : null}
      </section>
    );
  }

  const context = initialContext;
  const vehicle = [context.vehicleMake, context.vehicleModel, context.vehicleYear].filter(Boolean).join(" · ");

  return (
    <section className={styles.panel}>
      <div className={styles.contextHeader}>
        <div>
          <span className={styles.eyebrow}>ضمان تم التحقق منه</span>
          <h1>{context.productName}</h1>
          <p>{vehicle}</p>
        </div>
        <button className={styles.ghostButton} type="button" onClick={leaveVerifiedAccess} disabled={isPending}>
          تغيير الرقم
        </button>
      </div>

      <div className={styles.warrantyStrip}>
        <span>رقم الضمان</span><strong dir="ltr">{context.warrantyNumber}</strong>
        <span>نهاية التغطية</span><strong>{formatDate(context.coverageExpiresAt)}</strong>
      </div>

      {context.currentOpenClaim ? (
        <div className={styles.stack}>
          <ClaimSummaryCard claim={context.currentOpenClaim} />
          <p className={styles.quietNotice}>لا يمكن إنشاء مطالبة أخرى قبل إغلاق المطالبة الحالية.</p>
        </div>
      ) : context.canSubmitNewClaim ? (
        successNumber ? (
          <div className={styles.successBox} role="status">
            <span className={styles.eyebrow}>تم الاستلام بنجاح</span>
            <h2>رقم المطالبة</h2>
            <strong dir="ltr">{successNumber}</strong>
            <p>احتفظ بالرقم كمرجع. ستظهر حالة المطالبة هنا بعد تحديث الصفحة.</p>
          </div>
        ) : (
          <form className={styles.claimForm} onSubmit={submit}>
            <div className={styles.sectionHeading}>
              <span className={styles.eyebrow}>مطالبة جديدة</span>
              <h2>صف لنا المشكلة</h2>
              <p>اختيار نوع المشكلة يساعد المراجعة، لكنه لا يعني قبول أو رفض المطالبة تلقائيًا.</p>
            </div>

            <label>
              <span>نوع المشكلة</span>
              <select value={category} onChange={(event) => { setCategory(event.target.value); payloadChanged(); }} required>
                <option value="">اختر نوع المشكلة</option>
                {WARRANTY_CLAIM_CATEGORIES.map((item) => (
                  <option key={item} value={item}>{WARRANTY_CLAIM_CATEGORY_LABELS[item]}</option>
                ))}
              </select>
            </label>

            <label>
              <span>الجزء أو المنطقة المتأثرة</span>
              <input
                value={affectedArea}
                onChange={(event) => { setAffectedArea(event.target.value); payloadChanged(); }}
                minLength={2}
                maxLength={160}
                placeholder="مثال: غطاء المحرك — الجهة اليمنى"
                required
              />
            </label>

            <label>
              <span>وصف المشكلة</span>
              <textarea
                value={description}
                onChange={(event) => { setDescription(event.target.value); payloadChanged(); }}
                minLength={10}
                maxLength={3000}
                rows={5}
                placeholder="متى لاحظت المشكلة؟ وما شكلها الحالي؟"
                required
              />
            </label>

            <div className={styles.evidenceBlock}>
              <div className={styles.evidenceHeading}>
                <div>
                  <span>صور المشكلة</span>
                  <p>مطلوب صورة واحدة على الأقل. يفضل صورة عامة وصورة قريبة واضحة.</p>
                </div>
                <strong>{readyEvidence.length}/{WARRANTY_CLAIM_MAX_IMAGES}</strong>
              </div>

              <label className={styles.fileButton}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  onChange={(event) => void uploadFiles(event.target.files)}
                  disabled={anyUploading || readyEvidence.length >= WARRANTY_CLAIM_MAX_IMAGES}
                />
                إضافة صور
              </label>

              {uploads.length > 0 ? (
                <ul className={styles.uploadList}>
                  {uploads.map((item) => (
                    <li key={item.localId}>
                      <div>
                        <strong>{item.fileName}</strong>
                        <span className={item.status === "error" ? styles.uploadError : styles.uploadState}>
                          {item.status === "uploading" ? "جارٍ الرفع…" : item.status === "ready" ? "تم الرفع" : item.error}
                        </span>
                      </div>
                      <button type="button" onClick={() => void removeUpload(item)} disabled={item.status === "uploading"}>
                        إزالة
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            {submitError ? <p className={styles.errorText} role="alert">{submitError}</p> : null}

            <div className={styles.confirmBox}>
              <p>بالإرسال أنت تطلب من Protection Giants مراجعة الحالة وفق سياسة الضمان المسجلة. الإرسال لا يعني قرار قبول تلقائي.</p>
            </div>

            <button className={styles.primaryButton} type="submit" disabled={isPending || anyUploading || readyEvidence.length < 1}>
              {isPending ? "جارٍ إرسال المطالبة…" : "إرسال المطالبة"}
            </button>
          </form>
        )
      ) : (
        <div className={styles.closedNotice}>
          <span className={styles.eyebrow}>متابعة فقط</span>
          <h2>انتهت مدة إنشاء مطالبة جديدة</h2>
          <p>يمكنك الاطلاع على المطالبات السابقة المرتبطة بهذا الضمان بعد التحقق، لكن لا يمكن فتح مطالبة جديدة بعد انتهاء التغطية.</p>
        </div>
      )}

      {context.recentClosedClaims.length > 0 ? (
        <div className={styles.historySection}>
          <h2>المطالبات السابقة</h2>
          <div className={styles.stack}>
            {context.recentClosedClaims.map((claim) => (
              <ClaimSummaryCard key={claim.claimNumber} claim={claim} historical />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
