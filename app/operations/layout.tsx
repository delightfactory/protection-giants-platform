import type { ReactNode } from "react";
import { AppBadgeSync } from "@/components/app-badge-sync";
import { NavigationFeedback } from "@/components/ui/navigation-feedback";
import { OperationsNav } from "@/components/operations-nav";
import { PwaLifecycleCoordinator } from "@/components/pwa-lifecycle";
import { requireOperationalProfile } from "@/lib/auth/operational-profile";
import { getNotificationUnreadCountForShell } from "@/lib/notifications/inbox.server";
import "./operations.css";
import "./interaction.css";
import "./production.css";
import "./mobile-shell-hardening.css";
import "./notification-shell.css";

export default async function OperationsLayout({ children }: Readonly<{ children: ReactNode }>) {
  const profile = await requireOperationalProfile();
  const notificationUnreadCount = await getNotificationUnreadCountForShell();

  return (
    <div className={`operations-shell operations-shell-${profile.role}`}>
      <OperationsNav profile={profile} notificationUnreadCount={notificationUnreadCount} />
      <NavigationFeedback />
      <main className="operations-content">{children}</main>
      <PwaLifecycleCoordinator />
      <AppBadgeSync unreadCount={notificationUnreadCount ?? 0} />
    </div>
  );
}
