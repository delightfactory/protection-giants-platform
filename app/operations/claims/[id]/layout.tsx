"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./claim-workflow-layout.module.css";

const claimDetailPattern = /^\/operations\/claims\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

export default function ClaimWorkflowLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const match = pathname.match(claimDetailPattern);

  return (
    <>
      {children}
      {match ? (
        <aside className={styles.reviewShortcut} aria-label="إجراءات المطالبة">
          <div>
            <span className={styles.eyebrow}>إجراءات منفصلة عن سجل التدقيق</span>
            <h2>متابعة مراجعة وقرار المطالبة</h2>
            <p>بعد مراجعة البيانات والمرفقات والـTimeline، استخدم مساحة المراجعة لإدارة الفحص أو مساحة القرار النهائي لتنفيذ قرار Admin المسموح.</p>
          </div>
          <Link href={`${pathname}/review`} className="button button-ghost">
            إجراءات المراجعة
          </Link>
          <Link href={`${pathname}/decision`} className="button button-primary">
            القرار النهائي
          </Link>
        </aside>
      ) : null}
    </>
  );
}
