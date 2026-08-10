import type { ReactNode } from "react";

type FilterBarProps = {
  label: string;
  children: ReactNode;
};

type FilterFieldProps = {
  label: string;
  children: ReactNode;
  wide?: boolean;
};

export function FilterBar({ label, children }: FilterBarProps) {
  return <section className="ui-filter-bar" aria-label={label}>{children}</section>;
}

export function FilterGrid({ children }: { children: ReactNode }) {
  return <div className="ui-filter-grid">{children}</div>;
}

export function FilterField({ label, children, wide = false }: FilterFieldProps) {
  return (
    <label className={`ui-filter-field${wide ? " is-wide" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function FilterActions({ children }: { children: ReactNode }) {
  return <div className="ui-filter-actions">{children}</div>;
}
