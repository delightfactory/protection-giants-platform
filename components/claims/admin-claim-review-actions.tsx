"use client";

import { FormEvent, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  reassignClaimInspection,
  requestClaimInspection,
  startClaimReview,
} from "@/app/operations/claims/review-actions";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import styles from "./admin-claim-review-actions.module.css";

export type ClaimInspectionCenterOption = {
  centerPartyId: string;
  centerName: string;
  countryCode: string;
  city: string;
  approvalStatus: string;
  activeOperatorCount: number;
};

type Feedback = { tone: "error" | "warning" | "success" | "info"; text: string } | null;

type AdminClaimReviewActionsProps = {
  claimId: string;
  claimNumber: string;
  claimStatus: string;
  inspectionId: string | null;
  inspectionStatus: string | null;
  currentCenterPartyId: string | null;
  currentCenterName: string | null;
  centers: ClaimInspectionCenterOption[];
};

const stateRaceCodes = new Set([
  "PG_CLAIM_REVIEW_STATE_INVALID",
  "PG_CLAIM_INSPECTION_STATE_INVALID",
  "PG_CLAIM_INSPECTION_EXISTS",
  "PG_CLAIM_INSPECTION_REASSIGN_STATE_INVALID",
]);

const errorMessages: Record<string, string> = {
  PG_CLAIM_REVIEW_REQUEST_INVALID: "تعذر تجهيز رقم محاولة آمن لبدء المراجعة. أعد فتح المطالبة ثم حاول مرة أخرى.",
  PG_CLAIM_INSPECTION_REQUEST_INVALID: "بيانات طلب الفحص غير مكتملة. راجع المطالبة والمركز المختار.",
  PG_CLAIM_INSPECTION_REASSIGN_REQUEST_INVALID: "بيانات إعادة تعيين مركز الفحص غير مكتملة.",
  PG_CLAIM_INSPECTION_REASSIGN_REASON_INVALID: "اكتب سبب إعادة التعيين بوضوح من 5 إلى 500 حرف.",
  PG_CLAIM_ACTION_REQUEST_CONFLICT: "رقم المحاولة نفسه استُخدم لإجراء مختلف. راجع الحالة وابدأ محاولة جديدة.",
  PG_CLAIM_NOT_FOUND: "لم تعد المطالبة متاحة في النطاق الحالي.",
  PG_CLAIM_WARRANTY_INVALID: "سجل الضمان المرتبط لم يعد صالحًا لهذا الإجراء. راجع حالة الضمان قبل المتابعة.",
  PG_CLAIM_REVIEW_STATE_INVALID: "حالة المطالبة تغيّرت ولم يعد بدء المراجعة متاحًا.",
  PG_CLAIM_INSPECTION_STATE_INVALID: "حالة المطالبة تغيّرت ولم يعد طلب فحص جديد متاحًا.",
  PG_CLAIM_INSPECTION_EXISTS: "يوجد بالفعل فحص رسمي مرتبط بهذه المطالبة.",
  PG_CLAIM_CENTER_REQUIRED: "اختر مركز فحص صالحًا.",
  PG_CLAIM_CENTER_INACTIVE: "المركز المختار لم يعد نشطًا وقت التنفيذ.",
  PG_CLAIM_CENTER_UNACTIONABLE: "المركز المختار لا يملك حاليًا أي حساب Center نشط يستطيع استلام مهمة الفحص.",
  PG_CLAIM_INSPECTION_REASSIGN_STATE_INVALID: "الفحص لم يعد في حالة تسمح بإعادة التعيين. حدّث الصفحة وراجع حالته الحالية.",
  PG_CLAIM_INSPECTION_REASSIGN_SAME_CENTER: "اختر مركزًا مختلفًا عن المركز المكلف حاليًا.",
  PG_CLAIM_ADMIN_REQUIRED: "هذا الإجراء متاح لحساب Admin نشط فقط.",
  PG_CLAIM_FORBIDDEN: "لا تملك صلاحية تنفيذ هذا الإجراء.",
  PG_WARRANTY_ADMIN_REQUIRED: "هذا الإجراء متاح لحساب Admin نشط فقط.",
  PG_CLAIM_REVIEW_ACTION_FAILED: "تعذر إكمال الإجراء الآن. حدّث المطالبة ثم أعد المحاولة، أو راجع مسؤول النظام إذا استمرت المشكلة.",
};

function actionError(code: string) {
  return errorMessages[code] ?? errorMessages.PG_CLAIM_REVIEW_ACTION_FAILED;
}

function centerLabel(center: ClaimInspectionCenterOption) {
  const location = [center.city, center.countryCode].filter(Boolean).join(" · ");
  const operators = `${center.activeOperatorCount.toLocaleString("en-US")} حساب نشط`;
  return `${center.centerName}${location ? ` — ${location}` : ""} — ${operators}`;
}

