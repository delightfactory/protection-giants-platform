import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const baseUrl = process.env.ACC_BASE_URL?.trim() || "http://127.0.0.1:3000";
const apiUrl = process.env.API_URL;
const anonKey = process.env.ANON_KEY;
const artifactDir = process.env.ACC_G_ARTIFACT_DIR?.trim() || "artifacts/acc-01-g";
const activeRollSerial = process.env.ACC_G_ACTIVE_ROLL_SERIAL?.trim() || "ACC01F-WARRANTY-ROLL-001";
const pendingIssueRollSerial = process.env.ACC_G_PENDING_ISSUE_ROLL_SERIAL?.trim() || "ACC01D-ROLL-001";

if (!apiUrl || !anonKey) throw new Error("API_URL and ANON_KEY are required for ACC-01-G.");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

async function rpcPublic(name, body) {
  const response = await fetch(`${apiUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return { response, body: await readJson(response) };
}

function dbContainerName() {
  const names = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" })
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
  const name = names.find((value) => value.startsWith("supabase_db_"));
  assert(name, "Supabase database container was not found for ACC-01-G.");
  return name;
}

function querySql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", dbContainerName(), "psql", "-At", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-c", sql],
    { encoding: "utf8" },
  ).trim();
}

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlUuid(value) {
  assert(/^[0-9a-f-]{36}$/i.test(value), `Unsafe UUID fixture value: ${value}`);
  return `'${value}'::uuid`;
}

function oneSql(sql, label) {
  const raw = querySql(`select row_to_json(q)::text from (${sql}) q;`);
  const rows = raw ? raw.split("\n").filter(Boolean) : [];
  assert(rows.length === 1, `${label}: expected one row, received ${rows.length}.`);
  return JSON.parse(rows[0]);
}

function countSql(sql) {
  return Number(querySql(`select count(*) from (${sql}) q;`));
}

function attachDiagnostics(page, prefix, runtimeErrors, failedResponses) {
  page.on("pageerror", (error) => runtimeErrors.push(`${prefix} pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" && !/^Failed to load resource:/.test(message.text())) {
      runtimeErrors.push(`${prefix} console.error: ${message.text()}`);
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      failedResponses.push({
        actor: prefix,
        status: response.status(),
        method: response.request().method(),
        url: response.url(),
      });
    }
  });
}

async function audit(page, label, mobile) {
  const geometry = await page.evaluate((enforce) => {
    const root = document.documentElement;
    const body = document.body;
    const viewportWidth = root.clientWidth;
    const scrollWidth = Math.max(root.scrollWidth, body?.scrollWidth ?? 0);
    const targets = Array.from(document.querySelectorAll(
      "a[href], button, input:not([type='hidden']), select, textarea, [role='button']",
    ))
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          name: element.getAttribute("aria-label") || element.textContent?.trim().slice(0, 80) || element.getAttribute("name") || "",
          width: rect.width,
          height: rect.height,
        };
      });

    return {
      viewportWidth,
      scrollWidth,
      undersized: enforce ? targets.filter((item) => item.width < 44 || item.height < 44) : [],
    };
  }, mobile);

  assert(geometry.scrollWidth <= geometry.viewportWidth + 1, `${label}: horizontal overflow.`);
  assert(geometry.undersized.length === 0,
    `${label}: undersized mobile targets ${JSON.stringify(geometry.undersized)}`);

  const axe = await new AxeBuilder({ page }).analyze();
  const axeDetails = axe.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    nodes: violation.nodes.map((node) => ({ target: node.target, html: node.html, failureSummary: node.failureSummary })),
  }));
  assert(axeDetails.length === 0, `${label}: axe violations ${JSON.stringify(axeDetails)}`);
  return { geometry, axe: axeDetails };
}

async function failureSnapshot(page, filePrefix) {
  const diagnostic = { url: page.url(), bodyExcerpt: "" };
  try { diagnostic.bodyExcerpt = (await page.locator("body").innerText()).slice(0, 2200); } catch {}
  try { await page.screenshot({ path: path.join(artifactDir, `${filePrefix}-failure.png`), fullPage: true }); } catch {}
  return diagnostic;
}

function assertExactResolverKeys(row, label) {
  const expected = [
    "activated_at",
    "activating_center_name",
    "coverage_expires_at",
    "product_name",
    "public_state",
    "vehicle_make",
    "vehicle_model",
    "vehicle_year",
    "warranty_number",
  ].sort();
  const actual = Object.keys(row).sort();
  assert(JSON.stringify(actual) === JSON.stringify(expected),
    `${label}: public resolver projection changed. Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`);
}

