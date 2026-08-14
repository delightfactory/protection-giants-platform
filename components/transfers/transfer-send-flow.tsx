"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { sendRollTransfer, type SendTransferActionResult } from "@/app/operations/transfers/new/actions";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { StatusBadge } from "@/components/ui/status-badge";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { normalizeRollSerial, parseRollQrPayload } from "@/lib/rolls/roll-qr";
import {
  buildTransferSendFingerprint,
  clearTransferSendRequest,
  requestIdForTransferSend,
} from "@/lib/transfers/send-idempotency";
import { normalizeTransferId, transferPartyTypeLabel } from "@/lib/transfers/transfer-id";
import { QrScannerSheet, type ScannerDecodeOutcome } from "./qr-scanner-sheet";
import styles from "./transfer-send-flow.module.css";

const PAGE_SIZE = 40;
const MAX_ROLLS = 10000;

type Stage = "recipient" | "select" | "review" | "success";
type InputMode = "scan" | "rolls" | "lots";
type ScannerMode = "recipient" | "roll" | null;

type Recipient = {
  transferCode: string;
  entityType: string;
  displayName: string;
  countryCode: string | null;
  city: string | null;
  entityCode: string | null;
};

type SendRollRow = {
  roll_id: string;
  serial_number: string;
  erp_serial: string;
  lot_id: string;
  lot_number: string;
  product_code: string;
  product_name: string;
  availability: "available" | "reserved";
};

type SendLotRow = {
  lot_id: string;
  lot_number: string;
  product_code: string;
  product_name: string;
  total_count: number;
  held_count: number;
  available_count: number;
  reserved_count: number;
  elsewhere_count: number;
};

type ExpandedLot = SendLotRow & {
  available_roll_ids: string[];
};

type SelectedDetail = {
  rollId: string;
  serialNumber: string;
  lotId: string;
  lotNumber: string;
  productCode: string;
  productName: string;
};

type LotSelection = {
  lotId: string;
  lotNumber: string;
  productCode: string;
  productName: string;
  rollIds: Set<string>;
};

type SuccessState = Extract<SendTransferActionResult, { ok: true }>;

type InlineFeedback = {
  tone: "success" | "warning" | "error" | "info";
  text: string;
};

const sendErrorMessages: Record<string, string> = {
  PG_TRANSFER_RECIPIENT_INVALID: "Transfer ID للمستلم غير صالح. تحقق منه مرة أخرى.",
  PG_TRANSFER_RECIPIENT_NOT_FOUND: "تعذر التحقق من Transfer ID. راجع الكود أو امسحه مرة أخرى.",
  PG_TRANSFER_RECIPIENT_INACTIVE: "تعذر التحقق من Transfer ID. راجع الكود أو امسحه مرة أخرى.",
  PG_TRANSFER_SENDER_RECIPIENT_SAME: "لا يمكن إرسال التحويل إلى نفس الجهة المرسلة.",
  PG_TRANSFER_ROLL_COUNT_INVALID: "اختر لفة واحدة على الأقل وبحد أقصى 10,000 لفة.",
  PG_TRANSFER_ROLL_NOT_FOUND: "بعض اللفات المختارة لم تعد متاحة للتحويل. راجع الاختيار ثم أعد الإرسال.",
  PG_TRANSFER_PRODUCTION_VOIDED: "إحدى اللفات لم تعد مؤهلة للتحويل بسبب حالة أمر الإنتاج.",
  PG_TRANSFER_CUSTODY_MISSING: "تعذر تأكيد عهدة بعض اللفات. راجع الاختيار قبل المحاولة مرة أخرى.",
  PG_TRANSFER_ROLL_NOT_HELD: "بعض اللفات لم تعد في عهدة جهتك. تم الاحتفاظ بالاختيار للمراجعة.",
  PG_TRANSFER_ROLL_RESERVED: "بعض اللفات أصبحت محجوزة في تحويل آخر. راجع الاختيار قبل الإرسال.",
  PG_TRANSFER_ACTOR_INACTIVE: "حسابك أو جهتك التشغيلية لم تعد نشطة لهذه العملية.",
  PG_TRANSFER_REQUEST_PAYLOAD_CONFLICT: "تغيرت بيانات التحويل أثناء إعادة المحاولة. أعد مراجعة العملية قبل الإرسال.",
  PG_TRANSFER_SEND_CONFIRMATION_FAILED: "تم تنفيذ الطلب لكن تعذر تحميل تأكيد التحويل. أعد المحاولة بنفس البيانات للتحقق بأمان.",
  PG_TRANSFER_SEND_FAILED: "تعذر إنشاء التحويل حاليًا. احتفظنا بالاختيار ويمكنك إعادة المحاولة.",
};

