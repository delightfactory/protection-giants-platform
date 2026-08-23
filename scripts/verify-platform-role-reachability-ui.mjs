import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const productsPage = read("app/operations/products/page.tsx");
const operationsPage = read("app/operations/page.tsx");
const navLinks = read("components/operations-nav-links.tsx");
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

for (const roleBlock of ["agentModules", "dealerModules", "centerModules"]) {
  const start = operationsPage.indexOf(`const ${roleBlock}`);
  assert(start >= 0, `Missing ${roleBlock}.`);
  const end = operationsPage.indexOf("];", start);
  const block = operationsPage.slice(start, end + 2);
  assert(block.includes('/operations/products'), `${roleBlock} must retain the reachable Products module.`);
}

for (const roleBlock of ["agentMobileItems", "dealerMobileItems", "centerMobileItems"]) {
  const start = navLinks.indexOf(`const ${roleBlock}`);
  assert(start >= 0, `Missing ${roleBlock}.`);
  const end = navLinks.indexOf("];", start);
  const block = navLinks.slice(start, end + 2);
  assert(block.includes('/operations/products'), `${roleBlock} must retain Products navigation.`);
}

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
