"use client";

import Link from "next/link";
import { FormEvent, useRef, useState, useTransition } from "react";
import {
  activateWarranty,
  resolveWarrantyActivationCandidate,
  type WarrantyActivationCandidate,
  type WarrantyActivationResult,
} from "@/app/operations/warranties/actions";
import { QrScannerSheet, type ScannerDecodeOutcome } from "@/components/transfers/qr-scanner-sheet";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { LocalDateTime } from "@/components/ui/local-date-time";
import { normalizeRollSerial, parseRollQrPayload } from "@/lib/rolls/roll-qr";
import {
  INTERNATIONAL_PHONE_GUIDANCE_AR,
  normalizeInternationalPhone,
} from "@/lib/warranty/international-phone";
import styles from "./warranty-activation-flow.module.css";

const errorMessages: Record<string, string> = {
  PG_WARRANTY_REQUEST_ID_REQUIRED: "تعذر تجهيز رقم المحاولة الآمن. أعد فتح شاشة التفعيل ثم حاول مرة أخرى.",
  PG_WARRANTY_REQUEST_CONFLICT: "هذه المحاولة الآمنة مرتبطة ببيانات مختلفة. أعد قراءة الرول وابدأ المحاولة من جديد.",
  PG_WARRANTY_CENTER_REQUIRED: "تفعيل ضمان العميل متاح من حساب مركز تركيب فقط.",
  PG_WARRANTY_CENTER_INACTIVE: "حساب المركز أو المركز نفسه غير نشط حاليًا.",
  PG_WARRANTY_SERIAL_INVALID: "رقم الرول أو QR غير صالح. امسح QR الأصلي على الرول أو أدخل السيريال الكامل.",
  PG_WARRANTY_ROLL_NOT_FOUND: "لم يتم العثور على هذا الرول في سجل Protection Giants.",
  PG_WARRANTY_PRODUCTION_INVALID: "أصل الإنتاج الخاص بهذا الرول غير صالح للتفعيل. يلزم مراجعة الإدارة.",
  PG_WARRANTY_CUSTODY_MISSING: "لا توجد عهدة مؤكدة لهذا الرول حاليًا. يلزم حسم العهدة أولًا.",
  PG_WARRANTY_NOT_CURRENT_CUSTODIAN: "هذا الرول ليس في العهدة المؤكدة الحالية لهذا المركز.",
  PG_WARRANTY_TRANSFER_RESERVED: "الرول مرتبط بتحويل نشط. يجب حسم التحويل أولًا قبل تفعيل الضمان.",
  PG_WARRANTY_ROLL_NOT_OPENED: "يجب تسجيل فتح الرول فعليًا قبل تفعيل ضمان العميل.",
  PG_WARRANTY_ISSUE_PENDING: "يوجد بلاغ ما قبل تركيب قيد قرار الشركة. التفعيل متوقف حتى حسم البلاغ.",
  PG_WARRANTY_RETURN_REQUIRED: "هذا الرول عليه قرار إرجاع سابق، لذلك لا يمكن استخدامه لتفعيل ضمان عميل.",
  PG_WARRANTY_ALREADY_ACTIVATED: "تم تفعيل ضمان فعّال لهذا الرول بالفعل.",
  PG_WARRANTY_POLICY_INCOMPLETE: "سياسة الضمان على المنتج غير مكتملة. يلزم أن تستكمل الإدارة المدة والتغطية وتعليمات العناية.",
  PG_WARRANTY_CUSTOMER_INVALID: `راجع بيانات العميل. ${INTERNATIONAL_PHONE_GUIDANCE_AR}`,
  PG_WARRANTY_VEHICLE_INVALID: "راجع بيانات السيارة وVIN/رقم الشاسيه قبل المتابعة.",
  PG_WARRANTY_CANDIDATE_INVALID: "تعذر التحقق من بيانات الرول الآن. أعد المحاولة.",
  PG_WARRANTY_CONFIRMATION_FAILED: "تم إرسال التفعيل لكن تعذر تحميل التأكيد. أعد نفس المحاولة دون تغيير البيانات حتى يسترجع النظام النتيجة بأمان.",
  PG_WARRANTY_FAILED: "تعذر إكمال تفعيل الضمان الآن. أعد المحاولة دون تغيير الرول أو البيانات.",
};