function sameInstant(actual, expected, label) {
  assert(typeof actual === "string" && typeof expected === "string", `${label}: timestamp missing.`);
  assert(Date.parse(actual) === Date.parse(expected), `${label}: timestamp mismatch ${actual} vs ${expected}.`);
}

function assertBodyExcludes(body, values, label) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    assert(!body.includes(String(value)), `${label}: public page leaked private value ${String(value)}.`);
  }
}

function findUnknownCode() {
  for (const character of ["f", "e", "d", "c", "b", "a", "9", "8"]) {
    const candidate = character.repeat(64);
    const count = Number(querySql(`select count(*) from private.roll_public_identities where public_code = ${sqlText(candidate)};`));
    if (count === 0) return candidate;
  }
  throw new Error("Could not allocate a deterministic unknown Public Warranty code for ACC-01-G.");
}

fs.mkdirSync(artifactDir, { recursive: true });

const activeRoll = oneSql(`
  select r.id::text as id, r.serial_number, identity.public_code
  from public.rolls r
  join private.roll_public_identities identity on identity.roll_id = r.id
  where r.serial_number = ${sqlText(activeRollSerial)}
`, "active Public Warranty Roll");

const warranty = oneSql(`
  select
    w.id::text as id,
    w.request_id::text as request_id,
    w.roll_id::text as roll_id,
    w.warranty_number,
    w.record_state,
    w.activated_by_profile_id::text as activated_by_profile_id,
    w.activating_center_party_id::text as activating_center_party_id,
    w.activating_center_name_snapshot,
    w.activated_at::text as activated_at,
    w.coverage_expires_at::text as coverage_expires_at,
    w.product_id::text as product_id,
    w.product_code_snapshot,
    w.product_name_snapshot,
    w.customer_name,
    w.customer_phone,
    w.customer_email,
    w.vehicle_make,
    w.vehicle_model,
    w.vehicle_year,
    w.vehicle_plate,
    w.vehicle_color,
    w.vehicle_vin
  from public.warranties w
  where w.roll_id = ${sqlUuid(activeRoll.id)} and w.record_state = 'issued'
`, "active authoritative Warranty");

assert(warranty.roll_id === activeRoll.id, "active: Warranty Roll identity mismatch.");
assert(warranty.record_state === "issued", "active: Warranty is not issued.");
assert(/^[0-9a-f]{64}$/.test(activeRoll.public_code), "active: Public Warranty code is not 64 lowercase hex characters.");
assert(countSql(`select 1 from private.roll_public_identities where roll_id = ${sqlUuid(activeRoll.id)}`) === 1,
  "active: Roll must own exactly one permanent public identity.");

const pendingRoll = oneSql(`
  select r.id::text as id, r.serial_number, identity.public_code
  from public.rolls r
  join private.roll_public_identities identity on identity.roll_id = r.id
  where r.serial_number = ${sqlText(pendingIssueRollSerial)}
`, "pending Issue Public Warranty Roll");

const pendingIssue = oneSql(`
  select id::text as id, category, description, status, reporting_center_party_id::text as reporting_center_party_id
  from public.roll_preinstall_issues
  where roll_id = ${sqlUuid(pendingRoll.id)} and status in ('submitted', 'under_review')
`, "pending authoritative Pre-install Issue");

assert(/^[0-9a-f]{64}$/.test(pendingRoll.public_code), "pending: Public Warranty code is not 64 lowercase hex characters.");
assert(activeRoll.public_code !== pendingRoll.public_code, "Public Warranty identities must be unique per Roll.");
assert(countSql(`select 1 from private.roll_public_identities where roll_id = ${sqlUuid(pendingRoll.id)}`) === 1,
  "pending: Roll must own exactly one permanent public identity.");
assert(countSql(`select 1 from public.warranties where roll_id = ${sqlUuid(pendingRoll.id)} and record_state = 'issued'`) === 0,
  "pending: issue-held Roll unexpectedly has an issued Warranty.");

const activeRpc = await rpcPublic("resolve_public_warranty", { p_public_code: activeRoll.public_code });
assert(activeRpc.response.ok && Array.isArray(activeRpc.body) && activeRpc.body.length === 1,
  `active: anonymous public resolver failed ${activeRpc.response.status} ${JSON.stringify(activeRpc.body)}`);
