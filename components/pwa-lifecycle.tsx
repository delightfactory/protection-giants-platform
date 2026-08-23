"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./pwa-lifecycle.module.css";

const CHANNEL_NAME = "pg-pwa-lifecycle";
const LEASE_KEY = "pg-pwa-update-prompt-lease";
const EVENT_KEY = "pg-pwa-update-event";
const DEFER_KEY = "pg-pwa-update-deferred-until";
const RELOAD_GUARD_KEY = "pg-pwa-update-reloaded";
const PROMPT_LEASE_MS = 60_000;
const DEFER_MS = 15 * 60_000;
const MIN_UPDATE_CHECK_MS = 30 * 60_000;

type LifecycleMessage = Readonly<{
  type: "waiting" | "activate" | "deferred";
  sender: string;
  at: number;
}>;

type PromptLease = Readonly<{ owner: string; expiresAt: number }>;

function parseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function deferUntil(): number {
  const value = Number(window.localStorage.getItem(DEFER_KEY) ?? "0");
  return Number.isFinite(value) ? value : 0;
}

function claimPromptLease(tabId: string): boolean {
  const now = Date.now();
  const lease = parseJson<PromptLease>(window.localStorage.getItem(LEASE_KEY));
  if (lease && lease.owner !== tabId && lease.expiresAt > now) return false;

  const nextLease: PromptLease = { owner: tabId, expiresAt: now + PROMPT_LEASE_MS };
  window.localStorage.setItem(LEASE_KEY, JSON.stringify(nextLease));
  const confirmed = parseJson<PromptLease>(window.localStorage.getItem(LEASE_KEY));
  return confirmed?.owner === tabId;
}

function releasePromptLease(tabId: string) {
  const lease = parseJson<PromptLease>(window.localStorage.getItem(LEASE_KEY));
  if (lease?.owner === tabId) window.localStorage.removeItem(LEASE_KEY);
}

function isLifecycleMessage(value: unknown): value is LifecycleMessage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LifecycleMessage>;
  return (
    (candidate.type === "waiting" || candidate.type === "activate" || candidate.type === "deferred") &&
    typeof candidate.sender === "string" &&
    typeof candidate.at === "number"
  );
}

