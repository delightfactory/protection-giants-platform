"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  derivePushDeviceViewState,
  isAppleMobileEnvironment,
  isPushServerState,
  type PushDeviceViewState,
  type PushServerState,
} from "@/lib/notifications/push-device-contract";
import styles from "./push-device-settings.module.css";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type PushDeviceSettingsProps = Readonly<{ vapidPublicKey: string }>;

type DeviceSnapshot = Readonly<{
  state: PushDeviceViewState;
  serverState: PushServerState;
  browserSubscription: PushSubscription | null;
  appleMobile: boolean;
  standalone: boolean;
}>;

const INITIAL_SNAPSHOT: DeviceSnapshot = {
  state: "unsupported",
  serverState: "missing",
  browserSubscription: null,
  appleMobile: false,
  standalone: false,
};

function base64UrlToBytes(value: string): ArrayBuffer {
  const normalized = value.replace(/-/gu, "+").replace(/_/gu, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = window.atob(`${normalized}${padding}`);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function bytesToBase64Url(value: ArrayBuffer): string {
  const bytes = new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return window.btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

function subscriptionKeys(subscription: PushSubscription): { p256dh: string; auth: string } {
  const p256dh = subscription.getKey("p256dh");
  const auth = subscription.getKey("auth");
  if (!p256dh || !auth) throw new Error("PG_PUSH_BROWSER_KEYS_MISSING");
  return { p256dh: bytesToBase64Url(p256dh), auth: bytesToBase64Url(auth) };
}

async function pushApi(endpoint: string, method: "POST" | "DELETE"): Promise<PushServerState> {
  const response = await fetch("/api/notifications/push-subscription", {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
  if (!response.ok) throw new Error("PG_PUSH_API_FAILED");
  const payload = await response.json() as { state?: unknown };
  if (!isPushServerState(payload.state)) throw new Error("PG_PUSH_API_INVALID");
  return payload.state;
}

async function registerServerSubscription(subscription: PushSubscription) {
  const keys = subscriptionKeys(subscription);
  const response = await fetch("/api/notifications/push-subscription", {
    method: "PUT",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint, keys }),
  });
  if (!response.ok) throw new Error("PG_PUSH_API_FAILED");
}

async function getPushRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing?.active) return existing;
  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  return navigator.serviceWorker.ready;
}

function currentEnvironment() {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  const appleMobile = isAppleMobileEnvironment({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
  });
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigatorWithStandalone.standalone === true;
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  return { appleMobile, standalone, supported };
}

function presentation(state: PushDeviceViewState) {
  switch (state) {
    case "subscribed":
      return { label: "مفعلة على هذا الجهاز", className: `${styles.state} ${styles.stateReady}` };
    case "repair_required":
      return { label: "يحتاج إصلاح", className: `${styles.state} ${styles.stateWarning}` };
    case "install_required":
      return { label: "يلزم التثبيت أولًا", className: `${styles.state} ${styles.stateWarning}` };
    case "denied":
      return { label: "الإذن مرفوض", className: `${styles.state} ${styles.stateWarning}` };
    case "ready_to_enable":
      return { label: "غير مفعلة", className: styles.state };
    case "not_configured":
      return { label: "غير مهيأة", className: `${styles.state} ${styles.stateWarning}` };
    default:
      return { label: "غير مدعومة", className: styles.state };
  }
}

export function PushDeviceSettings({ vapidPublicKey }: PushDeviceSettingsProps) {
  const [snapshot, setSnapshot] = useState<DeviceSnapshot>(INITIAL_SNAPSHOT);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const mountedRef = useRef(true);

  const inspectDevice = useCallback(async () => {
    setMessage(null);
    const environment = currentEnvironment();
    const vapidConfigured = vapidPublicKey.trim().length > 0;

    if (!environment.supported || (environment.appleMobile && !environment.standalone) || !vapidConfigured) {
      const state = derivePushDeviceViewState({
        vapidConfigured,
        supported: environment.supported,
        appleMobile: environment.appleMobile,
        standalone: environment.standalone,
        permission: "Notification" in window ? Notification.permission : "default",
        hasBrowserSubscription: false,
        serverState: "missing",
      });
      if (mountedRef.current) {
        setSnapshot({ state, serverState: "missing", browserSubscription: null, ...environment });
        setLoading(false);
      }
      return;
    }

    try {
      const registration = await getPushRegistration();
      const browserSubscription = await registration.pushManager.getSubscription();
      const serverState = browserSubscription ? await pushApi(browserSubscription.endpoint, "POST") : "missing";
      const state = derivePushDeviceViewState({
        vapidConfigured,
        supported: true,
        appleMobile: environment.appleMobile,
        standalone: environment.standalone,
        permission: Notification.permission,
        hasBrowserSubscription: Boolean(browserSubscription),
        serverState,
      });
      if (mountedRef.current) {
        setSnapshot({ state, serverState, browserSubscription, ...environment });
        setLoading(false);
      }
    } catch {
      if (mountedRef.current) {
        setLoading(false);
        setMessage("تعذر فحص حالة الإشعارات لهذا الجهاز حاليًا. يمكنك إعادة المحاولة بدون التأثير على صندوق الإشعارات.");
      }
    }
  }, [vapidPublicKey]);

  useEffect(() => {
    mountedRef.current = true;
    void inspectDevice();
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstallPrompt(null);
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      mountedRef.current = false;
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [inspectDevice]);

  async function ensureSubscription(existing: PushSubscription | null) {
    if (existing) return existing;
    const registration = await getPushRegistration();
    return registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(vapidPublicKey),
    });
  }

  async function enablePush() {
    if (busy || snapshot.state === "denied" || snapshot.state === "install_required") return;
    setBusy(true);
    setMessage(null);
    try {
      let permission = Notification.permission;
      if (permission === "default") permission = await Notification.requestPermission();
      if (permission !== "granted") {
        await inspectDevice();
        return;
      }
      const subscription = await ensureSubscription(snapshot.browserSubscription);
      await registerServerSubscription(subscription);
      await inspectDevice();
    } catch {
      setMessage("تعذر تفعيل الإشعارات على هذا الجهاز. لم يتأثر صندوق الإشعارات ويمكنك المحاولة مرة أخرى.");
    } finally {
      setBusy(false);
    }
  }

  async function repairPush() {
    if (busy || Notification.permission !== "granted") return;
    setBusy(true);
    setMessage(null);
    try {
      let subscription = snapshot.browserSubscription;
      if (subscription && snapshot.serverState === "disabled") {
        await subscription.unsubscribe();
        subscription = null;
      }
      subscription = await ensureSubscription(subscription);
      await registerServerSubscription(subscription);
      await inspectDevice();
    } catch {
      setMessage("تعذر إصلاح ربط هذا الجهاز الآن. جرّب مرة أخرى لاحقًا؛ صندوق الإشعارات يظل متاحًا كالمعتاد.");
    } finally {
      setBusy(false);
    }
  }

  async function disablePush() {
    if (busy || !snapshot.browserSubscription) return;
    setBusy(true);
    setMessage(null);
    try {
      await pushApi(snapshot.browserSubscription.endpoint, "DELETE");
      await snapshot.browserSubscription.unsubscribe();
      await inspectDevice();
    } catch {
      setMessage("تعذر تعطيل الإشعارات لهذا الجهاز بالكامل. أعد المحاولة للتأكد من إيقاف الربط على الخادم والمتصفح.");
    } finally {
      setBusy(false);
    }
  }

  async function installApp() {
    if (!installPrompt || busy) return;
    setBusy(true);
    try {
      await installPrompt.prompt();
      await installPrompt.userChoice;
      setInstallPrompt(null);
    } finally {
      setBusy(false);
    }
  }

  const state = presentation(snapshot.state);
  const showInstallButton = Boolean(installPrompt && !snapshot.standalone);

  return (
    <section className={styles.panel} aria-labelledby="push-device-settings-title">
      <div className={styles.heading}>
        <div className={styles.copy}>
          <h2 id="push-device-settings-title">إشعارات هذا الجهاز</h2>
          <p>الإشعارات الخارجية تساعدك على رؤية التنبيهات المهمة عندما تكون المنصة في الخلفية. صندوق الإشعارات داخل المنصة يظل المصدر الأساسي حتى لو لم تفعّلها.</p>
        </div>
        <span className={state.className}>{loading ? "جارٍ الفحص…" : state.label}</span>
      </div>

      {snapshot.state === "install_required" ? (
        <p className={styles.guidance}>على iPhone وiPad أضف المنصة إلى الشاشة الرئيسية أولًا من زر المشاركة ثم «إضافة إلى الشاشة الرئيسية». بعد فتح النسخة المثبتة ارجع إلى هذه الصفحة لتفعيل الإشعارات.</p>
      ) : null}
      {snapshot.state === "denied" ? (
        <p className={styles.guidance}>المتصفح سجّل رفض الإذن. لن نطلبه منك مرة أخرى تلقائيًا؛ فعّله يدويًا من إعدادات الموقع/الإشعارات ثم استخدم «إعادة الفحص».</p>
      ) : null}
      {snapshot.state === "unsupported" ? (
        <p className={styles.guidance}>هذا المتصفح أو الجهاز لا يوفر Web Push بالشكل المطلوب. يمكنك الاستمرار في استخدام صندوق الإشعارات داخل المنصة دون أي نقص في العمليات.</p>
      ) : null}
      {snapshot.state === "not_configured" ? (
        <p className={styles.guidance}>خدمة Push غير مهيأة في بيئة التشغيل الحالية. لن نعرض طلب إذن غير قابل للاستخدام.</p>
      ) : null}
      {snapshot.state === "repair_required" ? (
        <p className={styles.guidance}>إذن المتصفح وحالة الخادم غير متطابقين. استخدم «إصلاح الربط» لإنشاء/تسجيل اشتراك صالح لهذا الجهاز فقط.</p>
      ) : null}
      {message ? <p className={styles.feedback} role="alert">{message}</p> : null}

      <div className={styles.actions}>
        {!loading && snapshot.state === "ready_to_enable" ? (
          <button type="button" className={styles.primary} onClick={enablePush} disabled={busy}>تفعيل إشعارات الجهاز</button>
        ) : null}
        {!loading && snapshot.state === "repair_required" ? (
          <button type="button" className={styles.primary} onClick={repairPush} disabled={busy}>إصلاح الربط</button>
        ) : null}
        {!loading && snapshot.state === "subscribed" ? (
          <button type="button" className={styles.secondary} onClick={disablePush} disabled={busy}>تعطيل على هذا الجهاز</button>
        ) : null}
        {!loading && snapshot.state === "denied" ? (
          <button type="button" className={styles.secondary} onClick={() => void inspectDevice()} disabled={busy}>إعادة الفحص</button>
        ) : null}
        {showInstallButton ? (
          <button type="button" className={styles.secondary} onClick={installApp} disabled={busy}>تثبيت المنصة على الجهاز</button>
        ) : null}
      </div>
    </section>
  );
}