const activePublic = activeRpc.body[0];
assertExactResolverKeys(activePublic, "active");
assert(activePublic.public_state === "active", `active: expected active public state, got ${JSON.stringify(activePublic)}.`);
assert(activePublic.product_name === warranty.product_name_snapshot, "active: public Product snapshot mismatch.");
assert(activePublic.warranty_number === warranty.warranty_number, "active: public Warranty Number mismatch.");
assert(activePublic.activating_center_name === warranty.activating_center_name_snapshot, "active: public Center snapshot mismatch.");
assert(activePublic.vehicle_make === warranty.vehicle_make && activePublic.vehicle_model === warranty.vehicle_model,
  "active: public vehicle make/model mismatch.");
assert(activePublic.vehicle_year === warranty.vehicle_year, "active: public vehicle year mismatch.");
sameInstant(activePublic.activated_at, warranty.activated_at, "active activated_at");
sameInstant(activePublic.coverage_expires_at, warranty.coverage_expires_at, "active coverage_expires_at");

const pendingRpc = await rpcPublic("resolve_public_warranty", { p_public_code: pendingRoll.public_code });
assert(pendingRpc.response.ok && Array.isArray(pendingRpc.body) && pendingRpc.body.length === 1,
  `pending: anonymous public resolver failed ${pendingRpc.response.status} ${JSON.stringify(pendingRpc.body)}`);
const pendingPublic = pendingRpc.body[0];
assertExactResolverKeys(pendingPublic, "pending");
assert(pendingPublic.public_state === "not_activated", `pending: internal hold leaked into public state ${JSON.stringify(pendingPublic)}.`);
assert(typeof pendingPublic.product_name === "string" && pendingPublic.product_name.length > 0,
  "pending: public Product identity missing.");
for (const key of ["warranty_number", "activated_at", "coverage_expires_at", "activating_center_name", "vehicle_make", "vehicle_model", "vehicle_year"]) {
  assert(pendingPublic[key] === null, `pending: ${key} must stay null before Warranty activation.`);
}

const unknownCode = findUnknownCode();
const unknownRpc = await rpcPublic("resolve_public_warranty", { p_public_code: unknownCode });
assert(unknownRpc.response.ok && Array.isArray(unknownRpc.body) && unknownRpc.body.length === 0,
  `unknown: expected anonymous zero-row result, got ${unknownRpc.response.status} ${JSON.stringify(unknownRpc.body)}.`);

const malformedCode = "NOT-A-PUBLIC-WARRANTY-CODE";
const malformedRpc = await rpcPublic("resolve_public_warranty", { p_public_code: malformedCode });
assert(malformedRpc.response.ok && Array.isArray(malformedRpc.body) && malformedRpc.body.length === 0,
  `malformed: expected the same anonymous zero-row result as unknown code, got ${malformedRpc.response.status} ${JSON.stringify(malformedRpc.body)}.`);

const browser = await chromium.launch({ headless: true });
const results = [];
const failures = [];

