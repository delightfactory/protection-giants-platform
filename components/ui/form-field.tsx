import type { ReactNode } from "react";

type FormFieldProps = {
  label: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
  optional?: boolean;
  full?: boolean;
};

export function FormField({ label, children, hint, optional = false, full = false }: FormFieldProps) {
  return (
    <label className={`ui-form-field${full ? " is-full" : ""}`}>
      <span className="ui-form-label">
        <span>{label}</span>
        {optional ? <small>اختياري</small> : null}
      </span>
      {children}
      {hint ? <small className="ui-form-hint">{hint}</small> : null}
    </label>
  );
}