function RecipientCard({ recipient, compact = false }: { recipient: Recipient; compact?: boolean }) {
  return (
    <div className={`${styles.recipientCard} ${compact ? styles.compactRecipient : ""}`}>
      <div className={styles.recipientMark} aria-hidden="true">✓</div>
      <div className={styles.recipientCopy}>
        <span>{transferPartyTypeLabel(recipient.entityType)}</span>
        <strong>{recipient.displayName}</strong>
        <div className={styles.recipientMeta}>
          {recipient.entityCode ? <span>{recipient.entityCode}</span> : null}
          {recipient.countryCode ? <span>{recipient.countryCode}</span> : null}
          {recipient.city ? <span>{recipient.city}</span> : null}
        </div>
        <code>{recipient.transferCode}</code>
      </div>
    </div>
  );
}

function ModeButton({ active, title, description, onClick }: {
  active: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className={styles.modeButton} data-active={active ? "true" : "false"} onClick={onClick}>
      <strong>{title}</strong>
      <span>{description}</span>
    </button>
  );
}

export function TransferSendFlow({ senderTransferId, publicSiteOrigin }: {
  senderTransferId: string;
  publicSiteOrigin: string;
}) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [stage, setStage] = useState<Stage>("recipient");
  const [mode, setMode] = useState<InputMode>("scan");
  const [scannerMode, setScannerMode] = useState<ScannerMode>(null);
  const [recipientInput, setRecipientInput] = useState("");
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [recipientLoading, setRecipientLoading] = useState(false);
  const [feedback, setFeedback] = useState<InlineFeedback | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [selectedDetails, setSelectedDetails] = useState<Map<string, SelectedDetail>>(() => new Map());
  const [lotSelections, setLotSelections] = useState<Map<string, LotSelection>>(() => new Map());

  const [rollSearch, setRollSearch] = useState("");
  const [rollPage, setRollPage] = useState(0);
  const [rollRows, setRollRows] = useState<SendRollRow[]>([]);
  const [rollHasNext, setRollHasNext] = useState(false);
  const [rollLoading, setRollLoading] = useState(false);

  const [lotSearch, setLotSearch] = useState("");
  const [lotPage, setLotPage] = useState(0);
  const [lotRows, setLotRows] = useState<SendLotRow[]>([]);
  const [lotHasNext, setLotHasNext] = useState(false);
  const [lotLoading, setLotLoading] = useState(false);
  const [pendingLot, setPendingLot] = useState<ExpandedLot | null>(null);
  const [recipientChangePending, setRecipientChangePending] = useState(false);
  const [clearSelectionPending, setClearSelectionPending] = useState(false);

  const [manualSerial, setManualSerial] = useState("");
  const [submitLoading, setSubmitLoading] = useState(false);
  const [success, setSuccess] = useState<SuccessState | null>(null);

  const selectedCount = selectedIds.size;
  const decisionOpen = Boolean(pendingLot || recipientChangePending || clearSelectionPending);

  useEffect(() => {
    if (!decisionOpen) return;

    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setPendingLot(null);
      setRecipientChangePending(false);
      setClearSelectionPending(false);
    }

    window.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [decisionOpen]);

  const verifyRecipient = useCallback(async (rawValue: string): Promise<boolean> => {
    const normalized = normalizeTransferId(rawValue);
    setFeedback(null);
    setRecipient(null);

    if (!normalized) {
      setFeedback({ tone: "error", text: "أدخل Transfer ID كاملًا بالشكل الصحيح أو امسح QR الخاص بالجهة." });
      return false;
    }

    if (normalized === normalizeTransferId(senderTransferId)) {
      setFeedback({ tone: "error", text: "هذا Transfer ID يخص جهتك الحالية. اختر جهة مستلمة مختلفة." });
      return false;
    }

    setRecipientLoading(true);
    try {
      const { data, error } = await supabase.rpc("resolve_transfer_recipient", { p_transfer_code: normalized });
      if (error || !data || data.length !== 1) {
        setFeedback({ tone: "error", text: "تعذر التحقق من Transfer ID. راجع الكود أو امسحه مرة أخرى." });
        return false;
      }

      const row = data[0];
      setRecipient({
        transferCode: normalized,
        entityType: row.entity_type,
        displayName: row.display_name,
        countryCode: row.country_code,
        city: row.city,
        entityCode: row.entity_code,
      });
      setRecipientInput(normalized);
      return true;
    } catch {
      setFeedback({ tone: "error", text: "تعذر الاتصال للتحقق من الجهة. تحقق من الشبكة ثم أعد المحاولة." });
      return false;
    } finally {
      setRecipientLoading(false);
    }
  }, [senderTransferId, supabase]);

  const addRoll = useCallback((row: SendRollRow): ScannerDecodeOutcome => {
    if (row.availability === "reserved") {
      return { action: "continue", message: "هذه اللفة محجوزة في تحويل آخر.", tone: "warning" };
    }

    if (selectedIds.has(row.roll_id)) {
      return { action: "continue", message: "اللفة مضافة بالفعل.", tone: "warning" };
    }

    if (selectedIds.size >= MAX_ROLLS) {
      return { action: "continue", message: "وصلت للحد الأقصى 10,000 لفة في التحويل الواحد.", tone: "error" };
    }

    setSelectedIds((current) => new Set(current).add(row.roll_id));
    setSelectedDetails((current) => {
      const next = new Map(current);
      next.set(row.roll_id, {
        rollId: row.roll_id,
        serialNumber: row.serial_number,
        lotId: row.lot_id,
        lotNumber: row.lot_number,
        productCode: row.product_code,
        productName: row.product_name,
      });
      return next;
    });
    return { action: "continue", message: `تمت إضافة اللفة · ${row.serial_number}`, tone: "success" };
  }, [selectedIds]);

  const removeRoll = useCallback((rollId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      next.delete(rollId);
      return next;
    });
    setSelectedDetails((current) => {
      const next = new Map(current);
      next.delete(rollId);
      return next;
    });
    setLotSelections((current) => {
      const next = new Map(current);
      for (const [lotId, selection] of next) {
        if (!selection.rollIds.has(rollId)) continue;
        const rollIds = new Set(selection.rollIds);
        rollIds.delete(rollId);
        if (rollIds.size === 0) next.delete(lotId);
        else next.set(lotId, { ...selection, rollIds });
      }
      return next;
    });
  }, []);

  const lookupRollBySerial = useCallback(async (rawSerial: string): Promise<ScannerDecodeOutcome> => {
    const serial = normalizeRollSerial(rawSerial);
    if (!serial) {
      return { action: "continue", message: "Serial اللفة غير صالح.", tone: "error" };
    }

    const { data, error } = await supabase.rpc("list_transfer_send_rolls", {
      p_search: serial,
      p_lot_id: undefined,
      p_limit: 5,
      p_offset: 0,
    });
    if (error) {
      return { action: "continue", message: "تعذر التحقق من اللفة الآن. أعد المحاولة.", tone: "error" };
    }

    const exact = (data as SendRollRow[]).find((row) => row.serial_number === serial);
    if (!exact) {
      return { action: "continue", message: "هذه اللفة غير متاحة للتحويل من عهدتك الحالية.", tone: "warning" };
    }
    return addRoll(exact);
  }, [addRoll, supabase]);

  const handleScannerDecode = useCallback(async (payload: string): Promise<ScannerDecodeOutcome> => {
    if (scannerMode === "recipient") {
      const normalized = normalizeTransferId(payload);
      if (!normalized) {
        return { action: "continue", message: "QR المقروء ليس Transfer ID صالحًا.", tone: "error" };
      }
      const valid = await verifyRecipient(normalized);
      return valid
        ? { action: "close", message: "تم التحقق من الجهة.", tone: "success" }
        : { action: "continue", message: "تعذر التحقق من Transfer ID.", tone: "error" };
    }

    const serial = parseRollQrPayload(payload, publicSiteOrigin);
    if (!serial) {
      return { action: "continue", message: "QR المقروء ليس QR لفة صالحًا لهذه المنصة.", tone: "error" };
    }
    return lookupRollBySerial(serial);
  }, [lookupRollBySerial, publicSiteOrigin, scannerMode, verifyRecipient]);

  const closeScanner = useCallback(() => setScannerMode(null), []);

  const loadRolls = useCallback(async (search = rollSearch, page = rollPage) => {
    setRollLoading(true);
    try {
      const { data, error } = await supabase.rpc("list_transfer_send_rolls", {
        p_search: search.trim() || undefined,
        p_lot_id: undefined,
        p_limit: PAGE_SIZE + 1,
        p_offset: page * PAGE_SIZE,
      });
      if (error) throw error;
      const rows = data as SendRollRow[];
      setRollHasNext(rows.length > PAGE_SIZE);
      setRollRows(rows.slice(0, PAGE_SIZE));
    } catch {
      setFeedback({ tone: "error", text: "تعذر تحميل اللفات الموجودة في عهدتك. أعد المحاولة." });
      setRollRows([]);
      setRollHasNext(false);
    } finally {
      setRollLoading(false);
    }
  }, [rollPage, rollSearch, supabase]);

  const loadLots = useCallback(async (search = lotSearch, page = lotPage) => {
    setLotLoading(true);
    try {
      const { data, error } = await supabase.rpc("list_transfer_send_lots", {
        p_search: search.trim() || undefined,
        p_limit: PAGE_SIZE + 1,
        p_offset: page * PAGE_SIZE,
      });
      if (error) throw error;
      const rows = data as SendLotRow[];
      setLotHasNext(rows.length > PAGE_SIZE);
      setLotRows(rows.slice(0, PAGE_SIZE));
    } catch {
      setFeedback({ tone: "error", text: "تعذر تحميل الـLots الموجودة ضمن عهدتك. أعد المحاولة." });
      setLotRows([]);
      setLotHasNext(false);
    } finally {
      setLotLoading(false);
    }
  }, [lotPage, lotSearch, supabase]);

  useEffect(() => {
    if (stage !== "select" || mode !== "rolls") return;
    void loadRolls();
  }, [stage, mode, rollPage, loadRolls]);

  useEffect(() => {
    if (stage !== "select" || mode !== "lots") return;
    void loadLots();
  }, [stage, mode, lotPage, loadLots]);

  async function selectLot(lot: SendLotRow) {
    setFeedback(null);
    const { data, error } = await supabase.rpc("expand_transfer_send_lot", { p_lot_id: lot.lot_id });
    if (error || !data || data.length !== 1) {
      setFeedback({ tone: "error", text: "تعذر تحديث حالة الـLot. أعد تحميل القائمة ثم حاول مرة أخرى." });
      return;
    }

    const expanded = data[0] as ExpandedLot;
    if (expanded.available_count < 1) {
      setFeedback({ tone: "warning", text: "لا توجد لفات متاحة حاليًا من هذا الـLot للتحويل." });
      void loadLots();
      return;
    }

    if (expanded.available_count < expanded.total_count) {
      setPendingLot(expanded);
      return;
    }
    applyExpandedLot(expanded);
  }

  function applyExpandedLot(expanded: ExpandedLot) {
    const remainingCapacity = MAX_ROLLS - selectedIds.size;
    const newIds = expanded.available_roll_ids.filter((rollId) => !selectedIds.has(rollId));
    if (newIds.length > remainingCapacity) {
      setPendingLot(null);
      setFeedback({ tone: "error", text: `لا يمكن إضافة ${newIds.length.toLocaleString("en-US")} لفة لأن الحد الأقصى للتحويل 10,000 لفة.` });
      return;
    }

    setSelectedIds((current) => {
      const next = new Set(current);
      for (const rollId of expanded.available_roll_ids) next.add(rollId);
      return next;
    });
    setLotSelections((current) => {
      const next = new Map(current);
      const existing = next.get(expanded.lot_id);
      const rollIds = new Set(existing?.rollIds ?? []);
      for (const rollId of expanded.available_roll_ids) rollIds.add(rollId);
      next.set(expanded.lot_id, {
        lotId: expanded.lot_id,
        lotNumber: expanded.lot_number,
        productCode: expanded.product_code,
        productName: expanded.product_name,
        rollIds,
      });
      return next;
    });
    setPendingLot(null);
    setFeedback({ tone: "success", text: `تمت إضافة ${newIds.length.toLocaleString("en-US")} لفة متاحة من ${expanded.lot_number}.` });
  }

  function clearSelection() {
    setSelectedIds(new Set());
    setSelectedDetails(new Map());
    setLotSelections(new Map());
    setFeedback({ tone: "info", text: "تم مسح الاختيار. يمكنك بدء تحديد اللفات من جديد." });
  }

  function resetRecipient() {
    setRecipient(null);
    setRecipientInput("");
    setStage("recipient");
    setFeedback(null);
    setRecipientChangePending(false);
  }

  async function submitTransfer() {
    if (!recipient || selectedIds.size < 1 || submitLoading) return;
    setSubmitLoading(true);
    setFeedback(null);

    try {
      const rollIds = [...selectedIds];
      const fingerprint = await buildTransferSendFingerprint(recipient.transferCode, rollIds);
      const requestId = requestIdForTransferSend(fingerprint);
      const result = await sendRollTransfer({
        requestId,
        recipientTransferId: recipient.transferCode,
        rollIds,
      });

      if (result.ok) {
        clearTransferSendRequest();
        setSuccess(result);
        setStage("success");
        return;
      }

      const text = sendErrorMessages[result.code] ?? sendErrorMessages.PG_TRANSFER_SEND_FAILED;
      setFeedback({ tone: "error", text });
      if ([
        "PG_TRANSFER_ROLL_NOT_FOUND",
        "PG_TRANSFER_PRODUCTION_VOIDED",
        "PG_TRANSFER_CUSTODY_MISSING",
        "PG_TRANSFER_ROLL_NOT_HELD",
        "PG_TRANSFER_ROLL_RESERVED",
      ].includes(result.code)) {
        setStage("select");
        if (mode === "rolls") void loadRolls();
        if (mode === "lots") void loadLots();
      }
      if (["PG_TRANSFER_RECIPIENT_INVALID", "PG_TRANSFER_RECIPIENT_NOT_FOUND", "PG_TRANSFER_RECIPIENT_INACTIVE", "PG_TRANSFER_SENDER_RECIPIENT_SAME"].includes(result.code)) {
        setStage("recipient");
        setRecipient(null);
      }
    } catch {
      setFeedback({
        tone: "error",
        text: "انقطع الاتصال قبل تأكيد نتيجة الإرسال. احتفظنا بنفس الطلب والاختيار؛ أعد المحاولة بنفس البيانات للتحقق بأمان.",
      });
    } finally {
      setSubmitLoading(false);
    }
  }

  if (stage === "success" && success) {
    return (
      <section className={styles.successSurface} aria-labelledby="transfer-success-title">
        <div className={styles.successMark} aria-hidden="true">✓</div>
        <p className={styles.stepLabel}>تم إنشاء التحويل</p>
        <h2 id="transfer-success-title">التحويل في انتظار الاستلام</h2>
        <code>{success.transferNumber}</code>
        <div className={styles.successCount}>
          <strong>{success.rollCount.toLocaleString("en-US")}</strong>
          <span>لفة محجوزة لهذا التحويل</span>
        </div>
        <p>
          لم تنتقل العهدة بعد. تظل العهدة المؤكدة لدى جهتك حتى يؤكد المستلم الاستلام في خطوة الاستلام المخصصة.
        </p>
        <div className={styles.successActions}>
          <a href="/operations/transfers" className="button button-primary">العودة للتحويلات</a>
          <button type="button" className="button" onClick={() => {
            setRecipient(null);
            setRecipientInput("");
            setSelectedIds(new Set());
            setSelectedDetails(new Map());
            setLotSelections(new Map());
            setSuccess(null);
            setStage("recipient");
          }}>إرسال تحويل آخر</button>
        </div>
      </section>
    );
  }

  return (
    <div className={styles.flow}>
      <div className={styles.progress} aria-label="تقدم إرسال التحويل">
        <span data-current={stage === "recipient" ? "true" : "false"} data-done={stage !== "recipient" ? "true" : "false"}><span>المستلم</span></span>
        <i />
        <span data-current={stage === "select" ? "true" : "false"} data-done={stage === "review" ? "true" : "false"}><span>اللفات</span></span>
        <i />
        <span data-current={stage === "review" ? "true" : "false"}><span>المراجعة</span></span>
      </div>

      {feedback ? <FeedbackBanner tone={feedback.tone}>{feedback.text}</FeedbackBanner> : null}

      {stage === "recipient" ? (
        <section className={styles.taskSurface}>
          <div className={styles.taskHeading}>
            <p className={styles.stepLabel}>الخطوة 1 من 3</p>
            <h2>إلى أي جهة سترسل اللفات؟</h2>
            <p>استخدم Transfer ID الذي شاركته الجهة المستلمة. لا نعرض دليلًا عامًا للجهات حتى يظل التحديد مقصودًا وواضحًا.</p>
          </div>

          <div className={styles.recipientEntry}>
            <label htmlFor="recipient-transfer-id">Transfer ID للمستلم</label>
            <div className={styles.entryRow}>
              <input
                id="recipient-transfer-id"
                value={recipientInput}
                onChange={(event) => {
                  setRecipientInput(event.target.value.toUpperCase());
                  setRecipient(null);
                  setFeedback(null);
                }}
                placeholder="PG-C-XXXX-XXXX-XXXX"
                dir="ltr"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
              />
              <button type="button" className="button" onClick={() => setScannerMode("recipient")}>مسح QR</button>
            </div>
            <button
              type="button"
              className="button button-primary"
              disabled={recipientLoading || !recipientInput.trim()}
              onClick={() => { void verifyRecipient(recipientInput); }}
            >
              {recipientLoading ? "جارٍ التحقق…" : "تحقق من الجهة"}
            </button>
          </div>

          {recipient ? (
            <div className={styles.verificationBlock}>
              <RecipientCard recipient={recipient} />
              <button type="button" className="button button-primary" onClick={() => {
                setStage("select");
                setFeedback(null);
              }}>تأكيد المستلم والمتابعة</button>
            </div>
          ) : null}
        </section>
      ) : null}

      {stage === "select" && recipient ? (
        <>
          <section className={styles.contextStrip}>
            <RecipientCard recipient={recipient} compact />
            <button type="button" className="button button-ghost" onClick={() => {
              if (selectedCount > 0) setRecipientChangePending(true);
              else resetRecipient();
            }}>تغيير المستلم</button>
          </section>

          <section className={styles.taskSurface}>
            <div className={styles.taskHeading}>
              <div className={styles.headingWithCount}>
                <div>
                  <p className={styles.stepLabel}>الخطوة 2 من 3</p>
                  <h2>حدد اللفات المرسلة</h2>
                </div>
                <div className={styles.selectedCounter}>
                  <strong>{selectedCount.toLocaleString("en-US")}</strong>
                  <span>محددة</span>
                </div>
              </div>
              <p>اختر الطريقة التي تطابق الحركة الفعلية أمامك. يمكنك التبديل بين الطرق بدون فقد اللفات التي أضفتها.</p>
            </div>

            <div className={styles.modeGrid}>
              <ModeButton active={mode === "scan"} title="مسح اللفات" description="QR · لفات أمامك أو تشكيلة مختلطة" onClick={() => setMode("scan")} />
              <ModeButton active={mode === "rolls"} title="اختيار اللفات" description="اختيار معلوم من العهدة الحالية" onClick={() => setMode("rolls")} />
              <ModeButton active={mode === "lots"} title="اختيار Lot" description="حركة كمية من Lot واحد" onClick={() => setMode("lots")} />
            </div>

            {mode === "scan" ? (
              <div className={styles.scanMode}>
                <div className={styles.scanHero}>
                  <div className={styles.scanGlyph} aria-hidden="true"><span /><span /><span /><span /></div>
                  <div>
                    <h3>امسح QR الموجود على كل لفة</h3>
                    <p>اللفة الصحيحة تُضاف فورًا ويظل الماسح جاهزًا للفة التالية. اللفات المحجوزة أو غير الموجودة في عهدتك لن تُضاف.</p>
                  </div>
                  <button type="button" className="button button-primary" onClick={() => setScannerMode("roll")}>فتح الماسح</button>
                </div>
                <form className={styles.manualSerial} onSubmit={(event) => {
                  event.preventDefault();
                  void lookupRollBySerial(manualSerial).then((outcome) => {
                    if (outcome.message) setFeedback({ tone: outcome.tone === "success" ? "success" : outcome.tone === "error" ? "error" : "warning", text: outcome.message });
                    if (outcome.tone === "success") setManualSerial("");
                  });
                }}>
                  <label htmlFor="manual-roll-serial">QR تالف؟ أدخل Serial اللفة</label>
                  <div className={styles.entryRow}>
                    <input id="manual-roll-serial" value={manualSerial} onChange={(event) => setManualSerial(event.target.value.toUpperCase())} placeholder="PG-R-..." dir="ltr" autoCapitalize="characters" autoCorrect="off" spellCheck={false} />
                    <button type="submit" className="button">إضافة</button>
                  </div>
                </form>
              </div>
            ) : null}

            {mode === "rolls" ? (
              <div className={styles.listMode}>
                <form className={styles.searchBar} onSubmit={(event) => {
                  event.preventDefault();
                  setRollPage(0);
                  void loadRolls(rollSearch, 0);
                }}>
                  <input value={rollSearch} onChange={(event) => setRollSearch(event.target.value.toUpperCase())} placeholder="ابحث بـ Serial أو ERP Serial أو Lot" dir="ltr" />
                  <button type="submit" className="button">بحث</button>
                </form>
                {rollLoading ? <div className={styles.loadingState}>جارٍ تحميل اللفات…</div> : null}
                {!rollLoading && rollRows.length === 0 ? <div className={styles.emptyInline}>لا توجد لفات مطابقة في عهدتك الحالية.</div> : null}
                <div className={styles.rollList}>
                  {rollRows.map((row) => {
                    const selected = selectedIds.has(row.roll_id);
                    const disabled = row.availability === "reserved";
                    return (
                      <article key={row.roll_id} className={styles.rollRow} data-selected={selected ? "true" : "false"} data-disabled={disabled ? "true" : "false"}>
                        <button
                          type="button"
                          className={styles.selectToggle}
                          disabled={disabled}
                          aria-label={selected ? "إزالة اللفة من التحويل" : "إضافة اللفة للتحويل"}
                          onClick={() => selected ? removeRoll(row.roll_id) : addRoll(row)}
                        >{selected ? "✓" : "+"}</button>
                        <div className={styles.rollIdentity}>
                          <strong>{row.product_name}</strong>
                          <code>{row.serial_number}</code>
                          <span>{row.lot_number} · {row.erp_serial}</span>
                        </div>
                        <StatusBadge tone={disabled ? "warning" : selected ? "success" : "neutral"}>
                          {disabled ? "محجوزة" : selected ? "محددة" : "متاحة"}
                        </StatusBadge>
                      </article>
                    );
                  })}
                </div>
                <div className={styles.pager}>
                  <button type="button" className="button button-ghost" disabled={rollPage === 0} onClick={() => setRollPage((value) => Math.max(0, value - 1))}>السابق</button>
                  <span>صفحة {(rollPage + 1).toLocaleString("en-US")}</span>
                  <button type="button" className="button button-ghost" disabled={!rollHasNext} onClick={() => setRollPage((value) => value + 1)}>التالي</button>
                </div>
              </div>
            ) : null}

            {mode === "lots" ? (
              <div className={styles.listMode}>
                <form className={styles.searchBar} onSubmit={(event) => {
                  event.preventDefault();
                  setLotPage(0);
                  void loadLots(lotSearch, 0);
                }}>
                  <input value={lotSearch} onChange={(event) => setLotSearch(event.target.value.toUpperCase())} placeholder="ابحث برقم الـLot أو كود المنتج" dir="ltr" />
                  <button type="submit" className="button">بحث</button>
                </form>
                {lotLoading ? <div className={styles.loadingState}>جارٍ تحميل الـLots…</div> : null}
                {!lotLoading && lotRows.length === 0 ? <div className={styles.emptyInline}>لا توجد Lots بها لفات في عهدتك الحالية.</div> : null}
                <div className={styles.lotList}>
                  {lotRows.map((lot) => (
                    <article key={lot.lot_id} className={styles.lotCard}>
                      <div className={styles.lotHeader}>
                        <div>
                          <span>{lot.product_code}</span>
                          <strong>{lot.product_name}</strong>
                          <code>{lot.lot_number}</code>
                        </div>
                        {lotSelections.has(lot.lot_id) ? <StatusBadge tone="success">مضاف</StatusBadge> : null}
                      </div>
                      <div className={styles.lotMetrics}>
                        <div><strong>{lot.total_count.toLocaleString("en-US")}</strong><span>إجمالي</span></div>
                        <div><strong>{lot.available_count.toLocaleString("en-US")}</strong><span>متاحة</span></div>
                        <div><strong>{lot.reserved_count.toLocaleString("en-US")}</strong><span>محجوزة</span></div>
                        <div><strong>{lot.elsewhere_count.toLocaleString("en-US")}</strong><span>لدى جهات أخرى</span></div>
                      </div>
                      <button type="button" className="button" disabled={lot.available_count === 0} onClick={() => { void selectLot(lot); }}>
                        {lot.available_count === lot.total_count
                          ? `اختيار الـLot بالكامل — ${lot.available_count.toLocaleString("en-US")} لفة`
                          : lot.available_count > 0
                            ? `اختيار ${lot.available_count.toLocaleString("en-US")} لفة المتاحة`
                            : "لا توجد لفات متاحة"}
                      </button>
                    </article>
                  ))}
                </div>
                <div className={styles.pager}>
                  <button type="button" className="button button-ghost" disabled={lotPage === 0} onClick={() => setLotPage((value) => Math.max(0, value - 1))}>السابق</button>
                  <span>صفحة {(lotPage + 1).toLocaleString("en-US")}</span>
                  <button type="button" className="button button-ghost" disabled={!lotHasNext} onClick={() => setLotPage((value) => value + 1)}>التالي</button>
                </div>
              </div>
            ) : null}
          </section>

          {selectedCount > 0 ? (
            <section className={styles.selectionSummary}>
              <div className={styles.summaryHeader}>
                <div><span>الاختيار الحالي</span><strong>{selectedCount.toLocaleString("en-US")} لفة</strong></div>
                <button type="button" className="button button-ghost" onClick={() => setClearSelectionPending(true)}>مسح الكل</button>
              </div>
              {lotSelections.size > 0 ? (
                <div className={styles.selectedLots}>
                  {[...lotSelections.values()].map((selection) => (
                    <div key={selection.lotId}><code>{selection.lotNumber}</code><span>{selection.rollIds.size.toLocaleString("en-US")} لفة</span></div>
                  ))}
                </div>
              ) : null}
              {selectedDetails.size > 0 ? (
                <div className={styles.selectedPreview}>
                  {[...selectedDetails.values()].filter((detail) => selectedIds.has(detail.rollId)).slice(0, 8).map((detail) => (
                    <div key={detail.rollId}>
                      <code>{detail.serialNumber}</code>
                      <button type="button" onClick={() => removeRoll(detail.rollId)} aria-label={`إزالة ${detail.serialNumber}`}>إزالة</button>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          <div className={styles.stickyActions}>
            <button type="button" className="button button-primary" disabled={selectedCount === 0} onClick={() => {
              setStage("review");
              setFeedback(null);
            }}>مراجعة التحويل · {selectedCount.toLocaleString("en-US")}</button>
          </div>
        </>
      ) : null}

      {stage === "review" && recipient ? (
        <section className={styles.reviewSurface}>
          <div className={styles.taskHeading}>
            <p className={styles.stepLabel}>الخطوة 3 من 3</p>
            <h2>راجع قبل الإرسال</h2>
            <p>هذه آخر مراجعة قبل حجز اللفات داخل تحويل معلق.</p>
          </div>

          <RecipientCard recipient={recipient} compact />

          <div className={styles.reviewCount}>
            <span>عدد اللفات</span>
            <strong>{selectedCount.toLocaleString("en-US")}</strong>
          </div>

          {lotSelections.size > 0 ? (
            <div className={styles.reviewBreakdown}>
              <h3>تفصيل الكميات المحددة بالـLot</h3>
              {[...lotSelections.values()].map((selection) => (
                <div key={selection.lotId}>
                  <span><strong>{selection.productName}</strong><code>{selection.lotNumber}</code></span>
                  <b>{selection.rollIds.size.toLocaleString("en-US")} لفة</b>
                </div>
              ))}
            </div>
          ) : null}

          <div className={styles.custodyNotice}>
            <strong>ماذا يحدث عند الإرسال؟</strong>
            <p>سيتم حجز هذه اللفات للتحويل، وتظل العهدة المؤكدة لدى المرسل حتى الاستلام.</p>
          </div>

          <div className={styles.reviewActions}>
            <button type="button" className="button button-primary" disabled={submitLoading} onClick={() => { void submitTransfer(); }}>
              {submitLoading ? "جارٍ إرسال التحويل…" : `إرسال التحويل · ${selectedCount.toLocaleString("en-US")} لفة`}
            </button>
            <button type="button" className="button button-ghost" disabled={submitLoading} onClick={() => setStage("select")}>العودة للاختيار</button>
          </div>
        </section>
      ) : null}

      <QrScannerSheet
        open={scannerMode !== null}
        title={scannerMode === "recipient" ? "امسح Transfer ID" : "امسح QR اللفة"}
        instruction={scannerMode === "recipient"
          ? "وجّه الكاميرا إلى QR الخاص بالجهة المستلمة. لن نقبل QR رول أو أي كود آخر."
          : `وجّه الكاميرا إلى QR اللفة. المختار حاليًا: ${selectedCount.toLocaleString("en-US")} لفة.`}
        onClose={closeScanner}
        onDecode={handleScannerDecode}
      />

      {pendingLot ? (
        <div className={styles.decisionBackdrop} role="presentation">
          <section className={styles.decisionSheet} role="dialog" aria-modal="true" aria-labelledby="partial-lot-title">
            <p className={styles.stepLabel}>Lot جزئي</p>
            <h2 id="partial-lot-title">ليست كل لفات الـLot متاحة</h2>
            <code>{pendingLot.lot_number}</code>
            <div className={styles.lotMetrics}>
              <div><strong>{pendingLot.total_count.toLocaleString("en-US")}</strong><span>إجمالي</span></div>
              <div><strong>{pendingLot.available_count.toLocaleString("en-US")}</strong><span>متاحة</span></div>
              <div><strong>{pendingLot.reserved_count.toLocaleString("en-US")}</strong><span>محجوزة</span></div>
              <div><strong>{pendingLot.elsewhere_count.toLocaleString("en-US")}</strong><span>لدى جهات أخرى</span></div>
            </div>
            <p>سيتم اختيار اللفات المتاحة فقط، ولن يُسجل التحويل كأنه يحتوي الـLot بالكامل.</p>
            <div className={styles.decisionActions}>
              <button type="button" className="button button-primary" onClick={() => applyExpandedLot(pendingLot)}>اختيار {pendingLot.available_count.toLocaleString("en-US")} لفة المتاحة</button>
              <button type="button" className="button button-ghost" onClick={() => setPendingLot(null)}>إلغاء</button>
            </div>
          </section>
        </div>
      ) : null}

      {recipientChangePending ? (
        <div className={styles.decisionBackdrop} role="presentation">
          <section className={styles.decisionSheet} role="dialog" aria-modal="true" aria-labelledby="change-recipient-title">
            <p className={styles.stepLabel}>تغيير وجهة التحويل</p>
            <h2 id="change-recipient-title">تغيير المستلم مع وجود لفات محددة؟</h2>
            <p>لأن الوجهة تغيرت، لن نحتفظ باختيار جاهز للإرسال إلى مستلم آخر بشكل صامت. سيتم مسح اللفات الحالية ثم تعود لتحديد المستلم.</p>
            <div className={styles.decisionActions}>
              <button type="button" className="button button-primary" onClick={() => {
                clearSelection();
                resetRecipient();
              }}>تغيير المستلم ومسح الاختيار</button>
              <button type="button" className="button button-ghost" onClick={() => setRecipientChangePending(false)}>الاحتفاظ بالمستلم</button>
            </div>
          </section>
        </div>
      ) : null}

      {clearSelectionPending ? (
        <div className={styles.decisionBackdrop} role="presentation">
          <section className={styles.decisionSheet} role="dialog" aria-modal="true" aria-labelledby="clear-selection-title">
            <p className={styles.stepLabel}>الاختيار الحالي</p>
            <h2 id="clear-selection-title">مسح كل اللفات المحددة؟</h2>
            <p>سيتم إلغاء الاختيار الحالي فقط. لن يتم إنشاء أو إلغاء أي تحويل في قاعدة البيانات.</p>
            <div className={styles.decisionActions}>
              <button type="button" className="button button-primary" onClick={() => {
                clearSelection();
                setClearSelectionPending(false);
              }}>مسح {selectedCount.toLocaleString("en-US")} لفة</button>
              <button type="button" className="button button-ghost" onClick={() => setClearSelectionPending(false)}>الاحتفاظ بالاختيار</button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
