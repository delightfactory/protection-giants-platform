import type { ReactNode } from "react";

type FormPanelProps = {
  children: ReactNode;
  className?: string;
};

type FormSectionProps = {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
};

type FormGridProps = {
  children: ReactNode;
  columns?: 1 | 2;
};

export function FormPanel({ children, className = "" }: FormPanelProps) {
  return <section className={`ui-form-panel ${className}`.trim()}>{children}</section>;
}

export function FormSection({ title, description, children }: FormSectionProps) {
  return (
    <section className="ui-form-section">
      <div className="ui-form-section-heading">
        <strong>{title}</strong>
        {description ? <p>{description}</p> : null}
      </div>
      <div className="ui-form-section-body">{children}</div>
    </section>
  );
}

export function FormGrid({ children, columns = 2 }: FormGridProps) {
  return <div className={`ui-form-grid ui-form-grid-${columns}`}>{children}</div>;
}
