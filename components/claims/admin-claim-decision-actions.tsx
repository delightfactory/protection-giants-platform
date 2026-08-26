"use client";

import { FormEvent, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  approveClaimDecision,
  cancelClaimDecision,
  rejectClaimDecision,
  reopenClaimDecisionForCorrection,
  type ClaimDecisionActionResult,
} from "@/app/operations/claims/decision-actions";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import styles from "./admin-claim-decision-actions.module.css";

type Feedback = { tone: "error" | "warning" | "success" | "info"; text: string } | null;
type DecisionKind = "approve" | "reject" | "cancel";
type DecisionDraft = { reason: string; customerMessage: string };

type AdminClaimDecisionActionsProps = {
  claimId: string;
  claimNumber: string;
  claimStatus: string;
  inspectionStatus: string | null;
  resolutionId: string | null;
  resolutionStatus: string | null;
};

const stateRaceCodes = new Set([
  "PG_CLAIM_DECISION_STATE_INVALID",
  "PG_CLAIM_INSPECTION_PENDING",
  "PG_CLAIM_RESOLUTION_EXISTS",
  "PG_CLAIM_CANCEL_STATE_INVALID",
  "PG_CLAIM_APPROVAL_ALREADY_IN_EXECUTION",
  "PG_CLAIM_REOPEN_STATE_INVALID",
  "PG_CLAIM_REOPEN_RESOLUTION_EXISTS",
  "PG_CLAIM_REOPEN_LATER_CLAIM_EXISTS",
  "PG_CLAIM_REOPEN_INSPECTION_STATE_INVALID",
]);

const errorMessages: Record<string, string> = {
  PG_CLAIM_DECISION_REQUEST_INVALID: "تعذر تجهيز رقم محاولة آمن للقرار. أعد فتح الصفحة ثم حاول مرة أخرى.",
  PG_CLAIM_CANCEL_REQUEST_INVALID: "تعذر تجهيز رقم محاولة آمن للإلغاء. أعد فتح الصفحة ثم حاول مرة أخرى.",
  PG_CLAIM_REOPEN_REQUEST_INVALID: "تعذر تجهيز رقم محاولة آمن للتصحيح. أعد فتح الصفحة ثم حاول مرة أخرى.",
  PG_CLAIM_DECISION_TEXT_INVALID: "سبب القرار ورسالة العميل مطلوبان، وكل منهما من 5 إلى 1000 حرف.",
  PG_CLAIM_REOPEN_REASON_INVALID: "اكتب سبب التصحيح بوضوح من 5 إلى 500 حرف.",
  PG_CLAIM_ACTION_REQUEST_CONFLICT: "رقم المحاولة نفسه استُخدم بمدخلات مختلفة. راجع الحالة وابدأ محاولة جديدة.",
  PG_CLAIM_NOT_FOUND: "لم تعد المطالبة متاحة في النطاق الحالي.",
  PG_CLAIM_WARRANTY_INVALID: "سجل الضمان المرتبط لم يعد صالحًا لهذا الإجراء.",
  PG_CLAIM_DECISION_STATE_INVALID: "حالة المطالبة تغيّرت ولم يعد القبول أو الرفض متاحًا بهذه الصورة.",
  PG_CLAIM_INSPECTION_PENDING: "يوجد فحص رسمي ما زال قيد التنفيذ. لا يمكن القبول أو الرفض قبل تقديمه؛ يمكن الإلغاء فقط إذا كان ذلك هو القرار المقصود.",
  PG_CLAIM_RESOLUTION_EXISTS: "يوجد بالفعل Resolution مرتبط بهذه المطالبة، لذلك لا يمكن إنشاء قرار قبول جديد.",
  PG_CLAIM_APPROVAL_RESOLUTION_MISSING: "سجل قبول سابق لا يملك Resolution المتوقع. أوقف الإجراء وراجع مسؤول النظام.",
  PG_CLAIM_CANCEL_STATE_INVALID: "حالة المطالبة تغيّرت ولم يعد الإلغاء متاحًا.",
  PG_CLAIM_APPROVAL_ALREADY_IN_EXECUTION: "بدأ تنفيذ المعالجة المرتبطة بالقبول؛ لا يمكن إلغاء القبول من Cube Q بعد هذه النقطة.",
  PG_CLAIM_APPROVAL_EVENT_MISSING: "تعذر العثور على حدث القبول المرجعي. أوقف الإجراء وراجع مسؤول النظام.",
  PG_CLAIM_RESOLUTION_UNEXPECTED: "وجد النظام Resolution في حالة لا تسمح بهذا الإلغاء. أوقف الإجراء وراجع مسؤول النظام.",
  PG_CLAIM_REOPEN_STATE_INVALID: "هذه المطالبة ليست في حالة مغلقة تسمح بتصحيح القرار.",
  PG_CLAIM_REOPEN_RESOLUTION_EXISTS: "لا يمكن إعادة فتح هذا القرار لأن المطالبة لها Resolution تاريخي. هذا يشمل إلغاء قبول سابق قبل التنفيذ.",
  PG_CLAIM_REOPEN_LATER_CLAIM_EXISTS: "لا يمكن إعادة فتح القرار لأن هناك مطالبة أحدث على نفس الضمان.",
  PG_CLAIM_REOPEN_INSPECTION_STATE_INVALID: "حالة الفحص الباقي لا تتوافق مع مسار التصحيح المسموح.",
  PG_CLAIM_REOPEN_DECISION_EVENT_MISSING: "تعذر العثور على حدث القرار المغلق المطلوب للتصحيح. أوقف الإجراء وراجع مسؤول النظام.",
  PG_CLAIM_ADMIN_REQUIRED: "هذا الإجراء متاح لحساب Admin نشط فقط.",
  PG_CLAIM_FORBIDDEN: "لا تملك صلاحية تنفيذ هذا الإجراء.",
  PG_WARRANTY_ADMIN_REQUIRED: "هذا الإجراء متاح لحساب Admin نشط فقط.",
  PG_CLAIM_DECISION_ACTION_FAILED: "تعذر إكمال القرار الآن. حدّث المطالبة ثم أعد المحاولة، أو راجع مسؤول النظام إذا استمرت المشكلة.",
};

