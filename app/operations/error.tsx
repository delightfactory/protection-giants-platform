"use client";

import { EmptyState } from "@/components/ui/empty-state";

export default function OperationsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <EmptyState
      eyebrow="حدث خطأ"
      title="تعذر تحميل هذه المساحة التشغيلية"
      description="لم يتم تنفيذ أي إجراء جديد من هذه الشاشة. أعد المحاولة، وإذا تكرر الخطأ راجع سجل النظام."
      action={<button type="button" className="button button-primary" onClick={reset}>إعادة المحاولة</button>}
    />
  );
}
