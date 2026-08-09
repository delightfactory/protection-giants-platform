"use client";

import { useId, useRef } from "react";

type ConfirmSubmitButtonProps = {
  children: string;
  title: string;
  description: string;
  confirmLabel: string;
  tone?: "danger" | "primary";
  className?: string;
};

export function ConfirmSubmitButton({
  children,
  title,
  description,
  confirmLabel,
  tone = "danger",
  className = "",
}: ConfirmSubmitButtonProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  const openDialog = () => dialogRef.current?.showModal();
  const closeDialog = () => dialogRef.current?.close();

  return (
    <>
      <button
        type="button"
        className={className || (tone === "danger" ? "button button-danger" : "button button-primary")}
        onClick={openDialog}
        aria-haspopup="dialog"
      >
        {children}
      </button>

      <dialog
        ref={dialogRef}
        className="ui-confirm-dialog"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeDialog();
        }}
      >
        <div className="ui-confirm-card">
          <div className="ui-confirm-copy">
            <span className="eyebrow">تأكيد الإجراء</span>
            <h2 id={titleId}>{title}</h2>
            <p id={descriptionId}>{description}</p>
          </div>

          <div className="ui-confirm-actions">
            <button type="button" className="button button-ghost" onClick={closeDialog}>إلغاء</button>
            <button
              type="submit"
              className={tone === "danger" ? "button button-danger" : "button button-primary"}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
