import { normalizeRollSerial } from "@/lib/rolls/roll-qr";
export {
  buildTransferActionFingerprint,
  clearTransferActionRequest,
  receiptDraftStorageKey,
  requestIdForTransferAction,
} from "@/lib/transfers/receipt-idempotency";

export type TransferStatus =
  | "pending"
  | "partially_received"
  | "received"
  | "partially_completed"
  | "cancelled"
  | "rejected";

export type TransferItemStatus =
  | "pending"
  | "received"
  | "released_to_sender"
  | "closed_unreceived";

export type TransferSummary = {
  transfer_id: string;
  transfer_number: string;
  status: TransferStatus;
  created_at: string;
  closed_at: string | null;
  sender_party_type: string;
  sender_name: string;
  recipient_party_type: string;
  recipient_name: string;
  roll_count: number;
  received_count: number;
  pending_count: number;
  released_to_sender_count: number;
  closed_unreceived_count: number;
  needs_action: boolean;
  matching_count: number;
};

export type TransferLotGroup = {
  lot_id: string;
  lot_number: string;
  product_code: string;
  product_name: string;
  production_lot_total: number;
  transfer_count: number;
  received_count: number;
  pending_count: number;
  released_to_sender_count: number;
  transfer_contains_full_lot: boolean;
};

export type TransferTimelineEvent = {
  event_sequence: number;
  event_type: string;
  occurred_at: string;
  affected_roll_count: number | null;
  reason: string | null;
};

export type TransferDetail = {
  transfer_id: string;
  transfer_number: string;
  status: TransferStatus;
  created_at: string;
  closed_at: string | null;
  sender_party_type: string;
  sender_name: string;
  recipient_party_type: string;
  recipient_name: string;
  roll_count: number;
  received_count: number;
  pending_count: number;
  released_to_sender_count: number;
  closed_unreceived_count: number;
  viewer_is_sender: boolean;
  viewer_is_recipient: boolean;
  viewer_is_admin: boolean;
  can_receive: boolean;
  can_cancel: boolean;
  can_reject: boolean;
  can_resolve_unreceived: boolean;
  can_admin_resolve_unreceived: boolean;
  can_admin_recovery_cancel: boolean;
  lot_groups: TransferLotGroup[];
  timeline: TransferTimelineEvent[];
};

export type TransferItem = {
  roll_id: string;
  serial_number: string;
  erp_serial: string;
  lot_id: string;
  lot_number: string;
  product_code: string;
  product_name: string;
  item_status: TransferItemStatus;
  acted_at: string | null;
};

export type ReceiptLotExpansion = {
  lot_id: string;
  lot_number: string;
  product_code: string;
  product_name: string;
  production_lot_total: number;
  transfer_count: number;
  received_count: number;
  pending_count: number;
  released_to_sender_count: number;
  transfer_contains_full_lot: boolean;
  pending_roll_ids: string[];
};

