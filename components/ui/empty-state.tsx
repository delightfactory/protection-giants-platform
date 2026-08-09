import type { ReactNode } from "react";

type EmptyStateProps = {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
};

export function EmptyState({ eyebrow, title, description, action }: EmptyStateProps) {
  return (
    <section className="ui-empty-state">
      <div>
        {eyebrow ? <span className="ui-empty-eyebrow">{eyebrow}</span> : null}
        <strong>{title}</strong>
        {description ? <p>{description}</p> : null}
      </div>
      {action ? <div className="ui-empty-action">{action}</div> : null}
    </section>
  );
}
