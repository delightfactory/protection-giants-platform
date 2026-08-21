import React, { act } from "react";
import { createRoot } from "test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  receive: vi.fn(),
  release: vi.fn(),
  adminRelease: vi.fn(),
  refresh: vi.fn(),
  clearRequest: vi.fn(),
  requestId: vi.fn(async () => "11111111-1111-4111-8111-111111111111"),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("next/link", async () => {
  const ReactModule = await vi.importActual("react");
  return {
    default: ({ children, ...props }) => ReactModule.createElement("a", props, children),
  };
});

vi.mock("@/app/operations/transfers/[transferId]/actions", () => ({
  receiveTransferItems: mocks.receive,
  releaseUnreceivedTransferItems: mocks.release,
  adminReleaseUnreceivedTransferItems: mocks.adminRelease,
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({ rpc: mocks.rpc }),
}));

vi.mock("@/components/transfers/qr-scanner-sheet", () => ({
  QrScannerSheet: () => null,
}));

vi.mock("@/components/ui/feedback-banner", async () => {
  const ReactModule = await vi.importActual("react");
  return {
    FeedbackBanner: ({ children }) => ReactModule.createElement("div", null, children),
  };
});

vi.mock("@/components/ui/status-badge", async () => {
  const ReactModule = await vi.importActual("react");
  return {
    StatusBadge: ({ children }) => ReactModule.createElement("span", null, children),
  };
});

vi.mock("@/lib/rolls/roll-qr", () => ({
  normalizeRollSerial: (value) => value?.trim?.().toUpperCase?.() ?? null,
  parseRollQrPayload: () => null,
}));

vi.mock("@/lib/transfers/receipt", () => ({
  clearTransferActionRequest: mocks.clearRequest,
  receiptDraftStorageKey: (transferId) => `pg:transfer:${transferId}:receipt-selection`,
  requestIdForTransferAction: mocks.requestId,
  transferActionErrorMessage: (code) => code,
  transferItemStatusLabel: (status) => status,
}));

const { TransferReceiptFlow } = await import("../components/transfers/transfer-receipt-flow.tsx");
const { UnresolvedResolutionPanel } = await import("../components/transfers/unresolved-resolution-panel.tsx");
const { MAX_TRANSFER_RECEIPT_ROLLS, planReceiptLotSelection } = await import("../lib/transfers/receipt-selection.ts");

