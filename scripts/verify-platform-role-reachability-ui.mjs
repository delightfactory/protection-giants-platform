import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const productsPage = read("app/operations/products/page.tsx");
const operationsPage = read("app/operations/page.tsx");
const morePage = read("app/operations/more/page.tsx");
const navLinks = read("components/operations-nav-links.tsx");
const navigationRegistry = read("lib/navigation/operations-navigation.ts");
const operationsLayout = read("app/operations/layout.tsx");
const mobileShell = read("app/operations/mobile-shell-hardening.css");

assert(productsPage.includes("requireOperationalProfile"),
  "Products page must use the operational profile gate so active Agent/Dealer/Center users can reach the existing read-only product scope.");
assert(!productsPage.includes("requireAdminProfile"),
  "Products page must not deny non-Admin operational roles at the route boundary.");
assert(productsPage.includes('const isAdmin = profile.role === "admin"'),
  "Products page must explicitly separate Admin management from operational read-only presentation.");
assert(productsPage.includes('actions={isAdmin ? <Link href="/operations/products/new"'),
  "Create Product must remain Admin-only in the UI.");
assert(productsPage.includes("actions={isAdmin ? ("),
  "Per-product edit/lifecycle actions must remain Admin-only in the UI.");
assert(productsPage.includes("العرض فقط؛ إدارة المنتجات متاحة للشركة"),
  "Non-Admin product presentation must clearly communicate read-only behavior.");

const productsDestinationStart = navigationRegistry.indexOf('id: "products"');
const productsDestinationEnd = navigationRegistry.indexOf("\n  },", productsDestinationStart);
assert(productsDestinationStart >= 0 && productsDestinationEnd > productsDestinationStart,
  "Products destination must remain registered in the shared role navigation registry.");
const productsDestination = navigationRegistry.slice(productsDestinationStart, productsDestinationEnd);
assert(productsDestination.includes('href: "/operations/products"'),
  "Products destination must keep the canonical operational route.");
assert(productsDestination.includes("roles: allRoles"),
  "Products must remain discoverable to every operational role.");
assert(operationsPage.includes("getHomeDestinations(profile.role)"),
  "Role Home must derive Products reachability from the shared registry.");
assert(navLinks.includes("getMobileNavItems(role)"),
  "Mobile primary navigation must derive from the shared registry.");
assert(morePage.includes("getMoreDestinations(profile.role)"),
  "Lower-frequency mobile capabilities such as Products must remain reachable through the controlled Operations destination.");
assert(navigationRegistry.includes('{ id: "more", href: "/operations/more", label: "العمليات"'),
  "Mobile navigation must retain the controlled Operations fallback instead of dropping lower-frequency capabilities.");

assert(operationsLayout.includes('import "./mobile-shell-hardening.css";'),
  "Operations layout must load the mobile fixed-navigation content reservation override.");
assert(mobileShell.includes("@media (max-width: 900px)"),
  "Mobile shell hardening must apply at the same breakpoint as the fixed mobile navigation.");
assert(mobileShell.includes(".operations-content"),
  "Mobile shell hardening must reserve space on the shared operations content surface for every role.");
assert(mobileShell.includes("padding-bottom: calc(92px + env(safe-area-inset-bottom))"),
  "Mobile content reservation must cover the fixed navigation and device safe area.");
assert(!mobileShell.includes("operations-shell-admin"),
  "Bottom-navigation content reservation must not be Admin-only.");

console.log("Platform role reachability and mobile shell UI contracts verified.");
