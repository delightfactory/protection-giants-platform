import { isOperationalUserId } from "@/lib/users/operational-user-input";

export type CenterParentRef =
  | { type: "company" }
  | { type: "agent"; id: string }
  | { type: "dealer"; id: string };

export function parseCenterParentRef(value: string): CenterParentRef | null {
  const normalized = value.trim();
  if (normalized === "company") return { type: "company" };

  const separator = normalized.indexOf(":");
  if (separator <= 0) return null;

  const type = normalized.slice(0, separator);
  const id = normalized.slice(separator + 1);
  if (!isOperationalUserId(id)) return null;

  if (type === "agent") return { type: "agent", id };
  if (type === "dealer") return { type: "dealer", id };
  return null;
}

export function centerParentRefValue(parent: CenterParentRef): string {
  if (parent.type === "company") return "company";
  return `${parent.type}:${parent.id}`;
}
