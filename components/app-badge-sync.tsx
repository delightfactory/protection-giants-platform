"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type BadgeNavigator = Navigator & {
  setAppBadge?: (contents?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

export function AppBadgeSync({ unreadCount }: Readonly<{ unreadCount: number }>) {
  const router = useRouter();

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "PG_NOTIFICATION_PUSH_RECEIVED") router.refresh();
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [router]);

  useEffect(() => {
    const badgeNavigator = navigator as BadgeNavigator;
    const count = Number.isFinite(unreadCount) && unreadCount > 0 ? Math.floor(unreadCount) : 0;

    if (count > 0 && typeof badgeNavigator.setAppBadge === "function") {
      void badgeNavigator.setAppBadge(count).catch(() => undefined);
      return;
    }

    if (typeof badgeNavigator.clearAppBadge === "function") {
      void badgeNavigator.clearAppBadge().catch(() => undefined);
      return;
    }

    if (typeof badgeNavigator.setAppBadge === "function") {
      void badgeNavigator.setAppBadge(0).catch(() => undefined);
    }
  }, [unreadCount]);

  return null;
}
