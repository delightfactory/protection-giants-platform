"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/icon";
import styles from "./operations-nav-links.module.css";

type OperationalRole = "admin" | "agent" | "dealer" | "center";
type NavVariant = "desktop" | "mobile";
type NavItem = {
  href: string;
  label: string;
  icon: IconName;
};

const adminMobileItems: NavItem[] = [
  { href: "/operations", label: "الرئيسية", icon: "home" },
  { href: "/operations/users", label: "الحسابات", icon: "users" },
  { href: "/operations/dealers", label: "الوكلاء", icon: "dealers" },
  { href: "/operations/centers", label: "المراكز", icon: "centers" },
  { href: "/operations/products", label: "المنتجات", icon: "products" },
];

const adminDesktopItems: NavItem[] = [
  { href: "/operations", label: "الرئيسية", icon: "home" },
  { href: "/operations/users", label: "الحسابات", icon: "users" },
  { href: "/operations/agents", label: "وكلاء الدول", icon: "users" },
  { href: "/operations/dealers", label: "الوكلاء", icon: "dealers" },
  { href: "/operations/centers", label: "المراكز", icon: "centers" },
  { href: "/operations/products", label: "المنتجات", icon: "products" },
  { href: "/operations/production-orders", label: "الإنتاج", icon: "production" },
];

const agentItems: NavItem[] = [
  { href: "/operations", label: "الرئيسية", icon: "home" },
  { href: "/operations/dealers", label: "الموزعون", icon: "dealers" },
  { href: "/operations/centers", label: "المراكز", icon: "centers" },
  { href: "/operations/products", label: "المنتجات", icon: "products" },
];

const dealerItems: NavItem[] = [
  { href: "/operations", label: "الرئيسية", icon: "home" },
  { href: "/operations/centers", label: "المراكز", icon: "centers" },
  { href: "/operations/products", label: "المنتجات", icon: "products" },
];

const centerItems: NavItem[] = [
  { href: "/operations", label: "الرئيسية", icon: "home" },
  { href: "/operations/products", label: "المنتجات", icon: "products" },
];

function itemsForRole(role: OperationalRole, variant: NavVariant) {
  if (role === "admin") return variant === "mobile" ? adminMobileItems : adminDesktopItems;
  if (role === "agent") return agentItems;
  if (role === "dealer") return dealerItems;
  return centerItems;
}

function isActivePath(pathname: string, href: string) {
  return href === "/operations" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function OperationsNavLinks({ role, variant }: { role: OperationalRole; variant: NavVariant }) {
  const pathname = usePathname();
  const items = itemsForRole(role, variant);
  const isTaskRoute = pathname.endsWith("/new") || pathname.endsWith("/edit");

  if (variant === "mobile" && isTaskRoute) {
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
            <span className="operations-nav-icon" aria-hidden="true"><Icon name={item.icon} /></span>
            <span className={variant === "mobile" ? styles.mobileLabel : undefined}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
