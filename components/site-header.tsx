import Link from "next/link";
import { BrandLockup } from "@/components/ui/brand-lockup";

const publicLinks = [
  { href: "/products", label: "المنتجات" },
  { href: "/centers", label: "المراكز المعتمدة" },
  { href: "/warranty", label: "الضمان" },
];

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="container header-inner">
        <BrandLockup />
        <nav className="nav-links" aria-label="التنقل الرئيسي">
          {publicLinks.map((link) => (
            <Link key={link.href} href={link.href} className="nav-link">
              {link.label}
            </Link>
          ))}
          <Link href="/operations" className="nav-link nav-cta">بوابة التشغيل</Link>
        </nav>
      </div>
    </header>
  );
}
