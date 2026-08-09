import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";

export default function OperationsNotFound() {
  return (
    <EmptyState
      eyebrow="غير موجود"
      title="السجل أو الصفحة المطلوبة غير متاحة"
      description="قد يكون الرابط غير صحيح أو أن السجل لم يعد موجودًا في النطاق التشغيلي الحالي."
      action={<Link href="/operations" className="button button-primary">العودة للرئيسية</Link>}
    />
  );
}
