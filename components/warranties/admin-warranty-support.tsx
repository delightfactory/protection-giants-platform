"use client";

import { FormEvent, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  correctWarrantyDetails,
  voidWarrantyInError,
} from "@/app/operations/warranties/support-actions";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import {
  INTERNATIONAL_PHONE_GUIDANCE_AR,
  normalizeInternationalPhone,
} from "@/lib/warranty/international-phone";
import styles from "./admin-warranty-support.module.css";

type WarrantyDetails = {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number | null;
  vehiclePlate: string;
  vehicleColor: string;
  vehicleVin: string;
};

type Feedback = { tone: "error" | "warning" | "success" | "info"; text: string } | null;

const errorMessages: Record<string, string> = {
  PG_WARRANTY_REQUEST_ID_REQUIRED: "تعذر تجهيز رقم المحاولة الآمن. أعد فتح صفحة الضمان ثم حاول مرة أخرى.",
  PG_WARRANTY_REQUEST_CONFLICT: "نفس رقم المحاولة استُخدم ببيانات مختلفة. راجع الضمان وابدأ محاولة جديدة.",
  PG_WARRANTY_ADMIN_REQUIRED: "هذا الإجراء متاح لحساب Admin نشط فقط.",
  PG_WARRANTY_NOT_FOUND: "لم يعد هذا الضمان متاحًا في النطاق الحالي.",
  PG_WARRANTY_DETAILS_INVALID: `راجع بيانات العميل والسيارة. ${INTERNATIONAL_PHONE_GUIDANCE_AR}`,
  PG_WARRANTY_CORRECTION_REASON_INVALID: "اكتب سببًا واضحًا من 5 إلى 500 حرف يشرح سبب الإجراء.",
  PG_WARRANTY_ALREADY_VOIDED: "هذا التفعيل أُلغي كخطأ بالفعل ولا يقبل تعديلات جديدة.",
  PG_WARRANTY_SUPPORT_FAILED: "تعذر إكمال الإجراء الآن. أعد المحاولة بنفس البيانات، أو راجع مسؤول النظام إذا استمرت المشكلة.",
};

function supportError(code: string) {
  return errorMessages[code] ?? errorMessages.PG_WARRANTY_SUPPORT_FAILED;
}

function normalizeDetails(details: WarrantyDetails): WarrantyDetails {
  return {
    customerName: details.customerName.trim(),
    customerPhone: normalizeInternationalPhone(details.customerPhone) ?? details.customerPhone.trim(),
    customerEmail: details.customerEmail.trim().toLowerCase(),
    vehicleMake: details.vehicleMake.trim(),
    vehicleModel: details.vehicleModel.trim(),
    vehicleYear: details.vehicleYear,
    vehiclePlate: details.vehiclePlate.trim(),
    vehicleColor: details.vehicleColor.trim(),
    vehicleVin: details.vehicleVin.trim().toUpperCase().replace(/\s+/g, ""),
  };
}

function validateDetails(details: WarrantyDetails, reason: string): string | null {
  const normalized = normalizeDetails(details);
  if (normalized.customerName.length < 2 || normalized.customerName.length > 160) return "راجع اسم العميل.";
  if (!normalizeInternationalPhone(details.customerPhone)) return INTERNATIONAL_PHONE_GUIDANCE_AR;
  if (normalized.customerEmail && (normalized.customerEmail.length < 3 || normalized.customerEmail.length > 254)) return "راجع البريد الإلكتروني أو اتركه فارغًا.";
  if (!normalized.vehicleMake || normalized.vehicleMake.length > 120) return "راجع ماركة السيارة.";
  if (!normalized.vehicleModel || normalized.vehicleModel.length > 120) return "راجع موديل السيارة.";
  if (normalized.vehicleYear !== null && (normalized.vehicleYear < 1886 || normalized.vehicleYear > 2200)) return "راجع سنة موديل السيارة.";
  if (normalized.vehiclePlate.length > 80 || normalized.vehicleColor.length > 80) return "راجع رقم اللوحة أو اللون.";
  if (!/^[A-Z0-9]{6,40}$/.test(normalized.vehicleVin)) return "VIN/رقم الشاسيه يجب أن يكون من 6 إلى 40 حرفًا أو رقمًا بدون مسافات.";
  const normalizedReason = reason.trim();
  if (normalizedReason.length < 5 || normalizedReason.length > 500) return "اكتب سبب التصحيح بوضوح من 5 إلى 500 حرف.";
  return null;
}

