"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { receiveTransferItems } from "@/app/operations/transfers/[transferId]/actions";
import { QrScannerSheet, type ScannerDecodeOutcome } from "@/components/transfers/qr-scanner-sheet";
import { AccessibleDialog } from "@/components/ui/accessible-dialog";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { StatusBadge } from "@/components/ui/status-badge";
import { normalizeRollSerial, parseRollQrPayload } from "@/lib/rolls/roll-qr";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { MAX_TRANSFER_RECEIPT_ROLLS, planReceiptLotSelection } from "@/lib/transfers/receipt-selection";
import {
  clearTransferActionRequest,
  receiptDraftStorageKey,
  requestIdForTransferAction,
  transferActionErrorMessage,
  transferItemStatusLabel,
  type ReceiptLotExpansion,
  type TransferDetail,
  type TransferItem,
} from "@/lib/transfers/receipt";
import styles from "./transfer-receipt-flow.module.css";

const PAGE_SIZE = 40;
type Mode = "scan" | "expected" | "lots";
type Stage = "verify" | "review" | "success";

type InlineFeedback = { tone: "success" | "warning" | "error" | "info"; text: string };
type SelectionDetail = Pick<TransferItem, "roll_id" | "serial_number" | "lot_id" | "lot_number" | "product_name">;
type LotSelectionConfirmation = {
  lot: ReceiptLotExpansion;
};
type ReceiptOutcome = {
  receivedCount: number;
  remainingCount: number;
  completedTransfer: boolean;
};

