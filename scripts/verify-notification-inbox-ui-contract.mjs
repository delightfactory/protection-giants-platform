import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const page = read("app/operations/notifications/page.tsx");
const actions = read("app/operations/notifications/actions.ts");
const nav = read("components/operations-nav.tsx");
const navLinks = read("components/operations-nav-links.tsx");
const shellCss = read("app/operations/notification-shell.css");
const inboxCss = read("app/operations/notifications/notifications.module.css");
const resolutionTaskDetail = read("app/operations/claim-resolution-tasks/[id]/page.tsx");
const pushContract = read("lib/notifications/push-worker-contract.ts");
const serviceWorker = read("public/sw.js");

assert(page.includes("<LocalDateTime"), "Inbox timestamps must use LocalDateTime.");
assert(page.includes("غير مقروء"), "Unread state must be expressed textually, not color-only.");
assert(page.includes("قراءة الإشعار لا تعني تنفيذ الإجراء"), "Inbox must separate read state from business completion semantics.");
assert(page.includes("NOTIFICATION_PAGE_SIZE"), "Inbox must preserve bounded pagination.");
assert(page.includes("markAllNotificationsReadAction"), "Inbox must expose mark-all-read.");
for (const [sourceDomain, label] of [
  ["warranty", "الضمان"],
  ["warranty_claim", "مطالبات الضمان"],
  ["warranty_claim_resolution", "تنفيذ مطالبات الضمان"],
]) {
  assert(page.includes(`${sourceDomain}: "${label}"`), `Inbox must present ${sourceDomain} with the current Arabic source label.`);
}

assert(resolutionTaskDetail.includes('if (error.message === "PG_CLAIM_RESOLUTION_TASK_NOT_FOUND") redirect("/operations/claim-resolution-tasks");'),
  "A stale exact Resolution task must fall back to the current Center queue instead of a dead-end 404.");
assert(resolutionTaskDetail.includes('if (!data || data.length !== 1) redirect("/operations/claim-resolution-tasks");'),
  "A stale/removed Resolution task result must fall back to the current Center queue.");
assert(resolutionTaskDetail.includes('if (evidenceResult.error.message === "PG_CLAIM_RESOLUTION_TASK_NOT_FOUND") redirect("/operations/claim-resolution-tasks");'),
  "A reassignment race during evidence read must fall back to the current Center queue.");
assert(pushContract.includes('const fallback = "/operations/notifications";')
  && pushContract.includes('actionPath: safePushActionPath(claim.action_path)'),
  "Push payloads must consume the same durable action_path as Inbox and retain the Inbox fallback.");
assert(serviceWorker.includes('const DEFAULT_ACTION_PATH = "/operations/notifications";')
  && serviceWorker.includes('const actionPath = safeActionPath(event.notification?.data?.actionPath);'),
  "Push click must preserve same-origin action routing with a non-dead-end Inbox fallback.");

assert(actions.includes('.from("notifications")'), "Open action must resolve the notification through the user's RLS-visible Inbox.");
assert(actions.includes('trimmed.startsWith("/")'), "Deep-link action must require an application-relative path.");
assert(actions.includes('trimmed.startsWith("//")'), "Protocol-relative deep links must be rejected.");
assert(actions.includes('trimmed.includes("\\\\")') && actions.includes('trimmed.includes("\\0")'),
  "Malformed backslash/NUL deep links must be rejected.");
assert(actions.includes("new URL(trimmed, APPLICATION_ORIGIN)") && actions.includes("parsed.origin !== APPLICATION_ORIGIN"),
  "Deep-link action must parse and enforce same-origin paths, not rely on substring checks only.");
assert(actions.includes('rpc("mark_notification_read"'), "Opening an owned notification must use the controlled read RPC.");

assert(nav.includes('href="/operations/notifications"'), "Authenticated shell must expose the Inbox.");
assert(nav.includes('count > 99 ? "99+"'), "Visual unread count must cap safely at 99+.");
assert(nav.includes("notificationUnreadCount}"), "Accessible shell label must retain the exact unread count.");
assert(!navLinks.includes("/operations/notifications"), "Cube L must not silently redesign the role bottom-navigation IA.");

const mobileBellRule = shellCss.match(/\.operations-mobile-notifications\s*\{([\s\S]*?)\}/);
assert(mobileBellRule, "Mobile notification bell rule is missing.");
assert(/width:\s*44px/.test(mobileBellRule[1]), "Mobile notification bell must keep a 44px touch width.");
assert(/height:\s*44px/.test(mobileBellRule[1]), "Mobile notification bell must keep a 44px touch height.");
assert(!/@media\s*\(max-width:\s*390px\)[\s\S]*?\.operations-mobile-notifications\s*\{[\s\S]*?(?:width|height):\s*(?:4[0-3]|[0-3]\d)px/.test(shellCss), "Small-screen CSS must not shrink the notification bell below 44px.");
assert(inboxCss.includes("min-height: 44px"), "Mobile Inbox actions must preserve the 44px touch contract.");

console.log("Notification Inbox UI contract verification passed.");
