import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export const NOTIFICATION_PAGE_SIZE = 30;

type GeneratedInboxNotification =
  Database["public"]["Functions"]["list_notifications"]["Returns"][number];

export type InboxNotification = Omit<GeneratedInboxNotification, "action_path" | "read_at"> & {
  action_path: string | null;
  read_at: string | null;
};

function normalizeInboxNotification(row: GeneratedInboxNotification): InboxNotification {
  // The generated RPC contract is preserved verbatim. The SQL return shape is
  // nullable at runtime, so widen only these two fields at the server boundary.
  const nullableRow = row as unknown as InboxNotification;
  return {
    ...row,
    action_path: nullableRow.action_path,
    read_at: nullableRow.read_at,
  };
}

export async function listInboxNotifications({
  limit = NOTIFICATION_PAGE_SIZE,
  offset = 0,
}: {
  limit?: number;
  offset?: number;
} = {}): Promise<InboxNotification[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_notifications", {
    p_limit: limit,
    p_offset: offset,
  });

  if (error) throw new Error(`Unable to list notifications: ${error.code}`);
  return (data ?? []).map(normalizeInboxNotification);
}

export async function getNotificationUnreadCount(): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("notification_unread_count");

  if (error) throw new Error(`Unable to count unread notifications: ${error.code}`);
  return Number(data ?? 0);
}

export async function getNotificationUnreadCountForShell(): Promise<number | null> {
  try {
    return await getNotificationUnreadCount();
  } catch {
    // Notifications are an attention layer. A transient count failure must not
    // make the authenticated operational shell unavailable.
    return null;
  }
}
