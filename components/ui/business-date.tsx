type BusinessDateProps = {
  value: string | null | undefined;
  className?: string;
};

function isLeapYear(year: number) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number) {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
  return 31;
}

export function normalizeBusinessDate(value: string | null | undefined): string | null {
  if (!value) return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return null;
  }

  return `${match[1]}-${match[2]}-${match[3]}`;
}

export function BusinessDate({ value, className }: BusinessDateProps) {
  const normalized = normalizeBusinessDate(value);
  if (!normalized) return <span className={className}>—</span>;

  return (
    <time className={className} dateTime={normalized} title={normalized} dir="ltr">
      {normalized}
    </time>
  );
}
