import { EmptyState } from "@/components/ui/empty-state";

export default function OperationsLoading() {
  return (
    <div aria-live="polite" aria-busy="true">
      <EmptyState
        eyebrow="بوابة التشغيل"
        title="جاري تحميل البيانات"
        description="يتم تجهيز المساحة التشغيلية المطلوبة."
      />
    </div>
  );
}