const receiptErrorMessages: Record<string, string> = {
  PG_TRANSFER_UNAUTHENTICATED: "انتهت جلسة الدخول. سجل الدخول مرة أخرى ثم تابع العملية.",
  PG_TRANSFER_ACTOR_INACTIVE: "حسابك أو جهتك التشغيلية لم تعد نشطة لهذه العملية.",
  PG_TRANSFER_NOT_FOUND: "التحويل غير موجود أو لم يعد متاحًا.",
  PG_TRANSFER_NOT_RECIPIENT: "هذا التحويل ليس واردًا إلى جهتك الحالية.",
  PG_TRANSFER_NOT_SENDER: "هذا الإجراء متاح للجهة المرسلة فقط.",
  PG_TRANSFER_INVALID_STATE: "حالة التحويل تغيرت ولم يعد هذا الإجراء متاحًا.",
  PG_TRANSFER_RECEIPT_STATE_INVALID: "حالة التحويل تغيرت ولم يعد الاستلام متاحًا بهذه الصورة.",
  PG_TRANSFER_RECEIPT_ROLL_COUNT_INVALID: "اختر لفة واحدة على الأقل وبحد أقصى 10,000 لفة.",
  PG_TRANSFER_RECEIPT_ROLL_ID_DUPLICATE: "يوجد تكرار في اللفات المختارة. راجع الاختيار ثم أعد المحاولة.",
  PG_TRANSFER_RECEIPT_ROLL_NOT_IN_TRANSFER: "إحدى اللفات ليست ضمن هذا التحويل.",
  PG_TRANSFER_RECEIPT_ITEM_ALREADY_RECEIVED: "إحدى اللفات المختارة تم استلامها بالفعل.",
  PG_TRANSFER_RECEIPT_ITEM_RELEASED: "إحدى اللفات لم تعد قابلة للاستلام في هذا التحويل لأنها حُسمت لدى المرسل.",
  PG_TRANSFER_RECEIPT_ITEM_CLOSED: "إحدى اللفات أُغلقت مع التحويل ولم تعد قابلة للاستلام.",
  PG_TRANSFER_RECEIPT_RESERVATION_INVALID: "تغير حجز إحدى اللفات. حدّث التحويل قبل الاستلام.",
  PG_TRANSFER_RECEIPT_SENDER_CUSTODY_CHANGED: "تغيرت عهدة إحدى اللفات بشكل غير متوقع. أوقف الاستلام وراجع التحويل.",
  PG_TRANSFER_RECEIPT_PRODUCTION_INVALID: "إحدى اللفات لم تعد مؤهلة للعملية بسبب حالة أمر الإنتاج.",
  PG_TRANSFER_RECEIPT_REQUEST_CONFLICT: "تغيرت بيانات محاولة الاستلام أثناء إعادة المحاولة. راجع الاختيار قبل المتابعة.",
  PG_TRANSFER_RESOLUTION_STATE_INVALID: "لا يمكن حسم اللفات المتبقية في حالة التحويل الحالية.",
  PG_TRANSFER_RESOLUTION_ITEM_NOT_PENDING: "إحدى اللفات المحددة لم تعد معلقة في التحويل.",
  PG_TRANSFER_RESOLUTION_RESERVATION_INVALID: "تغير حجز إحدى اللفات المحددة. حدّث التحويل قبل المتابعة.",
  PG_TRANSFER_RESOLUTION_REASON_INVALID: "اكتب سببًا واضحًا من 5 إلى 500 حرف.",
  PG_TRANSFER_RESOLUTION_REQUEST_CONFLICT: "تغيرت بيانات محاولة التسوية أثناء إعادة المحاولة. راجع الاختيار قبل المتابعة.",
  PG_TRANSFER_ADMIN_REQUIRED: "هذا الإجراء متاح لإدارة Protection Giants فقط.",
  PG_TRANSFER_ADMIN_RECOVERY_NOT_ALLOWED: "لا تتوفر شروط الإلغاء الإداري لهذا التحويل.",
  PG_TRANSFER_RECEIPT_FAILED: "تعذر تأكيد الاستلام الآن. احتفظنا باختيارك ويمكنك إعادة المحاولة بنفس البيانات.",
  PG_TRANSFER_ACTION_FAILED: "تعذر تنفيذ الإجراء الآن. حدّث حالة التحويل ثم أعد المحاولة.",
};

export function transferStatusLabel(status: TransferStatus): string {
  switch (status) {
    case "pending": return "بانتظار الاستلام";
    case "partially_received": return "مستلم جزئيًا";
    case "received": return "تم الاستلام";
    case "partially_completed": return "مكتمل جزئيًا";
    case "cancelled": return "ملغي";
    case "rejected": return "مرفوض";
  }
}

export function transferItemStatusLabel(status: TransferItemStatus): string {
  switch (status) {
    case "pending": return "بانتظار الاستلام";
    case "received": return "مستلم";
    case "released_to_sender": return "باقٍ لدى المرسل";
    case "closed_unreceived": return "أُغلق دون استلام";
  }
}

export function transferTimelineLabel(event: TransferTimelineEvent): string {
  switch (event.event_type) {
    case "created": return "تم إنشاء التحويل";
    case "received": return `تم استلام ${event.affected_roll_count ?? 0} لفة`;
    case "unresolved_released": return `تم تأكيد بقاء ${event.affected_roll_count ?? 0} لفة لدى المرسل`;
    case "administrative_unresolved_released": return `تم حسم ${event.affected_roll_count ?? 0} لفة إداريًا مع بقاء العهدة لدى المرسل`;
    case "cancelled": return "تم إلغاء التحويل قبل الاستلام";
    case "rejected": return "تم رفض التحويل قبل الاستلام";
    case "administrative_cancelled": return "تم إلغاء التحويل إداريًا قبل الاستلام";
    default: return "تم تحديث التحويل";
  }
}

export function transferActionErrorMessage(code: string): string {
  return receiptErrorMessages[code] ?? receiptErrorMessages.PG_TRANSFER_ACTION_FAILED;
}

export function normalizeReceiptManualSerial(value: string): string | null {
  return normalizeRollSerial(value);
}
