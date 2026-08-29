"use client";

import { FormEvent, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  assignWarrantyClaimResolution,
  changeWarrantyClaimResolutionRemedy,
  reassignWarrantyClaimResolution,
  releaseWarrantyClaimResolutionRoll,
  reserveWarrantyClaimResolutionRoll,
} from "@/app/operations/claim-resolutions/admin-actions";
import {
  completeWarrantyClaimResolutionByAdminRecovery,
  removeAdminRecoveryCompletionEvidence,
  uploadAdminRecoveryCompletionEvidence,
  type RecoveryEvidenceReference,
} from "@/app/operations/claim-resolutions/recovery-actions";
import { cancelAssignedResolutionForCustomerWithdrawal } from "@/app/operations/claim-resolutions/withdrawal-actions";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import styles from "./admin-claim-resolution-actions.module.css";

type Feedback = { tone: "error" | "warning" | "success" | "info"; text: string } | null;
type ActionKind = "assign" | "reassign" | "remedy" | "reserve" | "release" | "withdrawal";
type ActionResult = { ok: true } | { ok: false; code: string };

type CenterOption = {
  partyId: string;
  code: string;
  name: string;
};

type RollCandidate = {
  rollId: string;
  serialNumber: string;
  erpSerial: string | null;
  productCode: string;
  productName: string;
  productVersion: string;
};

type AdminClaimResolutionActionsProps = {
  resolutionId: string;
  resolutionStatus: string;
  remedyKind: string | null;
  performingCenterPartyId: string | null;
  performingCenterStatus: string | null;
  activeOperatorCount: number;
  allocationId: string | null;
  allocationStatus: string | null;
  replacementRollSerial: string | null;
  centers: CenterOption[];
  rollCandidates: RollCandidate[];
};

const stateRaceCodes = new Set([
  "PG_CLAIM_RESOLUTION_ASSIGN_STATE_INVALID",
  "PG_CLAIM_RESOLUTION_REASSIGN_STATE_INVALID",
  "PG_CLAIM_RESOLUTION_REMEDY_CHANGE_STATE_INVALID",
  "PG_CLAIM_RESOLUTION_MATERIAL_ACTIVE",
  "PG_CLAIM_ROLL_RESERVE_STATE_INVALID",
  "PG_CLAIM_ROLL_RELEASE_STATE_INVALID",
  "PG_CLAIM_RESOLUTION_WITHDRAWAL_STATE_INVALID",
  "PG_CLAIM_RESOLUTION_WITHDRAWAL_MATERIAL_CONSUMED",
  "PG_CLAIM_RESOLUTION_WITHDRAWAL_RELEASE_REQUIRED",
  "PG_CLAIM_RESOLUTION_ADMIN_RECOVERY_NOT_ALLOWED",
  "PG_CLAIM_RESOLUTION_COMPLETE_STATE_INVALID",
  "PG_CLAIM_CONSUMPTION_QUALITY_PENDING",
  "PG_CLAIM_CONSUMPTION_QUALITY_RETURN_REQUIRED",
]);

