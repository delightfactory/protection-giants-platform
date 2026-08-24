"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const INBOX_PATH = "/operations/notifications";
const APPLICATION_ORIGIN = "https://protection-giants.invalid";

function safeApplicationPath(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.includes("\\") ||
    trimmed.includes("\0")
  ) return null;

  try {
    const parsed = new URL(trimmed, APPLICATION_ORIGIN);
    if (parsed.origin !== APPLICATION_ORIGIN) return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

function refreshNotificationSurfaces() {
  revalidatePath("/operations", "layout");
  revalidatePath(INBOX_PATH);
}

export async function openNotificationAction(formData: FormData) {
  const notificationId = String(formData.get("notification_id") ?? "").trim();
  if (!notificationId) redirect(`${INBOX_PATH}?error=notification`);

  const supabase = await createSupabaseServerClient();
  const { data: notification, error: lookupError } = await supabase
    .from("notifications")
    .select("id, action_path")
    .eq("id", notificationId)
    .maybeSingle();

  if (lookupError || !notification) redirect(`${INBOX_PATH}?error=notification`);

  const { error: readError } = await supabase.rpc("mark_notification_read", {
    p_notification_id: notificationId,
  });

  if (readError) redirect(`${INBOX_PATH}?error=read`);

  refreshNotificationSurfaces();
  redirect(safeApplicationPath(notification.action_path) ?? INBOX_PATH);
}

export async function markNotificationReadAction(formData: FormData) {
  const notificationId = String(formData.get("notification_id") ?? "").trim();
  if (!notificationId) redirect(`${INBOX_PATH}?error=notification`);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("mark_notification_read", {
    p_notification_id: notificationId,
  });

  if (error) redirect(`${INBOX_PATH}?error=read`);
  refreshNotificationSurfaces();
}

export async function markAllNotificationsReadAction() {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("mark_all_notifications_read");

  if (error) redirect(`${INBOX_PATH}?error=read-all`);
  refreshNotificationSurfaces();
}
