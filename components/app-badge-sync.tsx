"use client";

import { useEffect } from "react";

type BadgeNavigator = Navigator & {
  setAppBadge?: (contents?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

export function AppBadgeSync({ unreadCount }: Readonly<{ unreadCount: number }>) {
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
