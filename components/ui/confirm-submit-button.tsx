"use client";

import { useId, useRef } from "react";
import { useFormStatus } from "react-dom";

type ConfirmSubmitButtonProps = {
  children: string;
  title: string;
  description: string;
  confirmLabel: string;
  tone?: "danger" | "primary";
  className?: string;
  disabled?: boolean;
};

export function ConfirmSubmitButton({
  children,
  title,
  description,
  confirmLabel,
  tone = "danger",
  className = "",
  disabled = false,
}: ConfirmSubmitButtonProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const { pending } = useFormStatus();
  const triggerClass = tone === "danger" ? "button button-danger" : "button button-primary";

  const openDialog = (button: HTMLButtonElement) => {
    if (pending || disabled) return;
    const form = button.form;
    if (form && !form.reportValidity()) return;
    dialogRef.current?.showModal();
  };
  const closeDialog = () => {
    if (!pending) dialogRef.current?.close();
  };

  return (
    <>
      <button
        type="button"
        className={`${triggerClass} ${className}`.trim()}
        onClick={(event) => openDialog(event.currentTarget)}
        aria-haspopup="dialog"
        disabled={pending || disabled}
      >
        {children}
      </button>

      <dialog
        ref={dialogRef}
        className="ui-confirm-dialog"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={pending}
        onCancel={(event) => {
          if (pending) event.preventDefault();
        }}
        onClick={(event) => {
          if (!pending && event.target === event.currentTarget) closeDialog();
        }}
      >
        <div className="ui-confirm-card">
          <div className="ui-confirm-copy">
            <span className="eyebrow">تأكيد الإجراء</span>
            <h2 id={titleId}>{title}</h2>
            <p id={descriptionId}>{description}</p>
          </div>

          <div className="ui-confirm-actions">
            <button type="button" className="button button-ghost" onClick={closeDialog} disabled={pending}>
              إلغاء
            </button>
            <button
              type="submit"
              className={tone === "danger" ? "button button-danger" : "button button-primary"}
              disabled={pending}
            >
              {pending ? "جاري التنفيذ…" : confirmLabel}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
