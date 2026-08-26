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
        <aside className={styles.reviewShortcut} aria-label="إجراءات مراجعة المطالبة">
          <div>
            <span className={styles.eyebrow}>إجراءات منفصلة عن سجل التدقيق</span>
            <h2>متابعة مراجعة المطالبة</h2>
            <p>بعد مراجعة بيانات المطالبة والمرفقات والـTimeline، انتقل لمساحة الإجراءات لبدء المراجعة أو إدارة تكليف الفحص.</p>
          </div>
          <Link href={`${pathname}/review`} className="button button-primary">
            فتح إجراءات المراجعة
          </Link>
        </aside>
      ) : null}
    </>
  );
}
