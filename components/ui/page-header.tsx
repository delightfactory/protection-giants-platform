import type { ReactNode } from "react";

type PageHeaderProps = {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
};

export function PageHeader({ eyebrow, title, description, meta, actions }: PageHeaderProps) {
  return (
    <header className="ui-page-header">
      <div className="ui-page-heading">
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <h1>{title}</h1>
        {description ? <p className="ui-page-description">{description}</p> : null}
      </div>

      {meta || actions ? (
        <div className="ui-page-actions">
          {meta ? <div className="ui-page-meta">{meta}</div> : null}
          {actions}
        </div>
      ) : null}
    </header>
  );
}
