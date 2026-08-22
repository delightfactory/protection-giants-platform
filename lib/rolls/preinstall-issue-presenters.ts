export const rollPreinstallIssueCategoryLabels: Record<string, string> = {
  manufacturing_defect: "عيب تصنيع",
  physical_damage: "تلف مادي",
  contamination_or_packaging: "تلوث أو مشكلة تغليف",
  other: "أخرى",
};

export const rollPreinstallIssueStatusLabels: Record<string, string> = {
  submitted: "قيد مراجعة الشركة",
  cleared_for_use: "مسموح بالاستخدام",
  return_required: "يلزم الإرجاع",
  reported_in_error: "بلاغ بالخطأ",
};

export type RollPreinstallIssueStatusTone = "success" | "neutral" | "warning" | "danger" | "accent";

export function rollPreinstallIssueStatusTone(status: string): RollPreinstallIssueStatusTone {
  switch (status) {
    case "submitted":
      return "warning";
    case "cleared_for_use":
      return "success";
    case "return_required":
      return "danger";
    case "reported_in_error":
      return "neutral";
    default:
      return "neutral";
  }
}

export function rollPreinstallIssueCategoryLabel(category: string): string {
  return rollPreinstallIssueCategoryLabels[category] ?? "غير مصنف";
}

export function rollPreinstallIssueStatusLabel(status: string): string {
  return rollPreinstallIssueStatusLabels[status] ?? "حالة غير معروفة";
}
