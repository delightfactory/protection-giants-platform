import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export const NOTIFICATION_PAGE_SIZE = 30;

export type InboxNotification = Database["public"]["Functions"]["list_notifications"]["Returns"][number];

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
  return data ?? [];
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