const retryRecheckCodes = new Set([
  "PG_WARRANTY_PRODUCTION_INVALID",
  "PG_WARRANTY_CUSTODY_MISSING",
  "PG_WARRANTY_NOT_CURRENT_CUSTODIAN",
  "PG_WARRANTY_TRANSFER_RESERVED",
  "PG_WARRANTY_ROLL_NOT_OPENED",
  "PG_WARRANTY_ISSUE_PENDING",
  "PG_WARRANTY_RETURN_REQUIRED",
  "PG_WARRANTY_ALREADY_ACTIVATED",
  "PG_WARRANTY_POLICY_INCOMPLETE",
]);

type Stage = "identify" | "details" | "review";
type Feedback = { tone: "error" | "warning" | "success" | "info"; text: string } | null;

type FormState = {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: string;
  vehiclePlate: string;
  vehicleColor: string;
  vehicleVin: string;
};

const emptyForm: FormState = {
  customerName: "",
  customerPhone: "",
  customerEmail: "",
  vehicleMake: "",
  vehicleModel: "",
  vehicleYear: "",
  vehiclePlate: "",
  vehicleColor: "",
  vehicleVin: "",
};

function warrantyError(code: string): string {
  return errorMessages[code] ?? "تعذر إكمال العملية. أعد المحاولة أو راجع مسؤول النظام إذا استمرت المشكلة.";
}

function validateDetails(form: FormState): string | null {
  if (form.customerName.trim().length < 2 || form.customerName.trim().length > 160) {
    return "اكتب اسم العميل بشكل واضح قبل المتابعة.";
  }
  if (!normalizeInternationalPhone(form.customerPhone)) {
    return INTERNATIONAL_PHONE_GUIDANCE_AR;
  }
  if (form.customerEmail.trim() && (form.customerEmail.trim().length < 3 || form.customerEmail.trim().length > 254)) {
    return "راجع البريد الإلكتروني للعميل أو اتركه فارغًا.";
  }
  if (!form.vehicleMake.trim() || form.vehicleMake.trim().length > 120) return "اكتب ماركة السيارة.";
  if (!form.vehicleModel.trim() || form.vehicleModel.trim().length > 120) return "اكتب موديل السيارة.";
  if (!/^[A-Z0-9]{6,40}$/.test(form.vehicleVin)) {
    return "VIN/رقم الشاسيه يجب أن يكون من 6 إلى 40 حرفًا أو رقمًا بدون مسافات.";
  }
  if (form.vehicleYear) {
    const year = Number(form.vehicleYear);
    if (!Number.isInteger(year) || year < 1886 || year > 2200) return "راجع سنة موديل السيارة.";
  }
  if (form.vehiclePlate.trim().length > 80 || form.vehicleColor.trim().length > 80) {
    return "راجع رقم اللوحة أو اللون؛ القيمة المدخلة أطول من المسموح.";
  }
  return null;
}

