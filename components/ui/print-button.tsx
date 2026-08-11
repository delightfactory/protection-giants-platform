"use client";

export function PrintButton({ label = "طباعة" }: { label?: string }) {
  return (
    <button type="button" className="button button-primary" onClick={() => window.print()}>
      {label}
    </button>
  );
}
