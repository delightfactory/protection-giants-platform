"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  markRollPreinstallIssueReportedInError,
  resolveRollPreinstallIssue,
} from "@/app/operations/rolls/issues/actions";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import styles from "./roll-preinstall-issue-decision-panel.module.css";

const errorMessages: Record<string, string> = {
  PG_ROLL_ISSUE_ACTOR_INACTIVE: "حساب الإدارة أو جهة الشركة غير نشطة حاليًا.",
  PG_ROLL_ISSUE_ADMIN_REQUIRED: "قرار البلاغ متاح لحساب إدارة الشركة فقط.",
  PG_ROLL_ISSUE_RESOLUTION_REASON_INVALID: "اكتب سبب قرار واضحًا من 5 إلى 500 حرف.",
  PG_ROLL_ISSUE_ALREADY_RESOLVED: "تم حسم هذا البلاغ بالفعل. أعد تحميل الصفحة لعرض الحالة النهائية.",
  PG_ROLL_ISSUE_REQUEST_CONFLICT: "تعذر إعادة استخدام نفس محاولة القرار لأن بياناتها تغيّرت. أعد تحميل الصفحة قبل أي إجراء آخر.",
  PG_ROLL_ISSUE_NOT_FOUND: "لم يعد البلاغ متاحًا لهذا الحساب.",
  PG_ROLL_ISSUE_FAILED: "تعذر حفظ القرار الآن. أعد المحاولة بنفس القرار والسبب.",
};

type DecisionKind = "cleared_for_use" | "return_required" | "reported_in_error";

const decisionCopy: Record<DecisionKind, { title: string; consequence: string; confirm: string }> = {
  cleared_for_use: {
    title: "السماح باستخدام الرول",
    consequence: "سيُغلق هذا البلاغ كـ«مسموح بالاستخدام»، وسيتوقف هذا البلاغ وحده عن منع تفعيل الضمان. أي شروط تشغيلية أخرى تظل واجبة التحقق.",
    confirm: "تأكيد السماح بالاستخدام",
  },
  return_required: {
    title: "إلزام بإرجاع الرول",
    consequence: "سيصبح قرار الإرجاع نهائيًا، وسيظل الرول محظورًا من تفعيل الضمان. لن تنتقل العهدة تلقائيًا؛ Recovery يتم فقط عند الاستلام المادي.",
    confirm: "تأكيد إلزام الإرجاع",
  },
  reported_in_error: {
    title: "تسجيل أن البلاغ أُنشئ بالخطأ",
    consequence: "سيُغلق الـhold الخاص بهذا البلاغ كتصحيح إداري، مع الاحتفاظ بالبلاغ والأدلة في السجل. هذا ليس قرار جودة بأن الرول سليم.",
    confirm: "تأكيد البلاغ بالخطأ",
  },
};

function decisionError(code: string) {
  return errorMessages[code] ?? "تعذر حسم البلاغ. أعد تحميل الصفحة إذا استمرت المشكلة.";
}

export function RollPreinstallIssueDecisionPanel({ issueId }: { issueId: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState<DecisionKind | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const requestRef = useRef<{ kind: DecisionKind; id: string } | null>(null);

  function requestIdFor(kind: DecisionKind) {
    if (!requestRef.current || requestRef.current.kind !== kind) {
      requestRef.current = { kind, id: crypto.randomUUID() };
    }
    return requestRef.current.id;
  }

  function prepareDecision(kind: DecisionKind) {
    if (isPending) return;
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 5 || trimmedReason.length > 500) {
      setFeedback({ tone: "error", text: errorMessages.PG_ROLL_ISSUE_RESOLUTION_REASON_INVALID });
      return;
    }
    requestRef.current = null;
    setFeedback(null);
    setConfirmation(kind);
  }

  function runConfirmedDecision() {
    if (!confirmation || isPending) return;
    const kind = confirmation;
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 5 || trimmedReason.length > 500) {
      setConfirmation(null);
      setFeedback({ tone: "error", text: errorMessages.PG_ROLL_ISSUE_RESOLUTION_REASON_INVALID });
      return;
    }

    const requestId = requestIdFor(kind);
    setFeedback(null);

    startTransition(() => {
      void (async () => {
        try {
          const result = kind === "reported_in_error"
            ? await markRollPreinstallIssueReportedInError({ requestId, issueId, reason: trimmedReason })
            : await resolveRollPreinstallIssue({ requestId, issueId, outcome: kind, reason: trimmedReason });

          if (!result.ok) {
            setFeedback({ tone: "error", text: decisionError(result.code) });
            if (result.code === "PG_ROLL_ISSUE_ALREADY_RESOLVED" || result.code === "PG_ROLL_ISSUE_NOT_FOUND") {
              requestRef.current = null;
              setConfirmation(null);
              router.refresh();
            }
            return;
          }

          requestRef.current = null;
          setConfirmation(null);
          setFeedback({ tone: "success", text: "تم تسجيل القرار النهائي وحفظه في سجل البلاغ." });
          router.refresh();
        } catch {
          setFeedback({
            tone: "error",
            text: "انقطع تأكيد القرار. أعد الضغط على زر التأكيد بنفس السبب؛ النظام سيستخدم نفس هوية المحاولة ولن ينشئ قرارًا ثانيًا.",
          });
        }
      })();
    });
  }

  return (
    <section className={styles.panel} aria-label="قرار الشركة على البلاغ">
      <div>
        <h2>قرار الشركة</h2>
        <p>الحسم نهائي وغير قابل للتعديل. اختيار الإرجاع لا ينقل العهدة تلقائيًا؛ الاسترداد يتم فقط عند الاستلام المادي عبر مساره المنفصل.</p>
      </div>

      {feedback ? <FeedbackBanner tone={feedback.tone}>{feedback.text}</FeedbackBanner> : null}

      <label htmlFor="roll-preinstall-issue-resolution-reason"><strong>سبب القرار</strong></label>
      <textarea
        id="roll-preinstall-issue-resolution-reason"
        className={`input ${styles.reason}`}
        maxLength={500}
        placeholder="اكتب الأساس التشغيلي للقرار بوضوح…"
        value={reason}
        disabled={isPending || confirmation !== null}
        onChange={(event) => {
          setReason(event.target.value);
          requestRef.current = null;
          setFeedback(null);
        }}
      />

      {confirmation ? (
        <div className={styles.confirmation} role="alert">
          <strong>{decisionCopy[confirmation].title}</strong>
          <p>{decisionCopy[confirmation].consequence}</p>
          <div className={styles.actions}>
            <button type="button" className="button button-primary" disabled={isPending} onClick={runConfirmedDecision}>
              {isPending ? "جارٍ تسجيل القرار…" : decisionCopy[confirmation].confirm}
            </button>
            <button
              type="button"
              className="button button-ghost"
              disabled={isPending}
              onClick={() => {
                requestRef.current = null;
                setConfirmation(null);
              }}
            >
              إلغاء والعودة للمراجعة
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className={styles.actions}>
            <button type="button" className="button button-primary" disabled={isPending} onClick={() => prepareDecision("cleared_for_use")}>
              السماح باستخدام الرول
            </button>
            <button type="button" className="button button-secondary" disabled={isPending} onClick={() => prepareDecision("return_required")}>
              يلزم إرجاع الرول
            </button>
          </div>

          <div className={styles.correction}>
            <button type="button" className="button button-ghost" disabled={isPending} onClick={() => prepareDecision("reported_in_error")}>
              تسجيل أن البلاغ أُنشئ بالخطأ
            </button>
          </div>
        </>
      )}
    </section>
  );
}
