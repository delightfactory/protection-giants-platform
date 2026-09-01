"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import {
  getDesktopNavItems,
  getMobileNavItems,
  isOperationsTaskRoute,
} from "@/lib/navigation/operations-navigation";
import type { OperationalRole } from "@/lib/auth/operational-profile";
import styles from "./operations-nav-links.module.css";

type NavVariant = "desktop" | "mobile";

function isActivePath(pathname: string, href: string) {
  if (href === "/operations") return pathname === href;
  if (href === "/operations/more") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function OperationsNavLinks({ role, variant }: { role: OperationalRole; variant: NavVariant }) {
  const pathname = usePathname();
  const items = variant === "mobile" ? getMobileNavItems(role) : getDesktopNavItems(role);

  if (variant === "mobile" && isOperationsTaskRoute(pathname)) return null;

  return (
    <nav className={variant === "mobile" ? "operations-mobile-nav" : "operations-nav"} aria-label="تنقل بوابة التشغيل">
      {items.map((item) => {
        const active = isActivePath(pathname, item.href);
        return (
          <Link
            key={item.id}
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
