import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  TransferDetail,
  TransferItem,
  TransferSummary,
} from "@/lib/transfers/receipt";

type RpcResult = { data: unknown; error: { message?: string } | null };
type RpcInvoker = (name: string, args?: Record<string, unknown>) => Promise<RpcResult>;

async function rpc(name: string, args: Record<string, unknown>): Promise<RpcResult> {
  const supabase = await createSupabaseServerClient();
  return (supabase.rpc as unknown as RpcInvoker)(name, args);
}

function rows<T>(data: unknown): T[] {
  return Array.isArray(data) ? data as T[] : [];
}

export async function listTransfers(input: {
  direction: "incoming" | "outgoing" | "all";
  scope?: "active" | "history" | "all";
  search?: string | null;
  limit?: number;
  offset?: number;
}): Promise<TransferSummary[]> {
  const { data, error } = await rpc("list_roll_transfers", {
    p_direction: input.direction,
    p_scope: input.scope ?? "active",
    p_search: input.search ?? null,
    p_limit: input.limit ?? 30,
    p_offset: input.offset ?? 0,
  });
  if (error) throw new Error(error.message ?? "PG_TRANSFER_LIST_FAILED");
  return rows<TransferSummary>(data);
}

export async function getTransferDetail(transferId: string): Promise<TransferDetail | null> {
  const { data, error } = await rpc("get_roll_transfer_detail", { p_transfer_id: transferId });
  if (error) throw new Error(error.message ?? "PG_TRANSFER_DETAIL_FAILED");
  return rows<TransferDetail>(data)[0] ?? null;
}

export async function listTransferItems(input: {
  transferId: string;
  search?: string | null;
  status?: "pending" | "received" | "released_to_sender" | "closed_unreceived" | null;
  limit?: number;
  offset?: number;
}): Promise<TransferItem[]> {
  const { data, error } = await rpc("list_roll_transfer_items", {
    p_transfer_id: input.transferId,
    p_search: input.search ?? null,
    p_status: input.status ?? null,
    p_limit: input.limit ?? 50,
    p_offset: input.offset ?? 0,
  });
  if (error) throw new Error(error.message ?? "PG_TRANSFER_ITEMS_FAILED");
  return rows<TransferItem>(data);
}
