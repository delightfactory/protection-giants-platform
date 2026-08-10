import type { ReactNode } from "react";

type StatusTone = "success" | "neutral" | "warning" | "danger" | "accent";

type StatusBadgeProps = {
  tone?: StatusTone;
  children: ReactNode;
};

export function StatusBadge({ tone = "neutral", children }: StatusBadgeProps) {
  return <span className={`ui-status ui-status-${tone}`}>{children}</span>;
}
