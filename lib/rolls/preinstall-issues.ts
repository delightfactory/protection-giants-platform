import { createHash } from "node:crypto";

export const ROLL_PREINSTALL_ISSUE_EVIDENCE_BUCKET = "roll-preinstall-issue-evidence";
export const ROLL_PREINSTALL_ISSUE_MAX_IMAGES = 5;
export const ROLL_PREINSTALL_ISSUE_MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export const rollPreinstallIssueCategories = [
  "manufacturing_defect",
  "physical_damage",
  "contamination_or_packaging",
  "other",
] as const;

export type RollPreinstallIssueCategory = (typeof rollPreinstallIssueCategories)[number];

export const rollPreinstallIssueStatuses = [
  "submitted",
  "cleared_for_use",
  "return_required",
  "reported_in_error",
] as const;

export type RollPreinstallIssueStatus = (typeof rollPreinstallIssueStatuses)[number];

const allowedImageExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export type PreparedRollIssueImage = {
  file: File;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  sha256: string;
  storagePath: string;
};

export type ParseRollIssueSubmissionResult =
  | {
      ok: true;
      value: {
        category: RollPreinstallIssueCategory;
        description: string;
        images: PreparedRollIssueImage[];
      };
    }
  | { ok: false; code: string };

function nonEmptyFiles(formData: FormData): File[] {
  return formData
    .getAll("issue_images")
    .filter((value): value is File => value instanceof File && value.size > 0);
}

async function sha256(file: File): Promise<string> {
  const bytes = Buffer.from(await file.arrayBuffer());
  return createHash("sha256").update(bytes).digest("hex");
}

export async function parseRollIssueSubmission(
  formData: FormData,
  issueId: string,
): Promise<ParseRollIssueSubmissionResult> {
  const category = String(formData.get("category") ?? "").trim() as RollPreinstallIssueCategory;
  const description = String(formData.get("description") ?? "").trim();
  const files = nonEmptyFiles(formData);

  if (!rollPreinstallIssueCategories.includes(category)) {
    return { ok: false, code: "PG_ROLL_ISSUE_INVALID_CATEGORY" };
  }

  if (description.length < 10 || description.length > 2000) {
    return { ok: false, code: "PG_ROLL_ISSUE_INVALID_DESCRIPTION" };
  }

  if (files.length > ROLL_PREINSTALL_ISSUE_MAX_IMAGES) {
    return { ok: false, code: "PG_ROLL_ISSUE_INVALID_EVIDENCE" };
  }

  const images: PreparedRollIssueImage[] = [];
  for (const [index, file] of files.entries()) {
    const extension = allowedImageExtensions[file.type];
    if (!extension || file.size > ROLL_PREINSTALL_ISSUE_MAX_IMAGE_BYTES) {
      return { ok: false, code: "PG_ROLL_ISSUE_INVALID_EVIDENCE" };
    }

    const digest = await sha256(file);
    images.push({
      file,
      mimeType: file.type,
      extension,
      sizeBytes: file.size,
      sha256: digest,
      storagePath: `${issueId}/${index + 1}-${digest}.${extension}`,
    });
  }

  return { ok: true, value: { category, description, images } };
}

export function rollIssueCategoryLabel(category: string): string {
  switch (category) {
    case "manufacturing_defect":
      return "عيب تصنيع";
    case "physical_damage":
      return "تلف مادي";
    case "contamination_or_packaging":
      return "تلوث أو مشكلة تغليف";
    case "other":
      return "أخرى";
    default:
      return category;
  }
}

export function rollIssueStatusLabel(status: string): string {
  switch (status) {
    case "submitted":
      return "قيد مراجعة الشركة";
    case "cleared_for_use":
      return "مسموح بالاستخدام";
    case "return_required":
      return "مطلوب إرجاع الرول";
    case "reported_in_error":
      return "تم الإبلاغ بالخطأ";
    default:
      return status;
  }
}
