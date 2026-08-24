// Hosted PWA update-lifecycle acceptance marker: 2026-08-24.

const DEFAULT_ACTION_PATH = "/operations/notifications";
const DEFAULT_TITLE = "عمالقة الحماية";
const DEFAULT_BODY = "لديك إشعار جديد. افتح المنصة للاطلاع عليه.";

function safeActionPath(value) {
  if (typeof value !== "string") return DEFAULT_ACTION_PATH;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("\0")) {
    return DEFAULT_ACTION_PATH;
  }

  try {
    const base = new URL(self.location.origin);
    const parsed = new URL(trimmed, base);
    if (parsed.origin !== base.origin) return DEFAULT_ACTION_PATH;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return DEFAULT_ACTION_PATH;
  }
}

function readPushPayload(event) {
  if (!event.data) return {};
  try {
    const parsed = event.data.json();
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function markAppBadge() {
  if (typeof self.navigator?.setAppBadge !== "function") return;
  try {
    await self.navigator.setAppBadge();
  } catch {
    // App badging is progressive enhancement and must never block notification display.
  }
}

async function refreshOpenClients() {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of clients) {
    try {
      client.postMessage({ type: "PG_NOTIFICATION_PUSH_RECEIVED" });
    } catch {
      // Client refresh is best-effort and must never block persistent notification display.
    }
  }
}

self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    const payload = readPushPayload(event);
    const title = typeof payload.title === "string" && payload.title.trim()
      ? payload.title.trim()
      : DEFAULT_TITLE;
    const body = typeof payload.body === "string" && payload.body.trim()
      ? payload.body.trim()
      : DEFAULT_BODY;
    const actionPath = safeActionPath(payload.actionPath);
    const notificationId = typeof payload.notificationId === "string" ? payload.notificationId : null;
    const tag = typeof payload.tag === "string" && /^pg-notification-[a-f0-9-]{36}$/iu.test(payload.tag)
      ? payload.tag
      : undefined;

    await markAppBadge();
    await self.registration.showNotification(title, {
      body,
      tag,
      renotify: false,
      icon: "/icons/pwa-192.png",
      badge: "/icons/pwa-192.png",
      dir: "rtl",
      lang: "ar",
      data: { actionPath, notificationId },
    });
    await refreshOpenClients();
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const actionPath = safeActionPath(event.notification?.data?.actionPath);

  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const sameOriginClient = clients.find((client) => {
      try {
        return new URL(client.url).origin === self.location.origin;
      } catch {
        return false;
      }
    });

    if (sameOriginClient) {
      if ("navigate" in sameOriginClient) {
        await sameOriginClient.navigate(actionPath);
      }
      await sameOriginClient.focus();
      return;
    }

    await self.clients.openWindow(actionPath);
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "PG_ACTIVATE_UPDATE") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
