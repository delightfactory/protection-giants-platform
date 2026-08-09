"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const publicLinks = [
  { href: "/products", label: "المنتجات" },
  { href: "/centers", label: "المراكز المعتمدة" },
  { href: "/warranty", label: "الضمان" },
];

export function PublicNavLinks() {
  const pathname = usePathname();

  return (
    <nav className="nav-links" aria-label="التنقل الرئيسي">
      {publicLinks.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link key={link.href} href={link.href} className="nav-link" aria-current={active ? "page" : undefined}>
            {link.label}
          </Link>
        );
      })}
      <Link href="/operations" className="nav-link nav-cta">بوابة التشغيل</Link>
    </nav>
  );
}
