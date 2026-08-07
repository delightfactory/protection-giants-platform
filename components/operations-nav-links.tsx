"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type OperationalRole = "admin" | "dealer" | "center";
type NavVariant = "desktop" | "mobile";
type NavItem = {
  href: string;
  label: string;
  icon: "home" | "users" | "dealers" | "centers" | "products";
};

const adminItems: NavItem[] = [
  { href: "/operations", label: "الرئيسية", icon: "home" },
  { href: "/operations/users", label: "الحسابات", icon: "users" },
  { href: "/operations/dealers", label: "الوكلاء", icon: "dealers" },
  { href: "/operations/centers", label: "المراكز", icon: "centers" },
  { href: "/operations/products", label: "المنتجات", icon: "products" },
];

const basicItems: NavItem[] = [
  { href: "/operations", label: "الرئيسية", icon: "home" },
];

function isActivePath(pathname: string, href: string) {
  return href === "/operations" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function NavIcon({ name }: { name: NavItem["icon"] }) {
  if (name === "home") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3.5 10.5 12 3.8l8.5 6.7" />
        <path d="M5.5 9.5v10.2h13V9.5" />
        <path d="M9.5 19.7v-6h5v6" />
      </svg>
    );
  }

  if (name === "users") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="8" r="3" />
        <path d="M5.5 19c.5-3.4 2.7-5.2 6.5-5.2s6 1.8 6.5 5.2" />
      </svg>
    );
  }

  if (name === "dealers") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="9" cy="8" r="3" />
        <path d="M3.5 19c.5-3.3 2.4-5 5.5-5s5 1.7 5.5 5" />
        <path d="M16 7.2a2.7 2.7 0 0 1 0 5.2" />
        <path d="M16.3 14.6c2.4.5 3.8 2 4.2 4.4" />
      </svg>
    );
  }

  if (name === "centers") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 21s6-5.3 6-11a6 6 0 1 0-12 0c0 5.7 6 11 6 11Z" />
        <circle cx="12" cy="10" r="2.2" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m4 7 8-4 8 4-8 4-8-4Z" />
      <path d="m4 7 8 4 8-4v10l-8 4-8-4V7Z" />
      <path d="M12 11v10" />
    </svg>
  );
}

export function OperationsNavLinks({ role, variant }: { role: OperationalRole; variant: NavVariant }) {
  const pathname = usePathname();
  const items = role === "admin" ? adminItems : basicItems;
  const isTaskRoute = pathname.endsWith("/new") || pathname.endsWith("/edit");

  if (variant === "mobile" && (role !== "admin" || isTaskRoute)) {
    return null;
  }

  return (
    <nav className={variant === "mobile" ? "operations-mobile-nav" : "operations-nav"} aria-label="تنقل بوابة التشغيل">
      {items.map((item) => {
        const active = isActivePath(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className="operations-nav-link"
            aria-current={active ? "page" : undefined}
          >
            <span className="operations-nav-icon" aria-hidden="true"><NavIcon name={item.icon} /></span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
