import Link from "next/link";
import { signOut } from "@/lib/auth/actions";
import type { OperationalProfile } from "@/lib/auth/operational-profile";
import { brandConfig } from "@/lib/brand-config";

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
    <aside className="operations-sidebar">
      <Link href="/" className="brand" aria-label="العودة إلى الموقع العام">
        <span className="brand-mark" aria-hidden="true">{brandConfig.shortName}</span>
        <span>{brandConfig.name}</span>
      </Link>

      <div className="operations-user" aria-label="المستخدم الحالي">
        <strong>{profile.display_name}</strong>
        <span>{roleLabels[profile.role]}</span>
      </div>

      <nav className="operations-nav" aria-label="تنقل بوابة التشغيل">
        <Link href="/operations">نظرة عامة</Link>
        {profile.role === "admin" ? (
          <>
            <Link href="/operations/dealers">الوكلاء والموزعون</Link>
            <Link href="/operations/products">المنتجات</Link>
          </>
        ) : null}
      </nav>

      <form action={signOut} className="operations-signout">
        <button type="submit">تسجيل الخروج</button>
      </form>
    </aside>
  );
}
