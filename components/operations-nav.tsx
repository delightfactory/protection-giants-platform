import Link from "next/link";
import { signOut } from "@/lib/auth/actions";
import type { OperationalProfile } from "@/lib/auth/operational-profile";
import { BrandLockup } from "@/components/ui/brand-lockup";
import { Icon } from "@/components/ui/icon";
import { OperationsNavLinks } from "@/components/operations-nav-links";

const roleLabels = {
  admin: "إدارة الشركة",
  agent: "وكيل الدولة",
  dealer: "وكيل / موزع",
  center: "مركز تركيب",
} satisfies Record<OperationalProfile["role"], string>;

type OperationsNavProps = {
  profile: OperationalProfile;
  notificationUnreadCount: number | null;
};

function visibleUnreadCount(count: number | null) {
  if (!count || count <= 0) return null;
  return count > 99 ? "99+" : String(count);
}

export function OperationsNav({ profile, notificationUnreadCount }: OperationsNavProps) {
  const unreadBadge = visibleUnreadCount(notificationUnreadCount);
  const notificationLabel = unreadBadge
    ? `الإشعارات، ${notificationUnreadCount} غير مقروء`
    : "الإشعارات";

  return (
    <>
      <aside className="operations-sidebar">
        <BrandLockup href="/operations" />

        <Link href="/operations/account" className="operations-user" aria-label="أمان الحساب">
          <span className="operations-user-avatar" aria-hidden="true">
            {profile.display_name.trim().slice(0, 1)}
          </span>
          <span className="operations-user-copy">
            <strong>{profile.display_name}</strong>
            <span>{roleLabels[profile.role]} · الحساب</span>
          </span>
        </Link>

        <Link href="/operations/notifications" className="operations-notification-entry" aria-label={notificationLabel}>
          <span className="operations-notification-icon" aria-hidden="true"><Icon name="notifications" /></span>
          <span>الإشعارات</span>
          {unreadBadge ? <span className="operations-notification-badge" aria-hidden="true">{unreadBadge}</span> : null}
        </Link>

        <OperationsNavLinks role={profile.role} variant="desktop" />

        <form action={signOut} className="operations-signout">
          <button type="submit">
            <Icon name="logout" />
            <span>تسجيل الخروج</span>
          </button>
        </form>
      </aside>

      <header className="operations-mobile-header">
        <Link href="/operations/account" className="operations-mobile-identity" aria-label="أمان الحساب">
          <span className="operations-user-avatar" aria-hidden="true">
            {profile.display_name.trim().slice(0, 1)}
          </span>
          <span className="operations-mobile-user">
            <strong>{profile.display_name}</strong>
            <span>{roleLabels[profile.role]} · الحساب</span>
          </span>
        </Link>
        <div className="operations-mobile-tools">
          <BrandLockup href="/operations" compact className="operations-mobile-brand" />
          <Link
            href="/operations/notifications"
            className="operations-mobile-notifications"
            aria-label={notificationLabel}
            title="الإشعارات"
          >
            <Icon name="notifications" />
            {unreadBadge ? <span className="operations-mobile-notification-badge" aria-hidden="true">{unreadBadge}</span> : null}
          </Link>
          <form action={signOut}>
            <button type="submit" className="operations-mobile-signout" aria-label="تسجيل الخروج" title="تسجيل الخروج">
              <Icon name="logout" />
            </button>
          </form>
        </div>
      </header>

      <OperationsNavLinks role={profile.role} variant="mobile" />
    </>
  );
}