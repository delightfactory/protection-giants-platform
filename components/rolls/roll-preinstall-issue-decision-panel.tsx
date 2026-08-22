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

function decisionError(code: string) {
  return errorMessages[code] ?? "تعذر حسم البلاغ. أعد تحميل الصفحة إذا استمرت المشكلة.";
}

export function RollPreinstallIssueDecisionPanel({ issueId }: { issueId: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const requestRef = useRef<{ kind: DecisionKind; id: string } | null>(null);

  function requestIdFor(kind: DecisionKind) {
    if (!requestRef.current || requestRef.current.kind !== kind) {
      requestRef.current = { kind, id: crypto.randomUUID() };
    }
    return requestRef.current.id;
  }

  function runDecision(kind: DecisionKind) {
    if (isPending) return;
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 5 || trimmedReason.length > 500) {
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
              router.refresh();
            }
            return;
          }

          requestRef.current = null;
          setFeedback({ tone: "success", text: "تم تسجيل القرار النهائي وحفظه في سجل البلاغ." });
          router.refresh();
        } catch {
          setFeedback({
            tone: "error",
            text: "انقطع تأكيد القرار. أعد الضغط على نفس القرار بنفس السبب؛ النظام سيستخدم نفس هوية المحاولة ولن ينشئ قرارًا ثانيًا.",
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
        disabled={isPending}
        onChange={(event) => {
          setReason(event.target.value);
          requestRef.current = null;
          setFeedback(null);
        }}
      />

      <div className={styles.actions}>
        <button type="button" className="button button-primary" disabled={isPending} onClick={() => runDecision("cleared_for_use")}>
          {isPending ? "جارٍ تسجيل القرار…" : "السماح باستخدام الرول"}
        </button>
        <button type="button" className="button button-secondary" disabled={isPending} onClick={() => runDecision("return_required")}>
          يلزم إرجاع الرول
        </button>
      </div>

      <div className={styles.correction}>
        <button type="button" className="button button-ghost" disabled={isPending} onClick={() => runDecision("reported_in_error")}>
          تسجيل أن البلاغ أُنشئ بالخطأ
        </button>
      </div>
    </section>
  );
}
