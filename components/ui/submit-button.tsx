"use client";

import { useFormStatus } from "react-dom";

type SubmitButtonProps = {
  children: string;
  pendingLabel?: string;
  className?: string;
  disabled?: boolean;
};

/** Shared normal-submit affordance; confirmation-required actions stay on ConfirmSubmitButton. */
export function SubmitButton({
  children,
  pendingLabel = "جارٍ الحفظ…",
  className = "button button-primary",
  disabled = false,
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className={className}
      disabled={pending || disabled}
      aria-busy={pending || undefined}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
