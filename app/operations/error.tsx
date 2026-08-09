"use client";

import { EmptyState } from "@/components/ui/empty-state";

export default function OperationsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <EmptyState
      eyebrow="حدث خطأ"
      title="تعذر تحميل هذه المساحة التشغيلية"
      description="أعد المحاولة. إذا ظهر الخطأ بعد حفظ أو تغيير حالة، راجع النتيجة الحالية قبل تكرار الإجراء حتى لا تنفذه مرتين."
      action={<button type="button" className="button button-primary" onClick={reset}>إعادة المحاولة</button>}
    />
  );
}
