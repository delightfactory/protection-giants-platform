import Link from "next/link";
import { brandConfig } from "@/lib/brand-config";

export function OperationsNav() {
  return (
    <aside className="operations-sidebar">
      <Link href="/" className="brand" aria-label="العودة إلى الموقع العام">
        <span className="brand-mark" aria-hidden="true">{brandConfig.shortName}</span>
        <span>{brandConfig.name}</span>
      </Link>
      <nav className="operations-nav" aria-label="تنقل بوابة التشغيل">
        <Link href="/operations">نظرة عامة</Link>
      </nav>
    </aside>
  );
}
