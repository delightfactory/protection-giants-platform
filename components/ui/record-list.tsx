import type { ReactNode } from "react";

type RecordFact = {
  label: string;
  value: ReactNode;
  dir?: "rtl" | "ltr";
};

type RecordListProps = {
  label: string;
  children: ReactNode;
};

type RecordItemProps = {
  kicker?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  facts?: RecordFact[];
  status?: ReactNode;
  actions?: ReactNode;
};

export function RecordList({ label, children }: RecordListProps) {
  return <section className="ui-record-list" aria-label={label}>{children}</section>;
}

export function RecordItem({ kicker, title, subtitle, facts = [], status, actions }: RecordItemProps) {
  return (
    <article className="ui-record-item">
      <div className="ui-record-identity">
        {kicker ? <span className="ui-record-kicker">{kicker}</span> : null}
        <h2>{title}</h2>
        {subtitle ? <div className="ui-record-subtitle">{subtitle}</div> : null}
      </div>

      {facts.length ? (
        <dl className="ui-record-facts">
          {facts.map((fact) => (
            <div className="ui-record-fact" key={fact.label}>
              <dt>{fact.label}</dt>
              <dd dir={fact.dir}>{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : <div />}

      <div className="ui-record-state">{status}</div>
      <div className="ui-record-actions">{actions}</div>
    </article>
  );
}
