import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const baseUrl = process.env.ACC_BASE_URL?.trim() || "http://127.0.0.1:3000";
const artifactDir = process.env.ACC_C_ARTIFACT_DIR?.trim() || "artifacts/acc-01-c";
const password = "Agent-Network-Foundation-2026!";

const fixture = JSON.parse(fs.readFileSync(path.join(artifactDir, "fixture.json"), "utf8"));

function assert(condition, message) { if (!condition) throw new Error(message); }
function dbContainerName() {
  const names = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" })
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
  const name = names.find((value) => value.startsWith("supabase_db_"));
  assert(name, "Supabase database container was not found for ACC-01-C.");
  return name;
}
function querySql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", dbContainerName(), "psql", "-At", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-c", sql],
    { encoding: "utf8" },
  ).trim();
}
function sqlUuid(value) {
  assert(/^[0-9a-f-]{36}$/i.test(value), `Unsafe UUID fixture value: ${value}`);
  return `'${value}'::uuid`;
}
function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}
function oneSql(sql, label) {
  const raw = querySql(`select row_to_json(q)::text from (${sql}) q;`);
  const rows = raw ? raw.split("\n").filter(Boolean) : [];
  assert(rows.length === 1, `${label}: expected one row, received ${rows.length}.`);
  return JSON.parse(rows[0]);
}
function reservationCount(transferId, rollId) {
  return Number(querySql(`select count(*) from public.roll_transfer_reservations where transfer_id = ${sqlUuid(transferId)} and roll_id = ${sqlUuid(rollId)};`));
}
function custodyParty(rollId) {
  return querySql(`select custodian_party_id::text from public.roll_custody_current where roll_id = ${sqlUuid(rollId)};`);
}
async function login(page, email) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.getByLabel("كلمة المرور").fill(password);
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/operations", { timeout: 30000 }),
    page.getByRole("button", { name: "دخول" }).click(),
  ]);
  await page.getByRole("heading", { level: 1 }).waitFor({ state: "visible" });
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
      failedResponses.push({ actor: prefix, status: response.status(), method: response.request().method(), url: response.url() });
    }
  });
}
async function failureSnapshot(page, filePrefix) {
  const diagnostic = { url: page.url(), bodyExcerpt: "" };
  try { diagnostic.bodyExcerpt = (await page.locator("body").innerText()).slice(0, 1200); } catch {}
  try { await page.screenshot({ path: path.join(artifactDir, `${filePrefix}-failure.png`), fullPage: true }); } catch {}
  return diagnostic;
}
async function audit(page, label, mobile) {
  const geometry = await page.evaluate((enforce) => {
    const root = document.documentElement;
    const body = document.body;
    const viewportWidth = root.clientWidth;
    const scrollWidth = Math.max(root.scrollWidth, body?.scrollWidth ?? 0);
    const targets = Array.from(document.querySelectorAll("a[href], button, input:not([type='hidden']), select, textarea, [role='button']"))
      .filter((element) => { const style = getComputedStyle(element); const rect = element.getBoundingClientRect(); return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0; })
      .map((element) => { const rect = element.getBoundingClientRect(); return { name: element.getAttribute("aria-label") || element.textContent?.trim().slice(0, 80) || "", width: rect.width, height: rect.height }; });
    return { viewportWidth, scrollWidth, undersized: enforce ? targets.filter((item) => item.width < 44 || item.height < 44) : [] };
  }, mobile);
  assert(geometry.scrollWidth <= geometry.viewportWidth + 1, `${label}: horizontal overflow.`);
  assert(geometry.undersized.length === 0, `${label}: undersized mobile targets ${JSON.stringify(geometry.undersized)}`);
  const axe = await new AxeBuilder({ page }).analyze();
  const axeDetails = axe.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    nodes: violation.nodes.map((node) => ({
      target: node.target,
      html: node.html,
      failureSummary: node.failureSummary,
    })),
  }));
  assert(axeDetails.length === 0, `${label}: axe violations ${JSON.stringify(axeDetails)}`);
  return { geometry, axe: axeDetails };
}

