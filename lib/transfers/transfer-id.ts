export const transferIdPattern = /^PG-[PADC]-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;

export type TransferPartyType = "company" | "agent" | "dealer" | "center";

export function normalizeTransferId(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  return transferIdPattern.test(normalized) ? normalized : null;
}

export function transferPartyTypeLabel(value: string): string {
  if (value === "company") return "شركة Protection Giants";
  if (value === "agent") return "وكيل دولة";
  if (value === "dealer") return "موزع / وكيل";
  if (value === "center") return "مركز تركيب";
  return "جهة تشغيلية";
}
