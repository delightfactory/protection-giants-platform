type IconName = "home" | "users" | "dealers" | "centers" | "products" | "production" | "transfer" | "plus" | "search" | "filter" | "back" | "logout";

type IconProps = {
  name: IconName;
  className?: string;
};

export function Icon({ name, className = "" }: IconProps) {
  const commonProps = {
    viewBox: "0 0 24 24",
    "aria-hidden": true,
    className,
  } as const;

  if (name === "home") {
    return <svg {...commonProps}><path d="M3.5 10.5 12 3.8l8.5 6.7"/><path d="M5.5 9.5v10.2h13V9.5"/><path d="M9.5 19.7v-6h5v6"/></svg>;
  }
  if (name === "users") {
    return <svg {...commonProps}><circle cx="9" cy="8" r="3"/><path d="M3.5 19c.5-3.3 2.4-5 5.5-5s5 1.7 5.5 5"/><path d="M16 7.2a2.7 2.7 0 0 1 0 5.2"/><path d="M16.3 14.6c2.4.5 3.8 2 4.2 4.4"/></svg>;
  }
  if (name === "dealers") {
    return <svg {...commonProps}><path d="M4 20V7.5L12 4l8 3.5V20"/><path d="M8 10h2M14 10h2M8 14h2M14 14h2"/><path d="M10 20v-3h4v3"/></svg>;
  }
  if (name === "centers") {
    return <svg {...commonProps}><path d="M12 21s6-5.3 6-11a6 6 0 1 0-12 0c0 5.7 6 11 6 11Z"/><circle cx="12" cy="10" r="2.2"/></svg>;
  }
  if (name === "products") {
    return <svg {...commonProps}><path d="m4 7 8-4 8 4-8 4-8-4Z"/><path d="m4 7 8 4 8-4v10l-8 4-8-4V7Z"/><path d="M12 11v10"/></svg>;
  }
  if (name === "production") {
    return <svg {...commonProps}><path d="M4 6.5h16v11H4z"/><path d="M7 10h10M7 14h5"/><path d="M8 3.5v3M16 3.5v3"/></svg>;
  }
  if (name === "transfer") {
    return <svg {...commonProps}><path d="M4 7h13"/><path d="m14 4 3 3-3 3"/><path d="M20 17H7"/><path d="m10 14-3 3 3 3"/></svg>;
  }
  if (name === "plus") {
    return <svg {...commonProps}><path d="M12 5v14M5 12h14"/></svg>;
  }
  if (name === "search") {
    return <svg {...commonProps}><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></svg>;
  }
  if (name === "filter") {
    return <svg {...commonProps}><path d="M4 6h16M7 12h10M10 18h4"/></svg>;
  }
  if (name === "back") {
    return <svg {...commonProps}><path d="M5 12h14M13 6l6 6-6 6"/></svg>;
  }
  return <svg {...commonProps}><path d="M10 5H5v14h5M13 8l4 4-4 4M17 12H9"/></svg>;
}

export type { IconName };
