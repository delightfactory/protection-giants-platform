"use client";

import { useRef, useState, useTransition } from "react";
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
  validateWarrantyClaimImage,
  WARRANTY_CLAIM_ALLOWED_IMAGES,
  WARRANTY_CLAIM_CATEGORIES,
  WARRANTY_CLAIM_CATEGORY_LABELS,
  WARRANTY_CLAIM_MAX_IMAGES,
  type CustomerClaimSummary,
  type CustomerWarrantyClaimContext,
  type CustomerWarrantyServiceEntry,
  type WarrantyClaimEvidenceReference,
  type WarrantyClaimRemedyKind,
} from "@/lib/warranty/claim-intake";
import {
  INTERNATIONAL_PHONE_GUIDANCE_AR,
  normalizeInternationalPhone,
} from "@/lib/warranty/international-phone";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { LocalDateTime } from "@/components/ui/local-date-time";
import {
  LocalEvidenceReview,
  type LocalEvidenceReviewItem,
} from "@/components/ui/local-evidence-review";
import styles from "./page.module.css";

const EVIDENCE_ACCEPT = Object.keys(WARRANTY_CLAIM_ALLOWED_IMAGES).join(",");

type UploadItem = LocalEvidenceReviewItem & {
  evidence?: WarrantyClaimEvidenceReference;
};

type Props = {
  publicCode: string;
  initialContext: CustomerWarrantyClaimContext | null;
  publicProductName: string | null;
  publicState: string | null;
};

function remedyLabel(remedy: WarrantyClaimRemedyKind): string {
  return remedy === "replacement_roll_reinstall" ? "استبدال وإعادة تركيب" : "إعادة تنفيذ الخدمة";
}

function customerClaimStatusLabel(claim: CustomerClaimSummary): string {
  if (claim.status !== "approved") return claimStatusLabel(claim.status);
  if (claim.resolutionStatus === "completed") return "تم تنفيذ الخدمة";
  if (claim.resolutionStatus === "assigned") return "جارٍ تنفيذ الخدمة";
  return "تم قبول المطالبة";
}

