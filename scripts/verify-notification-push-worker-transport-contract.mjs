import { readFileSync } from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const route = read("app/api/internal/push-worker/route.ts");
const worker = read("lib/notifications/push-worker.ts");
const auth = read("lib/notifications/push-worker-auth.ts");
const contract = read("lib/notifications/push-worker-contract.ts");
const envExample = read(".env.example");
const packageJson = JSON.parse(read("package.json"));
const prWorkflow = read(".github/workflows/pr-quality.yml");
const cubeWorkflow = read(".github/workflows/cube-l-notification-quality.yml");

assert(route.includes('export const runtime = "nodejs"'), "Push worker route must be Node-only.");
assert(route.includes("export async function POST"), "Push worker must expose the approved internal POST route.");
assert(!route.includes("export async function GET"), "Push worker must not expose a GET execution surface.");
assert(route.indexOf("authorizePushWorkerRequest(request)") < route.indexOf("runPushWorkerBatch()"),
  "Worker authorization must happen before any delivery claim/send work.");
assert(!route.includes("createSupabaseAdminClient") && !route.includes("SUPABASE_SERVICE_ROLE_KEY"),
  "Internal route must delegate service-role work to the server-only worker module.");

assert(auth.includes('process.env.PUSH_WORKER_SECRET'), "Worker execution must require a server-only bearer secret.");
assert(auth.includes("timingSafeEqual"), "Worker secret comparison must be timing-safe.");
assert(!auth.includes("NEXT_PUBLIC_PUSH_WORKER"), "Worker bearer secret must never use a public environment variable.");

assert(worker.includes('import "server-only"'), "Push sender must remain server-only.");
assert(worker.includes('from "web-push"'), "Push sender must use the pinned standards-based web-push transport.");
assert(worker.includes("claim_notification_push_deliveries"), "Push sender must claim through the 5A service RPC.");
assert(worker.includes("record_notification_push_delivery_result"), "Push sender must record results through the 5A service RPC.");
assert(!worker.includes('.from("notification_push_deliveries")') && !worker.includes('.from("push_subscriptions")'),
  "Push sender must not bypass bounded worker RPCs with direct table access.");
assert(worker.includes("vapidDetails"), "Push sender must supply VAPID details per send.");
assert(worker.includes("NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY") && worker.includes("WEB_PUSH_VAPID_PRIVATE_KEY"),
  "VAPID public/private runtime configuration is incomplete.");
assert(!worker.includes("console.log") && !worker.includes("console.error"),
  "Push sender must not log endpoint/key/provider payload details.");

assert(contract.includes('statusCode === 404 || statusCode === 410'), "404/410 must invalidate dead subscriptions.");
assert(contract.includes("statusCode === 429"), "Provider 429 must be retryable.");
assert(contract.includes("statusCode >= 500"), "Provider 5xx must be retryable.");
assert(contract.includes("pg-notification-"), "Push payload needs a stable notification tag for retry de-duplication.");
assert(!contract.includes("topic:"), "Distinct business events must not be generically coalesced with Push Topic.");
assert(contract.includes("PUSH_TTL_SECONDS"), "Push payload delivery must use a bounded TTL.");
assert(contract.includes('attentionLevel === "action_required"'), "Urgency must follow attention policy, not always high.");

for (const variable of [
  "NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY",
  "WEB_PUSH_VAPID_PRIVATE_KEY",
  "WEB_PUSH_VAPID_SUBJECT",
  "PUSH_WORKER_SECRET",
]) {
  assert(envExample.includes(`${variable}=`), `Missing ${variable} from .env.example runtime contract.`);
}
assert(!envExample.includes("BEGIN PRIVATE KEY"), ".env.example must never contain real private key material.");

assert(packageJson.dependencies?.["web-push"] === "3.6.7", "web-push must remain pinned to 3.6.7.");
assert(packageJson.devDependencies?.["@types/web-push"] === "3.6.4", "@types/web-push must remain pinned to 3.6.4.");

for (const workflow of [prWorkflow, cubeWorkflow]) {
  assert(workflow.includes("verify-notification-push-worker-transport-contract.mjs"),
    "Push worker static transport contract is not wired into all Cube L quality gates.");
  assert(workflow.includes("verify-notification-push-worker-transport.test.mjs"),
    "Push worker behavioral transport contract is not wired into all Cube L quality gates.");
}

console.log("Cube L Push worker transport/static security contract passed.");
