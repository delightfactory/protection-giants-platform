import Link from "next/link";
import { brandConfig } from "@/lib/brand-config";

type BrandLockupProps = {
  href?: string;
  compact?: boolean;
  className?: string;
};

export function BrandLockup({ href = "/", compact = false, className = "" }: BrandLockupProps) {
  return (
    <Link
      href={href}
      className={`brand ui-brand-lockup${compact ? " is-compact" : ""} ${className}`.trim()}
      aria-label={`${brandConfig.name} - الرئيسية`}
    >
      <span className="brand-mark" dir="ltr" aria-hidden="true">{brandConfig.shortName}</span>
      <span className="ui-brand-copy">
        <strong>{brandConfig.name}</strong>
        {!compact ? <small dir="ltr">{brandConfig.englishName}</small> : null}
      </span>
    </Link>
  );
}