const errorMessages: Record<string, string> = {
  PG_CLAIM_RESOLUTION_ASSIGN_REQUEST_INVALID: "تعذر تجهيز محاولة الإسناد. حدّث الصفحة ثم حاول مرة أخرى.",
  PG_CLAIM_RESOLUTION_REASSIGN_REQUEST_INVALID: "بيانات إعادة الإسناد غير مكتملة أو غير صالحة.",
  PG_CLAIM_RESOLUTION_REMEDY_CHANGE_REQUEST_INVALID: "بيانات تصحيح أسلوب المعالجة غير مكتملة أو غير صالحة.",
  PG_CLAIM_RESOLUTION_REMEDY_INVALID: "أسلوب المعالجة المختار غير مدعوم.",
  PG_CLAIM_RESOLUTION_ASSIGN_STATE_INVALID: "حالة التنفيذ تغيّرت ولم يعد الإسناد متاحًا بهذه الصورة.",
  PG_CLAIM_RESOLUTION_REASSIGN_STATE_INVALID: "حالة التنفيذ أو المركز تغيّرت ولم تعد إعادة الإسناد متاحة.",
  PG_CLAIM_RESOLUTION_REMEDY_CHANGE_STATE_INVALID: "لا يمكن تصحيح أسلوب المعالجة في الحالة الحالية.",
  PG_CLAIM_RESOLUTION_CENTER_UNCHANGED: "اختر مركزًا مختلفًا لإعادة الإسناد.",
  PG_CLAIM_RESOLUTION_REMEDY_UNCHANGED: "اختر أسلوب معالجة مختلفًا عن الحالي.",
  PG_CLAIM_RESOLUTION_MATERIAL_ACTIVE: "يوجد تخصيص مادة نشط. حرّر اللفة غير المستخدمة أولًا قبل تغيير المركز أو أسلوب المعالجة.",
  PG_CLAIM_ROLL_RESERVE_REQUEST_INVALID: "تعذر تجهيز محاولة حجز اللفة. حدّث الصفحة ثم حاول مرة أخرى.",
  PG_CLAIM_ROLL_RESERVE_STATE_INVALID: "لم تعد الـResolution تسمح بحجز لفة استبدال الآن.",
  PG_CLAIM_ROLL_ALREADY_ALLOCATED: "يوجد بالفعل تخصيص مادة نشط لهذه المعالجة.",
  PG_CLAIM_REPLACEMENT_ROLL_NOT_FOUND: "اللفة المختارة لم تعد متاحة.",
  PG_CLAIM_ROLL_NOT_PERFORMING_CENTER: "اللفة لم تعد في عهدة مركز التنفيذ الحالي.",
  PG_CLAIM_ROLL_TRANSFER_RESERVED: "اللفة محجوزة في تحويل تشغيلي آخر.",
  PG_CLAIM_ROLL_ALREADY_OPENED: "اللفة فُتحت بالفعل ولا تصلح كمرشح حجز جديد لهذه الخطوة.",
  PG_CLAIM_ROLL_WARRANTY_EXISTS: "اللفة مرتبطة بضمان عميل ولا يمكن استخدامها كاستبدال.",
  PG_CLAIM_ROLL_RETURN_REQUIRED: "اللفة محظورة بسبب قرار جودة Return Required.",
  PG_CLAIM_ROLL_PREVIOUSLY_CONSUMED: "اللفة استُهلكت سابقًا في معالجة مطالبة.",
  PG_CLAIM_ROLL_PRODUCT_INELIGIBLE: "اللفة لم تعد متوافقة مع سياسة الاستبدال الحالية.",
  PG_CLAIM_ROLL_RELEASE_REQUEST_INVALID: "تعذر تجهيز تحرير اللفة.",
  PG_CLAIM_ROLL_RELEASE_REASON_INVALID: "اكتب سبب التحرير بوضوح من 5 إلى 500 حرف.",
  PG_CLAIM_ROLL_RELEASE_STATE_INVALID: "لا يمكن تحرير هذا التخصيص في حالته الحالية.",
  PG_CLAIM_ROLL_RELEASE_OPENED_INVALID: "اللفة فُتحت ولا يمكن تحريرها بهذا المسار قبل استيفاء مسار الجودة/الاسترداد المناسب.",
  PG_CLAIM_RESOLUTION_WITHDRAWAL_REASON_INVALID: "اكتب سبب إغلاق التنفيذ بناءً على رغبة العميل من 5 إلى 500 حرف.",
  PG_CLAIM_RESOLUTION_WITHDRAWAL_CUSTOMER_MESSAGE_INVALID: "اكتب رسالة آمنة للعميل من 5 إلى 1000 حرف.",
  PG_CLAIM_RESOLUTION_WITHDRAWAL_STATE_INVALID: "لم يعد إغلاق التنفيذ بناءً على رغبة العميل متاحًا في الحالة الحالية.",
  PG_CLAIM_RESOLUTION_WITHDRAWAL_RELEASE_REQUIRED: "حرّر لفة الاستبدال المحجوزة أولًا ثم أعد إغلاق التنفيذ.",
  PG_CLAIM_RESOLUTION_WITHDRAWAL_MATERIAL_CONSUMED: "المادة استُهلكت بالفعل؛ لا يجوز تسجيل انسحاب العميل بدل الإكمال الحقيقي.",
  PG_CLAIM_RESOLUTION_ACTION_REQUEST_CONFLICT: "رقم المحاولة نفسه استُخدم بمدخلات مختلفة. راجع الحالة وابدأ محاولة جديدة.",
  PG_CLAIM_RESOLUTION_NOT_FOUND: "لم يعد سجل التنفيذ متاحًا.",
  PG_CLAIM_WARRANTY_INVALID: "سجل الضمان المرتبط لم يعد صالحًا لهذا الإجراء.",
  PG_CLAIM_ADMIN_REQUIRED: "هذا الإجراء متاح لحساب Admin نشط فقط.",
  PG_WARRANTY_ADMIN_REQUIRED: "هذا الإجراء متاح لحساب Admin نشط فقط.",
  PG_CLAIM_FORBIDDEN: "لا تملك صلاحية تنفيذ هذا الإجراء.",
  PG_CLAIM_RESOLUTION_ADMIN_ACTION_FAILED: "تعذر إكمال الإجراء الآن. حدّث الصفحة ثم حاول مرة أخرى.",
  PG_CLAIM_RESOLUTION_WITHDRAWAL_FAILED: "تعذر إغلاق التنفيذ الآن. حدّث الصفحة ثم حاول مرة أخرى.",
};

