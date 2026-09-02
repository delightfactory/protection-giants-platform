const claimStatusLabels: Record<string, string> = {
  submitted: "جديدة",
  under_review: "قيد المراجعة",
  awaiting_inspection: "مطلوب فحص",
  approved: "مقبولة",
  rejected: "مرفوضة",
  cancelled: "ملغاة",
};

const resolutionStatusLabels: Record<string, string> = {
  authorized: "بانتظار الإسناد",
  assigned: "مسندة للتنفيذ",
  completed: "مكتملة",
  cancelled: "أُغلقت دون تنفيذ",
};

const inspectionStatusLabels: Record<string, string> = {
  requested: "بانتظار الفحص",
  submitted: "تم الفحص",
};

const warrantyStateLabels: Record<string, string> = {
  active: "ساري",
  expired: "منتهي",
  voided: "ملغى كخطأ",
};

const allocationStatusLabels: Record<string, string> = {
  reserved: "محجوزة",
  released: "محررة",
  consumed: "مستهلكة",
};

const qualityStateLabels: Record<string, string> = {
  pending: "بلاغ جودة قيد المراجعة",
  return_required: "قرار إرجاع — غير صالحة للاستخدام",
  clear_history: "لا يوجد حظر جودة حالي",
  none: "لا يوجد بلاغ جودة",
};

const centerStatusLabels: Record<string, string> = {
  active: "نشط",
  suspended: "موقوف",
  archived: "مؤرشف",
};

const actorKindLabels: Record<string, string> = {
  admin: "الإدارة",
  center: "مركز التركيب",
  customer: "العميل",
  system: "النظام",
  admin_recovery: "الإدارة عبر الإكمال الاستثنائي",
};

function labelFrom(labels: Record<string, string>, value: string | null | undefined, fallback: string) {
  return value ? labels[value] ?? fallback : fallback;
}

export function claimStatusLabel(value: string | null | undefined) {
  return labelFrom(claimStatusLabels, value, "حالة غير معروفة");
}

export function resolutionStatusLabel(value: string | null | undefined) {
  return labelFrom(resolutionStatusLabels, value, "حالة غير معروفة");
}

export function inspectionStatusLabel(value: string | null | undefined) {
  return labelFrom(inspectionStatusLabels, value, "لا يوجد فحص رسمي");
}

export function warrantyRecordStateLabel(value: string | null | undefined) {
  return labelFrom(warrantyStateLabels, value, "حالة ضمان غير معروفة");
}

export function allocationStatusLabel(value: string | null | undefined) {
  return labelFrom(allocationStatusLabels, value, "لا يوجد تخصيص");
}

export function qualityStateLabel(value: string | null | undefined) {
  return labelFrom(qualityStateLabels, value, "غير منطبق");
}

export function centerOperationalStatusLabel(value: string | null | undefined) {
  return labelFrom(centerStatusLabels, value, "غير منطبق");
}

export function actorKindLabel(value: string | null | undefined) {
  return labelFrom(actorKindLabels, value, "جهة تشغيلية");
}