export function AdminClaimReviewActions({
  claimId,
  claimNumber,
  claimStatus,
  inspectionId,
  inspectionStatus,
  currentCenterPartyId,
  currentCenterName,
  centers,
}: AdminClaimReviewActionsProps) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [selectedCenterId, setSelectedCenterId] = useState("");
  const [reassignReason, setReassignReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const startRequestIdRef = useRef<string | null>(null);
  const requestInspectionIdRef = useRef<string | null>(null);
  const reassignRequestIdRef = useRef<string | null>(null);

  const alternativeCenters = useMemo(
    () => centers.filter((center) => center.centerPartyId !== currentCenterPartyId),
    [centers, currentCenterPartyId],
  );

  function handleResult(
    result: Awaited<ReturnType<typeof startClaimReview>>,
    successText: string,
    resetRequestId: () => void,
  ) {
    if (!result.ok) {
      const tone = stateRaceCodes.has(result.code) ? "warning" : "error";
      setFeedback({ tone, text: actionError(result.code) });
      if (result.code === "PG_CLAIM_ACTION_REQUEST_CONFLICT") resetRequestId();
      if (stateRaceCodes.has(result.code)) router.refresh();
      return;
    }

    resetRequestId();
    setSelectedCenterId("");
    setReassignReason("");
    setFeedback({ tone: "success", text: successText });
    router.refresh();
  }

  function submitStartReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;
    if (!startRequestIdRef.current) startRequestIdRef.current = crypto.randomUUID();
    const requestId = startRequestIdRef.current;

    startTransition(() => {
      void (async () => {
        try {
          const result = await startClaimReview({ requestId, claimId });
          handleResult(result, "تم بدء مراجعة المطالبة وتسجيل الحدث في السجل الزمني.", () => {
            startRequestIdRef.current = null;
          });
        } catch {
          setFeedback({
            tone: "error",
            text: "انقطع تأكيد بدء المراجعة. أعد المحاولة دون تغيير الصفحة؛ سيستخدم النظام رقم المحاولة نفسه بأمان.",
          });
        }
      })();
    });
  }

  function submitInspectionRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;
    if (!selectedCenterId) {
      setFeedback({ tone: "error", text: "اختر مركز الفحص قبل المتابعة." });
      return;
    }
    if (!requestInspectionIdRef.current) requestInspectionIdRef.current = crypto.randomUUID();
    const requestId = requestInspectionIdRef.current;

    startTransition(() => {
      void (async () => {
        try {
          const result = await requestClaimInspection({
            requestId,
            claimId,
            centerPartyId: selectedCenterId,
          });
          handleResult(result, "تم تكليف مركز الفحص وتثبيت المهمة رسميًا على المطالبة.", () => {
            requestInspectionIdRef.current = null;
          });
        } catch {
          setFeedback({
            tone: "error",
            text: "انقطع تأكيد طلب الفحص. أعد الإرسال دون تغيير المركز؛ سيستخدم النظام رقم المحاولة نفسه بأمان.",
          });
        }
      })();
    });
  }

  function submitReassignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;
    const reason = reassignReason.trim();
    if (!selectedCenterId) {
      setFeedback({ tone: "error", text: "اختر مركزًا بديلًا قبل المتابعة." });
      return;
    }
    if (reason.length < 5 || reason.length > 500) {
      setFeedback({ tone: "error", text: "اكتب سبب إعادة التعيين بوضوح من 5 إلى 500 حرف." });
      return;
    }
    if (!reassignRequestIdRef.current) reassignRequestIdRef.current = crypto.randomUUID();
    const requestId = reassignRequestIdRef.current;

    startTransition(() => {
      void (async () => {
        try {
          const result = await reassignClaimInspection({
            requestId,
            claimId,
            centerPartyId: selectedCenterId,
            reason,
          });
          handleResult(result, "تم نقل مهمة الفحص إلى المركز البديل وتسجيل سبب إعادة التعيين.", () => {
            reassignRequestIdRef.current = null;
          });
        } catch {
          setFeedback({
            tone: "error",
            text: "انقطع تأكيد إعادة التعيين. أعد التنفيذ بنفس المركز والسبب؛ سيستخدم النظام رقم المحاولة نفسه بأمان.",
          });
        }
      })();
    });
  }

  const selector = (options: ClaimInspectionCenterOption[], label: string) => (
    <label className={styles.field}>
      <span>{label}</span>
      <select
        value={selectedCenterId}
        disabled={isPending}
        required
        onChange={(event) => {
          requestInspectionIdRef.current = null;
          reassignRequestIdRef.current = null;
          setFeedback(null);
          setSelectedCenterId(event.target.value);
        }}
      >
        <option value="">اختر مركزًا…</option>
        {options.map((center) => (
          <option value={center.centerPartyId} key={center.centerPartyId}>
            {centerLabel(center)}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <section className={styles.stack} aria-label={`إجراءات مراجعة المطالبة ${claimNumber}`}>
      {feedback ? <FeedbackBanner tone={feedback.tone}>{feedback.text}</FeedbackBanner> : null}

      <section className={styles.card}>
        <div className={styles.heading}>
          <div>
            <span className={styles.eyebrow}>Cube Q · Admin workflow</span>
            <h2>إجراءات المراجعة والفحص</h2>
          </div>
        </div>
        <p className={styles.note}>
          هذه المساحة تنفذ فقط انتقالات المراجعة والتكليف بالفحص. قبول أو رفض أو إلغاء المطالبة ليس جزءًا من هذه الدفعة وسيظهر في مرحلة القرار النهائي لاحقًا.
        </p>

        {claimStatus === "submitted" ? (
          <form className={styles.form} onSubmit={submitStartReview}>
            <p className={styles.note}>
              ابدأ المراجعة لتصبح المطالبة تحت مسؤولية فريق Protection Giants قبل طلب أي فحص أو اتخاذ قرار.
            </p>
            <div className={styles.actions}>
              <ConfirmSubmitButton
                title="بدء مراجعة المطالبة؟"
                description="سيتم نقل المطالبة من جديدة إلى قيد المراجعة وتسجيل الحدث باسم حساب Admin الحالي."
                confirmLabel="بدء المراجعة"
                tone="primary"
                disabled={isPending}
              >
                {isPending ? "جاري التنفيذ…" : "بدء المراجعة"}
              </ConfirmSubmitButton>
            </div>
          </form>
        ) : null}

        {claimStatus === "under_review" && !inspectionId ? (
          centers.length > 0 ? (
            <form className={styles.form} onSubmit={submitInspectionRequest}>
              <div className={styles.notice}>
                القائمة تضم فقط مركزًا نشطًا لديه حساب Center نشط واحد على الأقل. اعتماد الشبكة معلومة تصنيفية وليس شرطًا لصلاحية تكليف الفحص.
              </div>
              {selector(centers, "مركز الفحص")}
              <div className={styles.actions}>
                <ConfirmSubmitButton
                  title="تأكيد طلب الفحص؟"
                  description="سيتم إنشاء الفحص الرسمي الوحيد لهذه المطالبة وتكليف المركز المختار بالمهمة."
                  confirmLabel="تأكيد التكليف"
                  tone="primary"
                  disabled={isPending || !selectedCenterId}
                >
                  {isPending ? "جاري التكليف…" : "طلب فحص رسمي"}
                </ConfirmSubmitButton>
              </div>
            </form>
          ) : (
            <FeedbackBanner tone="warning">
              لا يوجد حاليًا مركز نشط لديه حساب Center نشط يمكن تكليفه بالفحص. لا يتم إنشاء مهمة غير قابلة للتنفيذ.
            </FeedbackBanner>
          )
        ) : null}

        {claimStatus === "under_review" && inspectionId && inspectionStatus === "submitted" ? (
          <FeedbackBanner tone="info">
            تم استلام نتيجة الفحص وعادت المطالبة إلى قيد المراجعة. الخطوة التالية هي القرار النهائي، وهي خارج Q6 الحالية.
          </FeedbackBanner>
        ) : null}

        {claimStatus === "awaiting_inspection" && inspectionStatus === "requested" ? (
          <div className={styles.form}>
            <div className={styles.currentAssignment}>
              <span>المركز المكلف حاليًا</span>
              <strong>{currentCenterName ?? "غير متاح"}</strong>
            </div>
            {alternativeCenters.length > 0 ? (
              <form className={styles.form} onSubmit={submitReassignment}>
                {selector(alternativeCenters, "المركز البديل")}
                <label className={styles.field}>
                  <span>سبب إعادة التعيين</span>
                  <textarea
                    value={reassignReason}
                    minLength={5}
                    maxLength={500}
                    rows={3}
                    required
                    disabled={isPending}
                    placeholder="مثال: المركز الحالي لا يستطيع تنفيذ الفحص خلال المدة المطلوبة."
                    onChange={(event) => {
                      reassignRequestIdRef.current = null;
                      setFeedback(null);
                      setReassignReason(event.target.value);
                    }}
                  />
                </label>
                <div className={styles.actions}>
                  <ConfirmSubmitButton
                    title="تأكيد إعادة تعيين مركز الفحص؟"
                    description="ستنتقل مهمة الفحص الرسمية إلى المركز البديل، وسيُحفظ المركز السابق والجديد وسبب النقل في Timeline المطالبة."
                    confirmLabel="تأكيد إعادة التعيين"
                    tone="primary"
                    disabled={isPending || !selectedCenterId || reassignReason.trim().length < 5}
                  >
                    {isPending ? "جاري النقل…" : "إعادة تعيين المركز"}
                  </ConfirmSubmitButton>
                </div>
              </form>
            ) : (
              <FeedbackBanner tone="info">
                لا يوجد مركز بديل قابل للتكليف حاليًا. تظل المهمة مع المركز الحالي حتى تقديم الفحص أو توفر مركز صالح آخر.
              </FeedbackBanner>
            )}
          </div>
        ) : null}

        {!["submitted", "under_review", "awaiting_inspection"].includes(claimStatus) ? (
          <FeedbackBanner tone="info">
            لا توجد إجراءات مراجعة أو تكليف بالفحص متاحة لهذه الحالة. هذه الصفحة لا تنفذ إجراءات القرار النهائي أو Cube R.
          </FeedbackBanner>
        ) : null}
      </section>
    </section>
  );
}
