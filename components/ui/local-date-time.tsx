"use client";

import { useEffect, useState } from "react";

type LocalDateTimeProps = {
  value: string | null | undefined;
  className?: string;
};

const localDateTimeFormatter = new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatLocal(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return localDateTimeFormatter.format(date);
}

export function LocalDateTime({ value, className }: LocalDateTimeProps) {
  const [formatted, setFormatted] = useState("—");

  useEffect(() => {
    setFormatted(value ? formatLocal(value) : "—");
  }, [value]);

  if (!value) return <span className={className}>—</span>;

  return (
    <time className={className} dateTime={value} title={value} dir="auto">
      {formatted}
    </time>
  );
}