function candidateNotice(candidate: WarrantyActivationCandidate) {
  switch (candidate.eligibility) {
    case "not_opened":
      return {
        text: "هذا الرول في عهدة المركز لكنه غير مسجل كمفتوح. سجّل الفتح أولًا ثم ارجع للتفعيل.",
        href: "/operations/rolls/open",
        label: "فتح الرول",
      };
    case "transfer_reserved":
      return {
        text: "هذا الرول محجوز داخل تحويل نشط. أكمل أو احسم التحويل ثم أعد فحصه.",
        href: "/operations/transfers",
        label: "عرض التحويلات",
      };
    case "issue_pending":
      return {
        text: "يوجد بلاغ ما قبل تركيب قيد قرار الشركة. لا يمكن التفعيل حتى يتم حسمه.",
        href: "/operations/rolls/issues",
        label: "عرض البلاغات",
      };
    case "return_required":
      return {
        text: "صدر قرار إرجاع لهذا الرول، ولذلك لا يجوز استخدامه في تفعيل ضمان عميل.",
        href: "/operations/rolls/issues",
        label: "مراجعة البلاغ",
      };
    case "already_activated":
      return {
        text: candidate.existingWarrantyNumber
          ? `هذا الرول مرتبط بالفعل بالضمان ${candidate.existingWarrantyNumber}.`
          : "هذا الرول مرتبط بالفعل بضمان عميل فعّال.",
        href: candidate.existingWarrantyId ? `/operations/warranties/${candidate.existingWarrantyId}` : "/operations/warranties",
        label: "فتح الضمان",
      };
    case "policy_incomplete":
      return {
        text: "سياسة ضمان المنتج غير مكتملة. اطلب من الإدارة استكمال مدة الضمان والتغطية وتعليمات العناية ثم أعد الفحص.",
        href: "/operations/warranties",
        label: "العودة للضمانات",
      };
    case "production_invalid":
      return {
        text: "أصل الإنتاج الخاص بالرول غير صالح للتفعيل. يلزم مراجعة الإدارة قبل أي خطوة أخرى.",
        href: "/operations/warranties",
        label: "العودة للضمانات",
      };
    default:
      return null;
  }
}

