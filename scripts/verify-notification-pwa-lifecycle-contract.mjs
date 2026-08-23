import { readFileSync } from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function pngSize(path) {
  const bytes = readFileSync(new URL(`../${path}`, import.meta.url));
  const signature = "89504e470d0a1a0a";
  assert(bytes.subarray(0, 8).toString("hex") === signature, `${path} must be a PNG.`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

const sw = read("public/sw.js");
const manifest = JSON.parse(read("public/manifest.webmanifest"));
const coordinator = read("components/pwa-lifecycle.tsx");
const operationsLayout = read("app/operations/layout.tsx");
const rootLayout = read("app/layout.tsx");
const nextConfig = read("next.config.ts");
const prWorkflow = read(".github/workflows/pr-quality.yml");
const cubeWorkflow = read(".github/workflows/cube-l-notification-quality.yml");

assert(sw.includes('self.addEventListener("push"'), "Root Service Worker must handle Push events.");
assert(sw.includes("self.registration.showNotification"), "Every received Push must surface a persistent notification.");
assert(sw.includes('self.addEventListener("notificationclick"'), "Service Worker must handle notification clicks.");
assert(sw.includes("self.clients.matchAll") && sw.includes("self.clients.openWindow"),
  "Notification clicks must focus/navigate an existing client or open the validated action path.");
assert(sw.includes("parsed.origin !== base.origin"), "Notification action paths must remain same-origin.");
assert(sw.includes('event.data?.type === "PG_ACTIVATE_UPDATE"'), "Worker activation must require the explicit update message.");
assert((sw.match(/skipWaiting\s*\(/g) ?? []).length === 1,
  "skipWaiting must appear only in the explicit user-aware activation path.");
assert(!sw.includes('addEventListener("fetch"') && !sw.includes("caches."),
  "Cube L V1 must not introduce speculative fetch caching/offline business logic.");

assert(manifest.id === "/", "PWA manifest identity must remain stable at root.");
assert(manifest.start_url === "/operations" && manifest.scope === "/", "PWA start URL/scope contract mismatch.");
assert(manifest.display === "standalone" && manifest.lang === "ar" && manifest.dir === "rtl",
  "PWA manifest must be Arabic/RTL and standalone-capable.");
assert(Array.isArray(manifest.icons) && manifest.icons.length >= 3, "PWA manifest must include install icons.");
assert(manifest.icons.some((icon) => icon.src === "/icons/pwa-maskable-512.png" && icon.purpose === "maskable"),
  "PWA manifest must include a maskable icon.");

for (const [path, width, height] of [
  ["public/icons/pwa-192.png", 192, 192],
  ["public/icons/pwa-512.png", 512, 512],
  ["public/icons/pwa-maskable-512.png", 512, 512],
  ["public/icons/apple-touch-icon.png", 180, 180],
]) {
  const size = pngSize(path);
  assert(size.width === width && size.height === height, `${path} must be ${width}x${height}.`);
}

assert(coordinator.includes('navigator.serviceWorker.register("/sw.js", { scope: "/" })'),
  "Operations shell must register the stable root Service Worker.");
assert(coordinator.includes("registration.waiting") && coordinator.includes("updatefound"),
  "Coordinator must detect waiting workers without blocking startup.");
assert(coordinator.includes("BroadcastChannel") && coordinator.includes("localStorage"),
  "Multi-tab update coordination needs BroadcastChannel plus a storage fallback.");
assert(coordinator.includes('navigator.serviceWorker.addEventListener("controllerchange"'),
  "Coordinator must wait for controllerchange before reload.");
assert(coordinator.includes("sessionStorage") && coordinator.includes("RELOAD_GUARD_KEY"),
  "Update reload must be guarded to prevent reload loops.");
assert(coordinator.includes('worker.postMessage({ type: "PG_ACTIVATE_UPDATE" })'),
  "Update activation must happen only after the explicit user action.");
assert(coordinator.includes("MIN_UPDATE_CHECK_MS") && coordinator.includes("registration.update()"),
  "Update checks must be bounded and best-effort.");
assert(!coordinator.includes("Notification.requestPermission"),
  "6A lifecycle foundation must not request Push permission automatically.");
assert(coordinator.includes("تحديث جديد متاح") && coordinator.includes("تحديث الآن") && coordinator.includes("لاحقًا"),
  "User-aware update affordance is incomplete.");

assert(operationsLayout.includes("PwaLifecycleCoordinator"), "PWA lifecycle coordinator must be mounted once in operations layout.");
assert(rootLayout.includes('manifest: "/manifest.webmanifest"'), "Root metadata must advertise the stable manifest URL.");
assert(rootLayout.includes("appleWebApp") && rootLayout.includes("apple-touch-icon.png"),
  "Apple Home Screen metadata/icon is incomplete.");
assert(nextConfig.includes('source: "/sw.js"') && nextConfig.includes("no-cache, no-store, must-revalidate"),
  "Service Worker response must not be served from stale HTTP cache.");
assert(nextConfig.includes('Service-Worker-Allowed') && nextConfig.includes('value: "/"'),
  "Service Worker root scope header is missing.");

for (const workflow of [prWorkflow, cubeWorkflow]) {
  assert(workflow.includes("verify-notification-pwa-lifecycle-contract.mjs"),
    "PWA lifecycle contract must run in all Cube L application gates.");
}

console.log("Cube L PWA lifecycle/static contract passed.");