try {
  for (const scenario of [
    { name: "active-mobile", width: 390, height: 844, kind: "active" },
    { name: "active-desktop", width: 1365, height: 900, kind: "active" },
    { name: "pending-mobile", width: 390, height: 844, kind: "pending" },
  ]) {
    const runtimeErrors = [];
    const failedResponses = [];
    const context = await browser.newContext({
      viewport: { width: scenario.width, height: scenario.height },
      locale: "ar-EG",
    });
    const page = await context.newPage();
    attachDiagnostics(page, scenario.name, runtimeErrors, failedResponses);

    try {
      const isActive = scenario.kind === "active";
      const publicCode = isActive ? activeRoll.public_code : pendingRoll.public_code;
      const response = await page.goto(`${baseUrl}/w/${publicCode}`, { waitUntil: "networkidle" });
      assert(response?.status() === 200, `${scenario.name}: expected HTTP 200, got ${response?.status()}.`);

      if (isActive) {
        await page.getByRole("heading", { name: "الضمان ساري", level: 1 }).waitFor();
        await page.getByText("ساري", { exact: true }).waitFor();
        await page.getByText(warranty.warranty_number, { exact: true }).waitFor();
        await page.getByText(warranty.product_name_snapshot, { exact: true }).waitFor();
        await page.getByText(warranty.activating_center_name_snapshot, { exact: true }).waitFor();
        await page.getByText(`${warranty.vehicle_make} ${warranty.vehicle_model} · ${warranty.vehicle_year}`, { exact: true }).waitFor();
        await page.getByText("تحتاج مساعدة تحت الضمان؟", { exact: true }).waitFor();
        const claimHref = await page.getByRole("link", { name: "طلب خدمة الضمان" }).getAttribute("href");
        assert(claimHref === `/w/${activeRoll.public_code}/claim`,
          `${scenario.name}: public Claim boundary href mismatch ${claimHref}.`);

        const body = await page.locator("body").innerText();
        assertBodyExcludes(body, [
          warranty.customer_name,
          warranty.customer_phone,
          warranty.customer_email,
          warranty.vehicle_vin,
          warranty.vehicle_plate,
          warranty.vehicle_color,
          warranty.id,
          warranty.request_id,
          warranty.roll_id,
          warranty.activated_by_profile_id,
          warranty.activating_center_party_id,
          warranty.product_id,
          warranty.product_code_snapshot,
        ], scenario.name);
      } else {
        await page.getByRole("heading", { name: "لم يتم تفعيل الضمان بعد", level: 1 }).waitFor();
        await page.getByText("غير مفعّل", { exact: true }).waitFor();
        await page.getByText(pendingPublic.product_name, { exact: true }).waitFor();
        const body = await page.locator("body").innerText();
        assertBodyExcludes(body, [
          pendingIssue.id,
          pendingIssue.category,
          pendingIssue.description,
          pendingIssue.status,
          pendingIssue.reporting_center_party_id,
          "issue_pending",
          "تفعيل الضمان متوقف مؤقتًا",
        ], scenario.name);
        assert(!body.includes("طلب خدمة الضمان"), `${scenario.name}: Claim CTA must not appear before Warranty activation.`);
      }

      const mobile = scenario.width < 600;
      const auditResult = await audit(page, scenario.name, mobile);
      await page.screenshot({ path: path.join(artifactDir, `${scenario.name}.png`), fullPage: true });
      assert(runtimeErrors.length === 0, `${scenario.name}: runtime errors ${JSON.stringify(runtimeErrors)}`);
      assert(failedResponses.length === 0, `${scenario.name}: unexpected HTTP failures ${JSON.stringify(failedResponses)}`);
      results.push({
        scenario: scenario.name,
        status: "PASS",
        url: page.url(),
        publicState: isActive ? activePublic.public_state : pendingPublic.public_state,
        audit: auditResult,
        runtimeErrors,
        failedResponses,
      });
    } catch (error) {
      const diagnostic = await failureSnapshot(page, scenario.name);
      failures.push({
        scenario: scenario.name,
        message: error instanceof Error ? error.message : String(error),
        runtimeErrors,
        failedResponses,
        diagnostic,
      });
    } finally {
      await context.close();
    }
  }

  for (const [name, code] of [["unknown", unknownCode], ["malformed", malformedCode]]) {
    const context = await browser.newContext({ viewport: { width: 1365, height: 900 }, locale: "ar-EG" });
    const page = await context.newPage();
    try {
      const response = await page.goto(`${baseUrl}/w/${code}`, { waitUntil: "networkidle" });
      assert(response?.status() === 404, `${name}: public route must return 404, got ${response?.status()}.`);
      results.push({ scenario: `${name}-404`, status: "PASS", url: page.url(), httpStatus: response.status() });
    } catch (error) {
      const diagnostic = await failureSnapshot(page, `${name}-404`);
      failures.push({
        scenario: `${name}-404`,
        message: error instanceof Error ? error.message : String(error),
        diagnostic,
      });
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}

const summary = {
  suite: "ACC-01-G Public Warranty browser acceptance",
  baseUrl,
  activeRollSerial,
  pendingIssueRollSerial,
  activePublicCodeShape: /^[0-9a-f]{64}$/.test(activeRoll.public_code),
  pendingPublicCodeShape: /^[0-9a-f]{64}$/.test(pendingRoll.public_code),
  activeResolverProjection: Object.keys(activePublic).sort(),
  pendingResolverState: pendingPublic.public_state,
  unknownResolverRows: unknownRpc.body.length,
  malformedResolverRows: malformedRpc.body.length,
  results,
  failures,
};

fs.writeFileSync(path.join(artifactDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);

if (failures.length > 0) {
  console.error(JSON.stringify(summary, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(summary, null, 2));
