"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./local-evidence-review.module.css";

export type LocalEvidenceReviewStatus = "local" | "uploading" | "retained" | "error";

export type LocalEvidenceReviewItem = {
  id: string;
  file: File;
  status: LocalEvidenceReviewStatus;
  error?: string;
  label?: string;
};

type LocalEvidenceReviewProps = {
  idPrefix: string;
  title: string;
  help: string;
  items: LocalEvidenceReviewItem[];
  maxFiles: number;
  accept: string;
  disabled?: boolean;
  addLabel?: string;
  onAdd: (files: File[]) => void | Promise<void>;
  onRemove: (item: LocalEvidenceReviewItem) => void | Promise<void>;
  onReplace: (item: LocalEvidenceReviewItem, file: File) => void | Promise<void>;
};

const PREVIEWABLE_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes.toLocaleString("en-US")} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString("en-US")} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileTypeLabel(file: File) {
  if (file.type) return file.type;
  const extension = file.name.includes(".") ? file.name.split(".").pop()?.toUpperCase() : null;
  return extension ? `${extension} file` : "ملف";
}

function statusLabel(item: LocalEvidenceReviewItem) {
  if (item.status === "local") return "خاص على جهازك — لم يُرفع بعد";
  if (item.status === "uploading") return "جارٍ الرفع بعد تأكيد الإرسال…";
  if (item.status === "retained") return "تم الرفع ومحفوظ للمحاولة الحالية";
  return item.error ?? "تعذر تجهيز الملف للمحاولة الحالية";
}

export function LocalEvidenceReview({
  idPrefix,
  title,
  help,
  items,
  maxFiles,
  accept,
  disabled = false,
  addLabel = "إضافة ملفات",
  onAdd,
  onRemove,
  onReplace,
}: LocalEvidenceReviewProps) {
  const addInputRef = useRef<HTMLInputElement | null>(null);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    const created: Record<string, string> = {};
    for (const item of items) {
      if (PREVIEWABLE_IMAGE_TYPES.has(item.file.type)) {
        created[item.id] = URL.createObjectURL(item.file);
      }
    }
    setPreviewUrls(created);
    return () => {
      for (const url of Object.values(created)) URL.revokeObjectURL(url);
    };
  }, [items]);

  const submissionStarted = items.some((item) => item.status !== "local");
  const canAdd = !disabled && items.length < maxFiles;

  return (
    <section className={styles.review} aria-label={title}>
      <div className={styles.heading}>
        <div>
          <strong>{title}</strong>
          <p>{help}</p>
        </div>
        <span className={styles.count}>{items.length.toLocaleString("en-US")}/{maxFiles.toLocaleString("en-US")}</span>
      </div>

      <div className={styles.privacy} role="note">
        {submissionStarted
          ? "بدأت محاولة الإرسال. الملفات التي تحمل حالة «تم الرفع» محفوظة للمحاولة الحالية؛ راجعها أو أزلها قبل إعادة التأكيد."
          : "الملفات المختارة ما زالت خاصة على جهازك. لن يبدأ رفعها إلى Protection Giants إلا بعد تأكيد الإرسال النهائي."}
      </div>

      <label className={`button button-secondary ${styles.addButton}`} htmlFor={`${idPrefix}-add`} aria-disabled={!canAdd}>
        {addLabel}
        <input
          ref={addInputRef}
          id={`${idPrefix}-add`}
          type="file"
          accept={accept}
          multiple
          hidden
          disabled={!canAdd}
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = "";
            if (files.length) void onAdd(files);
          }}
        />
      </label>

      {items.length ? (
        <ul className={styles.grid} aria-live="polite">
          {items.map((item, index) => {
            const previewUrl = previewUrls[item.id];
            const busy = disabled || item.status === "uploading";
            return (
              <li className={styles.item} key={item.id}>
                <div className={styles.preview}>
                  {previewUrl ? (
                    <img src={previewUrl} alt={`معاينة ${item.label ?? `الملف ${index + 1}`}: ${item.file.name}`} />
                  ) : (
                    <div className={styles.fileFallback}>
                      <span aria-hidden="true">▤</span>
                      <strong>{fileTypeLabel(item.file)}</strong>
                      <small>لا تتوفر معاينة محلية لهذا النوع</small>
                    </div>
                  )}
                </div>

                <div className={styles.meta}>
                  <strong>{item.label ?? `ملف ${index + 1}`}</strong>
                  <span className={styles.fileName}>{item.file.name}</span>
                  <span dir="ltr">{fileTypeLabel(item.file)} · {formatBytes(item.file.size)}</span>
                  <span className={item.status === "error" ? styles.error : styles.state}>{statusLabel(item)}</span>
                </div>

                <div className={styles.actions}>
                  <label className="button button-ghost" aria-disabled={busy}>
                    استبدال
                    <input
                      type="file"
                      accept={accept}
                      hidden
                      disabled={busy}
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0] ?? null;
                        event.currentTarget.value = "";
                        if (file) void onReplace(item, file);
                      }}
                    />
                  </label>
                  <button type="button" className="button button-ghost" disabled={busy} onClick={() => void onRemove(item)}>
                    إزالة
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={styles.empty}>لم تُحدد ملفات بعد.</p>
      )}
    </section>
  );
}
