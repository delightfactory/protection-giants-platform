"use client";

import { ReactNode, useEffect, useRef } from "react";
import styles from "./accessible-dialog.module.css";

type AccessibleDialogProps = {
  open: boolean;
  onClose: () => void;
  titleId: string;
  descriptionId?: string;
  busy?: boolean;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  placement?: "bottom" | "responsive";
  initialFocusSelector?: string;
  children: ReactNode;
};

const DEFAULT_FOCUS_SELECTOR = [
  "[data-dialog-initial-focus]",
  "button:not([disabled])",
  "[href]",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function restoreFocus(target: HTMLElement | null) {
  if (!target || !target.isConnected) return;
  window.requestAnimationFrame(() => target.focus({ preventScroll: true }));
}

export function AccessibleDialog({
  open,
  onClose,
  titleId,
  descriptionId,
  busy = false,
  closeOnBackdrop = true,
  closeOnEscape = true,
  placement = "bottom",
  initialFocusSelector = DEFAULT_FOCUS_SELECTOR,
  children,
}: AccessibleDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const busyRef = useRef(busy);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      if (!dialog.open) {
        const active = document.activeElement;
        restoreFocusRef.current = active instanceof HTMLElement && active !== document.body ? active : null;
        dialog.showModal();
      }

      const previousOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = "hidden";
      const frame = window.requestAnimationFrame(() => {
        const target = dialog.querySelector<HTMLElement>(initialFocusSelector);
        target?.focus({ preventScroll: true });
      });

      return () => {
        window.cancelAnimationFrame(frame);
        document.documentElement.style.overflow = previousOverflow;
      };
    }

    if (dialog.open) dialog.close();
    restoreFocus(restoreFocusRef.current);
    restoreFocusRef.current = null;
  }, [initialFocusSelector, open]);

  useEffect(() => () => {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
    restoreFocus(restoreFocusRef.current);
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      data-placement={placement}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-busy={busy || undefined}
      onCancel={(event) => {
        event.preventDefault();
        if (!busyRef.current && closeOnEscape) onCloseRef.current();
      }}
      onMouseDown={(event) => {
        if (
          event.target === event.currentTarget
          && closeOnBackdrop
          && !busyRef.current
        ) {
          onCloseRef.current();
        }
      }}
    >
      {children}
    </dialog>
  );
}