function sameDetails(a: WarrantyDetails, b: WarrantyDetails) {
  return JSON.stringify(normalizeDetails(a)) === JSON.stringify(normalizeDetails(b));
}

export function AdminWarrantySupport({
  warrantyId,
  warrantyNumber,
  initialDetails,
}: {
  warrantyId: string;
  warrantyNumber: string;
  initialDetails: WarrantyDetails;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [details, setDetails] = useState<WarrantyDetails>(initialDetails);
  const [correctionReason, setCorrectionReason] = useState("");
  const [voidReason, setVoidReason] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [isCorrecting, startCorrection] = useTransition();
  const [isVoiding, startVoid] = useTransition();
  const correctionRequestIdRef = useRef<string | null>(null);
  const voidRequestIdRef = useRef<string | null>(null);

  function updateDetail<K extends keyof WarrantyDetails>(key: K, value: WarrantyDetails[K]) {
    correctionRequestIdRef.current = null;
    setFeedback(null);
    setDetails((current) => ({ ...current, [key]: value }));
  }

  function cancelCorrection() {
    if (isCorrecting) return;
    correctionRequestIdRef.current = null;
    setDetails(initialDetails);
    setCorrectionReason("");
    setFeedback(null);
    setEditing(false);
  }

  function submitCorrection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isCorrecting) return;

    const validation = validateDetails(details, correctionReason);
    if (validation) {
      setFeedback({ tone: "error", text: validation });
      return;
    }
    if (sameDetails(details, initialDetails)) {
      setFeedback({ tone: "warning", text: "لم تتغير بيانات العميل أو السيارة. لا يوجد تصحيح لحفظه." });
      return;
    }

    if (!correctionRequestIdRef.current) correctionRequestIdRef.current = crypto.randomUUID();
    const requestId = correctionRequestIdRef.current;
    const normalized = normalizeDetails(details);

    startCorrection(() => {
      void (async () => {
        try {
          const result = await correctWarrantyDetails({
            requestId,
            warrantyId,
            ...normalized,
            reason: correctionReason.trim(),
          });
          if (!result.ok) {
            setFeedback({
              tone: result.code === "PG_WARRANTY_ALREADY_VOIDED" ? "warning" : "error",
              text: supportError(result.code),
            });
            if (result.code === "PG_WARRANTY_ALREADY_VOIDED") router.refresh();
            if (result.code === "PG_WARRANTY_REQUEST_CONFLICT") correctionRequestIdRef.current = null;
            return;
          }

          correctionRequestIdRef.current = null;
          setDetails(normalized);
          setCorrectionReason("");
          setEditing(false);
          setFeedback({ tone: "success", text: "تم حفظ التصحيح وتسجيل Before/After في سجل التدقيق." });
          router.refresh();
        } catch {
          setFeedback({
            tone: "error",
            text: "انقطع تأكيد التصحيح. أعد الحفظ بنفس البيانات دون تعديلها؛ سيستخدم النظام نفس رقم المحاولة بأمان.",
          });
        }
      })();
    });
  }

  function submitVoid(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isVoiding) return;

    const reason = voidReason.trim();
    if (reason.length < 5 || reason.length > 500) {
      setFeedback({ tone: "error", text: "اكتب سبب الإلغاء كخطأ بوضوح من 5 إلى 500 حرف." });
      return;
    }

    if (!voidRequestIdRef.current) voidRequestIdRef.current = crypto.randomUUID();
    const requestId = voidRequestIdRef.current;

    startVoid(() => {
      void (async () => {
        try {
          const result = await voidWarrantyInError({ requestId, warrantyId, reason });
          if (!result.ok) {
            setFeedback({
              tone: result.code === "PG_WARRANTY_ALREADY_VOIDED" ? "warning" : "error",
              text: supportError(result.code),
            });
            if (result.code === "PG_WARRANTY_ALREADY_VOIDED") router.refresh();
            if (result.code === "PG_WARRANTY_REQUEST_CONFLICT") voidRequestIdRef.current = null;
            return;
          }

          voidRequestIdRef.current = null;
          setVoidReason("");
          setFeedback({
            tone: "success",
            text: "تم إلغاء التفعيل المسجل بالخطأ مع الاحتفاظ بالسجل ورقم الضمان وسجل التدقيق كاملًا.",
          });
          router.refresh();
        } catch {
          setFeedback({
            tone: "error",
            text: "انقطع تأكيد الإلغاء. أعد التنفيذ بنفس السبب دون تغييره؛ سيستخدم النظام نفس رقم المحاولة بأمان.",
          });
        }
      })();
    });
  }

  return (
    <section className={styles.stack} aria-label="دعم الضمان الإداري">
      {feedback ? <FeedbackBanner tone={feedback.tone}>{feedback.text}</FeedbackBanner> : null}

      <section className={styles.card}>
        <div className={styles.heading}>
          <div>
            <span className={styles.eyebrow}>Admin support</span>
            <h2>تصحيح بيانات العميل أو السيارة</h2>
          </div>
          {!editing ? (
            <button type="button" className="button button-secondary" onClick={() => setEditing(true)}>
              بدء التصحيح
            </button>
          ) : null}
        </div>
        <p className={styles.note}>
          التصحيح لا يغيّر الرول أو رقم الضمان أو مركز التفعيل أو بيانات المنتج أو مدة/سياسة الضمان أو تواريخ التغطية. كل تغيير حقيقي يُحفظ كـ Before/After دائم.
        </p>

        {editing ? (
          <form className={styles.form} onSubmit={submitCorrection}>
            <fieldset disabled={isCorrecting || isVoiding}>
              <legend>بيانات العميل</legend>
              <p className={styles.note}>{INTERNATIONAL_PHONE_GUIDANCE_AR}</p>
              <div className={styles.grid}>
                <label>
                  <span>الاسم الكامل</span>
                  <input value={details.customerName} maxLength={160} required onChange={(event) => updateDetail("customerName", event.target.value)} />
                </label>
                <label>
                  <span>الهاتف — بصيغة دولية</span>
                  <input dir="ltr" type="tel" inputMode="tel" autoComplete="tel" placeholder="+20 10 1234 5678" title={INTERNATIONAL_PHONE_GUIDANCE_AR} value={details.customerPhone} maxLength={32} required onChange={(event) => updateDetail("customerPhone", event.target.value)} />
                </label>
                <label className={styles.full}>
                  <span>البريد الإلكتروني — اختياري</span>
                  <input dir="ltr" type="email" value={details.customerEmail} maxLength={254} onChange={(event) => updateDetail("customerEmail", event.target.value)} />
                </label>
              </div>
            </fieldset>

            <fieldset disabled={isCorrecting || isVoiding}>
              <legend>بيانات السيارة</legend>
              <div className={styles.grid}>
                <label>
                  <span>الماركة</span>
                  <input value={details.vehicleMake} maxLength={120} required onChange={(event) => updateDetail("vehicleMake", event.target.value)} />
                </label>
                <label>
                  <span>الموديل</span>
                  <input value={details.vehicleModel} maxLength={120} required onChange={(event) => updateDetail("vehicleModel", event.target.value)} />
                </label>
                <label>
                  <span>VIN / رقم الشاسيه</span>
                  <input
                    dir="ltr"
                    value={details.vehicleVin}
                    minLength={6}
                    maxLength={40}
                    required
                    onChange={(event) => updateDetail("vehicleVin", event.target.value.toUpperCase().replace(/\s+/g, ""))}
                  />
                </label>
                <label>
                  <span>سنة الموديل — اختياري</span>
                  <input
                    type="number"
                    min={1886}
                    max={2200}
                    value={details.vehicleYear ?? ""}
                    onChange={(event) => updateDetail("vehicleYear", event.target.value ? Number(event.target.value) : null)}
                  />
                </label>
                <label>
                  <span>رقم اللوحة — اختياري</span>
                  <input value={details.vehiclePlate} maxLength={80} onChange={(event) => updateDetail("vehiclePlate", event.target.value)} />
                </label>
                <label>
                  <span>اللون — اختياري</span>
                  <input value={details.vehicleColor} maxLength={80} onChange={(event) => updateDetail("vehicleColor", event.target.value)} />
                </label>
              </div>
            </fieldset>

            <label className={styles.reasonField}>
              <span>سبب التصحيح</span>
              <textarea
                value={correctionReason}
                minLength={5}
                maxLength={500}
                required
                rows={3}
                placeholder="مثال: العميل صحح رقم الشاسيه بعد مراجعة مستند السيارة."
                onChange={(event) => {
                  correctionRequestIdRef.current = null;
                  setFeedback(null);
                  setCorrectionReason(event.target.value);
                }}
              />
            </label>

            <div className={styles.actions}>
              <ConfirmSubmitButton
                title="تأكيد حفظ التصحيح؟"
                description="سيتم حفظ بيانات العميل/السيارة المصححة مع السبب وتسجيل Before/After دائم في سجل التدقيق."
                confirmLabel="نعم، حفظ التصحيح"
                tone="primary"
                disabled={isCorrecting || isVoiding}
              >
                {isCorrecting ? "جارٍ حفظ التصحيح…" : "حفظ التصحيح"}
              </ConfirmSubmitButton>
              <button type="button" className="button button-ghost" onClick={cancelCorrection} disabled={isCorrecting || isVoiding}>
                إلغاء
              </button>
            </div>
          </form>
        ) : null}
      </section>

      <section className={styles.dangerCard}>
        <div className={styles.heading}>
          <div>
            <span className={styles.eyebrow}>إجراء استثنائي</span>
            <h2>إلغاء تفعيل مسجل بالخطأ</h2>
          </div>
        </div>
        <p className={styles.note}>
          استخدم هذا فقط إذا كان التفعيل نفسه خطأ فعليًا، مثل اختيار الرول الخطأ. الإجراء لا يحذف السجل ولا يعيد استخدام رقم الضمان، ولا توجد له عملية Restore. بعده يمكن للرول المرور من أهلية التفعيل الحالية بطلب جديد إذا ظل مؤهلًا.
        </p>
        <form className={styles.form} onSubmit={submitVoid}>
          <label className={styles.reasonField}>
            <span>سبب الإلغاء كخطأ</span>
            <textarea
              value={voidReason}
              minLength={5}
              maxLength={500}
              required
              rows={3}
              placeholder={`اشرح لماذا التفعيل ${warrantyNumber} سُجل بالخطأ.`}
              onChange={(event) => {
                voidRequestIdRef.current = null;
                setFeedback(null);
                setVoidReason(event.target.value);
              }}
              disabled={isCorrecting || isVoiding}
            />
          </label>
          <div className={styles.actions}>
            <ConfirmSubmitButton
              title="إلغاء هذا التفعيل كخطأ؟"
              description="سيصبح سجل الضمان voided_in_error نهائيًا. لن يُحذف السجل أو رقم الضمان، ولا يوجد Restore إلى issued."
              confirmLabel="نعم، إلغاء التفعيل كخطأ"
              disabled={isCorrecting || isVoiding}
            >
              إلغاء التفعيل كخطأ
            </ConfirmSubmitButton>
          </div>
        </form>
      </section>
    </section>
  );
}
