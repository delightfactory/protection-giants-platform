import Link from "next/link";
import { signOut } from "@/lib/auth/actions";
import type { OperationalProfile } from "@/lib/auth/operational-profile";
import { brandConfig } from "@/lib/brand-config";
import { OperationsNavLinks } from "@/components/operations-nav-links";

const roleLabels = {
  admin: "إدارة الشركة",
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
        <Link href="/operations" className="brand" aria-label={`${brandConfig.name} - بوابة التشغيل`}>
          <span className="brand-mark" aria-hidden="true">{brandConfig.shortName}</span>
          <span>{brandConfig.name}</span>
        </Link>

        <div className="operations-user" aria-label="المستخدم الحالي">
          <strong>{profile.display_name}</strong>
          <span>{roleLabels[profile.role]}</span>
        </div>

        <OperationsNavLinks role={profile.role} variant="desktop" />

        <form action={signOut} className="operations-signout">
          <button type="submit">تسجيل الخروج</button>
        </form>
      </aside>

      <header className="operations-mobile-header">
        <Link href="/operations" className="operations-mobile-identity" aria-label={`${brandConfig.name} - بوابة التشغيل`}>
          <span className="brand-mark" aria-hidden="true">{brandConfig.shortName}</span>
          <span className="operations-mobile-user">
            <strong>{profile.display_name}</strong>
            <span>{roleLabels[profile.role]}</span>
          </span>
        </Link>
        <form action={signOut}>
          <button type="submit" className="operations-mobile-signout">خروج</button>
        </form>
      </header>

      <OperationsNavLinks role={profile.role} variant="mobile" />
    </>
  );
}
