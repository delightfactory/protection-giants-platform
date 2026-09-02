import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const baseUrl = process.env.ACC_BASE_URL?.trim() || "http://127.0.0.1:3000";
const apiUrl = process.env.API_URL;
const anonKey = process.env.ANON_KEY;
const dArtifactDir = process.env.ACC_D_ARTIFACT_DIR?.trim() || "artifacts/acc-01-d";
const artifactDir = process.env.ACC_E_ARTIFACT_DIR?.trim() || "artifacts/acc-01-e";
const password = "Agent-Network-Foundation-2026!";
const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9YKxD7sAAAAASUVORK5CYII=",
  "base64",
);

if (!apiUrl || !anonKey) throw new Error("API_URL and ANON_KEY are required for ACC-01-E.");

const fixture = JSON.parse(fs.readFileSync(path.join(dArtifactDir, "fixture.json"), "utf8"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

async function request(pathname, { method = "GET", token = anonKey, body } = {}) {
  const headers = { apikey: anonKey, Authorization: `Bearer ${token}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${apiUrl}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { response, body: await readJson(response) };
}

async function signInApi(email) {
  const result = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email, password },
  });
  assert(result.response.ok && result.body?.access_token,
    `Could not sign in API actor ${email}: ${result.response.status} ${JSON.stringify(result.body)}`);
  return result.body.access_token;
}

async function rpc(name, body, token) {
  return request(`/rest/v1/rpc/${name}`, { method: "POST", body, token });
}

function dbContainerName() {
  const names = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" })
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
  const name = names.find((value) => value.startsWith("supabase_db_"));
  assert(name, "Supabase database container was not found for ACC-01-E.");
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

function oneSql(sql, label) {
  const raw = querySql(`select row_to_json(q)::text from (${sql}) q;`);
  const rows = raw ? raw.split("\n").filter(Boolean) : [];
  assert(rows.length === 1, `${label}: expected one row, received ${rows.length}.`);
  return JSON.parse(rows[0]);
}

function openingCount(rollId) {
  return Number(querySql(`select count(*) from public.roll_openings where roll_id = ${sqlUuid(rollId)};`));
}

function issueCount(rollId) {
  return Number(querySql(`select count(*) from public.roll_preinstall_issues where roll_id = ${sqlUuid(rollId)};`));
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
      failedResponses.push({
        actor: prefix,
        status: response.status(),
        method: response.request().method(),
        url: response.url(),
      });
    }
  });
}

async function failureSnapshot(page, filePrefix) {
  const diagnostic = { url: page.url(), bodyExcerpt: "" };
  try { diagnostic.bodyExcerpt = (await page.locator("body").innerText()).slice(0, 1800); } catch {}
  try { await page.screenshot({ path: path.join(artifactDir, `${filePrefix}-failure.png`), fullPage: true }); } catch {}
  return diagnostic;
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
const centerToken = await signInApi(fixture.actor.email);
const browser = await chromium.launch({ headless: true });
const results = [];
const failures = [];

try {
  for (const scenario of fixture.scenarios) {
    const mobile = scenario.width < 600;
    const label = scenario.name;
    const expectedCategory = mobile ? "manufacturing_defect" : "physical_damage";
    const expectedCategoryLabel = mobile ? "عيب تصنيع" : "تلف مادي";
    const description = mobile
      ? "ظهر عيب واضح في سطح الفيلم قبل بدء عملية التركيب الفعلية."
      : "ظهر تلف مادي واضح في الرول بعد الفتح وقبل بدء التركيب على السيارة.";
    const expectedEvidence = mobile ? 1 : 0;
    const runtimeErrors = [];
    const failedResponses = [];
    const context = await browser.newContext({
      viewport: { width: scenario.width, height: scenario.height },
      locale: "ar-EG",
    });
    const page = await context.newPage();
    attachDiagnostics(page, "center", runtimeErrors, failedResponses);

    try {
      assert(openingCount(scenario.rollId) === 1, `${label}: Roll must be opened exactly once before issue acceptance.`);
      assert(issueCount(scenario.rollId) === 0, `${label}: Roll already has a Pre-install Issue before acceptance.`);
      assert(custodyParty(scenario.rollId) === fixture.actor.partyId, `${label}: Center is not current custodian before issue creation.`);

      await login(page, fixture.actor.email);
      await page.goto(`${baseUrl}/operations/rolls/issues/new?roll=${encodeURIComponent(scenario.serialNumber)}`, { waitUntil: "networkidle" });
      await page.getByRole("heading", { name: "بلاغ مشكلة قبل التركيب", level: 1 }).waitFor();
      await page.getByLabel("أو أدخل سيريال الرول").waitFor();
      await page.getByRole("button", { name: "تحقق من الرول" }).click();

      await page.getByRole("heading", { name: "ACC 01 D Roll Opening Acceptance PPF", level: 2 }).waitFor({ timeout: 30000 });
      await page.getByText("إرسال البلاغ يوقف تفعيل الضمان على هذا الرول فورًا، بدون انتظار تأكيد من الشركة، إلى أن يتم حسم البلاغ.", { exact: true }).waitFor();
      await page.getByText(scenario.serialNumber, { exact: true }).waitFor();

      const candidateAudit = await audit(page, `${label}/issue-candidate`, mobile);
      await page.screenshot({ path: path.join(artifactDir, `${label}-issue-candidate.png`), fullPage: true });

      await page.getByLabel("نوع المشكلة").selectOption({ label: expectedCategoryLabel });
      await page.getByLabel("وصف المشكلة").fill(description);
      if (expectedEvidence === 1) {
        await page.getByLabel("صور اختيارية").setInputFiles({
          name: "acc-01-e-evidence.png",
          mimeType: "image/png",
          buffer: tinyPng,
        });
        await page.getByRole("img", { name: "معاينة الصورة 1: acc-01-e-evidence.png" }).waitFor();
      }

      const formAudit = await audit(page, `${label}/issue-form`, mobile);
      await page.screenshot({ path: path.join(artifactDir, `${label}-issue-form.png`), fullPage: true });

      await page.getByRole("button", { name: "إرسال البلاغ وإيقاف التفعيل مؤقتًا" }).click();
      await page.getByRole("heading", { name: "تم إرسال البلاغ للشركة", level: 2 }).waitFor({ timeout: 30000 });
      await page.getByText("قيد مراجعة الشركة", { exact: true }).waitFor();
      await page.getByText("تفعيل الضمان متوقف مؤقتًا", { exact: true }).waitFor();
      const issueHref = await page.getByRole("link", { name: "فتح البلاغ" }).getAttribute("href");
      const issueMatch = issueHref?.match(/^\/operations\/rolls\/issues\/([0-9a-f-]{36})(?:\?|$)/i);
      assert(issueMatch, `${label}: success surface did not expose a valid Issue detail link: ${issueHref}`);
      const issueId = issueMatch[1];

      const successAudit = await audit(page, `${label}/issue-success`, mobile);
      await page.screenshot({ path: path.join(artifactDir, `${label}-issue-success.png`), fullPage: true });

      const issue = oneSql(`
        select
          id::text as id,
          request_id::text as request_id,
          roll_id::text as roll_id,
          reported_by_profile_id::text as reported_by_profile_id,
          reporting_center_party_id::text as reporting_center_party_id,
          category,
          description,
          status,
          resolved_by_profile_id::text as resolved_by_profile_id,
          resolution_reason,
          resolved_at::text as resolved_at,
          created_at::text as created_at
        from public.roll_preinstall_issues
        where roll_id = ${sqlUuid(scenario.rollId)}
      `, `${label} authoritative Pre-install Issue`);

      assert(issue.id === issueId, `${label}: UI Issue ID does not match authoritative row.`);
      assert(issue.roll_id === scenario.rollId, `${label}: Issue Roll mismatch.`);
      assert(issue.reported_by_profile_id === fixture.actor.profileId, `${label}: Issue reporter Profile mismatch.`);
      assert(issue.reporting_center_party_id === fixture.actor.partyId, `${label}: Issue reporting Center mismatch.`);
      assert(issue.category === expectedCategory, `${label}: Issue category mismatch.`);
      assert(issue.description === description, `${label}: Issue description mismatch.`);
      assert(issue.status === "submitted", `${label}: Issue must be submitted immediately.`);
      assert(issue.resolved_by_profile_id === null && issue.resolution_reason === null && issue.resolved_at === null,
        `${label}: submitted Issue unexpectedly contains a terminal decision.`);
      assert(typeof issue.created_at === "string" && issue.created_at.length > 10, `${label}: Issue created_at missing.`);
      assert(issueCount(scenario.rollId) === 1, `${label}: expected exactly one Issue row.`);
      assert(openingCount(scenario.rollId) === 1, `${label}: Issue creation changed immutable Opening history.`);
      assert(custodyParty(scenario.rollId) === fixture.actor.partyId, `${label}: Issue creation changed Roll custody.`);

      const submittedEvent = oneSql(`
        select
          issue_id::text as issue_id,
          event_kind,
          actor_profile_id::text as actor_profile_id,
          reason,
          created_at::text as created_at
        from public.roll_preinstall_issue_events
        where issue_id = ${sqlUuid(issueId)}
      `, `${label} submitted Issue event`);
      assert(submittedEvent.issue_id === issueId && submittedEvent.event_kind === "submitted",
        `${label}: immutable submitted event missing.`);
      assert(submittedEvent.actor_profile_id === fixture.actor.profileId,
        `${label}: submitted event actor mismatch.`);
      assert(submittedEvent.reason === null, `${label}: submitted event should not contain resolution reason.`);

      const evidenceCount = Number(querySql(`select count(*) from public.roll_preinstall_issue_evidence where issue_id = ${sqlUuid(issueId)};`));
      assert(evidenceCount === expectedEvidence,
        `${label}: evidence metadata count mismatch; expected ${expectedEvidence}, received ${evidenceCount}.`);
      if (expectedEvidence === 1) {
        const evidence = oneSql(`
          select mime_type, size_bytes, uploaded_by_profile_id::text as uploaded_by_profile_id, storage_path
          from public.roll_preinstall_issue_evidence
          where issue_id = ${sqlUuid(issueId)}
        `, `${label} Issue evidence metadata`);
        assert(evidence.mime_type === "image/png", `${label}: evidence MIME mismatch.`);
        assert(Number(evidence.size_bytes) === tinyPng.length, `${label}: evidence size mismatch.`);
        assert(evidence.uploaded_by_profile_id === fixture.actor.profileId, `${label}: evidence uploader mismatch.`);
        assert(typeof evidence.storage_path === "string" && evidence.storage_path.startsWith(`${issueId}/`),
          `${label}: evidence storage path is not issue-owned.`);
      }

      const activationCandidate = await rpc("resolve_warranty_activation_candidate", {
        p_roll_serial: scenario.serialNumber,
      }, centerToken);
      assert(activationCandidate.response.ok && Array.isArray(activationCandidate.body) && activationCandidate.body.length === 1,
        `${label}: Warranty resolver failed after Issue submission: ${activationCandidate.response.status} ${JSON.stringify(activationCandidate.body)}`);
      assert(activationCandidate.body[0].roll_id === scenario.rollId,
        `${label}: Warranty resolver returned wrong Roll.`);
      assert(activationCandidate.body[0].eligibility === "issue_pending" && activationCandidate.body[0].blocking_issue_state === "submitted",
        `${label}: authoritative Warranty Activation hold missing: ${JSON.stringify(activationCandidate.body[0])}`);

      await page.goto(`${baseUrl}/operations/warranties/activate?roll=${encodeURIComponent(scenario.serialNumber)}`, { waitUntil: "networkidle" });
      await page.getByRole("heading", { name: "تفعيل ضمان عميل", level: 1 }).waitFor();
      await page.getByRole("button", { name: "تحقق من الأهلية" }).click();
      await page.getByText("لا يمكن التفعيل الآن", { exact: true }).waitFor({ timeout: 30000 });
      await page.getByText("يوجد بلاغ ما قبل تركيب قيد قرار الشركة. لا يمكن التفعيل حتى يتم حسمه.", { exact: true }).waitFor();
      assert(await page.getByRole("button", { name: "متابعة لبيانات العميل" }).count() === 0,
        `${label}: blocked Warranty still exposes customer-data continuation.`);
      const holdAudit = await audit(page, `${label}/activation-hold`, mobile);
      await page.screenshot({ path: path.join(artifactDir, `${label}-activation-hold.png`), fullPage: true });

      await page.goto(`${baseUrl}${issueHref}`, { waitUntil: "networkidle" });
      await page.getByRole("heading", { name: "تفاصيل البلاغ", level: 1 }).waitFor();
      await page.getByText("قيد مراجعة الشركة", { exact: true }).waitFor();
      await page.getByText("البلاغ قيد مراجعة الشركة", { exact: true }).waitFor();
      await page.getByRole("heading", { name: "السجل الزمني", level: 2 }).waitFor();
      await page.getByText("تم إرسال البلاغ", { exact: true }).waitFor();
      if (expectedEvidence === 1) {
        await page.getByRole("img", { name: "صورة دليل 1 مرفقة بالبلاغ" }).waitFor();
      } else {
        await page.getByText("لم يرفق المركز صورًا مع هذا البلاغ، وهو مسموح في الإصدار الحالي.", { exact: true }).waitFor();
      }
      const detailAudit = await audit(page, `${label}/issue-detail`, mobile);
      await page.screenshot({ path: path.join(artifactDir, `${label}-issue-detail.png`), fullPage: true });

      await page.goto(`${baseUrl}/operations/rolls/issues/new?roll=${encodeURIComponent(scenario.serialNumber)}`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "تحقق من الرول" }).click();
      await page.getByText("يوجد بلاغ قائم لهذا الرول قيد مراجعة الشركة. لا يمكن إنشاء بلاغ ثانٍ الآن.", { exact: true }).waitFor({ timeout: 30000 });
      assert(await page.getByRole("button", { name: "إرسال البلاغ وإيقاف التفعيل مؤقتًا" }).count() === 0,
        `${label}: active Issue still exposes duplicate submission action.`);
      assert(issueCount(scenario.rollId) === 1, `${label}: duplicate re-resolution changed Issue count.`);

      assert(runtimeErrors.length === 0, `${label}: runtime errors ${JSON.stringify(runtimeErrors)}`);
      assert(failedResponses.length === 0, `${label}: unexpected HTTP failures ${JSON.stringify(failedResponses)}`);

      results.push({
        name: label,
        ok: true,
        rollId: scenario.rollId,
        serialNumber: scenario.serialNumber,
        issueId,
        requestId: issue.request_id,
        category: expectedCategory,
        evidenceCount,
        activationEligibility: activationCandidate.body[0].eligibility,
        candidateAudit,
        formAudit,
        successAudit,
        holdAudit,
        detailAudit,
        failedResponses,
      });
    } catch (error) {
      failures.push({
        name: label,
        error: error instanceof Error ? error.message : String(error),
        diagnostic: await failureSnapshot(page, label),
        runtimeErrors,
        failedResponses,
      });
      results.push({ name: label, ok: false });
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}

fs.writeFileSync(path.join(artifactDir, "summary.json"), `${JSON.stringify({ results, failures }, null, 2)}\n`);
if (failures.length > 0) throw new Error(`ACC-01-E failed: ${JSON.stringify(failures)}`);
console.log(`ACC-01-E PASS: ${results.length}/${fixture.scenarios.length} Pre-install Issue + Activation-hold paths.`);
