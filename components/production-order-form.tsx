"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { FormField } from "@/components/ui/form-field";
import { FormGrid, FormSection } from "@/components/ui/form-layout";
import { createProductionOrder } from "@/app/operations/production-orders/new/actions";

type ProductOption = {
  id: string;
  code: string;
  name: string;
  widthMm: number | null;
  lengthM: number | null;
  thicknessMil: number | null;
};

type LotDraft = {
  id: number;
  quantity: string;
  sourceReference: string;
};

type ProductionOrderFormProps = {
  requestId: string;
  products: ProductOption[];
};

function viewerToday(): string {
  const now = new Date();
  const year = String(now.getFullYear()).padStart(4, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function ProductionOrderForm({ requestId, products }: ProductionOrderFormProps) {
  const [selectedProductId, setSelectedProductId] = useState("");
  const [productionDate, setProductionDate] = useState("");
  const [lots, setLots] = useState<LotDraft[]>([
    { id: 1, quantity: "", sourceReference: "" },
  ]);
  const nextLotId = useRef(2);

  useEffect(() => {
    setProductionDate(viewerToday());
  }, []);

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedProductId) ?? null,
    [products, selectedProductId],
  );

  const totalRolls = useMemo(
    () => lots.reduce((sum, lot) => {
      const quantity = Number(lot.quantity);
      return sum + (Number.isFinite(quantity) && quantity > 0 ? quantity : 0);
    }, 0),
    [lots],
  );

  const exceedsLimit = totalRolls > 10000;
  const cannotAddLot = lots.length >= 50 || totalRolls >= 10000;
  const cannotSubmit = !selectedProduct || !productionDate || exceedsLimit || totalRolls < 1;
  const lotsPayload = useMemo(
    () => JSON.stringify(lots.map((lot) => ({
      quantity: Number(lot.quantity),
      ...(lot.sourceReference.trim() ? { source_reference: lot.sourceReference.trim() } : {}),
    }))),
    [lots],
  );

  const addLot = () => {
    if (cannotAddLot) return;

    const id = nextLotId.current;
    nextLotId.current += 1;
    setLots((current) => [...current, { id, quantity: "", sourceReference: "" }]);
  };

  const updateLot = (id: number, field: "quantity" | "sourceReference", value: string) => {
    setLots((current) => current.map((lot) => lot.id === id ? { ...lot, [field]: value } : lot));
  };

  const removeLot = (id: number) => {
    if (lots.length === 1) return;
    setLots((current) => current.filter((lot) => lot.id !== id));
  };

  const confirmationDescription = selectedProduct
    ? `المنتج: ${selectedProduct.code} — ${selectedProduct.name}. تاريخ الإنتاج: ${productionDate}. سيتم إنشاء ${lots.length} Lot وتوليد ${totalRolls.toLocaleString("en-US")} سجل لفة وهوية فريدة. بعد الإنشاء لن يكون هذا الأمر قابلاً للتعديل.`
    : `سيتم إنشاء ${lots.length} Lot وتوليد ${totalRolls.toLocaleString("en-US")} سجل لفة وهوية فريدة. بعد الإنشاء لن يكون هذا الأمر قابلاً للتعديل.`;

  return (
    <form action={createProductionOrder} className="operations-form">
      <input type="hidden" name="request_id" value={requestId} />
      <input type="hidden" name="lots_json" value={lotsPayload} />

      <FormSection
        title="بيانات أمر الإنتاج"
        description="اختر المنتج وتاريخ الإنتاج. رقم أمر الإنتاج وأرقام الـLots ستُنشأ تلقائيًا عند الحفظ."
      >
        <FormGrid>
          <FormField label="المنتج">
            <select
              name="product_id"
              required
              value={selectedProductId}
              onChange={(event) => setSelectedProductId(event.target.value)}
            >
              <option value="" disabled>اختر المنتج</option>
              {products.map((product) => {
                const specs = [
                  product.widthMm ? `${product.widthMm}mm` : null,
                  product.lengthM ? `${product.lengthM}m` : null,
                  product.thicknessMil ? `${product.thicknessMil}mil` : null,
                ].filter(Boolean).join(" × ");

                return (
                  <option key={product.id} value={product.id}>
                    {product.code} — {product.name}{specs ? ` — ${specs}` : ""}
                  </option>
                );
              })}
            </select>
          </FormField>

          <FormField label="تاريخ الإنتاج" hint="التاريخ الفعلي الذي ترتبط به هذه الدفعة.">
            <input
              name="production_date"
              type="date"
              value={productionDate}
              onChange={(event) => setProductionDate(event.target.value)}
              required
            />
          </FormField>

          <FormField label="مرجع المصدر" hint="رقم أمر مصنع أو ملف أو مرجع خارجي إن وجد." optional>
            <input name="source_reference" type="text" maxLength={120} />
          </FormField>

          <FormField label="ملاحظات" full optional>
            <textarea name="notes" rows={4} maxLength={2000} />
          </FormField>
        </FormGrid>
      </FormSection>

      <FormSection
        title="تقسيم الـLots"
        description="أدخل عدد اللفات في كل Lot. النظام سيتولى ترقيم الـLot واللفات تلقائيًا لمنع أخطاء الإدخال اليدوي."
      >
        <div className="production-lots-editor">
          {lots.map((lot, index) => (
            <article className="production-lot-row" key={lot.id}>
              <div className="production-lot-heading">
                <div>
                  <span className="eyebrow">Lot {index + 1}</span>
                  <h3>الدفعة رقم {index + 1}</h3>
                </div>
                {lots.length > 1 ? (
                  <button
                    type="button"
                    className="button button-ghost production-lot-remove"
                    onClick={() => removeLot(lot.id)}
                    aria-label={`حذف Lot ${index + 1}`}
                  >
                    حذف
                  </button>
                ) : null}
              </div>

              <FormGrid>
                <FormField label="عدد اللفات">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={10000}
                    step={1}
                    value={lot.quantity}
                    onChange={(event) => updateLot(lot.id, "quantity", event.target.value)}
                    required
                  />
                </FormField>

                <FormField label="مرجع Lot من المصدر" hint="اختياري إذا كان المصنع أو المورد يستخدم رقم Lot خاصًا به." optional>
                  <input
                    type="text"
                    maxLength={120}
                    value={lot.sourceReference}
                    onChange={(event) => updateLot(lot.id, "sourceReference", event.target.value)}
                  />
                </FormField>
              </FormGrid>
            </article>
          ))}

          <button
            type="button"
            className="button button-ghost production-add-lot"
            onClick={addLot}
            disabled={cannotAddLot}
          >
            + إضافة Lot آخر
          </button>
        </div>
      </FormSection>

      <section className="production-order-summary" aria-live="polite">
        <div>
          <span className="eyebrow">ملخص قبل التوليد</span>
          <strong>{selectedProduct ? `${selectedProduct.code} — ${selectedProduct.name}` : "اختر المنتج أولًا"}</strong>
          <p>{productionDate || "—"} · {lots.length} Lot · {totalRolls.toLocaleString("en-US")} لفة</p>
          <p>سيُنشئ النظام سجلًا مستقلًا وهوية تشغيلية وERP Serial لكل لفة.</p>
        </div>
        {exceedsLimit ? (
          <FeedbackBanner tone="error">الحد الأقصى لأمر الإنتاج الواحد هو 10,000 لفة. خفّض الكميات قبل المتابعة.</FeedbackBanner>
        ) : null}
      </section>

      <div className="operations-form-actions">
        <ConfirmSubmitButton
          tone="primary"
          title="توليد أمر الإنتاج واللفات؟"
          description={confirmationDescription}
          confirmLabel="تأكيد وإنشاء الأمر"
          disabled={cannotSubmit}
        >
          إنشاء أمر الإنتاج
        </ConfirmSubmitButton>
        <Link href="/operations/production-orders" className="button button-ghost">إلغاء</Link>
      </div>
    </form>
  );
}