export function WarrantyActivationFlow({
  publicSiteOrigin,
  centerName,
  initialSerial = "",
}: {
  publicSiteOrigin: string;
  centerName: string;
  initialSerial?: string;
}) {
  const [serialInput, setSerialInput] = useState(() => normalizeRollSerial(initialSerial) ?? "");
  const [candidate, setCandidate] = useState<WarrantyActivationCandidate | null>(null);
  const [stage, setStage] = useState<Stage>("identify");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [success, setSuccess] = useState<WarrantyActivationResult | null>(null);
  const [isResolving, startResolve] = useTransition();
  const [isActivating, startActivation] = useTransition();
  const requestIdRef = useRef<string | null>(null);

  function resetAttempt() {
    setCandidate(null);
    setStage("identify");
    setFeedback(null);
    setSuccess(null);
    setForm(emptyForm);
    requestIdRef.current = null;
  }

  async function resolveSerial(serial: string): Promise<boolean> {
    const normalized = normalizeRollSerial(serial);
    if (!normalized) {
      resetAttempt();
      setSerialInput(serial.trim().toUpperCase());
      setFeedback({ tone: "error", text: errorMessages.PG_WARRANTY_SERIAL_INVALID });
      return false;
    }

    const result = await resolveWarrantyActivationCandidate(normalized);
    if (!result.ok) {
      resetAttempt();
      setSerialInput(normalized);
      setFeedback({ tone: "error", text: warrantyError(result.code) });
      return false;
    }

    requestIdRef.current = null;
    setSuccess(null);
    setForm(emptyForm);
    setSerialInput(result.candidate.serialNumber);
    setCandidate(result.candidate);
    setStage("identify");
    setFeedback(null);
    return true;
  }

  function handleManualSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startResolve(() => {
      void resolveSerial(serialInput);
    });
  }

  async function handleQrDecode(payload: string): Promise<ScannerDecodeOutcome> {
    const serial = parseRollQrPayload(payload, publicSiteOrigin);
    if (!serial) {
      return {
        action: "continue",
        tone: "error",
        message: "هذا QR ليس QR رول صالحًا لهذه المنصة. وجّه الكاميرا إلى QR الموجود على ملصق الرول الخارجي.",
      };
    }

    try {
      const resolved = await resolveSerial(serial);
      return resolved
        ? { action: "close", tone: "success", message: "تم التعرف على الرول وفحص أهلية التفعيل." }
        : { action: "continue", tone: "warning", message: "تمت قراءة الرول لكن تعذر التحقق من أهليته الآن." };
    } catch {
      return {
        action: "continue",
        tone: "error",
        message: "تعذر التحقق من الرول الآن. أعد المحاولة أو استخدم الإدخال اليدوي.",
      };
    }
  }

  function moveToDetails() {
    if (!candidate || candidate.eligibility !== "eligible") return;
    setFeedback(null);
    setStage("details");
  }

  function moveToReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const error = validateDetails(form);
    if (error) {
      setFeedback({ tone: "error", text: error });
      return;
    }

    const normalizedPhone = normalizeInternationalPhone(form.customerPhone);
    if (!normalizedPhone) {
      setFeedback({ tone: "error", text: INTERNATIONAL_PHONE_GUIDANCE_AR });
      return;
    }

    setForm((current) => ({ ...current, customerPhone: normalizedPhone }));
    setFeedback(null);
    setStage("review");
  }

  function confirmActivation() {
    if (!candidate || candidate.eligibility !== "eligible" || isActivating) return;
    const validationError = validateDetails(form);
    if (validationError) {
      setStage("details");
      setFeedback({ tone: "error", text: validationError });
      return;
    }

    const normalizedPhone = normalizeInternationalPhone(form.customerPhone);
    if (!normalizedPhone) {
      setStage("details");
      setFeedback({ tone: "error", text: INTERNATIONAL_PHONE_GUIDANCE_AR });
      return;
    }

    if (!requestIdRef.current) requestIdRef.current = crypto.randomUUID();
    const requestId = requestIdRef.current;

    startActivation(() => {
      void (async () => {
        try {
          const result = await activateWarranty({
            requestId,
            serialNumber: candidate.serialNumber,
            customerName: form.customerName,
            customerPhone: normalizedPhone,
            customerEmail: form.customerEmail,
            vehicleMake: form.vehicleMake,
            vehicleModel: form.vehicleModel,
            vehicleYear: form.vehicleYear ? Number(form.vehicleYear) : null,
            vehiclePlate: form.vehiclePlate,
            vehicleColor: form.vehicleColor,
            vehicleVin: form.vehicleVin,
          });

          if (!result.ok) {
            setFeedback({ tone: "error", text: warrantyError(result.code) });

            if (result.code === "PG_WARRANTY_REQUEST_CONFLICT") {
              requestIdRef.current = null;
              setStage("identify");
              setCandidate(null);
              return;
            }

            if (retryRecheckCodes.has(result.code)) {
              requestIdRef.current = null;
              await resolveSerial(candidate.serialNumber);
            }
            return;
          }

          if (result.warranty.recordState !== "issued") {
            requestIdRef.current = null;
            await resolveSerial(candidate.serialNumber);
            setFeedback({
              tone: "warning",
              text: "هذه المحاولة تشير إلى تفعيل تاريخي تم إلغاؤه كخطأ. أعد بدء تفعيل جديد إذا ظل الرول مؤهلًا.",
            });
            return;
          }

          requestIdRef.current = null;
          setSuccess(result.warranty);
          setFeedback(null);
        } catch {
          setFeedback({
            tone: "error",
            text: "انقطع تأكيد العملية. أعد الضغط على تأكيد التفعيل دون تغيير البيانات؛ سيستخدم النظام نفس رقم الطلب بأمان ولن ينشئ ضمانًا مكررًا.",
          });
        }
      })();
    });
  }

  function startAnother() {
    setSerialInput("");
    resetAttempt();
  }

  if (success) {
    return (
      <div className={styles.flow}>
        <section className={styles.successCard} aria-live="polite">
          <div className={styles.successMark}>✓</div>
          <div>
            <h2>تم تفعيل ضمان العميل</h2>
            <p>بدأت مدة الضمان من وقت التفعيل المسجل في النظام. رقم الضمان مرجع تشغيلي ثابت وليس QR عام للعميل.</p>
          </div>

          <div className={styles.warrantyNumber} dir="ltr">{success.warrantyNumber}</div>

          <dl className={styles.summaryGrid}>
            <div><dt>المنتج</dt><dd>{success.productName}</dd></div>
            <div><dt>المركز</dt><dd>{success.activatingCenterName}</dd></div>
            <div><dt>العميل</dt><dd>{success.customerName}</dd></div>
            <div><dt>السيارة</dt><dd>{success.vehicleMake} {success.vehicleModel}</dd></div>
            <div><dt>VIN / الشاسيه</dt><dd dir="ltr">{success.vehicleVin}</dd></div>
            <div><dt>بداية الضمان</dt><dd><LocalDateTime value={success.activatedAt} /></dd></div>
            <div><dt>نهاية التغطية</dt><dd><LocalDateTime value={success.coverageExpiresAt} /></dd></div>
          </dl>

          <FeedbackBanner tone="success">
            اكتملت مهمة التركيب والتفعيل لهذا الرول. لا توجد خطوة تشغيلية أخرى عليه من المركز الآن؛ افتح تفاصيل الضمان فقط إذا أردت مراجعة البيانات المثبتة، وأي مطالبة مستقبلية تبدأ من الضمان نفسه لا من مسار ما قبل التركيب.
          </FeedbackBanner>

          <div className={styles.actions}>
            <Link href={`/operations/warranties/${success.warrantyId}`} className="button button-primary">فتح تفاصيل الضمان</Link>
            <button type="button" className="button button-secondary" onClick={startAnother}>تفعيل ضمان آخر</button>
          </div>
        </section>
      </div>
    );
  }

  const block = candidate ? candidateNotice(candidate) : null;

  return (
    <div className={styles.flow}>
      <ol className={styles.steps} aria-label="مراحل تفعيل الضمان">
        <li data-active={stage === "identify"}>1. الرول</li>
        <li data-active={stage === "details"}>2. العميل والسيارة</li>
        <li data-active={stage === "review"}>3. المراجعة والتأكيد</li>
      </ol>

      {stage === "identify" ? (
        <>
          <section className={styles.card}>
            <div className={styles.cardHeading}>
              <h2>حدد الرول الذي تم التركيب منه</h2>
              <p>امسح QR الخارجي أو أدخل السيريال. امتلاك السيريال وحده لا يمنح صلاحية؛ التحقق النهائي يتم من العهدة والفتح والبلاغات وحالة المنتج.</p>
            </div>

            <button type="button" className={`button button-primary ${styles.scanButton}`} onClick={() => setScannerOpen(true)}>
              مسح QR الرول
            </button>

            <form className={styles.manualForm} onSubmit={handleManualSubmit}>
              <label htmlFor="warranty-roll-serial">أو أدخل سيريال الرول</label>
              <div className={styles.manualRow}>
                <input
                  id="warranty-roll-serial"
                  className="input"
                  dir="ltr"
                  autoComplete="off"
                  placeholder="PG-R-YYYYMMDD-00000000-00-0000"
                  value={serialInput}
                  onChange={(event) => {
                    setSerialInput(event.target.value);
                    setCandidate(null);
                    setFeedback(null);
                    requestIdRef.current = null;
                  }}
                />
                <button type="submit" className="button button-secondary" disabled={isResolving || !serialInput.trim()}>
                  {isResolving ? "جارٍ التحقق…" : "تحقق من الأهلية"}
                </button>
              </div>
            </form>
          </section>

          {feedback ? <FeedbackBanner tone={feedback.tone}>{feedback.text}</FeedbackBanner> : null}

          {candidate ? (
            <section className={styles.card}>
              <div className={styles.candidateHeader}>
                <div>
                  <span className={styles.eyebrow}>الرول المحدد</span>
                  <h2>{candidate.productName}</h2>
                </div>
                <code>{candidate.serialNumber}</code>
              </div>

              <dl className={styles.summaryGrid}>
                <div><dt>المركز</dt><dd>{candidate.actingCenterName}</dd></div>
                <div><dt>SKU</dt><dd dir="ltr">{candidate.productCode}</dd></div>
                <div><dt>Lot</dt><dd dir="ltr">{candidate.lotNumber}</dd></div>
                <div><dt>وقت الفتح</dt><dd><LocalDateTime value={candidate.openedAt} /></dd></div>
                <div><dt>مدة الضمان</dt><dd>{candidate.warrantyMonths ? `${candidate.warrantyMonths} شهر` : "—"}</dd></div>
              </dl>

              {candidate.eligibility === "eligible" ? (
                <div className={styles.readyBox}>
                  <strong>الرول مؤهل للتفعيل الآن</strong>
                  <p>ستُعاد كل الشروط داخل المعاملة النهائية عند الضغط على التأكيد؛ نتيجة الفحص هنا إرشادية وليست تجاوزًا لقواعد قاعدة البيانات.</p>
                  <div className={styles.actions}>
                    <button type="button" className="button button-primary" onClick={moveToDetails}>متابعة لبيانات العميل</button>
                    <button type="button" className="button button-ghost" onClick={startAnother}>اختيار رول آخر</button>
                  </div>
                </div>
              ) : block ? (
                <div className={styles.blockedBox}>
                  <strong>لا يمكن التفعيل الآن</strong>
                  <p>{block.text}</p>
                  <div className={styles.actions}>
                    <Link href={block.href} className="button button-secondary">{block.label}</Link>
                    <button type="button" className="button button-ghost" onClick={startAnother}>اختيار رول آخر</button>
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}

      {stage === "details" && candidate ? (
        <>
          <section className={styles.card}>
            <div className={styles.cardHeading}>
              <h2>بيانات العميل والسيارة</h2>
              <p>لا يتم إنشاء حساب للعميل ولا طلب OTP أو صور أو فاتورة. أدخل فقط البيانات اللازمة لهوية الضمان.</p>
              <p>{INTERNATIONAL_PHONE_GUIDANCE_AR}</p>
            </div>

            <form className={styles.detailsForm} onSubmit={moveToReview}>
              <fieldset>
                <legend>العميل</legend>
                <div className={styles.fieldsGrid}>
                  <label><span>الاسم الكامل *</span><input className="input" autoComplete="name" maxLength={160} value={form.customerName} onChange={(event) => setForm({ ...form, customerName: event.target.value })} /></label>
                  <label><span>رقم الهاتف الدولي *</span><input className="input" dir="ltr" type="tel" inputMode="tel" autoComplete="tel" maxLength={32} placeholder="+20 10 1234 5678" title={INTERNATIONAL_PHONE_GUIDANCE_AR} value={form.customerPhone} onChange={(event) => setForm({ ...form, customerPhone: event.target.value })} /></label>
                  <label className={styles.fullField}><span>البريد الإلكتروني — اختياري</span><input className="input" dir="ltr" type="email" autoComplete="email" maxLength={254} value={form.customerEmail} onChange={(event) => setForm({ ...form, customerEmail: event.target.value })} /></label>
                </div>
              </fieldset>

              <fieldset>
                <legend>السيارة</legend>
                <div className={styles.fieldsGrid}>
                  <label><span>الماركة *</span><input className="input" maxLength={120} value={form.vehicleMake} onChange={(event) => setForm({ ...form, vehicleMake: event.target.value })} /></label>
                  <label><span>الموديل *</span><input className="input" maxLength={120} value={form.vehicleModel} onChange={(event) => setForm({ ...form, vehicleModel: event.target.value })} /></label>
                  <label className={styles.fullField}><span>VIN / رقم الشاسيه *</span><input className="input" dir="ltr" autoCapitalize="characters" autoComplete="off" minLength={6} maxLength={40} value={form.vehicleVin} onChange={(event) => setForm({ ...form, vehicleVin: event.target.value.toUpperCase().replace(/\s+/g, "") })} /></label>
                  <label><span>سنة الموديل — اختياري</span><input className="input" dir="ltr" type="number" inputMode="numeric" min={1886} max={2200} value={form.vehicleYear} onChange={(event) => setForm({ ...form, vehicleYear: event.target.value })} /></label>
                  <label><span>رقم اللوحة — اختياري</span><input className="input" maxLength={80} value={form.vehiclePlate} onChange={(event) => setForm({ ...form, vehiclePlate: event.target.value })} /></label>
                  <label><span>اللون — اختياري</span><input className="input" maxLength={80} value={form.vehicleColor} onChange={(event) => setForm({ ...form, vehicleColor: event.target.value })} /></label>
                </div>
              </fieldset>

              {feedback ? <FeedbackBanner tone={feedback.tone}>{feedback.text}</FeedbackBanner> : null}

              <div className={styles.actions}>
                <button type="submit" className="button button-primary">مراجعة البيانات</button>
                <button type="button" className="button button-ghost" onClick={() => { setStage("identify"); setFeedback(null); }}>رجوع للرول</button>
              </div>
            </form>
          </section>
        </>
      ) : null}

      {stage === "review" && candidate ? (
        <section className={styles.card}>
          <div className={styles.cardHeading}>
            <h2>راجع قبل التفعيل</h2>
            <p>هذه الخطوة تنشئ ضمان العميل فعليًا وتبدأ مدة التغطية من وقت التفعيل المسجل في النظام.</p>
          </div>

          <dl className={styles.reviewGrid}>
            <div><dt>المركز</dt><dd>{centerName}</dd></div>
            <div><dt>المنتج</dt><dd>{candidate.productName}</dd></div>
            <div><dt>الرول</dt><dd dir="ltr">{candidate.serialNumber}</dd></div>
            <div><dt>مدة الضمان</dt><dd>{candidate.warrantyMonths ? `${candidate.warrantyMonths} شهر` : "—"}</dd></div>
            <div><dt>العميل</dt><dd>{form.customerName.trim()}</dd></div>
            <div><dt>الهاتف</dt><dd dir="ltr">{normalizeInternationalPhone(form.customerPhone) ?? form.customerPhone.trim()}</dd></div>
            <div><dt>السيارة</dt><dd>{form.vehicleMake.trim()} {form.vehicleModel.trim()}</dd></div>
            <div><dt>VIN / الشاسيه</dt><dd dir="ltr">{form.vehicleVin}</dd></div>
          </dl>

          <div className={styles.irreversibleBox}>
            <strong>تأكيد تفعيل ضمان العميل</strong>
            <p>بعد النجاح لا يستطيع المركز تعديل الضمان أو إلغاءه. أي خطأ حقيقي بعد التفعيل يحتاج مسار دعم Admin مسجل في الـaudit، ولا يتم تغيير الرول داخل نفس الضمان.</p>
          </div>

          {feedback ? <FeedbackBanner tone={feedback.tone}>{feedback.text}</FeedbackBanner> : null}

          <div className={styles.actions}>
            <button type="button" className="button button-primary" onClick={confirmActivation} disabled={isActivating}>
              {isActivating ? "جارٍ تفعيل الضمان…" : "تأكيد تفعيل ضمان العميل"}
            </button>
            <button type="button" className="button button-ghost" onClick={() => { setStage("details"); setFeedback(null); }} disabled={isActivating}>
              تعديل البيانات
            </button>
          </div>
        </section>
      ) : null}

      <QrScannerSheet
        open={scannerOpen}
        title="مسح QR الرول"
        instruction="وجّه الكاميرا إلى QR الموجود على ملصق الرول الخارجي."
        onClose={() => setScannerOpen(false)}
        onDecode={handleQrDecode}
      />
    </div>
  );
}