export function TransferReceiptFlow({
  detail,
  publicSiteOrigin,
}: {
  detail: TransferDetail;
  publicSiteOrigin: string;
}) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("scan");
  const [stage, setStage] = useState<Stage>("verify");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [selectionDetails, setSelectionDetails] = useState<Map<string, SelectionDetail>>(() => new Map());
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [manualSerial, setManualSerial] = useState("");
  const [feedback, setFeedback] = useState<InlineFeedback | null>(null);
  const [rows, setRows] = useState<TransferItem[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lotConfirmation, setLotConfirmation] = useState<LotSelectionConfirmation | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [receiptOutcome, setReceiptOutcome] = useState<ReceiptOutcome | null>(null);
  const [isSubmitting, startTransition] = useTransition();
  const selectionRef = useRef(selected);
  selectionRef.current = selected;

  const selectedCount = selected.size;
  const afterReceiptRemaining = Math.max(0, detail.pending_count - selectedCount);
  const finalReceipt = selectedCount > 0 && selectedCount === detail.pending_count;
  const lotSelectionPlan = useMemo(
    () => lotConfirmation
      ? planReceiptLotSelection(selected, lotConfirmation.lot.pending_roll_ids)
      : null,
    [lotConfirmation, selected],
  );

  useEffect(() => {
    let active = true;
    async function hydrateDraft() {
      let candidate: string[] = [];
      try {
        const parsed = JSON.parse(sessionStorage.getItem(receiptDraftStorageKey(detail.transfer_id)) ?? "[]");
        if (Array.isArray(parsed)) candidate = [...new Set(parsed.filter((value): value is string => typeof value === "string"))].slice(0, MAX_TRANSFER_RECEIPT_ROLLS);
      } catch {
        sessionStorage.removeItem(receiptDraftStorageKey(detail.transfer_id));
      }

      if (candidate.length === 0) {
        if (active) setDraftHydrated(true);
        return;
      }

      try {
        const { data, error } = await supabase.rpc("reconcile_roll_transfer_receipt_selection", {
          p_transfer_id: detail.transfer_id,
          p_roll_ids: candidate,
        });
        if (!error && Array.isArray(data) && active) {
          const valid = data.filter((value): value is string => typeof value === "string");
          const restored = new Set(valid);
          selectionRef.current = restored;
          setSelected(restored);
          if (valid.length < candidate.length) {
            setFeedback({ tone: "info", text: "تم تحديث الاختيار المحفوظ واستبعاد أي لفات لم تعد معلقة في التحويل." });
          } else {
            setFeedback({ tone: "info", text: `تم استعادة ${valid.length} لفة من جلسة الاستلام السابقة.` });
          }
        }
      } catch {
        if (active) setFeedback({ tone: "warning", text: "تعذر التحقق من الاختيار المحفوظ الآن. يمكنك متابعة المسح أو إعادة المحاولة بعد تحسن الاتصال." });
      } finally {
        if (active) setDraftHydrated(true);
      }
    }
    void hydrateDraft();
    return () => { active = false; };
  }, [detail.transfer_id, supabase]);

  useEffect(() => {
    if (!draftHydrated) return;
    const ids = [...selected];
    if (ids.length === 0) sessionStorage.removeItem(receiptDraftStorageKey(detail.transfer_id));
    else sessionStorage.setItem(receiptDraftStorageKey(detail.transfer_id), JSON.stringify(ids));
  }, [detail.transfer_id, draftHydrated, selected]);

  const queryItems = useCallback(async (rawSearch: string | null, status: string | null, limit = PAGE_SIZE + 1, offset = 0) => {
    return supabase.rpc("list_roll_transfer_items", {
      p_transfer_id: detail.transfer_id,
      p_search: rawSearch?.trim().toUpperCase() || undefined,
      p_status: status ?? undefined,
      p_limit: limit,
      p_offset: offset,
    });
  }, [detail.transfer_id, supabase]);

  const loadExpected = useCallback(async (nextPage = 0, rawSearch = search) => {
    setLoading(true);
    setFeedback(null);
    try {
      const { data, error } = await queryItems(rawSearch, null, PAGE_SIZE + 1, nextPage * PAGE_SIZE);
      if (error || !Array.isArray(data)) throw new Error(error?.message ?? "items");
      setRows((data as TransferItem[]).slice(0, PAGE_SIZE));
      setHasNext(data.length > PAGE_SIZE);
      setPage(nextPage);
    } catch {
      setFeedback({ tone: "error", text: "تعذر تحميل اللفات المتوقعة. تحقق من الشبكة ثم أعد المحاولة." });
    } finally {
      setLoading(false);
    }
  }, [queryItems, search]);

  const addPendingItem = useCallback((row: TransferItem): ScannerDecodeOutcome => {
    if (row.item_status !== "pending") {
      const message = row.item_status === "received"
        ? "هذه اللفة تم تأكيد استلامها سابقًا."
        : row.item_status === "released_to_sender"
          ? "هذه اللفة حُسمت لدى المرسل ولم تعد قابلة للاستلام في هذا التحويل."
          : "هذه اللفة أُغلقت دون استلام.";
      return { action: "continue", message, tone: "warning" };
    }
    if (selectionRef.current.has(row.roll_id)) {
      return { action: "continue", message: "هذه اللفة تم التحقق منها وإضافتها بالفعل.", tone: "warning" };
    }
    if (selectionRef.current.size >= MAX_TRANSFER_RECEIPT_ROLLS) {
      return { action: "continue", message: "وصلت للحد الأقصى 10,000 لفة.", tone: "error" };
    }

    const nextSelection = new Set(selectionRef.current);
    nextSelection.add(row.roll_id);
    selectionRef.current = nextSelection;
    setSelected(nextSelection);
    setSelectionDetails((current) => {
      const next = new Map(current);
      next.set(row.roll_id, {
        roll_id: row.roll_id,
        serial_number: row.serial_number,
        lot_id: row.lot_id,
        lot_number: row.lot_number,
        product_name: row.product_name,
      });
      return next;
    });
    return { action: "continue", message: `تم التحقق: ${row.serial_number}`, tone: "success" };
  }, []);

  const findBySerial = useCallback(async (serial: string): Promise<TransferItem | null> => {
    const { data, error } = await queryItems(serial, null, 10, 0);
    if (error || !Array.isArray(data)) throw new Error(error?.message ?? "serial");
    return (data as TransferItem[]).find((row) => row.serial_number === serial) ?? null;
  }, [queryItems]);

  const handleScannedPayload = useCallback(async (payload: string): Promise<ScannerDecodeOutcome> => {
    const serial = parseRollQrPayload(payload, publicSiteOrigin);
    if (!serial) return { action: "continue", message: "هذا QR ليس هوية Roll صالحة لهذه المنصة.", tone: "error" };
    try {
      const row = await findBySerial(serial);
      if (!row) return { action: "continue", message: "اللفة صحيحة لكن ليست ضمن هذا التحويل.", tone: "error" };
      return addPendingItem(row);
    } catch {
      return { action: "continue", message: "تعذر التحقق من اللفة بسبب الاتصال. أعد المسح بعد لحظة.", tone: "error" };
    }
  }, [addPendingItem, findBySerial, publicSiteOrigin]);

  async function addManualSerial() {
    const serial = normalizeRollSerial(manualSerial);
    setFeedback(null);
    if (!serial) {
      setFeedback({ tone: "error", text: "اكتب Roll Serial كاملًا بالشكل الصحيح." });
      return;
    }
    setLoading(true);
    try {
      const row = await findBySerial(serial);
      if (!row) {
        setFeedback({ tone: "error", text: "هذه اللفة ليست ضمن التحويل الحالي." });
        return;
      }
      const outcome = addPendingItem(row);
      setFeedback({ tone: outcome.tone ?? "info", text: outcome.message ?? "تم تحديث الاختيار." });
      if (row.item_status === "pending") setManualSerial("");
    } catch {
      setFeedback({ tone: "error", text: "تعذر التحقق من اللفة. تحقق من الاتصال ثم أعد المحاولة." });
    } finally {
      setLoading(false);
    }
  }

  function toggleRow(row: TransferItem) {
    if (row.item_status !== "pending") return;
    const nextSelection = new Set(selectionRef.current);
    const wasSelected = nextSelection.has(row.roll_id);
    if (!wasSelected && nextSelection.size >= MAX_TRANSFER_RECEIPT_ROLLS) {
      setFeedback({ tone: "error", text: "وصلت للحد الأقصى 10,000 لفة." });
      return;
    }
    if (wasSelected) nextSelection.delete(row.roll_id);
    else nextSelection.add(row.roll_id);
    selectionRef.current = nextSelection;
    setSelected(nextSelection);
    setSelectionDetails((current) => {
      const next = new Map(current);
      if (wasSelected) next.delete(row.roll_id);
      else next.set(row.roll_id, {
        roll_id: row.roll_id,
        serial_number: row.serial_number,
        lot_id: row.lot_id,
        lot_number: row.lot_number,
        product_name: row.product_name,
      });
      return next;
    });
  }

  async function addLot(lotId: string) {
    if (!draftHydrated) {
      setFeedback({ tone: "info", text: "جارٍ استعادة اختيار الاستلام السابق. أكمل بعد انتهاء الاستعادة." });
      return;
    }
    setLoading(true);
    setFeedback(null);
    try {
      const { data, error } = await supabase.rpc("expand_roll_transfer_receipt_lot", {
        p_transfer_id: detail.transfer_id,
        p_lot_id: lotId,
      });
      if (error || !Array.isArray(data) || data.length !== 1) throw new Error(error?.message ?? "lot");
      const lot = data[0] as ReceiptLotExpansion;
      const plan = planReceiptLotSelection(selectionRef.current, lot.pending_roll_ids);
      if (plan.additions.length === 0) {
        setFeedback({ tone: "info", text: `لا توجد لفات جديدة معلقة لإضافتها من Lot ${lot.lot_number}.` });
        return;
      }
      setLotConfirmation({ lot });
    } catch {
      setFeedback({ tone: "error", text: "تعذر تحديث مجموعة Lot. حدّث التحويل ثم أعد المحاولة." });
    } finally {
      setLoading(false);
    }
  }

  function confirmLotSelection() {
    if (!lotConfirmation || !draftHydrated) return;
    const { lot } = lotConfirmation;
    const plan = planReceiptLotSelection(selectionRef.current, lot.pending_roll_ids);
    const additions = plan.additions;
    if (additions.length === 0) {
      setLotConfirmation(null);
      setFeedback({ tone: "info", text: `لم تعد هناك لفات جديدة قابلة للإضافة من Lot ${lot.lot_number}.` });
      return;
    }

    selectionRef.current = plan.next;
    setSelected(plan.next);
    setSelectionDetails((current) => {
      const next = new Map(current);
      additions.forEach((rollId) => next.set(rollId, {
        roll_id: rollId,
        serial_number: "",
        lot_id: lot.lot_id,
        lot_number: lot.lot_number,
        product_name: lot.product_name,
      }));
      return next;
    });
    setLotConfirmation(null);
    setFeedback({
      tone: "success",
      text: lot.transfer_contains_full_lot
        ? `تم تحديد ${additions.length} لفة معلقة من Lot ${lot.lot_number}.`
        : `التحويل يحتوي جزءًا فقط من Lot ${lot.lot_number}. تم تحديد ${additions.length} لفة معلقة داخل التحويل فقط.`,
    });
  }

  function submitReceipt() {
    const rollIds = [...selected];
    if (rollIds.length === 0) return;
    setFeedback(null);
    startTransition(async () => {
      try {
        const requestId = await requestIdForTransferAction("receive", detail.transfer_id, rollIds);
        const result = await receiveTransferItems({ requestId, transferId: detail.transfer_id, rollIds });
        if (!result.ok) {
          setConfirmOpen(false);
          setFeedback({ tone: "error", text: transferActionErrorMessage(result.code) });
          if (["PG_TRANSFER_RECEIPT_ITEM_ALREADY_RECEIVED", "PG_TRANSFER_RECEIPT_RESERVATION_INVALID", "PG_TRANSFER_RECEIPT_STATE_INVALID"].includes(result.code)) {
            setStage("verify");
          }
          return;
        }

        const remainingCount = Math.max(0, detail.pending_count - rollIds.length);
        setReceiptOutcome({
          receivedCount: rollIds.length,
          remainingCount,
          completedTransfer: remainingCount === 0,
        });
        clearTransferActionRequest("receive", detail.transfer_id);
        sessionStorage.removeItem(receiptDraftStorageKey(detail.transfer_id));
        setConfirmOpen(false);
        setStage("success");
        router.refresh();
      } catch {
        setConfirmOpen(false);
        setFeedback({ tone: "error", text: "انقطع الاتصال أثناء تأكيد الاستلام. اختيارك محفوظ؛ أعد المحاولة بنفس البيانات للتحقق بأمان." });
      }
    });
  }

  function continueRemainingReceipt() {
    const emptySelection = new Set<string>();
    selectionRef.current = emptySelection;
    setSelected(emptySelection);
    setSelectionDetails(new Map());
    setManualSerial("");
    setRows([]);
    setSearch("");
    setPage(0);
    setHasNext(false);
    setLotConfirmation(null);
    setFeedback(null);
    setReceiptOutcome(null);
    setMode("scan");
    setStage("verify");
    router.refresh();
  }

  const selectedByLot = useMemo(() => {
    const counts = new Map<string, { name: string; lot: string; count: number }>();
    for (const detailRow of selectionDetails.values()) {
      const key = detailRow.lot_id;
      const current = counts.get(key) ?? { name: detailRow.product_name, lot: detailRow.lot_number, count: 0 };
      current.count += 1;
      counts.set(key, current);
    }
    return [...counts.values()];
  }, [selectionDetails]);

  if (stage === "success") {
    const outcome = receiptOutcome ?? {
      receivedCount: selectedCount,
      remainingCount: afterReceiptRemaining,
      completedTransfer: finalReceipt,
    };
    return (
      <div className={styles.flow}>
        <section className={styles.success} aria-live="polite">
          <div className={styles.successMark}>✓</div>
          <h2>{outcome.completedTransfer ? "تم استلام التحويل بالكامل" : "تم تأكيد الاستلام الجزئي"}</h2>
          <p>
            {outcome.completedTransfer
              ? `انتقلت العهدة المؤكدة لآخر ${outcome.receivedCount} لفة إلى جهتك وأصبح التحويل مستلمًا بالكامل. لا تفتح أي رول لمجرد الاستلام؛ عند بدء تركيب فعلي افتح الرول الذي ستستخدمه أولًا.`
              : `انتقلت العهدة المؤكدة لـ${outcome.receivedCount} لفة إلى جهتك، وبقي ${outcome.remainingCount} لفة معلقًا في نفس التحويل. اللفات المتبقية لا تدخل عهدتك قبل تأكيد استلامها فعليًا.`}
          </p>
          <div className={styles.scanActions}>
            {outcome.completedTransfer ? (
              <Link className="button button-primary" href="/operations/rolls/open">فتح رول عند بدء التركيب</Link>
            ) : (
              <button type="button" className="button button-primary" onClick={continueRemainingReceipt}>استكمال استلام الباقي</button>
            )}
            <Link className="button button-secondary" href={`/operations/transfers/${detail.transfer_id}`}>فتح تفاصيل التحويل</Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.flow}>
      <section className={styles.context}>
        <div className={styles.contextTop}>
          <div>
            <span>استلام من</span>
            <strong>{detail.sender_name}</strong>
          </div>
          <code className={styles.number}>{detail.transfer_number}</code>
        </div>
        <div className={styles.counters}>
          <div className={styles.counter}><span>المتوقع</span><strong>{detail.roll_count}</strong></div>
          <div className={styles.counter}><span>مستلم سابقًا</span><strong>{detail.received_count}</strong></div>
          <div className={styles.counter}><span>معلّق</span><strong>{detail.pending_count}</strong></div>
          <div className={styles.counter}><span>محدد الآن</span><strong>{selectedCount}</strong></div>
        </div>
      </section>

      {feedback ? <div style={{ marginTop: 12 }}><FeedbackBanner tone={feedback.tone}>{feedback.text}</FeedbackBanner></div> : null}

      {stage === "verify" ? (
        <>
          <div className={styles.modeTabs}>
            <button type="button" className={styles.mode} data-active={mode === "scan"} onClick={() => setMode("scan")}>
              <strong>مسح اللفات</strong><span>الأفضل للحركة الميدانية المختلطة</span>
            </button>
            <button type="button" className={styles.mode} data-active={mode === "expected"} onClick={() => { setMode("expected"); if (rows.length === 0) void loadExpected(); }}>
              <strong>اختيار من المتوقع</strong><span>راجع اللفات المسجلة في التحويل</span>
            </button>
            <button type="button" className={styles.mode} data-active={mode === "lots"} onClick={() => setMode("lots")} disabled={!draftHydrated}>
              <strong>تأكيد مجموعة Lot</strong><span>{draftHydrated ? "للحركة الكبيرة الموثوقة" : "جارٍ استعادة الاختيار السابق…"}</span>
            </button>
          </div>

          <section className={styles.workspace}>
            {mode === "scan" ? (
              <>
                <h2 className={styles.sectionTitle}>تحقق من اللفات الموجودة أمامك</h2>
                <p className={styles.sectionCopy}>امسح QR الخارجي لكل Roll. الماسح يظل مفتوحًا بعد كل قراءة ناجحة.</p>
                <div className={styles.scanActions}>
                  <button type="button" className={`button button-primary ${styles.scanButton}`} onClick={() => setScannerOpen(true)}>فتح الكاميرا</button>
                  <button type="button" className={`button button-ghost ${styles.scanButton}`} onClick={() => { setMode("expected"); if (rows.length === 0) void loadExpected(); }}>عرض القائمة المتوقعة</button>
                </div>
                <div className={styles.manual}>
                  <input className={styles.input} value={manualSerial} onChange={(event) => setManualSerial(event.target.value)} placeholder="PG-R-..." aria-label="Roll Serial يدوي" />
                  <button type="button" className="button button-ghost" onClick={() => void addManualSerial()} disabled={loading}>تحقق وأضف</button>
                </div>
              </>
            ) : null}

            {mode === "expected" ? (
              <>
                <h2 className={styles.sectionTitle}>اللفات الموجودة في التحويل</h2>
                <form className={styles.manual} onSubmit={(event) => { event.preventDefault(); void loadExpected(0, search); }}>
                  <input className={styles.input} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Serial / ERP / Lot" aria-label="بحث في اللفات المتوقعة" />
                  <button className="button button-ghost" type="submit" disabled={loading}>بحث</button>
                </form>
                <div className={styles.list}>
                  {rows.map((row) => (
                    <label key={row.roll_id} className={styles.roll} data-disabled={row.item_status !== "pending"}>
                      <input type="checkbox" disabled={row.item_status !== "pending"} checked={selected.has(row.roll_id)} onChange={() => toggleRow(row)} />
                      <span className={styles.rollCopy}>
                        <strong>{row.product_name}</strong>
                        <code>{row.serial_number}</code>
                        <small>{row.lot_number} · {transferItemStatusLabel(row.item_status)}</small>
                      </span>
                      {row.item_status === "received" ? <StatusBadge tone="success">مستلم</StatusBadge> : row.item_status === "pending" ? null : <StatusBadge tone="neutral">محسوم</StatusBadge>}
                    </label>
                  ))}
                </div>
                <div className={styles.pager}>
                  <button type="button" className="button button-ghost" disabled={page === 0 || loading} onClick={() => void loadExpected(page - 1, search)}>السابق</button>
                  <button type="button" className="button button-ghost" disabled={!hasNext || loading} onClick={() => void loadExpected(page + 1, search)}>التالي</button>
                </div>
              </>
            ) : null}

            {mode === "lots" ? (
              <>
                <h2 className={styles.sectionTitle}>تأكيد مجموعة Lot</h2>
                <p className={styles.sectionCopy}>لا نفترض أن التحويل يشمل Lot كاملًا. سيُضاف فقط ما هو مسجل ومعلّق داخل هذا التحويل.</p>
                <div className={styles.lots}>
                  {detail.lot_groups.map((lot) => (
                    <article className={styles.lot} key={lot.lot_id}>
                      <div className={styles.lotTop}>
                        <div><strong>{lot.product_name}</strong><code>{lot.lot_number}</code></div>
                        <button type="button" className="button button-ghost" onClick={() => void addLot(lot.lot_id)} disabled={!draftHydrated || loading || lot.pending_count === 0}>
                          {!draftHydrated ? "جارٍ الاستعادة…" : lot.pending_count === 0 ? "لا يوجد متبقي" : `مراجعة تحديد ${lot.pending_count}`}
                        </button>
                      </div>
                      <div className={styles.lotCounts}>
                        <span>Lot إنتاج: {lot.production_lot_total}</span>
                        <span>داخل التحويل: {lot.transfer_count}</span>
                        <span>مستلم: {lot.received_count}</span>
                        <span>معلّق: {lot.pending_count}</span>
                        <span>{lot.transfer_contains_full_lot ? "Lot كامل داخل التحويل" : "التحويل يشمل جزءًا من Lot"}</span>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            ) : null}
          </section>
        </>
      ) : (
        <section className={`${styles.workspace} ${styles.review}`}>
          <h2 className={styles.sectionTitle}>راجع الاستلام قبل التأكيد</h2>
          <div className={styles.reviewBox}>
            <div className={styles.reviewMetric}><span>مستلم سابقًا</span><strong>{detail.received_count}</strong></div>
            <div className={styles.reviewMetric}><span>سيُستلم الآن</span><strong>{selectedCount}</strong></div>
            <div className={styles.reviewMetric}><span>سيبقى معلقًا</span><strong>{afterReceiptRemaining}</strong></div>
          </div>
          {selectedByLot.length > 0 ? (
            <div className={styles.lots}>
              {selectedByLot.map((lot) => <div className={styles.lot} key={`${lot.lot}-${lot.name}`}><strong>{lot.name}</strong><div className={styles.lotCounts}><span>{lot.lot}</span><span>محدد: {lot.count}</span></div></div>)}
            </div>
          ) : null}
          <div className={styles.warning}>
            عند التأكيد ستنتقل العهدة المؤكدة لللفات المحددة فقط إلى جهتك. {afterReceiptRemaining > 0 ? "اللفات غير المحددة ستظل محجوزة وعهدتها لدى المرسل." : "كل اللفات المعلقة سيتم استلامها."}
          </div>
          <div className={styles.scanActions}>
            <button type="button" className="button button-ghost" onClick={() => setStage("verify")} disabled={isSubmitting}>العودة للتحقق</button>
            <button type="button" className="button button-primary" onClick={() => setConfirmOpen(true)} disabled={selectedCount === 0 || isSubmitting}>
              {finalReceipt ? "تأكيد الاستلام الكامل" : "تأكيد الاستلام الجزئي"}
            </button>
          </div>
        </section>
      )}

      {stage === "verify" ? (
        <div className={styles.sticky}>
          <div className={styles.stickyInner}>
            <div className={styles.stickyCount}><span>تم التحقق الآن</span><strong>{selectedCount} لفة</strong></div>
            <button type="button" className="button button-primary" disabled={selectedCount === 0} onClick={() => setStage("review")}>مراجعة الاستلام</button>
          </div>
        </div>
      ) : null}

      <QrScannerSheet
        open={scannerOpen}
        title="مسح لفات التحويل"
        instruction="وجّه الكاميرا إلى QR الخارجي للفة. سيظل الماسح مفتوحًا لمسح اللفة التالية."
        onClose={() => setScannerOpen(false)}
        onDecode={handleScannedPayload}
      />

      <AccessibleDialog
        open={Boolean(lotConfirmation && lotSelectionPlan)}
        onClose={() => setLotConfirmation(null)}
        titleId="lot-selection-confirm-title"
        descriptionId="lot-selection-confirm-description"
      >
        {lotConfirmation && lotSelectionPlan ? (
          <section className={styles.sheet}>
            <h2 id="lot-selection-confirm-title">إضافة {lotSelectionPlan.additions.length} لفة من Lot {lotConfirmation.lot.lot_number}؟</h2>
            <p>
              {lotConfirmation.lot.transfer_contains_full_lot
                ? `سيتم إضافة ${lotSelectionPlan.additions.length} لفة معلقة من هذا الـLot إلى اختيار الاستلام الحالي.`
                : `التحويل يشمل جزءًا فقط من هذا الـLot؛ سيتم إضافة ${lotSelectionPlan.additions.length} لفة معلقة ومسجلة داخل هذا التحويل فقط.`}
            </p>
            <p id="lot-selection-confirm-description">هذه الخطوة تضيف اللفات إلى الاختيار فقط؛ لن تنتقل العهدة قبل مراجعة الاستلام ثم تأكيده صراحةً.</p>
            <div className={styles.sheetActions}>
              <button type="button" className="button button-ghost" onClick={() => setLotConfirmation(null)} data-dialog-initial-focus>رجوع</button>
              <button type="button" className="button button-primary" onClick={confirmLotSelection} disabled={!draftHydrated || lotSelectionPlan.additions.length === 0}>نعم، أضف {lotSelectionPlan.additions.length} لفة</button>
            </div>
          </section>
        ) : null}
      </AccessibleDialog>

      <AccessibleDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        titleId="receipt-confirm-title"
        descriptionId="receipt-confirm-description"
        busy={isSubmitting}
      >
        {confirmOpen ? (
          <section className={styles.sheet}>
            <h2 id="receipt-confirm-title">{finalReceipt ? "تأكيد الاستلام الكامل؟" : "تأكيد الاستلام الجزئي؟"}</h2>
            <p id="receipt-confirm-description">أنت تؤكد أنك استلمت فعليًا {selectedCount} لفة أمامك. {afterReceiptRemaining > 0 ? `سيظل ${afterReceiptRemaining} لفة معلقًا في التحويل دون نقل عهدته.` : "سيُغلق التحويل كمستلم بالكامل."}</p>
            <div className={styles.sheetActions}>
              <button type="button" className="button button-ghost" onClick={() => setConfirmOpen(false)} disabled={isSubmitting} data-dialog-initial-focus>رجوع</button>
              <button type="button" className="button button-primary" onClick={submitReceipt} disabled={isSubmitting} aria-busy={isSubmitting || undefined}>{isSubmitting ? "جارٍ تثبيت العهدة…" : "نعم، استلمت هذه اللفات"}</button>
            </div>
          </section>
        ) : null}
      </AccessibleDialog>
    </div>
  );
}