fs.mkdirSync(artifactDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
const failures = [];

try {
  for (const scenario of fixture.scenarios) {
    const mobile = scenario.width < 600;
    const label = scenario.name;
    const runtimeErrors = [];
    const failedResponses = [];
    const senderContext = await browser.newContext({ viewport: { width: scenario.width, height: scenario.height }, locale: "ar-EG" });
    const senderPage = await senderContext.newPage();
    attachDiagnostics(senderPage, "sender", runtimeErrors, failedResponses);
    let recipientContext = null;
    let recipientPage = null;

    try {
      await login(senderPage, fixture.sender.email);
      await senderPage.goto(`${baseUrl}/operations/transfers/new`, { waitUntil: "networkidle" });
      await senderPage.getByRole("heading", { name: "إرسال تحويل جديد", level: 1 }).waitFor();
      await senderPage.getByLabel("Transfer ID للمستلم").fill(fixture.recipient.transferCode);
      await senderPage.getByRole("button", { name: "تحقق من الجهة" }).click();
      await senderPage.getByRole("button", { name: "تأكيد المستلم والمتابعة" }).waitFor();
      await senderPage.getByRole("button", { name: "تأكيد المستلم والمتابعة" }).click();
      await senderPage.getByLabel("QR تالف؟ أدخل Serial اللفة").fill(scenario.serialNumber);
      await senderPage.getByRole("button", { name: "إضافة", exact: true }).click();
      await senderPage.getByText(`تمت إضافة اللفة · ${scenario.serialNumber}`, { exact: true }).waitFor();
      await senderPage.getByRole("button", { name: "مراجعة التحويل · 1" }).click();
      await senderPage.getByRole("heading", { name: "راجع قبل الإرسال", level: 2 }).waitFor();
      const sendAudit = await audit(senderPage, `${label}/send-review`, mobile);
      await senderPage.screenshot({ path: path.join(artifactDir, `${label}-send-review.png`), fullPage: true });
      await senderPage.getByRole("button", { name: "إرسال التحويل · 1 لفة" }).click();
      await senderPage.getByRole("heading", { name: "التحويل في انتظار الاستلام", level: 2 }).waitFor({ timeout: 30000 });
      const transferNumber = (await senderPage.locator("code").filter({ hasText: /^PG-T-/ }).first().innerText()).trim();
      await senderPage.screenshot({ path: path.join(artifactDir, `${label}-send-success.png`), fullPage: true });

      const transfer = oneSql(`
        select id::text as id, status::text as status, sender_party_id::text as sender_party_id,
               recipient_party_id::text as recipient_party_id, roll_count
          from public.roll_transfers
         where transfer_number = ${sqlText(transferNumber)}
      `, `${label} transfer after send`);
      assert(transfer.status === "pending", `${label}: transfer not pending after send.`);
      assert(transfer.sender_party_id === fixture.sender.partyId && transfer.recipient_party_id === fixture.recipient.partyId, `${label}: sender/recipient mismatch.`);
      const pendingItem = oneSql(`
        select status::text as status
          from public.roll_transfer_item_states
         where transfer_id = ${sqlUuid(transfer.id)} and roll_id = ${sqlUuid(scenario.rollId)}
      `, `${label} item after send`);
      assert(pendingItem.status === "pending", `${label}: item not pending after send.`);
      assert(reservationCount(transfer.id, scenario.rollId) === 1, `${label}: reservation missing after send.`);
      assert(custodyParty(scenario.rollId) === fixture.sender.partyId, `${label}: custody moved before receipt.`);

      recipientContext = await browser.newContext({ viewport: { width: scenario.width, height: scenario.height }, locale: "ar-EG" });
      recipientPage = await recipientContext.newPage();
      attachDiagnostics(recipientPage, "recipient", runtimeErrors, failedResponses);
      await login(recipientPage, fixture.recipient.email);
      await recipientPage.goto(`${baseUrl}/operations/transfers`, { waitUntil: "networkidle" });
      assert((await recipientPage.locator("body").innerText()).includes(transferNumber), `${label}: incoming transfer is not visible to recipient.`);
      await recipientPage.goto(`${baseUrl}/operations/transfers/${transfer.id}/receive`, { waitUntil: "networkidle" });
      await recipientPage.getByRole("heading", { name: "استلام التحويل", level: 1 }).waitFor();
      await recipientPage.getByLabel("Roll Serial يدوي").fill(scenario.serialNumber);
      await recipientPage.getByRole("button", { name: "تحقق وأضف" }).click();
      await recipientPage.getByText(`تم التحقق: ${scenario.serialNumber}`, { exact: true }).waitFor();
      await recipientPage.getByRole("button", { name: "مراجعة الاستلام" }).click();
      await recipientPage.getByRole("heading", { name: "راجع الاستلام قبل التأكيد", level: 2 }).waitFor();
      const receiveAudit = await audit(recipientPage, `${label}/receive-review`, mobile);
      await recipientPage.screenshot({ path: path.join(artifactDir, `${label}-receive-review.png`), fullPage: true });
      await recipientPage.getByRole("button", { name: "تأكيد الاستلام الكامل" }).click();
      await recipientPage.getByRole("heading", { name: "تأكيد الاستلام الكامل؟", level: 2 }).waitFor();
      await Promise.all([
        recipientPage.waitForURL((url) => url.pathname === `/operations/transfers/${transfer.id}`, { timeout: 30000 }),
        recipientPage.getByRole("button", { name: "نعم، استلمت هذه اللفات" }).click(),
      ]);
      await recipientPage.getByText("تفاصيل التحويل", { exact: true }).first().waitFor({ timeout: 30000 });
      await recipientPage.getByText("تم الاستلام", { exact: true }).first().waitFor({ timeout: 30000 });
      await recipientPage.getByText(transferNumber, { exact: true }).first().waitFor({ timeout: 30000 });
      await recipientPage.screenshot({ path: path.join(artifactDir, `${label}-receive-success.png`), fullPage: true });

      const receivedTransfer = oneSql(`
        select id::text as id, status::text as status
          from public.roll_transfers
         where id = ${sqlUuid(transfer.id)}
      `, `${label} transfer after receipt`);
      assert(receivedTransfer.status === "received", `${label}: transfer not received after full receipt.`);
      const receivedItem = oneSql(`
        select status::text as status
          from public.roll_transfer_item_states
         where transfer_id = ${sqlUuid(transfer.id)} and roll_id = ${sqlUuid(scenario.rollId)}
      `, `${label} item after receipt`);
      assert(receivedItem.status === "received", `${label}: item not received after receipt.`);
      assert(reservationCount(transfer.id, scenario.rollId) === 0, `${label}: reservation remained after receipt.`);
      assert(custodyParty(scenario.rollId) === fixture.recipient.partyId, `${label}: custody did not move to recipient.`);
      assert(runtimeErrors.length === 0, `${label}: runtime errors ${JSON.stringify(runtimeErrors)}`);
      assert(failedResponses.length === 0, `${label}: unexpected HTTP failures ${JSON.stringify(failedResponses)}`);

      results.push({ name: label, ok: true, transferNumber, transferId: transfer.id, sendAudit, receiveAudit, failedResponses });
    } catch (error) {
      const senderDiagnostic = await failureSnapshot(senderPage, `${label}-sender`);
      const recipientDiagnostic = recipientPage ? await failureSnapshot(recipientPage, `${label}-recipient`) : null;
      failures.push({
        name: label,
        error: error instanceof Error ? error.message : String(error),
        senderDiagnostic,
        recipientDiagnostic,
        runtimeErrors,
        failedResponses,
      });
      results.push({ name: label, ok: false });
    } finally {
      if (recipientContext) await recipientContext.close();
      await senderContext.close();
    }
  }
} finally {
  await browser.close();
}

fs.writeFileSync(path.join(artifactDir, "summary.json"), `${JSON.stringify({ results, failures }, null, 2)}\n`);
if (failures.length > 0) throw new Error(`ACC-01-C failed: ${JSON.stringify(failures)}`);
console.log(`ACC-01-C PASS: ${results.length}/${fixture.scenarios.length} representative transfer send/receive paths.`);
