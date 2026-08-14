import type { OuterRollLabelSelection } from "@/lib/labels/outer-roll-label-plan";

export type OuterRollLabelRequestValues = {
  mode?: string;
  lot?: string;
  from?: string;
  to?: string;
  chunk?: string;
};

export class OuterRollLabelRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OuterRollLabelRequestError";
  }
}

export function parseOuterRollLabelSelection(
  values: OuterRollLabelRequestValues,
): OuterRollLabelSelection {
  const mode = values.mode?.trim() || "order";

  if (mode === "order") return { mode: "order" };

  if (mode === "lot") {
    const lotId = values.lot?.trim();
    if (!lotId) throw new OuterRollLabelRequestError("اختر Lot قبل تجهيز الملصقات.");
    return { mode: "lot", lotId };
  }

  if (mode === "roll-range") {
    const fromSerial = values.from?.trim();
    const toSerial = values.to?.trim();
    if (!fromSerial || !toSerial) {
      throw new OuterRollLabelRequestError("حدد أول وآخر Roll في النطاق قبل تجهيز الملصقات.");
    }
    return { mode: "roll-range", fromSerial, toSerial };
  }

  throw new OuterRollLabelRequestError("طريقة اختيار اللفات غير مدعومة.");
}

export function parseOuterRollLabelChunk(value: string | undefined, maxChunks: number): number {
  const chunk = value ? Number(value) : 1;
  if (!Number.isInteger(chunk) || chunk < 1 || chunk > maxChunks) {
    throw new OuterRollLabelRequestError("جزء الطباعة المطلوب غير موجود.");
  }
  return chunk;
}

export function buildOuterRollLabelSearchParams(
  selection: OuterRollLabelSelection,
  chunk?: number,
): URLSearchParams {
  const params = new URLSearchParams();
  params.set("mode", selection.mode);

  if (selection.mode === "lot") {
    params.set("lot", selection.lotId);
  } else if (selection.mode === "roll-range") {
    params.set("from", selection.fromSerial);
    params.set("to", selection.toSerial);
  }

  if (chunk !== undefined) params.set("chunk", String(chunk));
  return params;
}