export function PwaLifecycleCoordinator() {
  const [showUpdate, setShowUpdate] = useState(false);
  const [applying, setApplying] = useState(false);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const waitingRef = useRef<ServiceWorker | null>(null);
  const reloadRequestedRef = useRef(false);
  const tabIdRef = useRef("");
  const lastUpdateCheckRef = useRef(0);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    tabIdRef.current = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    const tabId = tabIdRef.current;
    const channel = typeof BroadcastChannel === "function" ? new BroadcastChannel(CHANNEL_NAME) : null;
    let disposed = false;

    const publish = (type: LifecycleMessage["type"]) => {
      const message: LifecycleMessage = { type, sender: tabId, at: Date.now() };
      channel?.postMessage(message);
      window.localStorage.setItem(EVENT_KEY, JSON.stringify(message));
    };

    const maybeOfferWaiting = () => {
      const worker = registrationRef.current?.waiting;
      if (!worker || !navigator.serviceWorker.controller) return;
      waitingRef.current = worker;
      if (deferUntil() > Date.now()) return;
      if (claimPromptLease(tabId)) setShowUpdate(true);
    };

    const noteWaitingWorker = (worker: ServiceWorker) => {
      waitingRef.current = worker;
      publish("waiting");
      maybeOfferWaiting();
    };

    const observeInstallingWorker = (registration: ServiceWorkerRegistration) => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          noteWaitingWorker(registration.waiting ?? worker);
        }
      });
    };

    const runUpdateCheck = async () => {
      const registration = registrationRef.current;
      if (!registration) return;
      const now = Date.now();
      if (now - lastUpdateCheckRef.current < MIN_UPDATE_CHECK_MS) return;
      lastUpdateCheckRef.current = now;
      try {
        await registration.update();
      } catch {
        // Update checks are best-effort and never block the current application version.
      }
    };

    const onLifecycleMessage = (message: unknown) => {
      if (!isLifecycleMessage(message) || message.sender === tabId) return;
      if (message.type === "waiting") {
        maybeOfferWaiting();
        return;
      }
      if (message.type === "deferred") {
        setShowUpdate(false);
        return;
      }
      reloadRequestedRef.current = true;
      window.sessionStorage.removeItem(RELOAD_GUARD_KEY);
      setShowUpdate(false);
      setApplying(true);
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === EVENT_KEY) onLifecycleMessage(parseJson<LifecycleMessage>(event.newValue));
      if (event.key === DEFER_KEY && deferUntil() > Date.now()) setShowUpdate(false);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      maybeOfferWaiting();
      void runUpdateCheck();
    };

    const onFocus = () => {
      maybeOfferWaiting();
      void runUpdateCheck();
    };

    const onControllerChange = () => {
      if (!reloadRequestedRef.current) return;
      if (window.sessionStorage.getItem(RELOAD_GUARD_KEY) === "1") return;
      window.sessionStorage.setItem(RELOAD_GUARD_KEY, "1");
      window.location.reload();
    };

    channel?.addEventListener("message", (event) => onLifecycleMessage(event.data));
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((registration) => {
      if (disposed) return;
      registrationRef.current = registration;
      if (registration.waiting && navigator.serviceWorker.controller) {
        noteWaitingWorker(registration.waiting);
      }
      registration.addEventListener("updatefound", () => observeInstallingWorker(registration));
      window.setTimeout(() => void runUpdateCheck(), 1_500);
    }).catch(() => {
      // PWA support is progressive enhancement; registration failure must not break operations.
    });

    return () => {
      disposed = true;
      releasePromptLease(tabId);
      channel?.close();
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  function applyUpdate() {
    const worker = waitingRef.current ?? registrationRef.current?.waiting;
    if (!worker || applying) return;

    reloadRequestedRef.current = true;
    window.sessionStorage.removeItem(RELOAD_GUARD_KEY);
    setApplying(true);
    setShowUpdate(false);
    releasePromptLease(tabIdRef.current);

    const message: LifecycleMessage = { type: "activate", sender: tabIdRef.current, at: Date.now() };
    if (typeof BroadcastChannel === "function") {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channel.postMessage(message);
      channel.close();
    }
    window.localStorage.setItem(EVENT_KEY, JSON.stringify(message));
    worker.postMessage({ type: "PG_ACTIVATE_UPDATE" });
  }

  function deferUpdate() {
    if (applying) return;
    window.localStorage.setItem(DEFER_KEY, String(Date.now() + DEFER_MS));
    releasePromptLease(tabIdRef.current);
    setShowUpdate(false);

    const message: LifecycleMessage = { type: "deferred", sender: tabIdRef.current, at: Date.now() };
    if (typeof BroadcastChannel === "function") {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channel.postMessage(message);
      channel.close();
    }
    window.localStorage.setItem(EVENT_KEY, JSON.stringify(message));
  }

  if (!showUpdate && !applying) return null;

  return (
    <aside className={styles.banner} role="status" aria-live="polite" aria-label="تحديث المنصة">
      <div className={styles.copy}>
        <strong>{applying ? "جارٍ تطبيق التحديث" : "تحديث جديد متاح"}</strong>
        <span>
          {applying
            ? "سيتم فتح النسخة الجديدة تلقائيًا بعد اكتمال التفعيل."
            : "يمكنك إكمال ما تقوم به الآن أو تطبيق التحديث عندما يكون الوقت مناسبًا."}
        </span>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={applyUpdate} disabled={applying}>
          {applying ? "جارٍ التحديث…" : "تحديث الآن"}
        </button>
        {!applying ? (
          <button type="button" className={styles.secondary} onClick={deferUpdate}>لاحقًا</button>
        ) : null}
      </div>
    </aside>
  );
}
