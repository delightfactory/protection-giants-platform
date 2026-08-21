"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  adminRecoveryCancelTransfer,
  cancelTransfer,
  rejectTransfer,
} from "@/app/operations/transfers/[transferId]/actions";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { transferActionErrorMessage } from "@/lib/transfers/receipt";
import styles from "./transfer-detail.module.css";

type ActionKind = "cancel" | "reject" | "admin-recovery";

const actionCopy: Record<ActionKind, { title: string; body: string; confirm: string }> = {
  cancel: {
    title: "إلغاء التحويل؟",
    body: "سيتم تحرير حجز كل اللفات قبل أي استلام، وستبقى العهدة المؤكدة لدى الجهة المرسلة.",
    confirm: "تأكيد الإلغاء",
  },
  reject: {
    title: "رفض التحويل؟",
    body: "استخدم الرفض فقط إذا لم تستلم أي لفة من هذا التحويل. سيُحرر الحجز وتبقى العهدة لدى المرسل.",
    confirm: "تأكيد الرفض",
  },
  "admin-recovery": {
    title: "إلغاء إداري للتحويل؟",
    body: "هذا مسار دعم استثنائي لتحويل معلّق مع جهة موقوفة. لا ينقل العهدة ولا يمثل أي طرف تجاري.",
    confirm: "تأكيد الإلغاء الإداري",
  },
};

export function TransferDetailActions({
  transferId,
  canCancel,
  canReject,
  canAdminRecoveryCancel,
}: {
  transferId: string;
  canCancel: boolean;
  canReject: boolean;
  canAdminRecoveryCancel: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<ActionKind | null>(null);
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!pending) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isPending) setPending(null);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [pending, isPending]);

  if (!canCancel && !canReject && !canAdminRecoveryCancel) return null;

  function submit() {
    if (!pending) return;
    setFeedback(null);
    startTransition(async () => {
      const result = pending === "cancel"
        ? await cancelTransfer(transferId)
        : pending === "reject"
          ? await rejectTransfer(transferId)
          : await adminRecoveryCancelTransfer({ transferId, reason });

      if (!result.ok) {
        setFeedback(transferActionErrorMessage(result.code));
        return;
      }

      setPending(null);
      setReason("");
      router.refresh();
    });
  }

  return (
    <>
      <section className={`${styles.panel} ${styles.actionPanel}`}>
        <div>
          <h2>إجراءات التحويل</h2>
          <p className={styles.panelIntro}>تظهر فقط الإجراءات المسموح بها في الحالة الحالية.</p>
        </div>
        {feedback ? <FeedbackBanner tone="error">{feedback}</FeedbackBanner> : null}
        <div className={styles.actionButtons}>
          {canCancel ? <button type="button" className={`button button-ghost ${styles.danger}`} onClick={() => setPending("cancel")}>إلغاء التحويل</button> : null}
          {canReject ? <button type="button" className={`button button-ghost ${styles.danger}`} onClick={() => setPending("reject")}>رفض التحويل</button> : null}
          {canAdminRecoveryCancel ? <button type="button" className="button button-ghost" onClick={() => setPending("admin-recovery")}>إلغاء إداري موثّق</button> : null}
        </div>
      </section>

      {pending ? (
        <div className={styles.backdrop} role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !isPending) setPending(null);
        }}>
          <section className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="transfer-action-title">
            <div className={styles.sheetHeader}>
              <h2 id="transfer-action-title">{actionCopy[pending].title}</h2>
              <button type="button" className={styles.close} onClick={() => setPending(null)} disabled={isPending} aria-label="إغلاق">×</button>
            </div>
            <p>{actionCopy[pending].body}</p>
            {pending === "admin-recovery" ? (
              <label>
                <span className="sr-only">سبب الإلغاء الإداري</span>
                <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="اكتب سببًا تشغيليًا واضحًا للتوثيق…" maxLength={500} />
              </label>
            ) : null}
            <div className={styles.sheetActions}>
              <button type="button" className="button button-ghost" onClick={() => setPending(null)} disabled={isPending}>رجوع</button>
              <button type="button" className="button button-primary" onClick={submit} disabled={isPending || (pending === "admin-recovery" && reason.trim().length < 5)}>
                {isPending ? "جارٍ التنفيذ…" : actionCopy[pending].confirm}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