class MemoryStorage {
  #values = new Map();
  getItem(key) { return this.#values.has(key) ? this.#values.get(key) : null; }
  setItem(key, value) { this.#values.set(key, String(value)); }
  removeItem(key) { this.#values.delete(key); }
  clear() { this.#values.clear(); }
}

function deferred() {
  let resolve;
  const promise = new Promise((next) => { resolve = next; });
  return { promise, resolve };
}

function textOf(node) {
  if (typeof node === "string") return node;
  return node.children.map(textOf).join("");
}

function findHost(container, type, matcher = () => true) {
  const match = container.queryAll((node) => node.type === type && matcher(node))[0];
  if (!match) throw new Error(`Missing ${type} host element.`);
  return match;
}

function findButton(container, pattern) {
  return findHost(container, "button", (node) => pattern.test(textOf(node)));
}

function transferDetail(pendingCount = 10005) {
  return {
    transfer_id: "22222222-2222-4222-8222-222222222222",
    transfer_number: "PG-T-20260821-00000001",
    sender_name: "Sender",
    recipient_name: "Recipient",
    roll_count: pendingCount,
    received_count: 0,
    pending_count: pendingCount,
    released_to_sender_count: 0,
    closed_unreceived_count: 0,
    lot_groups: [{
      lot_id: "33333333-3333-4333-8333-333333333333",
      lot_number: "LOT-001",
      product_code: "FILM-1",
      product_name: "Protection Film",
      production_lot_total: 5,
      transfer_count: 5,
      received_count: 0,
      pending_count: 5,
      released_to_sender_count: 0,
      closed_unreceived_count: 0,
      transfer_contains_full_lot: true,
    }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.sessionStorage = new MemoryStorage();
  globalThis.document = { body: { style: { overflow: "" } } };
  globalThis.window = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  mocks.receive.mockResolvedValue({ ok: true, transferId: "22222222-2222-4222-8222-222222222222" });
  mocks.release.mockResolvedValue({ ok: true, transferId: "22222222-2222-4222-8222-222222222222" });
  mocks.adminRelease.mockResolvedValue({ ok: true, transferId: "22222222-2222-4222-8222-222222222222" });
});

describe("Cube H Transfer receipt interactions", () => {
  it("keeps Lot selection disabled until draft hydration and recomputes the bounded additions at confirmation", async () => {
    const draftIds = Array.from({ length: MAX_TRANSFER_RECEIPT_ROLLS - 2 }, (_, index) => `draft-${index}`);
    const reconcile = deferred();
    const lotPendingIds = ["lot-a", "lot-b", "lot-c", "lot-d", "lot-e"];

    sessionStorage.setItem(
      "pg:transfer:22222222-2222-4222-8222-222222222222:receipt-selection",
      JSON.stringify(draftIds),
    );

    mocks.rpc.mockImplementation((name) => {
      if (name === "reconcile_roll_transfer_receipt_selection") return reconcile.promise;
      if (name === "expand_roll_transfer_receipt_lot") {
        return Promise.resolve({
          data: [{
            lot_id: "33333333-3333-4333-8333-333333333333",
            lot_number: "LOT-001",
            product_code: "FILM-1",
            product_name: "Protection Film",
            production_lot_total: 5,
            transfer_count: 5,
            received_count: 0,
            pending_count: 5,
            released_to_sender_count: 0,
            transfer_contains_full_lot: true,
            pending_roll_ids: lotPendingIds,
          }],
          error: null,
        });
      }
      if (name === "list_roll_transfer_items") {
        return Promise.resolve({
          data: [{
            roll_id: "outside-selection",
            serial_number: "PG-R-OUTSIDE",
            lot_id: "44444444-4444-4444-8444-444444444444",
            lot_number: "LOT-OUTSIDE",
            product_name: "Protection Film",
            item_status: "pending",
          }, {
            roll_id: "beyond-cap",
            serial_number: "PG-R-BEYOND-CAP",
            lot_id: "77777777-7777-4777-8777-777777777777",
            lot_number: "LOT-BEYOND",
            product_name: "Protection Film",
            item_status: "pending",
          }],
          error: null,
        });
      }
      throw new Error(`Unexpected RPC ${name}`);
    });

    const root = createRoot();
    await act(async () => {
      root.render(React.createElement(TransferReceiptFlow, {
        detail: transferDetail(),
        publicSiteOrigin: "https://example.test",
      }));
      await Promise.resolve();
    });

    expect(findButton(root.container, /^تأكيد مجموعة Lot/).props.disabled).toBe(true);

    await act(async () => {
      reconcile.resolve({ data: draftIds, error: null });
      await reconcile.promise;
      await Promise.resolve();
    });

    expect(findButton(root.container, /^تأكيد مجموعة Lot/).props.disabled).toBe(false);

    await act(async () => {
      findButton(root.container, /^تأكيد مجموعة Lot/).props.onClick();
    });
    await act(async () => {
      findButton(root.container, /مراجعة تحديد 5/).props.onClick();
      await Promise.resolve();
    });

    expect(textOf(root.container)).toContain("إضافة 2 لفة من Lot LOT-001؟");

    // Simulate another valid selection update landing while the confirmation is open.
    // The displayed Lot count must follow current selection rather than a stale staged ID list.
    await act(async () => {
      findButton(root.container, /اختيار من المتوقع/).props.onClick();
      await Promise.resolve();
    });
    const checkbox = findHost(root.container, "input", (node) => node.props.type === "checkbox");
    await act(async () => {
      checkbox.props.onChange();
    });

    expect(textOf(root.container)).toContain("إضافة 1 لفة من Lot LOT-001؟");

    await act(async () => {
      findButton(root.container, /نعم، أضف 1 لفة/).props.onClick();
    });

    expect(textOf(root.container)).toContain("10000 لفة");
    expect(textOf(root.container)).not.toContain("10001 لفة");

    const checkboxesAtCap = root.container.queryAll((node) => node.type === "input" && node.props.type === "checkbox");
    expect(checkboxesAtCap).toHaveLength(2);
    expect(checkboxesAtCap[1].props.checked).toBe(false);

    await act(async () => {
      checkboxesAtCap[1].props.onChange();
    });

    const checkboxesAfterRejectedAddition = root.container.queryAll((node) => node.type === "input" && node.props.type === "checkbox");
    expect(checkboxesAfterRejectedAddition[1].props.checked).toBe(false);
    expect(textOf(root.container)).toContain("10000 لفة");
    expect(textOf(root.container)).not.toContain("10001 لفة");

    await act(async () => {
      findButton(root.container, /مراجعة الاستلام/).props.onClick();
    });
    expect(textOf(root.container)).not.toContain("LOT-BEYOND");

    const plan = planReceiptLotSelection(
      new Set(Array.from({ length: MAX_TRANSFER_RECEIPT_ROLLS - 1 }, (_, index) => `existing-${index}`)),
      ["new-a", "new-b", "new-c"],
    );
    expect(plan.additions).toEqual(["new-a"]);
    expect(plan.next.size).toBe(MAX_TRANSFER_RECEIPT_ROLLS);

    await act(async () => root.unmount());
  });

  it("does not invoke unresolved release until the explicit confirmation click", async () => {
    mocks.rpc.mockImplementation((name) => {
      if (name === "expand_roll_transfer_unresolved_lot") {
        return Promise.resolve({
          data: [{
            lot_id: "55555555-5555-4555-8555-555555555555",
            lot_number: "LOT-RESOLVE",
            product_code: "FILM-1",
            product_name: "Protection Film",
            transfer_count: 1,
            received_count: 0,
            pending_count: 1,
            released_to_sender_count: 0,
            pending_roll_ids: ["66666666-6666-4666-8666-666666666666"],
          }],
          error: null,
        });
      }
      if (name === "list_roll_transfer_items") return Promise.resolve({ data: [], error: null });
      throw new Error(`Unexpected RPC ${name}`);
    });

    const root = createRoot();
    await act(async () => {
      root.render(React.createElement(UnresolvedResolutionPanel, {
        transferId: "22222222-2222-4222-8222-222222222222",
        lotGroups: [{
          lot_id: "55555555-5555-4555-8555-555555555555",
          lot_number: "LOT-RESOLVE",
          product_code: "FILM-1",
          product_name: "Protection Film",
          transfer_count: 1,
          received_count: 0,
          pending_count: 1,
          released_to_sender_count: 0,
          closed_unreceived_count: 0,
          production_lot_total: 1,
          transfer_contains_full_lot: true,
        }],
        adminMode: false,
      }));
    });

    await act(async () => {
      findButton(root.container, /تحديد المتبقي \(1\)/).props.onClick();
      await Promise.resolve();
    });

    const reason = findHost(root.container, "textarea");
    await act(async () => {
      reason.props.onChange({ target: { value: "بقيت اللفة فعليًا لدى المرسل" } });
    });

    await act(async () => {
      findButton(root.container, /مراجعة حسم 1 لفة/).props.onClick();
    });

    expect(mocks.release).toHaveBeenCalledTimes(0);
    expect(textOf(root.container)).toContain("تأكيد حسم 1 لفة؟");

    await act(async () => {
      findButton(root.container, /نعم، احسم 1 لفة/).props.onClick();
      await Promise.resolve();
    });

    expect(mocks.release).toHaveBeenCalledTimes(1);
    expect(mocks.release.mock.calls[0][0].rollIds).toEqual(["66666666-6666-4666-8666-666666666666"]);

    await act(async () => root.unmount());
  });
});
