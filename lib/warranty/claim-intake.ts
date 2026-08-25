export const WARRANTY_CLAIM_EVIDENCE_BUCKET = "warranty-claim-evidence";
export const WARRANTY_CLAIM_MAX_IMAGES = 5;
export const WARRANTY_CLAIM_MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export const WARRANTY_CLAIM_CATEGORIES = [
  "cracking",
  "yellowing",
  "discoloration",
  "peeling",
  "delamination",
  "adhesive_issue",
  "bubbling",
  "other",
] as const;

export type WarrantyClaimCategory = (typeof WARRANTY_CLAIM_CATEGORIES)[number];

export const WARRANTY_CLAIM_CATEGORY_LABELS: Record<WarrantyClaimCategory, string> = {
  cracking: "تشقق",
  yellowing: "اصفرار",
  discoloration: "تغير لون",
  peeling: "تقشر",
  delamination: "انفصال طبقات",
  adhesive_issue: "مشكلة في المادة اللاصقة",
  bubbling: "فقاعات",
  other: "أخرى",
};

export const WARRANTY_CLAIM_ALLOWED_IMAGES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type WarrantyClaimEvidenceMime = keyof typeof WARRANTY_CLAIM_ALLOWED_IMAGES;

export type WarrantyClaimEvidenceReference = {
  storagePath: string;
  mimeType: WarrantyClaimEvidenceMime;
  sizeBytes: number;
};

export type CustomerClaimSummary = {
  claimNumber: string;
  status: string;
  submittedAt: string;
  category: WarrantyClaimCategory;
  affectedArea: string;
  description: string;
  evidenceCount: number;
  closedAt?: string | null;
};

export type CustomerWarrantyClaimContext = {
  warrantyId: string;
  publicState: "active" | "expired";
  canSubmitNewClaim: boolean;
  productName: string;
  warrantyNumber: string;
  activatedAt: string;
  coverageExpiresAt: string;
  activatingCenterName: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number | null;
  currentOpenClaim: CustomerClaimSummary | null;
  recentClosedClaims: CustomerClaimSummary[];
};

export type WarrantyClaimVerificationResult =
  | { ok: true }
  | { ok: false; code: "PG_CLAIM_VERIFICATION_FAILED" | "PG_CLAIM_SERVICE_UNAVAILABLE" };

export type WarrantyClaimUploadResult =
  | { ok: true; evidence: WarrantyClaimEvidenceReference }
  | { ok: false; code: string };

export type WarrantyClaimSubmitResult =
  | { ok: true; claimId: string; claimNumber: string }
  | { ok: false; code: string };

export function isWarrantyClaimCategory(value: string): value is WarrantyClaimCategory {
  return (WARRANTY_CLAIM_CATEGORIES as readonly string[]).includes(value);
}

export function isWarrantyClaimEvidenceMime(value: string): value is WarrantyClaimEvidenceMime {
  return Object.prototype.hasOwnProperty.call(WARRANTY_CLAIM_ALLOWED_IMAGES, value);
}

export function validateWarrantyClaimImage(file: File): string | null {
  if (!isWarrantyClaimEvidenceMime(file.type)) return "PG_CLAIM_EVIDENCE_TYPE_INVALID";
  if (file.size < 1 || file.size > WARRANTY_CLAIM_MAX_IMAGE_BYTES) {
    return "PG_CLAIM_EVIDENCE_SIZE_INVALID";
  }
  return null;
}

export function claimStatusLabel(status: string): string {
  switch (status) {
    case "submitted":
      return "تم استلام المطالبة";
    case "under_review":
      return "قيد المراجعة";
    case "awaiting_inspection":
      return "بانتظار الفحص";
    case "approved":
      return "تم قبول المطالبة";
    case "rejected":
      return "تم رفض المطالبة";
    case "cancelled":
      return "تم إغلاق المطالبة";
    default:
      return "حالة المطالبة";
  }
}
