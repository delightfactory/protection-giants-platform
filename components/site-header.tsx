import Link from "next/link";
import { brandConfig } from "@/lib/brand-config";

const publicLinks = [
  { href: "/products", label: "المنتجات" },
  { href: "/centers", label: "المراكز المعتمدة" },
  { href: "/warranty", label: "الضمان" },
];

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link href="/" className="brand" aria-label={`${brandConfig.name} - الرئيسية`}>
          <span className="brand-mark" aria-hidden="true">{brandConfig.shortName}</span>
          <span>{brandConfig.name}</span>
        </Link>
        <nav className="nav-links" aria-label="التنقل الرئيسي">
          {publicLinks.map((link) => (
            <Link key={link.href} href={link.href} className="nav-link">
              {link.label}
            </Link>
          ))}
          <Link href="/operations" className="nav-link nav-cta">
            بوابة التشغيل
          </Link>
        </nav>
      </div>
    </header>
  );
}
