import type { ReactNode } from "react";

type FeedbackTone = "success" | "error" | "warning" | "info";

type FeedbackBannerProps = {
  tone: FeedbackTone;
  children: ReactNode;
  className?: string;
};

export function FeedbackBanner({ tone, children, className = "" }: FeedbackBannerProps) {
  const role = tone === "error" ? "alert" : "status";
  return (
    <div className={`ui-feedback ui-feedback-${tone} ${className}`.trim()} role={role}>
      <span className="ui-feedback-dot" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
