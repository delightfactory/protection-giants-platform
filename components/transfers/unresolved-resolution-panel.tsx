"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  adminReleaseUnreceivedTransferItems,
  releaseUnreceivedTransferItems,
} from "@/app/operations/transfers/[transferId]/actions";
import { AccessibleDialog } from "@/components/ui/accessible-dialog";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  clearTransferActionRequest,
  requestIdForTransferAction,
  transferActionErrorMessage,
  type TransferItem,
  type TransferLotGroup,
} from "@/lib/transfers/receipt";
import styles from "./transfer-detail.module.css";

const PAGE_SIZE = 40;

type LotExpansion = {
  lot_id: string;
  lot_number: string;
  product_code: string;
  product_name: string;
  transfer_count: number;
  received_count: number;
  pending_count: number;
  released_to_sender_count: number;
  pending_roll_ids: string[];
};

export function UnresolvedResolutionPanel({
  transferId,
  lotGroups,
  adminMode,
}: {
  transferId: string;
  lotGroups: TransferLotGroup[];
  adminMode: boolean;
}) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [rows, setRows] = useState<TransferItem[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "error" | "success" | "info"; text: string } | null>(null);
  const [isSubmitting, startTransition] = useTransition();

  const pendingLots = lotGroups.filter((lot) => lot.pending_count > 0);

  const loadRows = useCallback(async (nextPage = 0, rawSearch = search) => {
    setLoading(true);
    setFeedback(null);
    try {
      const { data, error } = await supabase.rpc("list_roll_transfer_items", {
        p_transfer_id: transferId,
        p_search: rawSearch.trim().toUpperCase() || undefined,
        p_status: "pending",
        p_limit: PAGE_SIZE + 1,
        p_offset: nextPage * PAGE_SIZE,
      });
      if (error || !Array.isArray(data)) throw new Error(error?.message ?? "load");
      setRows((data as TransferItem[]).slice(0, PAGE_SIZE));
      setHasNext(data.length > PAGE_SIZE);
      setPage(nextPage);
    } catch {
      setFeedback({ tone: "error", text: "تعذر تحميل اللفات المتبقية. تحقق من الاتصال ثم أعد المحاولة." });
    } finally {
      setLoading(false);
    }
  }, [search, supabase, transferId]);

  async function addLot(lotId: string) {
    setLoading(true);
    setFeedback(null);
    try {
      const { data, error } = await supabase.rpc("expand_roll_transfer_unresolved_lot", {
        p_transfer_id: transferId,
        p_lot_id: lotId,
      });
      if (error || !Array.isArray(data) || data.length !== 1) throw new Error(error?.message ?? "lot");
      const expansion = data[0] as LotExpansion;
      setSelected((current) => {
        const next = new Set(current);
        for (const rollId of expansion.pending_roll_ids) next.add(rollId);
        return next;
      });
      setFeedback({ tone: "info", text: `تم تحديد ${expansion.pending_roll_ids.length} لفة متبقية من Lot ${expansion.lot_number}.` });
    } catch {
      setFeedback({ tone: "error", text: "تعذر تحديث هذه المجموعة. حدّث التحويل ثم أعد المحاولة." });
    } finally {
      setLoading(false);
    }
  }

  function toggleRoll(rollId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(rollId)) next.delete(rollId);
      else next.add(rollId);
      return next;
    });
  }

  function openResolutionConfirmation() {
    if (selected.size === 0 || reason.trim().length < 5) return;
    setFeedback(null);
    setConfirmOpen(true);
  }

  function submitResolution() {
    const rollIds = [...selected];
    const trimmedReason = reason.trim();
    if (rollIds.length === 0 || trimmedReason.length < 5) return;
    setFeedback(null);

    startTransition(async () => {
      try {
        const action = adminMode ? "admin-release" as const : "release" as const;
        const requestId = await requestIdForTransferAction(action, transferId, rollIds, trimmedReason);
        const result = adminMode
          ? await adminReleaseUnreceivedTransferItems({ requestId, transferId, rollIds, reason: trimmedReason })
          : await releaseUnreceivedTransferItems({ requestId, transferId, rollIds, reason: trimmedReason });

        if (!result.ok) {
          setConfirmOpen(false);
          setFeedback({ tone: "error", text: transferActionErrorMessage(result.code) });
          return;
        }

        clearTransferActionRequest(action, transferId);
        setConfirmOpen(false);
        setSelected(new Set());
        setReason("");
        setFeedback({ tone: "success", text: "تم حسم اللفات المحددة مع بقاء عهدتها المؤكدة لدى المرسل." });
        await loadRows(0, search);
        router.refresh();
      } catch {
        setConfirmOpen(false);
        setFeedback({ tone: "error", text: "انقطع الاتصال أثناء التنفيذ. لم نفقد اختيارك؛ أعد المحاولة بنفس البيانات للتحقق بأمان." });
      }
    });
  }

  return (
    <section className={styles.panel}>
      <h2>{adminMode ? "تسوية المتبقي — دعم إداري" : "حسم اللفات التي بقيت لدى المرسل"}</h2>
      <p className={styles.panelIntro}>
        استخدم هذا الإجراء فقط بعد التأكد الفعلي أن اللفات المحددة لم تصل للمستلم وبقيت أو عادت للمرسل. لا يتم إنشاء حركة عهدة جديدة.
      </p>

      {feedback ? <FeedbackBanner tone={feedback.tone}>{feedback.text}</FeedbackBanner> : null}

      <div className={styles.lotList}>
        {pendingLots.map((lot) => (
          <div className={styles.lotCard} key={lot.lot_id}>
            <div className={styles.lotTop}>
              <div>
                <strong>{lot.product_name}</strong>
                <code>{lot.lot_number}</code>
              </div>
              <button type="button" className="button button-ghost" disabled={loading || isSubmitting} onClick={() => void addLot(lot.lot_id)}>
                تحديد المتبقي ({lot.pending_count})
              </button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
        <form onSubmit={(event) => { event.preventDefault(); void loadRows(0, search); }} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 8 }}>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="ابحث برقم Roll أو ERP أو Lot"
            aria-label="بحث في اللفات المتبقية"
            style={{ minHeight: 46, border: "1px solid var(--line)", borderRadius: 10, background: "var(--surface-0)", color: "var(--text-primary)", padding: "0 12px" }}
          />
          <button className="button button-ghost" type="submit" disabled={loading}>عرض اللفات</button>
        </form>

        {rows.map((row) => (
          <label key={row.roll_id} className={styles.lotCard} style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
            <input type="checkbox" checked={selected.has(row.roll_id)} onChange={() => toggleRoll(row.roll_id)} />
            <span style={{ minWidth: 0 }}>
              <strong style={{ display: "block" }}>{row.product_name}</strong>
              <code style={{ direction: "ltr", overflowWrap: "anywhere" }}>{row.serial_number}</code>
              <small style={{ display: "block", color: "var(--text-tertiary)" }}>{row.lot_number}</small>
            </span>
          </label>
        ))}

        {rows.length > 0 ? (
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <button type="button" className="button button-ghost" disabled={page === 0 || loading} onClick={() => void loadRows(page - 1, search)}>السابق</button>
            <button type="button" className="button button-ghost" disabled={!hasNext || loading} onClick={() => void loadRows(page + 1, search)}>التالي</button>
          </div>
        ) : null}
      </div>

      <div style={{ marginTop: 16, display: "grid", gap: 9 }}>
        <strong>محدد للحسم: {selected.size}</strong>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="اكتب سببًا واضحًا يؤكد لماذا هذه اللفات بقيت/عادت للمرسل…"
          maxLength={500}
          style={{ width: "100%", minHeight: 100, resize: "vertical", padding: 12, border: "1px solid var(--line)", borderRadius: 10, background: "var(--surface-0)", color: "var(--text-primary)", font: "inherit" }}
        />
        <button type="button" className="button button-primary" disabled={selected.size === 0 || reason.trim().length < 5 || isSubmitting} onClick={openResolutionConfirmation}>
          {`مراجعة حسم ${selected.size} لفة`}
        </button>
      </div>

      <AccessibleDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        titleId="resolution-confirm-title"
        descriptionId="resolution-confirm-description"
        busy={isSubmitting}
      >
        {confirmOpen ? (
          <section className={styles.sheet}>
            <div className={styles.sheetHeader}>
              <div>
                <span className={styles.eyebrow}>{adminMode ? "حسم إداري موثق" : "حسم نهائي للمتبقي"}</span>
                <h2 id="resolution-confirm-title">تأكيد حسم {selected.size} لفة؟</h2>
              </div>
              <button type="button" className={styles.close} onClick={() => setConfirmOpen(false)} disabled={isSubmitting} aria-label="إغلاق">×</button>
            </div>
            <p>
              سيتم تحرير حجز {selected.size} لفة من هذا التحويل، ولن تُنشأ حركة عهدة جديدة؛ ستظل العهدة المؤكدة لهذه اللفات لدى المرسل.
            </p>
            <p id="resolution-confirm-description">هذا الحسم نهائي داخل التحويل ولا يمكن التراجع عنه من هذه الشاشة.</p>
            <div className={styles.sheetActions}>
              <button type="button" className="button button-ghost" onClick={() => setConfirmOpen(false)} disabled={isSubmitting} data-dialog-initial-focus>رجوع</button>
              <button type="button" className="button button-primary" onClick={submitResolution} disabled={isSubmitting}>
                {isSubmitting ? "جارٍ التحقق والحسم…" : `نعم، احسم ${selected.size} لفة`}
              </button>
            </div>
          </section>
        ) : null}
      </AccessibleDialog>
    </section>
  );
}
