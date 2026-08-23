import fs from "node:fs";

const routePath = "app/api/notifications/push-subscription/route.ts";
const helperPath = "lib/notifications/push-subscription-api.ts";

const route = fs.readFileSync(routePath, "utf8");
const helper = fs.readFileSync(helperPath, "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function count(source, pattern) {
  return source.match(pattern)?.length ?? 0;
}

for (const method of ["PUT", "POST", "DELETE"]) {
  assert(
    route.includes(`export async function ${method}(request: Request)`),
    `Push subscription Route must export ${method}.`,
  );
}
assert(!route.includes("export async function GET"), "Push endpoint state must not be exposed through GET/query URLs.");
assert(!route.includes("searchParams"), "Push endpoint/key material must not be read from URL query parameters.");

assert(
  route.includes('import { createSupabaseServerClient } from "@/lib/supabase/server"'),
  "Push subscription Route must use the session-bound Supabase server client.",
);
for (const forbidden of [
  "createSupabaseAdminClient",
  "service_role",
  "SUPABASE_SERVICE_ROLE",
  "profile_id",
  '.from("push_subscriptions")',
  '.from("notification_push_deliveries")',
  "console.log",
  "console.error",
]) {
  assert(!route.includes(forbidden), `Push subscription Route contains forbidden authority/logging token: ${forbidden}`);
}

const guardPosition = route.indexOf("assertPushApiRequest(request);");
const sessionPosition = route.indexOf("createSupabaseServerClient()");
assert(guardPosition >= 0, "Push Route must execute the same-origin request guard.");
assert(sessionPosition > guardPosition, "Same-origin/JSON guard must run before opening the authenticated session.");
assert(route.includes("supabase.auth.getUser()"), "Push Route must verify the authenticated user explicitly.");

for (const rpcName of [
  "register_push_subscription",
  "current_push_subscription_state",
  "disable_push_subscription",
]) {
  assert(count(route, new RegExp(`\\.rpc\\(\\"${rpcName}\\"`, "g")) === 1, `Push Route must call ${rpcName} exactly once.`);
}
assert(count(route, /\.rpc\(/g) === 3, "Push Route must expose only the three frozen current-device RPC operations.");

assert(route.includes('return jsonPushApiResponse({ state: "subscribed" })'), "Register response must be secret-free and state-only.");
assert(route.includes('return jsonPushApiResponse({ state: data })'), "State response must return only the privacy-safe state token.");
assert(route.includes('return jsonPushApiResponse({ state: data ? "disabled" : "missing" })'), "Disable response must keep absent/foreign endpoints indistinguishable.");

for (const requiredHelperContract of [
  'request.headers.get("origin")',
  'request.headers.get("sec-fetch-site")',
  'request.headers.get("content-type")',
  'request.headers.get("content-length")',
  'fetchSite.toLowerCase() !== "same-origin"',
  'contentType !== "application/json"',
  'PG_PUSH_BODY_TOO_LARGE',
  'new TextDecoder("utf-8", { fatal: true })',
  'parsed.protocol !== "https:"',
  '"Cache-Control": "private, no-store, max-age=0"',
]) {
  assert(helper.includes(requiredHelperContract), `Push API helper is missing security contract: ${requiredHelperContract}`);
}

assert(
  helper.includes('case "PG_PUSH_ENDPOINT_OWNED":') && helper.includes('PG_PUSH_ENDPOINT_CONFLICT'),
  "Raw endpoint ownership errors must map to a generic safe conflict code.",
);
assert(
  helper.includes('return jsonPushApiResponse({ error: "PG_PUSH_OPERATION_FAILED" }, 500)'),
  "Unexpected Push API failures must collapse to a generic safe response.",
);

console.log("Cube L Push subscription API static security contract verified.");