function actionError(code: string) {
  return errorMessages[code] ?? errorMessages.PG_CLAIM_DECISION_ACTION_FAILED;
}

function emptyDraft(): DecisionDraft {
  return { reason: "", customerMessage: "" };
}

export function AdminClaimDecisionActions({
  claimId,
  claimNumber,
  claimStatus,
  inspectionStatus,
  resolutionId,
  resolutionStatus,
}: AdminClaimDecisionActionsProps) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [approveDraft, setApproveDraft] = useState<DecisionDraft>(emptyDraft);
  const [rejectDraft, setRejectDraft] = useState<DecisionDraft>(emptyDraft);
  const [cancelDraft, setCancelDraft] = useState<DecisionDraft>(emptyDraft);
  const [correctionReason, setCorrectionReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const approveRequestIdRef = useRef<string | null>(null);
  const rejectRequestIdRef = useRef<string | null>(null);
  const cancelRequestIdRef = useRef<string | null>(null);
  const reopenRequestIdRef = useRef<string | null>(null);

  const canApproveOrReject = claimStatus === "under_review" && inspectionStatus !== "requested";
  const canCancel = claimStatus === "under_review"
    || claimStatus === "awaiting_inspection"
    || (claimStatus === "approved" && resolutionStatus === "authorized");
  const canReopen = (claimStatus === "rejected" || claimStatus === "cancelled") && resolutionId === null;

  function clearRequestId(kind: DecisionKind | "reopen") {
    if (kind === "approve") approveRequestIdRef.current = null;
    if (kind === "reject") rejectRequestIdRef.current = null;
    if (kind === "cancel") cancelRequestIdRef.current = null;
    if (kind === "reopen") reopenRequestIdRef.current = null;
  }

  function handleResult(result: ClaimDecisionActionResult, kind: DecisionKind | "reopen") {
    if (!result.ok) {
      const tone = stateRaceCodes.has(result.code) ? "warning" : "error";
      setFeedback({ tone, text: actionError(result.code) });
      if (result.code === "PG_CLAIM_ACTION_REQUEST_CONFLICT") clearRequestId(kind);
      if (stateRaceCodes.has(result.code)) router.refresh();
      return;
    }

    clearRequestId(kind);
    router.replace(`/operations/claims/${claimId}`);
    router.refresh();
  }

  function requestIdFor(kind: DecisionKind): string {
    const ref = kind === "approve"
      ? approveRequestIdRef
      : kind === "reject"
        ? rejectRequestIdRef
        : cancelRequestIdRef;
    if (!ref.current) ref.current = crypto.randomUUID();
    return ref.current!;
  }

  function submitDecision(kind: DecisionKind, draft: DecisionDraft, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;

    const reason = draft.reason.trim();
    const customerMessage = draft.customerMessage.trim();
    if (
      reason.length < 5
      || reason.length > 1000
      || customerMessage.length < 5
      || customerMessage.length > 1000
    ) {
      setFeedback({ tone: "error", text: errorMessages.PG_CLAIM_DECISION_TEXT_INVALID });
      return;
    }

    const requestId = requestIdFor(kind);
    const action = kind === "approve"
      ? approveClaimDecision
      : kind === "reject"
        ? rejectClaimDecision
        : cancelClaimDecision;

    startTransition(() => {
      void (async () => {
        try {
          const result = await action({ requestId, claimId, reason, customerMessage });
          handleResult(result, kind);
        } catch {
          setFeedback({
            tone: "error",
            text: "انقطع تأكيد القرار. أعد المحاولة دون تغيير النصوص؛ سيستخدم النظام رقم المحاولة نفسه بأمان.",
          });
        }
      })();
    });
  }

  function submitCorrection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;

    const reason = correctionReason.trim();
    if (reason.length < 5 || reason.length > 500) {
      setFeedback({ tone: "error", text: errorMessages.PG_CLAIM_REOPEN_REASON_INVALID });
      return;
    }

    if (!reopenRequestIdRef.current) reopenRequestIdRef.current = crypto.randomUUID();
    const requestId = reopenRequestIdRef.current;

    startTransition(() => {
      void (async () => {
        try {
          const result = await reopenClaimDecisionForCorrection({ requestId, claimId, reason });
          handleResult(result, "reopen");
        } catch {
          setFeedback({
            tone: "error",
            text: "انقطع تأكيد إعادة الفتح. أعد المحاولة بنفس السبب؛ سيستخدم النظام رقم المحاولة نفسه بأمان.",
          });
        }
      })();
    });
  }

  function updateDraft(kind: DecisionKind, field: keyof DecisionDraft, value: string) {
    clearRequestId(kind);
    setFeedback(null);
    const updater = (current: DecisionDraft) => ({ ...current, [field]: value });
    if (kind === "approve") setApproveDraft(updater);
    if (kind === "reject") setRejectDraft(updater);
    if (kind === "cancel") setCancelDraft(updater);
  }

  function decisionForm(
    kind: DecisionKind,
    title: string,
    description: string,
    draft: DecisionDraft,
    buttonLabel: string,
    confirmTitle: string,
    confirmDescription: string,
    tone: "danger" | "primary",
  ) {
    return (
      <form className={styles.form} onSubmit={(event) => submitDecision(kind, draft, event)}>
        <div className={styles.formHeading}>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <label className={styles.field}>
          <span>سبب القرار الداخلي</span>
          <textarea
            value={draft.reason}
            minLength={5}
            maxLength={1000}
            rows={3}
            required
            disabled={isPending}
            placeholder="اكتب الأساس المهني للقرار كما يجب أن يظهر في سجل التدقيق."
            onChange={(event) => updateDraft(kind, "reason", event.target.value)}
          />
        </label>
        <label className={styles.field}>
          <span>رسالة القرار للعميل</span>
          <textarea
            value={draft.customerMessage}
            minLength={5}
            maxLength={1000}
            rows={3}
            required
            disabled={isPending}
            placeholder="اكتب الرسالة الواضحة التي ستُحفظ كرسالة القرار للعميل."
            onChange={(event) => updateDraft(kind, "customerMessage", event.target.value)}
          />
        </label>
        <p className={styles.deliveryNote}>
          حفظ رسالة العميل هنا لا يرسل إشعارًا في هذا الـcheckpoint؛ دمج الإشعارات يأتي في increment مستقل.
        </p>
        <div className={styles.actions}>
          <ConfirmSubmitButton
            title={confirmTitle}
            description={confirmDescription}
            confirmLabel={buttonLabel}
            tone={tone}
            disabled={isPending || draft.reason.trim().length < 5 || draft.customerMessage.trim().length < 5}
          >
            {isPending ? "جاري التنفيذ…" : buttonLabel}
          </ConfirmSubmitButton>
        </div>
      </form>
    );
  }

  const noActions = !canApproveOrReject && !canCancel && !canReopen;

  return (
    <section className={styles.stack} aria-label={`القرار النهائي للمطالبة ${claimNumber}`}>
      {feedback ? <FeedbackBanner tone={feedback.tone}>{feedback.text}</FeedbackBanner> : null}

      <section className={styles.card}>
        <div className={styles.heading}>
          <div>
            <span className={styles.eyebrow}>Cube Q · Admin final decision</span>
            <h2>القرار النهائي والتصحيح المحدود</h2>
          </div>
        </div>
        <p className={styles.note}>
          هذه المساحة تنفذ القرار فقط بعد قراءة سجل المطالبة والمرفقات والـTimeline. قاعدة البيانات تظل المصدر الحاكم للحالة وتمنع أي انتقال غير مسموح.
        </p>

        {claimStatus === "submitted" ? (
          <FeedbackBanner tone="warning">
            لا يمكن اتخاذ قرار قبل بدء المراجعة. استخدم مساحة إجراءات المراجعة أولًا.
          </FeedbackBanner>
        ) : null}

        {claimStatus === "awaiting_inspection" && inspectionStatus === "requested" ? (
          <FeedbackBanner tone="info">
            الفحص الرسمي ما زال مطلوبًا. القبول والرفض غير متاحين قبل تقديم الفحص؛ يظل الإلغاء الإداري متاحًا إذا كان هو القرار المقصود.
          </FeedbackBanner>
        ) : null}

        {canApproveOrReject ? (
          <div className={styles.decisionGrid}>
            {decisionForm(
              "approve",
              "قبول المطالبة",
              "ينقل المطالبة إلى Approved وينشئ Resolution واحدًا بحالة authorized لتسليمه لاحقًا إلى Cube R.",
              approveDraft,
              "قبول المطالبة",
              "تأكيد قبول المطالبة؟",
              "سيُثبت سبب القرار ورسالة العميل، وسيُنشأ Resolution رسمي واحد. لا يبدأ تنفيذ المعالجة داخل Cube Q.",
              "primary",
            )}
            {decisionForm(
              "reject",
              "رفض المطالبة",
              "يغلق المطالبة بالرفض بدون إنشاء Resolution، مع حفظ سبب القرار ورسالة العميل في سجل التدقيق.",
              rejectDraft,
              "رفض المطالبة",
              "تأكيد رفض المطالبة؟",
              "سيتم إغلاق المطالبة كـRejected. يمكن فقط استخدام مسار التصحيح المحدود PD-078 إذا ظلت شروطه متحققة.",
              "danger",
            )}
          </div>
        ) : null}

        {canCancel ? (
          <div className={styles.cancelSection}>
            {decisionForm(
              "cancel",
              claimStatus === "approved" ? "إلغاء قبول قبل التنفيذ" : "إلغاء المطالبة",
              claimStatus === "awaiting_inspection"
                ? "يلغي المطالبة إداريًا مع إبقاء سجل طلب الفحص التاريخي. إذا صُحح القرار لاحقًا وفق PD-078، يعود نفس الفحص المطلوب بدل إنشاء فحص ثانٍ."
                : claimStatus === "approved"
                  ? "متاح فقط طالما Resolution ما زال authorized ولم يبدأ Cube R في التنفيذ. بعد بدء التنفيذ تمنع قاعدة البيانات الإلغاء من Cube Q."
                  : "يغلق المطالبة إداريًا بدون Resolution. يظل سجل السبب ورسالة العميل محفوظًا بالكامل.",
              cancelDraft,
              claimStatus === "approved" ? "إلغاء القبول" : "إلغاء المطالبة",
              claimStatus === "approved" ? "تأكيد إلغاء القبول قبل التنفيذ؟" : "تأكيد إلغاء المطالبة؟",
              claimStatus === "approved"
                ? "سيتم إلغاء المطالبة فقط إذا كان Resolution ما زال untouched/authorized. أي بدء تنفيذ يمنع العملية تلقائيًا."
                : "سيتم إغلاق المطالبة كـCancelled وتسجيل السبب ورسالة العميل في الـTimeline.",
              "danger",
            )}
          </div>
        ) : null}

        {canReopen ? (
          <form className={styles.form} onSubmit={submitCorrection}>
            <div className={styles.formHeading}>
              <h3>تصحيح قرار سابق · PD-078</h3>
              <p>
                هذا ليس Undo عامًا. يعيد فقط أحدث مطالبة مرفوضة أو ملغاة بلا Resolution وبلا مطالبة أحدث على نفس الضمان. وإذا كان الإلغاء حدث أثناء فحص مطلوب، يعود نفس الفحص إلى مساره القابل للتنفيذ.
              </p>
            </div>
            <label className={styles.field}>
              <span>سبب إعادة فتح القرار</span>
              <textarea
                value={correctionReason}
                minLength={5}
                maxLength={500}
                rows={3}
                required
                disabled={isPending}
                placeholder="اشرح الخطأ في القرار السابق وسبب الحاجة إلى إعادة فتحه للتصحيح."
                onChange={(event) => {
                  reopenRequestIdRef.current = null;
                  setFeedback(null);
                  setCorrectionReason(event.target.value);
                }}
              />
            </label>
            <div className={styles.actions}>
              <ConfirmSubmitButton
                title="إعادة فتح القرار للتصحيح؟"
                description="ستبقى أحداث القرار السابق غير قابلة للتعديل، وسيُسجل حدث تصحيح جديد. قاعدة البيانات تتحقق من كل حدود PD-078 قبل التنفيذ."
                confirmLabel="إعادة الفتح للتصحيح"
                tone="danger"
                disabled={isPending || correctionReason.trim().length < 5}
              >
                {isPending ? "جاري التنفيذ…" : "إعادة الفتح للتصحيح"}
              </ConfirmSubmitButton>
            </div>
          </form>
        ) : null}

        {(claimStatus === "rejected" || claimStatus === "cancelled") && resolutionId !== null ? (
          <FeedbackBanner tone="info">
            لا يتاح PD-078 لهذه المطالبة لأنها تحمل Resolution تاريخيًا؛ لا يُفتح مسار تصحيح عام بعد قبول سابق.
          </FeedbackBanner>
        ) : null}

        {claimStatus === "approved" && resolutionStatus !== "authorized" ? (
          <FeedbackBanner tone="info">
            القرار مقبول لكن Resolution لم يعد في مرحلة authorized القابلة للإلغاء من Cube Q. لا توجد إجراءات قرار أخرى هنا.
          </FeedbackBanner>
        ) : null}

        {noActions && !["submitted", "approved", "rejected", "cancelled"].includes(claimStatus) ? (
          <FeedbackBanner tone="info">لا توجد إجراءات قرار نهائي متاحة للحالة الحالية.</FeedbackBanner>
        ) : null}
      </section>
    </section>
  );
}