function actionError(code: string) {
  return errorMessages[code] ?? "تعذر إكمال الإجراء الآن. حدّث الصفحة ثم حاول مرة أخرى.";
}

function remedyLabel(value: string) {
  return value === "replacement_roll_reinstall" ? "استبدال لفة وإعادة تركيب" : "إعادة تركيب / خدمة";
}

export function AdminClaimResolutionActions({
  resolutionId,
  resolutionStatus,
  remedyKind,
  performingCenterPartyId,
  performingCenterStatus,
  activeOperatorCount,
  allocationId,
  allocationStatus,
  replacementRollSerial,
  centers,
  rollCandidates,
}: AdminClaimResolutionActionsProps) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [isPending, startTransition] = useTransition();
  const requestIds = useRef<Partial<Record<ActionKind, string>>>({});

  const [assignCenter, setAssignCenter] = useState(centers[0]?.partyId ?? "");
  const [assignRemedy, setAssignRemedy] = useState<"service_reinstall" | "replacement_roll_reinstall">("service_reinstall");
  const reassignOptions = centers.filter((center) => center.partyId !== performingCenterPartyId);
  const [reassignCenter, setReassignCenter] = useState(reassignOptions[0]?.partyId ?? "");
  const [reassignReason, setReassignReason] = useState("");
  const alternateRemedy = remedyKind === "service_reinstall" ? "replacement_roll_reinstall" : "service_reinstall";
  const [nextRemedy, setNextRemedy] = useState<"service_reinstall" | "replacement_roll_reinstall">(
    alternateRemedy as "service_reinstall" | "replacement_roll_reinstall",
  );
  const [remedyReason, setRemedyReason] = useState("");
  const [selectedRollId, setSelectedRollId] = useState(rollCandidates[0]?.rollId ?? "");
  const [releaseReason, setReleaseReason] = useState("");
  const [withdrawalReason, setWithdrawalReason] = useState("");
  const [customerMessage, setCustomerMessage] = useState("");

  const materialActive = allocationStatus === "reserved" || allocationStatus === "consumed";
  const recoveryAllowed = resolutionStatus === "assigned"
    && (performingCenterStatus === "suspended" || activeOperatorCount === 0);

  function resetRequest(kind: ActionKind) {
    delete requestIds.current[kind];
  }

  function requestIdFor(kind: ActionKind) {
    if (!requestIds.current[kind]) requestIds.current[kind] = crypto.randomUUID();
    return requestIds.current[kind]!;
  }

  function handleResult(result: ActionResult, kind: ActionKind, successText: string) {
    if (!result.ok) {
      const tone = stateRaceCodes.has(result.code) ? "warning" : "error";
      setFeedback({ tone, text: actionError(result.code) });
      if (result.code === "PG_CLAIM_RESOLUTION_ACTION_REQUEST_CONFLICT") resetRequest(kind);
      if (stateRaceCodes.has(result.code)) router.refresh();
      return;
    }

    resetRequest(kind);
    setFeedback({ tone: "success", text: successText });
    router.refresh();
  }

  function execute(kind: ActionKind, task: () => Promise<ActionResult>, successText: string) {
    if (isPending) return;
    setFeedback(null);
    startTransition(() => {
      void (async () => {
        try {
          handleResult(await task(), kind, successText);
        } catch {
          setFeedback({
            tone: "error",
            text: "انقطع تأكيد العملية. أعد المحاولة دون تغيير المدخلات؛ سيستخدم النظام رقم المحاولة نفسه بأمان.",
          });
        }
      })();
    });
  }

  function submitAssign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!assignCenter) return setFeedback({ tone: "error", text: "اختر مركز تنفيذ صالحًا." });
    execute("assign", () => assignWarrantyClaimResolution({
      requestId: requestIdFor("assign"),
      resolutionId,
      remedyKind: assignRemedy,
      performingCenterPartyId: assignCenter,
    }), "تم إسناد التنفيذ إلى المركز المختار.");
  }

  function submitReassign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = reassignReason.trim();
    if (!reassignCenter || reason.length < 5 || reason.length > 500) {
      return setFeedback({ tone: "error", text: "اختر مركزًا مختلفًا واكتب سبب إعادة الإسناد من 5 إلى 500 حرف." });
    }
    execute("reassign", () => reassignWarrantyClaimResolution({
      requestId: requestIdFor("reassign"),
      resolutionId,
      performingCenterPartyId: reassignCenter,
      reason,
    }), "تمت إعادة إسناد التنفيذ.");
  }

  function submitRemedyChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = remedyReason.trim();
    if (reason.length < 5 || reason.length > 500) {
      return setFeedback({ tone: "error", text: "اكتب سبب تصحيح أسلوب المعالجة من 5 إلى 500 حرف." });
    }
    execute("remedy", () => changeWarrantyClaimResolutionRemedy({
      requestId: requestIdFor("remedy"),
      resolutionId,
      remedyKind: nextRemedy,
      reason,
    }), "تم تصحيح أسلوب المعالجة.");
  }

  function submitReserve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRollId) return setFeedback({ tone: "error", text: "لا توجد لفة مؤهلة محددة للحجز." });
    execute("reserve", () => reserveWarrantyClaimResolutionRoll({
      requestId: requestIdFor("reserve"),
      resolutionId,
      rollId: selectedRollId,
    }), "تم حجز لفة الاستبدال للمطالبة.");
  }

  function submitRelease(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = releaseReason.trim();
    if (!allocationId || reason.length < 5 || reason.length > 500) {
      return setFeedback({ tone: "error", text: "اكتب سبب تحرير اللفة من 5 إلى 500 حرف." });
    }
    execute("release", () => releaseWarrantyClaimResolutionRoll({
      requestId: requestIdFor("release"),
      allocationId,
      reason,
    }), "تم تحرير اللفة غير المستخدمة مع الاحتفاظ بسجل التخصيص.");
  }

  function submitWithdrawal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = withdrawalReason.trim();
    const message = customerMessage.trim();
    if (reason.length < 5 || reason.length > 500 || message.length < 5 || message.length > 1000) {
      return setFeedback({ tone: "error", text: "سبب الإغلاق مطلوب من 5 إلى 500 حرف، ورسالة العميل من 5 إلى 1000 حرف." });
    }
    execute("withdrawal", () => cancelAssignedResolutionForCustomerWithdrawal({
      requestId: requestIdFor("withdrawal"),
      resolutionId,
      reason,
      customerMessage: message,
    }), "تم إغلاق التنفيذ دون تسجيل خدمة غير منفذة، وبقي قرار المطالبة مقبولًا.");
  }

  if (resolutionStatus === "completed" || resolutionStatus === "cancelled") {
    return (
      <section className={styles.card}>
        <div className={styles.heading}>
          <div><span className={styles.eyebrow}>Resolution terminal state</span><h2>لا توجد إجراءات تشغيلية متبقية</h2></div>
        </div>
        <p className={styles.note}>السجل نهائي. راجع حقائق الإكمال أو الإغلاق وسجل المطالبة بدل محاولة تعديل الحالة.</p>
      </section>
    );
  }

  return (
    <section className={styles.stack} aria-label="إجراءات تنفيذ المطالبة">
      {feedback ? <FeedbackBanner tone={feedback.tone}>{feedback.text}</FeedbackBanner> : null}

      {resolutionStatus === "authorized" ? (
        <section className={styles.card}>
          <div className={styles.heading}>
            <div><span className={styles.eyebrow}>الخطوة الأولى</span><h2>إسناد المعالجة إلى مركز تنفيذ</h2></div>
          </div>
          {centers.length === 0 ? (
            <FeedbackBanner tone="warning">لا يوجد مركز نشط لديه مستخدم Center نشط يمكن إسناد المهمة إليه الآن.</FeedbackBanner>
          ) : (
            <form className={styles.form} onSubmit={submitAssign}>
              <label className={styles.field}>
                <span>أسلوب المعالجة</span>
                <select value={assignRemedy} disabled={isPending} onChange={(event) => {
                  resetRequest("assign");
                  setAssignRemedy(event.target.value as typeof assignRemedy);
                }}>
                  <option value="service_reinstall">إعادة تركيب / خدمة</option>
                  <option value="replacement_roll_reinstall">استبدال لفة وإعادة تركيب</option>
                </select>
              </label>
              <label className={styles.field}>
                <span>مركز التنفيذ</span>
                <select value={assignCenter} disabled={isPending} onChange={(event) => {
                  resetRequest("assign");
                  setAssignCenter(event.target.value);
                }}>
                  {centers.map((center) => <option key={center.partyId} value={center.partyId}>{center.name} ({center.code})</option>)}
                </select>
              </label>
              <div className={styles.actions}><button type="submit" className="button button-primary" disabled={isPending}>إسناد التنفيذ</button></div>
            </form>
          )}
        </section>
      ) : null}

      {resolutionStatus === "assigned" ? (
        <>
          <section className={styles.card}>
            <div className={styles.heading}>
              <div><span className={styles.eyebrow}>تصحيح قبل العمل غير القابل للعكس</span><h2>المركز وأسلوب المعالجة</h2></div>
            </div>
            {materialActive ? <FeedbackBanner tone="info">يوجد تخصيص مادة {allocationStatus === "consumed" ? "مستهلك" : "محجوز"}. لا يمكن تغيير المركز أو المعالجة قبل إنهاء شرط المادة المسموح.</FeedbackBanner> : null}
            <div className={styles.grid}>
              <form className={styles.form} onSubmit={submitReassign}>
                <div className={styles.heading}><h3>إعادة إسناد المركز</h3></div>
                {reassignOptions.length === 0 ? <p>لا يوجد مركز بديل قابل للإسناد حاليًا.</p> : (
                  <>
                    <label className={styles.field}>
                      <span>المركز الجديد</span>
                      <select value={reassignCenter} disabled={isPending || materialActive} onChange={(event) => {
                        resetRequest("reassign");
                        setReassignCenter(event.target.value);
                      }}>
                        {reassignOptions.map((center) => <option key={center.partyId} value={center.partyId}>{center.name} ({center.code})</option>)}
                      </select>
                    </label>
                    <label className={styles.field}>
                      <span>سبب إعادة الإسناد</span>
                      <textarea minLength={5} maxLength={500} required value={reassignReason} disabled={isPending || materialActive} onChange={(event) => {
                        resetRequest("reassign");
                        setReassignReason(event.target.value);
                      }} />
                    </label>
                    <div className={styles.actions}><button type="submit" className="button button-secondary" disabled={isPending || materialActive}>إعادة الإسناد</button></div>
                  </>
                )}
              </form>

              <form className={styles.form} onSubmit={submitRemedyChange}>
                <div className={styles.heading}><h3>تصحيح أسلوب المعالجة</h3></div>
                <label className={styles.field}>
                  <span>الأسلوب الجديد</span>
                  <select value={nextRemedy} disabled={isPending || materialActive} onChange={(event) => {
                    resetRequest("remedy");
                    setNextRemedy(event.target.value as typeof nextRemedy);
                  }}>
                    <option value={alternateRemedy}>{remedyLabel(alternateRemedy)}</option>
                  </select>
                </label>
                <label className={styles.field}>
                  <span>سبب التصحيح</span>
                  <textarea minLength={5} maxLength={500} required value={remedyReason} disabled={isPending || materialActive} onChange={(event) => {
                    resetRequest("remedy");
                    setRemedyReason(event.target.value);
                  }} />
                </label>
                <div className={styles.actions}><button type="submit" className="button button-secondary" disabled={isPending || materialActive}>تحديث المعالجة</button></div>
              </form>
            </div>
          </section>

          {remedyKind === "replacement_roll_reinstall" ? (
            <section className={styles.card}>
              <div className={styles.heading}>
                <div><span className={styles.eyebrow}>مادة الاستبدال</span><h2>لفة الاستبدال</h2></div>
              </div>
              {allocationStatus === "reserved" && allocationId ? (
                <form className={styles.form} onSubmit={submitRelease}>
                  <p>اللفة المحجوزة: <strong dir="ltr">{replacementRollSerial ?? "غير متاح"}</strong>. التحرير لا يلغي Opening أو تاريخ الجودة إن وُجدا.</p>
                  <label className={styles.field}>
                    <span>سبب تحرير اللفة</span>
                    <textarea minLength={5} maxLength={500} required value={releaseReason} disabled={isPending} onChange={(event) => {
                      resetRequest("release");
                      setReleaseReason(event.target.value);
                    }} />
                  </label>
                  <div className={styles.actions}>
                    <ConfirmSubmitButton
                      title="تحرير لفة الاستبدال؟"
                      description="سيبقى سجل التخصيص محفوظًا، ولن ينقل النظام اللفة أو يتراجع عن أي Opening/Quality fact."
                      confirmLabel="تأكيد التحرير"
                      disabled={isPending || releaseReason.trim().length < 5}
                    >تحرير اللفة</ConfirmSubmitButton>
                  </div>
                </form>
              ) : allocationStatus === "consumed" ? (
                <FeedbackBanner tone="info">تم استهلاك لفة الاستبدال فعليًا لهذه المعالجة ولا يمكن تحريرها أو استبدالها.</FeedbackBanner>
              ) : rollCandidates.length === 0 ? (
                <FeedbackBanner tone="info">لا توجد حاليًا لفة مؤهلة غير مفتوحة في عهدة مركز التنفيذ. استخدم مسار Transfer العادي عند الحاجة؛ هذه الصفحة لا تنشئ تحويلًا تلقائيًا.</FeedbackBanner>
              ) : (
                <form className={styles.form} onSubmit={submitReserve}>
                  <label className={styles.field}>
                    <span>لفة مؤهلة في عهدة المركز</span>
                    <select value={selectedRollId} disabled={isPending} onChange={(event) => {
                      resetRequest("reserve");
                      setSelectedRollId(event.target.value);
                    }}>
                      {rollCandidates.map((roll) => (
                        <option key={roll.rollId} value={roll.rollId}>
                          {roll.serialNumber} · {roll.productName} ({roll.productCode}){roll.erpSerial ? ` · ERP ${roll.erpSerial}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p>القائمة استشارية ومحصورة في عهدة مركز التنفيذ؛ الحجز يعيد التحقق من كل الشروط والسياسة تحت locks.</p>
                  <div className={styles.actions}><button type="submit" className="button button-primary" disabled={isPending}>حجز اللفة</button></div>
                </form>
              )}
            </section>
          ) : null}

          <section className={styles.card}>
            <div className={styles.heading}>
              <div><span className={styles.eyebrow}>PD-079</span><h2>إغلاق التنفيذ بناءً على رغبة العميل</h2></div>
            </div>
            {allocationStatus === "reserved" ? (
              <FeedbackBanner tone="warning">لا يمكن إغلاق التنفيذ الآن. حرّر لفة الاستبدال المحجوزة صراحة أولًا.</FeedbackBanner>
            ) : allocationStatus === "consumed" ? (
              <FeedbackBanner tone="warning">لا يمكن استخدام مسار انسحاب العميل بعد استهلاك المادة. يجب تسجيل حقيقة الإكمال الفعلية عبر المسار الصحيح.</FeedbackBanner>
            ) : (
              <form className={styles.form} onSubmit={submitWithdrawal}>
                <label className={styles.field}>
                  <span>سبب داخلي موثق</span>
                  <textarea minLength={5} maxLength={500} required value={withdrawalReason} disabled={isPending} onChange={(event) => {
                    resetRequest("withdrawal");
                    setWithdrawalReason(event.target.value);
                  }} />
                </label>
                <label className={styles.field}>
                  <span>رسالة آمنة للعميل</span>
                  <textarea minLength={5} maxLength={1000} required value={customerMessage} disabled={isPending} onChange={(event) => {
                    resetRequest("withdrawal");
                    setCustomerMessage(event.target.value);
                  }} />
                </label>
                <p>هذا لا يرفض المطالبة ولا يلغي الضمان؛ يغلق فقط التنفيذ المادي دون تسجيل خدمة لم تتم.</p>
                <div className={styles.actions}>
                  <ConfirmSubmitButton
                    title="إغلاق التنفيذ دون إكمال؟"
                    description="استخدم هذا المسار فقط عندما يرفض/يلغي العميل استكمال الخدمة بعد الإسناد."
                    confirmLabel="تأكيد إغلاق التنفيذ"
                    tone="danger"
                    disabled={isPending || withdrawalReason.trim().length < 5 || customerMessage.trim().length < 5}
                  >إغلاق التنفيذ</ConfirmSubmitButton>
                </div>
              </form>
            )}
          </section>

          {recoveryAllowed ? (
            <AdminRecoveryCompletionPanel
              resolutionId={resolutionId}
              remedyKind={remedyKind}
              expectedRollSerial={replacementRollSerial}
            />
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function AdminRecoveryCompletionPanel({
  resolutionId,
  remedyKind,
  expectedRollSerial,
}: {
  resolutionId: string;
  remedyKind: string | null;
  expectedRollSerial: string | null;
}) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [evidence, setEvidence] = useState<RecoveryEvidenceReference[]>([]);
  const [completionNote, setCompletionNote] = useState("");
  const [recoveryReason, setRecoveryReason] = useState("");
  const [replacementRollSerial, setReplacementRollSerial] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const requestIdRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isReplacement = remedyKind === "replacement_roll_reinstall";

  function resetRequest() {
    requestIdRef.current = null;
  }

  function recoveryError(code: string) {
    const messages: Record<string, string> = {
      PG_CLAIM_RESOLUTION_ADMIN_RECOVERY_NOT_ALLOWED: "عاد مسار الإكمال الطبيعي للمركز متاحًا أو لم تعد شروط Admin recovery قائمة. حدّث الصفحة.",
      PG_CLAIM_RESOLUTION_EVIDENCE_SIZE_INVALID: "كل صورة يجب أن تكون أكبر من صفر وألا تتجاوز 8 MiB.",
      PG_CLAIM_RESOLUTION_EVIDENCE_TYPE_INVALID: "المسموح صور JPEG أو PNG أو WebP حقيقية فقط.",
      PG_CLAIM_RESOLUTION_EVIDENCE_UPLOAD_FAILED: "تعذر رفع صورة الإكمال.",
      PG_CLAIM_RESOLUTION_EVIDENCE_UPLOAD_AMBIGUOUS: "تعذر تأكيد نتيجة رفع الصورة. أعد اختيار الملف نفسه؛ المسار المحتوى-المعنون يجعل إعادة المحاولة آمنة.",
      PG_CLAIM_RESOLUTION_EVIDENCE_REMOVE_FAILED: "تعذر حذف صورة الإكمال المرفوعة.",
      PG_CLAIM_RESOLUTION_COMPLETION_NOTE_INVALID: "ملاحظة الإكمال مطلوبة من 10 إلى 2000 حرف.",
      PG_CLAIM_RESOLUTION_ADMIN_RECOVERY_REASON_INVALID: "سبب استخدام Admin recovery مطلوب من 5 إلى 500 حرف.",
      PG_CLAIM_RESOLUTION_REPLACEMENT_SCAN_INVALID: "أدخل الرقم الفعلي للفة الاستبدال المستخدمة.",
      PG_CLAIM_RESOLUTION_REPLACEMENT_SCAN_MISMATCH: "رقم اللفة المدخل لا يطابق اللفة المحجوزة لهذه المعالجة.",
      PG_CLAIM_CONSUMPTION_OPENING_INVALID: "لفة الاستبدال لم تسجل Opening صالحًا بعد.",
      PG_CLAIM_CONSUMPTION_QUALITY_PENDING: "يوجد بلاغ جودة ما قبل التركيب ما زال قيد المراجعة.",
      PG_CLAIM_CONSUMPTION_QUALITY_RETURN_REQUIRED: "اللفة محظورة بقرار Return Required ولا يجوز إكمال المعالجة بها.",
      PG_CLAIM_RESOLUTION_ACTION_REQUEST_CONFLICT: "رقم محاولة الإكمال استُخدم بمدخلات مختلفة. راجع الحالة وابدأ محاولة جديدة.",
      PG_CLAIM_RESOLUTION_ADMIN_RECOVERY_FAILED: "تعذر إكمال Admin recovery الآن. حدّث الصفحة ثم أعد المحاولة.",
    };
    return messages[code] ?? "تعذر إكمال Admin recovery الآن. حدّث الصفحة ثم أعد المحاولة.";
  }

  async function uploadFiles(files: FileList | null) {
    if (!files?.length || isUploading || isPending) return;
    const current = [...evidence];
    const freeSlots = [1, 2, 3, 4, 5].filter((slot) => !current.some((item) => item.slot === slot));
    const selected = Array.from(files).slice(0, freeSlots.length);
    if (selected.length === 0) {
      setFeedback({ tone: "warning", text: "تم الوصول إلى الحد الأقصى: 5 صور." });
      return;
    }

    setIsUploading(true);
    setFeedback(null);
    try {
      for (let index = 0; index < selected.length; index += 1) {
        const slot = freeSlots[index];
        const result = await uploadAdminRecoveryCompletionEvidence(resolutionId, slot, selected[index]);
        if (!result.ok) {
          setFeedback({ tone: "error", text: recoveryError(result.code) });
          break;
        }
        const position = current.findIndex((item) => item.slot === slot);
        if (position >= 0) current[position] = result.evidence;
        else current.push(result.evidence);
        current.sort((left, right) => left.slot - right.slot);
        setEvidence([...current]);
        resetRequest();
      }
    } catch {
      setFeedback({ tone: "error", text: "انقطع تأكيد رفع الصورة. أعد اختيار الملف نفسه لإعادة المحاولة بأمان." });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function removeEvidence(item: RecoveryEvidenceReference) {
    if (isUploading || isPending) return;
    setFeedback(null);
    try {
      const result = await removeAdminRecoveryCompletionEvidence(resolutionId, item.storagePath);
      if (!result.ok) {
        setFeedback({ tone: "error", text: recoveryError(result.code ?? "") });
        return;
      }
      setEvidence((current) => current.filter((evidenceItem) => evidenceItem.storagePath !== item.storagePath));
      resetRequest();
    } catch {
      setFeedback({ tone: "error", text: "انقطع تأكيد حذف الصورة. حدّث الصفحة قبل المتابعة إذا استمرت المشكلة." });
    }
  }

  function submitRecovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isUploading || isPending) return;
    const note = completionNote.trim();
    const reason = recoveryReason.trim();
    const scan = replacementRollSerial.trim();
    if (note.length < 10 || note.length > 2000) {
      return setFeedback({ tone: "error", text: recoveryError("PG_CLAIM_RESOLUTION_COMPLETION_NOTE_INVALID") });
    }
    if (reason.length < 5 || reason.length > 500) {
      return setFeedback({ tone: "error", text: recoveryError("PG_CLAIM_RESOLUTION_ADMIN_RECOVERY_REASON_INVALID") });
    }
    if (evidence.length < 1) {
      return setFeedback({ tone: "error", text: "ارفع صورة إكمال واحدة على الأقل قبل Admin recovery." });
    }
    if (isReplacement && (!scan || (expectedRollSerial && scan !== expectedRollSerial))) {
      return setFeedback({ tone: "error", text: recoveryError("PG_CLAIM_RESOLUTION_REPLACEMENT_SCAN_MISMATCH") });
    }
    if (!requestIdRef.current) requestIdRef.current = crypto.randomUUID();
    const requestId = requestIdRef.current;

    startTransition(() => {
      void (async () => {
        try {
          const result = await completeWarrantyClaimResolutionByAdminRecovery({
            requestId,
            resolutionId,
            completionNote: note,
            recoveryReason: reason,
            evidencePaths: evidence.map((item) => item.storagePath),
            replacementRollSerial: isReplacement ? scan : undefined,
          });
          if (!result.ok) {
            const tone = stateRaceCodes.has(result.code) ? "warning" : "error";
            setFeedback({ tone, text: recoveryError(result.code) });
            if (result.code === "PG_CLAIM_RESOLUTION_ACTION_REQUEST_CONFLICT") resetRequest();
            if (stateRaceCodes.has(result.code)) router.refresh();
            return;
          }
          resetRequest();
          setFeedback({ tone: "success", text: "تم تسجيل الإكمال عبر مسار Admin recovery الاستثنائي." });
          router.refresh();
        } catch {
          setFeedback({ tone: "error", text: "انقطع تأكيد الإكمال. أعد المحاولة دون تغيير المدخلات؛ سيستخدم النظام رقم المحاولة نفسه بأمان." });
        }
      })();
    });
  }

  return (
    <section className={styles.card}>
      <div className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>استثناء مقيد</span>
          <h2>Admin recovery بعد فقد قدرة المركز</h2>
        </div>
      </div>
      <FeedbackBanner tone="warning">استخدم هذا المسار فقط عندما يكون العمل الحقيقي قد تم ويمكن إثباته، بينما المركز المسند أصبح موقوفًا أو بلا مستخدم Center نشط. إذا عاد المسار الطبيعي متاحًا سترفض السلطة النهائية الإجراء.</FeedbackBanner>
      {feedback ? <FeedbackBanner tone={feedback.tone}>{feedback.text}</FeedbackBanner> : null}

      <div className={styles.form}>
        <div className={styles.evidenceTop}>
          <div>
            <strong>صور إكمال خاصة</strong>
            <p>من 1 إلى 5 صور، JPEG/PNG/WebP، بحد أقصى 8 MiB للصورة.</p>
          </div>
          <label className="button button-secondary">
            {isUploading ? "جاري الرفع…" : "إضافة صور"}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              hidden
              disabled={isUploading || isPending || evidence.length >= 5}
              onChange={(event) => void uploadFiles(event.target.files)}
            />
          </label>
        </div>
        {evidence.length > 0 ? (
          <div className={styles.evidenceList} aria-label="صور الإكمال المرفوعة">
            {evidence.map((item) => (
              <div className={styles.evidenceItem} key={item.storagePath}>
                <div className={styles.evidenceMeta}>
                  <strong>صورة {item.slot}</strong>
                  <span>{item.mimeType} · {(item.sizeBytes / 1024).toFixed(0)} KiB</span>
                </div>
                <button type="button" className="button button-ghost" disabled={isUploading || isPending} onClick={() => void removeEvidence(item)}>حذف</button>
              </div>
            ))}
          </div>
        ) : <p>لم تُرفع صور بعد.</p>}
      </div>

      <form className={styles.form} onSubmit={submitRecovery}>
        <label className={styles.field}>
          <span>سبب استخدام Admin recovery</span>
          <textarea minLength={5} maxLength={500} required value={recoveryReason} disabled={isPending || isUploading} onChange={(event) => {
            resetRequest();
            setRecoveryReason(event.target.value);
          }} />
        </label>
        <label className={styles.field}>
          <span>ملاحظة الإكمال الفعلية</span>
          <textarea minLength={10} maxLength={2000} required value={completionNote} disabled={isPending || isUploading} onChange={(event) => {
            resetRequest();
            setCompletionNote(event.target.value);
          }} />
        </label>
        {isReplacement ? (
          <label className={styles.field}>
            <span>رقم اللفة المستخدمة فعليًا</span>
            <input dir="ltr" required value={replacementRollSerial} disabled={isPending || isUploading} onChange={(event) => {
              resetRequest();
              setReplacementRollSerial(event.target.value);
            }} placeholder={expectedRollSerial ?? "Scan / serial"} />
          </label>
        ) : null}
        <div className={styles.actions}>
          <ConfirmSubmitButton
            title="تسجيل إكمال استثنائي بواسطة Admin؟"
            description="سيُغلق الـResolution والمطالبة ويُسجل actor_kind=admin_recovery. لا تستخدمه كبديل عن مركز قادر على الإكمال الطبيعي."
            confirmLabel="تأكيد Admin recovery"
            disabled={isPending || isUploading || evidence.length < 1 || completionNote.trim().length < 10 || recoveryReason.trim().length < 5}
          >{isPending ? "جاري الإكمال…" : "إكمال عبر Admin recovery"}</ConfirmSubmitButton>
        </div>
      </form>
    </section>
  );
}
