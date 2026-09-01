import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const registry = read("lib/navigation/operations-navigation.ts");
const navLinks = read("components/operations-nav-links.tsx");
const roleHome = read("app/operations/page.tsx");
const morePage = read("app/operations/more/page.tsx");
const mobileLabels = read("components/operations-nav-links.module.css");
const reachability = read("docs/ux-s03r-role-navigation-reachability.md");

assert.ok(registry.includes("export const operationsDestinations"), "Expected one typed navigation registry");
assert.ok(registry.includes("NavigationTaxonomy"), "Expected explicit destination taxonomy");
for (const taxonomy of ["primary", "attention", "contextual", "reference"]) {
  assert.ok(registry.includes(`\"${taxonomy}\"`), `Missing taxonomy ${taxonomy}`);
}

const expectedCapabilities = {
  admin: [
    "home", "claims", "claim-resolutions", "transfers", "rolls", "issues", "warranties",
    "production-orders", "centers", "dealers", "agents", "users", "products",
  ],
  agent: ["home", "transfers", "rolls", "centers", "dealers", "products"],
  dealer: ["home", "transfers", "rolls", "centers", "products"],
  center: [
    "home", "claim-inspections", "claim-resolution-tasks", "transfers", "rolls", "issues",
    "warranties", "products", "location",
  ],
};

function destinationBlock(id) {
  const marker = `id: \"${id}\"`;
  const start = registry.indexOf(marker);
  assert.ok(start >= 0, `Missing destination ${id}`);
  const next = registry.indexOf("\n  {\n    id:", start + marker.length);
  return registry.slice(start, next >= 0 ? next : registry.indexOf("] as const", start));
}

function visibleRoles(block) {
  if (block.includes("roles: allRoles")) return ["admin", "agent", "dealer", "center"];
  const match = block.match(/roles: \[([^\]]*)\]/);
  assert.ok(match, "Destination must declare roles");
  return [...match[1].matchAll(/\"(admin|agent|dealer|center)\"/g)].map((item) => item[1]);
}

for (const [role, expectedIds] of Object.entries(expectedCapabilities)) {
  const actual = expectedIds.filter((id) => visibleRoles(destinationBlock(id)).includes(role));
  assert.deepEqual(actual, expectedIds, `${role} capability registry lost a baseline destination`);

  for (const match of registry.matchAll(/id: \"([^\"]+)\"/g)) {
    const id = match[1];
    if (id === "more") continue;
    const block = destinationBlock(id);
    if (visibleRoles(block).includes(role)) {
      assert.ok(expectedIds.includes(id), `${role} gained unapproved destination ${id}`);
    }
  }
}

const expectedMobilePrimary = {
  admin: ["home", "claims", "claim-resolutions", "transfers"],
  agent: ["home", "transfers", "rolls", "centers"],
  dealer: ["home", "transfers", "rolls", "centers"],
  center: ["home", "claim-inspections", "claim-resolution-tasks", "transfers"],
};

for (const [role, ids] of Object.entries(expectedMobilePrimary)) {
  for (const id of ids) {
    const block = destinationBlock(id);
    assert.ok(
      block.includes("mobilePrimaryRoles: allRoles")
        || new RegExp(`mobilePrimaryRoles: \\[[^\\]]*\\\"${role}\\\"`).test(block),
      `${role} mobile primary missing ${id}`,
    );
  }
}

assert.ok(registry.includes('{ id: "more", href: "/operations/more", label: "العمليات"'), "Expected controlled Operations mobile destination");
assert.ok(navLinks.includes("getDesktopNavItems"), "Desktop navigation must use registry");
assert.ok(navLinks.includes("getMobileNavItems"), "Mobile navigation must use registry");
assert.ok(navLinks.includes("isOperationsTaskRoute(pathname)"), "Mobile task-mode must use explicit registry classification");
for (const forbidden of ["adminMobileItems", "agentMobileItems", "dealerMobileItems", "centerMobileItems", ".endsWith("]) {
  assert.ok(!navLinks.includes(forbidden), `Legacy navigation heuristic/array still present: ${forbidden}`);
}

assert.ok(roleHome.includes("getHomeDestinations(profile.role)"), "Role Home must use the same registry");
assert.ok(morePage.includes("getMoreDestinations(profile.role)"), "Operations page must use the same registry");
assert.ok(registry.includes("taskRoutePatterns"), "Expected explicit task route classification");
for (const requiredTaskPattern of [
  "production-orders\\/new",
  "transfers\\/new",
  "transfers\\/[^/]+\\/receive",
  "rolls\\/[^/]+\\/open",
  "warranties\\/activate",
  "claim-inspections\\/[^/]+",
  "claim-resolution-tasks\\/[^/]+",
  "claims\\/[^/]+\\/review",
]) {
  assert.ok(registry.includes(requiredTaskPattern), `Missing explicit task route pattern ${requiredTaskPattern}`);
}

const labelSize = Number(mobileLabels.match(/font-size:\s*([0-9.]+)px/)?.[1]);
assert.ok(Number.isFinite(labelSize) && labelSize >= 8.5, "Mobile bottom-navigation labels must meet the 8.5px design-system minimum");

for (const role of ["Admin / Company", "Country Agent", "Dealer / Distributor", "Installation Center"]) {
  assert.ok(reachability.includes(`## ${role}`), `Missing reachability record for ${role}`);
}
assert.ok(reachability.includes("No role gains a destination"), "Reachability record must state authorization non-expansion");
assert.ok(reachability.includes("No role loses a destination"), "Reachability record must state capability non-regression");

console.log("UX-S03R role navigation verification passed.");
