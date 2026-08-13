"use client";

import { useRef, useState } from "react";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type StoredLocation = {
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  capturedAt: string;
  source: "center_device" | "admin";
};

type CandidateLocation = {
  latitude: number;
  longitude: number;
  accuracyM: number;
};

type CenterLocationCaptureProps = {
  initialLocation: StoredLocation | null;
};

type Phase = "idle" | "locating" | "review" | "saving" | "success" | "error";

const MAX_CENTER_ACCURACY_M = 50;

function formatCoordinate(value: number) {
  return value.toFixed(6);
}

function formatAccuracy(value: number | null) {
  if (value === null) return "تصحيح إداري";
  return `${Math.round(value * 10) / 10} م`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function geolocationErrorMessage(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) {
    return "تم رفض إذن الموقع. اسمح للمتصفح باستخدام الموقع لهذا الموقع ثم أعد المحاولة.";
  }
  if (error.code === error.POSITION_UNAVAILABLE) {
    return "تعذر تحديد موقع الجهاز حاليًا. تأكد من تشغيل خدمة الموقع وحاول من مكان يسمح باستقبال أفضل.";
  }
  if (error.code === error.TIMEOUT) {
    return "استغرق تحديد الموقع وقتًا أطول من المتوقع. حاول مرة أخرى مع إبقاء خدمة الموقع مفعلة.";
  }
  return "تعذر الحصول على الموقع من الجهاز. حاول مرة أخرى.";
}

export function CenterLocationCapture({ initialLocation }: CenterLocationCaptureProps) {
  const [storedLocation, setStoredLocation] = useState<StoredLocation | null>(initialLocation);
  const [candidate, setCandidate] = useState<CandidateLocation | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const locatingRef = useRef(false);
  const savingRef = useRef(false);

  function startCapture() {
    if (locatingRef.current || savingRef.current) return;

    setMessage(null);
    setCandidate(null);

    if (!navigator.geolocation) {
      setPhase("error");
      setMessage("هذا المتصفح لا يدعم تحديد الموقع. افتح المنصة من متصفح حديث على جهاز يدعم خدمة الموقع.");
      return;
    }

    locatingRef.current = true;
    setPhase("locating");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        locatingRef.current = false;

        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        const accuracyM = position.coords.accuracy;

        if (
          !Number.isFinite(latitude) ||
          !Number.isFinite(longitude) ||
          !Number.isFinite(accuracyM) ||
          latitude < -90 ||
          latitude > 90 ||
          longitude < -180 ||
          longitude > 180 ||
          accuracyM <= 0
        ) {
          setPhase("error");
          setMessage("أعاد الجهاز قراءة موقع غير صالحة. أعد المحاولة ولا يتم حفظ أي بيانات في هذه الحالة.");
          return;
        }

        if (accuracyM > MAX_CENTER_ACCURACY_M) {
          const displayedAccuracyM = Math.ceil(accuracyM * 10) / 10;
          setPhase("error");
          setMessage(`دقة القراءة الحالية نحو ${displayedAccuracyM} م، والمطلوب ${MAX_CENTER_ACCURACY_M} م أو أفضل. اقترب من واجهة المركز أو مكان أكثر انفتاحًا ثم أعد المحاولة.`);
          return;
        }

        setCandidate({ latitude, longitude, accuracyM });
        setPhase("review");
      },
      (error) => {
        locatingRef.current = false;
        setPhase("error");
        setMessage(geolocationErrorMessage(error));
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15000,
      },
    );
  }

  async function saveCapture() {
    if (!candidate || savingRef.current || locatingRef.current) return;

    savingRef.current = true;
    setPhase("saving");
    setMessage(null);

    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase.rpc("update_own_center_location", {
        p_latitude: candidate.latitude,
        p_longitude: candidate.longitude,
        p_accuracy_m: candidate.accuracyM,
      });

      const saved = data?.[0];
      if (error || !saved) {
        setPhase("error");
        setMessage("تعذر حفظ الموقع. قد تكون حالة الحساب أو المركز تغيرت، أو انتهت الجلسة. أعد تحميل الصفحة ثم حاول مرة أخرى.");
        return;
      }

      setStoredLocation({
        latitude: saved.latitude,
        longitude: saved.longitude,
        accuracyM: saved.accuracy_m,
        capturedAt: saved.captured_at,
        source: "center_device",
      });
      setCandidate(null);
      setPhase("success");
      setMessage("تم حفظ موقع المركز وتسجيل عملية الالتقاط في السجل بنجاح.");
    } catch {
      setPhase("error");
      setMessage("تعذر الاتصال بالنظام لحفظ الموقع. تحقق من الاتصال ثم أعد المحاولة.");
    } finally {
      savingRef.current = false;
    }
  }

  return (
    <div className="operations-form">
      {storedLocation ? (
        <div className="user-role-note">
          <strong>الموقع المسجل حاليًا</strong>
          <p>
            <span dir="ltr">{formatCoordinate(storedLocation.latitude)}, {formatCoordinate(storedLocation.longitude)}</span>
            {" · "}الدقة: {formatAccuracy(storedLocation.accuracyM)}
          </p>
          <p>آخر تسجيل: <span dir="ltr">{formatDate(storedLocation.capturedAt)}</span></p>
        </div>
      ) : (
        <FeedbackBanner tone="warning">
          لا يوجد موقع جغرافي مسجل لهذا المركز حتى الآن. نفّذ الالتقاط وأنت موجود فعليًا داخل المركز.
        </FeedbackBanner>
      )}

      {phase === "locating" ? (
        <FeedbackBanner tone="info">جارٍ طلب قراءة دقيقة من الجهاز… أبقِ هذه الصفحة مفتوحة.</FeedbackBanner>
      ) : null}

      {phase === "review" && candidate ? (
        <div className="user-role-note">
          <strong>راجع القراءة قبل الحفظ</strong>
          <p dir="ltr">{formatCoordinate(candidate.latitude)}, {formatCoordinate(candidate.longitude)}</p>
          <p>الدقة المبلغ عنها من الجهاز: {formatAccuracy(candidate.accuracyM)}</p>
          <p>لن يتم حفظ أي شيء قبل الضغط على «حفظ الموقع».</p>
        </div>
      ) : null}

      {message && phase === "error" ? <FeedbackBanner tone="error">{message}</FeedbackBanner> : null}
      {message && phase === "success" ? <FeedbackBanner tone="success">{message}</FeedbackBanner> : null}

      <div className="operations-form-actions">
        {phase === "review" ? (
          <>
            <button type="button" className="button button-primary" onClick={saveCapture}>
              حفظ الموقع
            </button>
            <button type="button" className="button button-ghost" onClick={startCapture}>
              إعادة القياس
            </button>
          </>
        ) : (
          <button
            type="button"
            className="button button-primary"
            onClick={startCapture}
            disabled={phase === "locating" || phase === "saving"}
          >
            {phase === "locating" ? "جارٍ تحديد الموقع…" : phase === "saving" ? "جارٍ الحفظ…" : storedLocation ? "تحديث موقعي" : "تسجيل موقعي"}
          </button>
        )}
      </div>
    </div>
  );
}
