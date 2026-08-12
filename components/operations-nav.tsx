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
};

export function OperationsNav({ profile }: OperationsNavProps) {
  return (
    <>
      <aside className="operations-sidebar">
        <BrandLockup href="/operations" />

        <div className="operations-user" aria-label="المستخدم الحالي">
          <span className="operations-user-avatar" aria-hidden="true">
            {profile.display_name.trim().slice(0, 1)}
          </span>
          <span className="operations-user-copy">
            <strong>{profile.display_name}</strong>
            <span>{roleLabels[profile.role]}</span>
          </span>
        </div>

        <OperationsNavLinks role={profile.role} variant="desktop" />

        <form action={signOut} className="operations-signout">
          <button type="submit">
            <Icon name="logout" />
            <span>تسجيل الخروج</span>
          </button>
        </form>
      </aside>

      <header className="operations-mobile-header">
        <div className="operations-mobile-identity">
          <span className="operations-user-avatar" aria-hidden="true">
            {profile.display_name.trim().slice(0, 1)}
          </span>
          <span className="operations-mobile-user">
            <strong>{profile.display_name}</strong>
            <span>{roleLabels[profile.role]}</span>
          </span>
        </div>
        <div className="operations-mobile-tools">
          <BrandLockup href="/operations" compact className="operations-mobile-brand" />
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