function errorText(code: string): string {
  switch (code) {
    case "PG_CLAIM_VERIFICATION_FAILED":
      return "تعذر التحقق. تأكد أن الرقم هو نفس الرقم الدولي المسجل على الضمان.";
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
    case "PG_CLAIM_EVIDENCE_UPLOAD_AMBIGUOUS":
      return "تعذر تأكيد حالة رفع الصورة. أزل هذا العنصر ثم حاول رفع الصورة مرة أخرى.";
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
  const showPerformingCenter = Boolean(
    claim.performingCenterName
    && (claim.resolutionStatus === "assigned" || claim.resolutionStatus === "completed"),
  );

  return (
    <article className={styles.claimCard}>
      <div className={styles.claimCardHeader}>
        <div>
          <span className={styles.eyebrow}>{historical ? "مطالبة سابقة" : "المطالبة الحالية"}</span>
          <strong dir="ltr">{claim.claimNumber}</strong>
        </div>
        <span className={styles.statusChip}>{customerClaimStatusLabel(claim)}</span>
      </div>
      <dl className={styles.claimFacts}>
        <div><dt>تاريخ الإرسال</dt><dd><LocalDateTime value={claim.submittedAt} /></dd></div>
        <div><dt>نوع المشكلة</dt><dd>{WARRANTY_CLAIM_CATEGORY_LABELS[claim.category] ?? "أخرى"}</dd></div>
        <div><dt>المنطقة المتأثرة</dt><dd>{claim.affectedArea}</dd></div>
        <div><dt>الصور المستلمة</dt><dd>{claim.evidenceCount}</dd></div>
        {claim.decidedAt ? <div><dt>آخر قرار</dt><dd><LocalDateTime value={claim.decidedAt} /></dd></div> : null}
        {claim.remedyKind ? <div><dt>إجراء الخدمة</dt><dd>{remedyLabel(claim.remedyKind)}</dd></div> : null}
        {showPerformingCenter ? <div><dt>مركز التنفيذ</dt><dd>{claim.performingCenterName}</dd></div> : null}
        {claim.resolutionCompletedAt ? <div><dt>تاريخ الإكمال</dt><dd><LocalDateTime value={claim.resolutionCompletedAt} /></dd></div> : null}
      </dl>
      <p className={styles.customerDescription}>{claim.description}</p>
      {claim.customerDecisionMessage ? (
        <p className={styles.quietNotice}>
          <strong>رسالة بخصوص القرار: </strong>{claim.customerDecisionMessage}
        </p>
      ) : null}
    </article>
  );
}

function ServiceHistoryCard({ service }: { service: CustomerWarrantyServiceEntry }) {
  return (
    <article className={styles.claimCard}>
      <div className={styles.claimCardHeader}>
        <div>
          <span className={styles.eyebrow}>خدمة ضمان مكتملة</span>
          <strong dir="ltr">{service.claimNumber}</strong>
        </div>
        <span className={styles.statusChip}>تم التنفيذ</span>
      </div>
      <dl className={styles.claimFacts}>
        <div><dt>الخدمة المنفذة</dt><dd>{remedyLabel(service.remedyKind)}</dd></div>
        <div><dt>تاريخ الإكمال</dt><dd><LocalDateTime value={service.completedAt} /></dd></div>
        {service.performingCenterName ? <div><dt>مركز التنفيذ</dt><dd>{service.performingCenterName}</dd></div> : null}
      </dl>
      {service.customerDecisionMessage ? (
        <p className={styles.quietNotice}>
          <strong>قرار المطالبة: </strong>{service.customerDecisionMessage}
        </p>
      ) : null}
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

  const anyUploading = uploads.some((item) => item.status === "uploading");
  const hasReservedUploadError = uploads.some((item) => item.status === "error" && item.evidence);
  const busy = isPending || anyUploading;

  function payloadChanged() {
    requestIdRef.current = null;
    setSubmitError(null);
  }

  function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setVerificationError(null);

    const normalizedPhone = normalizeInternationalPhone(phone);
    if (!normalizedPhone) {
      setVerificationError(INTERNATIONAL_PHONE_GUIDANCE_AR);
      return;
    }

    startTransition(async () => {
      const result = await verifyWarrantyClaimPhone(publicCode, normalizedPhone);
      if (!result.ok) {
        setVerificationError(errorText(result.code));
        return;
      }
      setPhone("");
      router.refresh();
    });
  }

  function addFiles(files: File[]) {
    if (!files.length || busy) return;
    const remaining = WARRANTY_CLAIM_MAX_IMAGES - uploads.length;
    if (remaining < 1) {
      setSubmitError(errorText("PG_CLAIM_EVIDENCE_COUNT_INVALID"));
      return;
    }

    const accepted: UploadItem[] = [];
    let firstError: string | null = null;
    for (const file of files) {
      if (accepted.length >= remaining) break;
      const validationError = validateWarrantyClaimImage(file);
      if (validationError) {
        firstError ??= errorText(validationError);
        continue;
      }
      accepted.push({
        id: crypto.randomUUID(),
        file,
        status: "local",
      });
    }

    if (accepted.length) {
      payloadChanged();
      setUploads((current) => [...current, ...accepted]);
    }
    if (firstError) setSubmitError(firstError);
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
      const result = await removeWarrantyClaimEvidence(publicCode, item.evidence.storagePath);
      if (!result.ok) {
        setUploads((current) => current.map((candidate) => candidate.id === item.id
          ? { ...candidate, status: "error", error: errorText(result.code ?? "PG_CLAIM_EVIDENCE_REMOVE_FAILED") }
          : candidate));
        return;
      }
      setUploads((current) => current.filter((candidate) => candidate.id !== item.id));
    } catch {
      setUploads((current) => current.map((candidate) => candidate.id === item.id
        ? { ...candidate, status: "error", error: "انقطع تأكيد حذف الصورة. حاول الإزالة مرة أخرى قبل إرسال المطالبة." }
        : candidate));
    }
  }

  async function replaceUpload(item: UploadItem, file: File) {
    if (busy) return;
    const validationError = validateWarrantyClaimImage(file);
    if (validationError) {
      setSubmitError(errorText(validationError));
      return;
    }

    payloadChanged();
    if (item.evidence) {
      setUploads((current) => current.map((candidate) => candidate.id === item.id
        ? { ...candidate, status: "uploading", error: undefined }
        : candidate));
      try {
        const result = await removeWarrantyClaimEvidence(publicCode, item.evidence.storagePath);
        if (!result.ok) {
          setUploads((current) => current.map((candidate) => candidate.id === item.id
            ? { ...candidate, status: "error", error: errorText(result.code ?? "PG_CLAIM_EVIDENCE_REMOVE_FAILED") }
            : candidate));
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

  async function prepareEvidence(): Promise<WarrantyClaimEvidenceReference[] | null> {
    const prepared: WarrantyClaimEvidenceReference[] = [];

    for (const item of uploads) {
      if (item.status === "retained" && item.evidence) {
        prepared.push(item.evidence);
        continue;
      }
      if (item.status === "error" && item.evidence) {
        setSubmitError("أزل أو استبدل أي صورة تعذر تأكيد حالتها قبل إعادة إرسال المطالبة.");
        return null;
      }

      setUploads((current) => current.map((candidate) => candidate.id === item.id
        ? { ...candidate, status: "uploading", error: undefined }
        : candidate));
      try {
        const result = await uploadWarrantyClaimEvidence(publicCode, item.file);
        if (!result.ok) {
          const message = errorText(result.code);
          setUploads((current) => current.map((candidate) => candidate.id === item.id
            ? { ...candidate, status: "error", evidence: result.evidence, error: message }
            : candidate));
          setSubmitError(message);
          return null;
        }
        prepared.push(result.evidence);
        setUploads((current) => current.map((candidate) => candidate.id === item.id
          ? { ...candidate, status: "retained", evidence: result.evidence, error: undefined }
          : candidate));
      } catch {
        const message = "انقطع تأكيد رفع الصورة. راجع الصور ثم أعد تأكيد الإرسال؛ سيستخدم النظام نفس الملف بأمان.";
        setUploads((current) => current.map((candidate) => candidate.id === item.id
          ? { ...candidate, status: "error", error: message }
          : candidate));
        setSubmitError(message);
        return null;
      }
    }

    return prepared;
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);
    if (uploads.length < 1) {
      setSubmitError("أرفق صورة واحدة على الأقل قبل الإرسال.");
      return;
    }
    if (anyUploading) {
      setSubmitError("انتظر حتى تنتهي محاولة رفع الصور الحالية.");
      return;
    }
    if (hasReservedUploadError) {
      setSubmitError("أزل أو استبدل أي صورة تعذر تأكيد رفعها قبل إرسال المطالبة.");
      return;
    }

    if (!requestIdRef.current) requestIdRef.current = crypto.randomUUID();
    const requestId = requestIdRef.current;

    startTransition(() => {
      void (async () => {
        const evidence = await prepareEvidence();
        if (!evidence) return;
        try {
          const result = await submitWarrantyClaim({
            publicCode,
            requestId,
            category,
            affectedArea,
            description,
            evidencePaths: evidence.map((item) => item.storagePath),
          });
          if (!result.ok) {
            setSubmitError(errorText(result.code));
            return;
          }
          requestIdRef.current = null;
          setSuccessNumber(result.claimNumber);
        } catch {
          setSubmitError("انقطع تأكيد إرسال المطالبة. لا تغيّر البيانات أو الصور؛ أعد التأكيد ليستخدم النظام نفس رقم المحاولة بأمان.");
        }
      })();
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
          <p>لإنشاء مطالبة أو متابعة مطالبة سابقة، أدخل نفس رقم الهاتف الدولي المسجل على الضمان.</p>
          {publicProductName ? <span className={styles.productLine}>{publicProductName}</span> : null}
        </div>
        <form className={styles.verifyForm} onSubmit={verify}>
          <label htmlFor="claim-phone">رقم الهاتف المسجل — بصيغة دولية</label>
          <input
            id="claim-phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            maxLength={32}
            required
            dir="ltr"
            placeholder="+20 10 1234 5678"
            title={INTERNATIONAL_PHONE_GUIDANCE_AR}
          />
          <p className={styles.quietNotice}>{INTERNATIONAL_PHONE_GUIDANCE_AR}</p>
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
  const otherClosedClaims = context.recentClosedClaims.filter((claim) => claim.resolutionStatus !== "completed");

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
        <span>نهاية التغطية</span><strong><LocalDateTime value={context.coverageExpiresAt} /></strong>
      </div>

      {successNumber ? (
        <div className={styles.successBox} role="status">
          <span className={styles.eyebrow}>تم الاستلام بنجاح</span>
          <h2>رقم المطالبة</h2>
          <strong dir="ltr">{successNumber}</strong>
          <p>احتفظ بالرقم كمرجع. ستظهر حالة المطالبة هنا بعد تحديث الصفحة.</p>
        </div>
      ) : context.currentOpenClaim ? (
        <div className={styles.stack}>
          <ClaimSummaryCard claim={context.currentOpenClaim} />
          <p className={styles.quietNotice}>لا يمكن إنشاء مطالبة أخرى قبل إغلاق المطالبة الحالية.</p>
        </div>
      ) : context.canSubmitNewClaim ? (
        <form className={styles.claimForm} onSubmit={submit}>
          <div className={styles.sectionHeading}>
            <span className={styles.eyebrow}>مطالبة جديدة</span>
            <h2>صف لنا المشكلة</h2>
            <p>اختيار نوع المشكلة يساعد المراجعة، لكنه لا يعني قبول أو رفض المطالبة تلقائيًا.</p>
          </div>

          <label>
            <span>نوع المشكلة</span>
            <select value={category} onChange={(event) => { setCategory(event.target.value); payloadChanged(); }} required disabled={busy}>
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
              disabled={busy}
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
              disabled={busy}
            />
          </label>

          <div className={styles.evidenceBlock}>
            <LocalEvidenceReview
              idPrefix="customer-claim-evidence"
              title="صور المشكلة"
              help="مطلوب صورة واحدة على الأقل · JPEG / PNG / WebP · حتى 8MB للصورة. راجع الصور قبل أن يبدأ الرفع."
              items={uploads}
              maxFiles={WARRANTY_CLAIM_MAX_IMAGES}
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
          </div>

          {submitError ? <p className={styles.errorText} role="alert">{submitError}</p> : null}

          <div className={styles.confirmBox}>
            <p>بالإرسال أنت تطلب من Protection Giants مراجعة الحالة وفق سياسة الضمان المسجلة. الإرسال لا يعني قرار قبول تلقائي.</p>
          </div>

          <ConfirmSubmitButton
            title={`إرسال المطالبة مع ${uploads.length.toLocaleString("en-US")} صورة؟`}
            description="بعد هذا التأكيد فقط سيبدأ رفع الصور المختارة، ثم تُرسل المطالبة للمراجعة إذا نجحت العملية النهائية."
            confirmLabel="تأكيد وإرسال المطالبة"
            tone="primary"
            className={styles.primaryButton}
            disabled={busy || hasReservedUploadError || uploads.length < 1}
          >
            {isPending ? "جارٍ إرسال المطالبة…" : "إرسال المطالبة"}
          </ConfirmSubmitButton>
        </form>
      ) : (
        <div className={styles.closedNotice}>
          <span className={styles.eyebrow}>متابعة فقط</span>
          <h2>انتهت مدة إنشاء مطالبة جديدة</h2>
          <p>يمكنك الاطلاع على المطالبات السابقة المرتبطة بهذا الضمان بعد التحقق، لكن لا يمكن فتح مطالبة جديدة بعد انتهاء التغطية.</p>
        </div>
      )}

      {context.serviceHistory.length > 0 ? (
        <div className={styles.historySection}>
          <h2>سجل خدمات الضمان</h2>
          <div className={styles.stack}>
            {context.serviceHistory.map((service) => (
              <ServiceHistoryCard key={`${service.claimNumber}-${service.completedAt}`} service={service} />
            ))}
          </div>
        </div>
      ) : null}

      {otherClosedClaims.length > 0 ? (
        <div className={styles.historySection}>
          <h2>المطالبات السابقة</h2>
          <div className={styles.stack}>
            {otherClosedClaims.map((claim) => (
              <ClaimSummaryCard key={claim.claimNumber} claim={claim} historical />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}