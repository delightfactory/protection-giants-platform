import type { ReactNode } from "react";

type EmptyStateProps = {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  headingLevel?: 1 | 2;
};

export function EmptyState({ eyebrow, title, description, action, headingLevel }: EmptyStateProps) {
  const titleNode = headingLevel === 1
    ? <h1 className="ui-empty-title">{title}</h1>
    : headingLevel === 2
      ? <h2 className="ui-empty-title">{title}</h2>
      : <strong className="ui-empty-title">{title}</strong>;

  return (
    <section className="ui-empty-state">
      <div>
        {eyebrow ? <span className="ui-empty-eyebrow">{eyebrow}</span> : null}
        {titleNode}
        {description ? <p>{description}</p> : null}
      </div>
      {action ? <div className="ui-empty-action">{action}</div> : null}
    </section>
  );
}
