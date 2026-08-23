import { readFileSync } from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const component = read("components/push-device-settings.tsx");
const contract = read("lib/notifications/push-device-contract.ts");
const page = read("app/operations/notifications/page.tsx");
const apiRoute = read("app/api/notifications/push-subscription/route.ts");
const prWorkflow = read(".github/workflows/pr-quality.yml");
const cubeWorkflow = read(".github/workflows/cube-l-notification-quality.yml");

assert(component.includes('"use client"'), "Push device settings must run in the browser.");
assert(component.includes("Notification.requestPermission()"), "Explicit enable action must be able to request permission.");
assert(component.indexOf("async function enablePush") < component.indexOf("Notification.requestPermission()"),
  "Notification permission may only be requested inside the explicit enable action.");
assert(component.indexOf("useEffect(() =>") < component.indexOf("async function enablePush"),
  "Initial reconciliation must not depend on the enable action.");
assert(!component.slice(component.indexOf("useEffect(() =>"), component.indexOf("async function enablePush")).includes("Notification.requestPermission"),
  "Initial page/app inspection must never trigger a permission prompt.");
assert(component.includes("Notification.permission"), "Current browser permission must be read without prompting.");
assert(component.includes("navigatorWithStandalone.standalone") && component.includes("display-mode: standalone"),
  "iPhone/iPad Home Screen detection must support installed display mode.");
assert(component.includes("beforeinstallprompt") && component.includes("installPrompt.prompt()"),
  "PWA installation prompt must be captured and invoked only from a user action.");
assert(component.includes("إضافة إلى الشاشة الرئيسية"), "Apple Home Screen guidance is missing.");
assert(component.includes('fetch("/api/notifications/push-subscription"'),
  "Current-device state must use the authenticated same-origin Push API.");
assert(!component.includes("?endpoint=") && !component.includes("URLSearchParams"),
  "Push endpoint must never be put in the URL/query string.");
assert(component.includes('method: "PUT"') && component.includes('method: "POST"') && component.includes('method: "DELETE"'),
  "Current-device register/read/disable operations are incomplete.");
assert(component.includes('credentials: "same-origin"') && component.includes('cache: "no-store"'),
  "Push device API calls must remain same-origin and uncached.");
assert(component.includes("snapshot.serverState === \"disabled\"") && component.includes("await subscription.unsubscribe()"),
  "Disabled server endpoints must be repaired with a fresh browser subscription.");
assert(component.indexOf('await pushApi(snapshot.browserSubscription.endpoint, "DELETE")') < component.indexOf("await snapshot.browserSubscription.unsubscribe()"),
  "Disable must stop server delivery before removing the local browser subscription.");
assert(!component.includes("WEB_PUSH_VAPID_PRIVATE_KEY") && !page.includes("WEB_PUSH_VAPID_PRIVATE_KEY"),
  "The VAPID private key must never enter browser/page code.");
assert(page.includes("PushDeviceSettings") && page.includes("NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY"),
  "Notification Inbox must surface current-device Push settings with only the public VAPID key.");
assert(contract.includes("install_required") && contract.includes("repair_required") && contract.includes("denied"),
  "Push device state model is missing required lifecycle states.");
assert(apiRoute.includes("current_push_subscription_state") && apiRoute.includes("register_push_subscription") && apiRoute.includes("disable_push_subscription"),
  "Browser UI must remain backed by the bounded subscription RPC route.");

for (const workflow of [prWorkflow, cubeWorkflow]) {
  assert(workflow.includes("verify-notification-push-device-contract.mjs"),
    "Push device static contract must run in all Cube L application gates.");
  assert(workflow.includes("verify-notification-push-device-contract.test.mjs"),
    "Push device behavioral state tests must run in all Cube L application gates.");
}

console.log("Cube L current-device Push permission/repair contract passed.");
