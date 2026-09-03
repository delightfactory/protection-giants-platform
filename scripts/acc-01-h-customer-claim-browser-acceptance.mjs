import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const baseUrl = process.env.ACC_BASE_URL?.trim() || "http://127.0.0.1:3000";
const artifactDir = process.env.ACC_H_ARTIFACT_DIR?.trim() || "artifacts/acc-01-h";
const activeRollSerial = process.env.ACC_H_ACTIVE_ROLL_SERIAL?.trim();

if (!activeRollSerial) throw new Error("ACC_H_ACTIVE_ROLL_SERIAL is required for ACC-01-H.");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function dbContainerName() {
  const names = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" })
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
  const name = names.find((value) => value.startsWith("supabase_db_"));
  assert(name, "Supabase database container was not found for ACC-01-H.");
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

function manySql(sql) {
  const raw = querySql(`select row_to_json(q)::text from (${sql}) q;`);
  return raw ? raw.split("\n").filter(Boolean).map((line) => JSON.parse(line)) : [];
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

async function audit(page, label, enforceMobileTargets) {
  const geometry = await page.evaluate((enforce) => {
    const root = document.documentElement;
    const body = document.body;
    const viewportWidth = root.clientWidth;
    const scrollWidth = Math.max(root.scrollWidth, body?.scrollWidth ?? 0);
    const targets = Array.from(document.querySelectorAll(
      "a[href], button, input:not([type='hidden']):not([type='file']), select, textarea, [role='button']",
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
  }, enforceMobileTargets);

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
  try { diagnostic.bodyExcerpt = (await page.locator("body").innerText()).slice(0, 2600); } catch {}
  try { await page.screenshot({ path: path.join(artifactDir, `${filePrefix}-failure.png`), fullPage: true }); } catch {}
  return diagnostic;
}

function assertBodyExcludes(body, values, label) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    assert(!body.includes(String(value)), `${label}: leaked private value ${String(value)}.`);
  }
}

fs.mkdirSync(artifactDir, { recursive: true });

const roll = oneSql(`
  select r.id::text as id, r.serial_number, identity.public_code
  from public.rolls r
  join private.roll_public_identities identity on identity.roll_id = r.id
  where r.serial_number = ${sqlText(activeRollSerial)}
`, "H active Roll");

const warranty = oneSql(`
  select
    w.id::text as id,
    w.warranty_number,
    w.record_state,
    w.product_name_snapshot,
    w.customer_name,
    w.customer_phone,
    w.customer_email,
    w.vehicle_make,
    w.vehicle_model,
    w.vehicle_year,
    w.vehicle_plate,
    w.vehicle_color,
    w.vehicle_vin,
    w.coverage_expires_at::text as coverage_expires_at
  from public.warranties w
  where w.roll_id = ${sqlUuid(roll.id)} and w.record_state = 'issued'
`, "H authoritative Warranty");

assert(warranty.record_state === "issued", "H requires one issued Warranty from ACC-01-F.");
assert(Date.parse(warranty.coverage_expires_at) > Date.now(), "H requires an active Warranty.");
assert(/^\+[1-9][0-9]{4,14}$/.test(warranty.customer_phone), "H Warranty phone must already be canonical international identity.");

const claimBaseline = countSql(`select id from public.warranty_claims where warranty_id = ${sqlUuid(warranty.id)}`);
assert(claimBaseline === 0, `H requires zero Claims before intake; found ${claimBaseline}.`);

const runtimeErrors = [];
const failedResponses = [];
const audits = {};
let mobilePage;
let desktopPage;
let mobileFailure = null;
let desktopFailure = null;

const browser = await chromium.launch({ headless: true });
try {
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    locale: "ar-EG",
  });
  mobilePage = await mobileContext.newPage();
  attachDiagnostics(mobilePage, "mobile", runtimeErrors, failedResponses);

  try {
    await mobilePage.goto(`${baseUrl}/w/${roll.public_code}/claim`, { waitUntil: "networkidle" });
    await mobilePage.getByRole("heading", { name: "تحقق من رقم الهاتف" }).waitFor();
    audits.mobileVerification = await audit(mobilePage, "H mobile verification", true);

    const wrongPhone = warranty.customer_phone === "+201000000001" ? "+201000000002" : "+201000000001";
    await mobilePage.getByLabel("رقم الهاتف المسجل — بصيغة دولية").fill(wrongPhone);
    await mobilePage.getByRole("button", { name: "متابعة" }).click();
    await mobilePage.getByRole("alert").getByText("تعذر التحقق", { exact: false }).waitFor();
    assert(countSql(`select id from public.warranty_claims where warranty_id = ${sqlUuid(warranty.id)}`) === 0,
      "Wrong-phone verification mutated Claim state.");

    await mobilePage.getByLabel("رقم الهاتف المسجل — بصيغة دولية").fill(warranty.customer_phone);
    await mobilePage.getByRole("button", { name: "متابعة" }).click();
    await mobilePage.getByText("ضمان تم التحقق منه", { exact: true }).waitFor();
    await mobilePage.getByRole("heading", { name: warranty.product_name_snapshot, exact: true }).first().waitFor();
    await mobilePage.getByRole("heading", { name: "صف لنا المشكلة" }).waitFor();

    const verifiedBody = await mobilePage.locator("body").innerText();
    assert(verifiedBody.includes(warranty.warranty_number), "Verified Claim surface omitted Warranty Number.");
    assert(verifiedBody.includes(warranty.vehicle_make), "Verified Claim surface omitted safe vehicle make context.");
    assert(verifiedBody.includes(warranty.vehicle_model), "Verified Claim surface omitted safe vehicle model context.");
    assertBodyExcludes(verifiedBody, [
      warranty.customer_name,
      warranty.customer_phone,
      warranty.customer_email,
      warranty.vehicle_vin,
      warranty.vehicle_plate,
      warranty.vehicle_color,
      warranty.id,
      roll.id,
    ], "verified Claim surface");

    const submitTrigger = mobilePage.getByRole("button", { name: "إرسال المطالبة" });
    assert(await submitTrigger.isDisabled(), "Claim submit must remain disabled before required evidence exists.");
    audits.mobileVerified = await audit(mobilePage, "H mobile verified claim form", true);

    await mobilePage.getByLabel("نوع المشكلة").selectOption("bubbling");
    await mobilePage.getByLabel("الجزء أو المنطقة المتأثرة").fill("غطاء المحرك — الجهة اليمنى");
    await mobilePage.getByLabel("وصف المشكلة").fill("ظهرت فقاعات واضحة في طبقة الحماية بعد التركيب وتحتاج مراجعة الشركة.");

    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );
    await mobilePage.locator('input[type="file"]').setInputFiles({
      name: "acc-01-h-evidence.png",
      mimeType: "image/png",
      buffer: png,
    });
    await mobilePage.getByText("acc-01-h-evidence.png", { exact: true }).waitFor();
    assert(!(await submitTrigger.isDisabled()), "Claim submit should enable after one valid local evidence image is reviewed.");

    await submitTrigger.click();
    const dialog = mobilePage.getByRole("dialog");
    await dialog.getByRole("heading", { name: /إرسال المطالبة مع 1 صورة/ }).waitFor();
    await dialog.getByRole("button", { name: "تأكيد وإرسال المطالبة" }).click();

    await mobilePage.getByText("تم الاستلام بنجاح", { exact: true }).waitFor({ timeout: 30000 });
    const successBox = mobilePage.getByRole("status");
    const successText = await successBox.innerText();
    const claimNumberMatch = successText.match(/PG-C-[0-9]{8,}/);
    assert(claimNumberMatch, `Success surface did not expose a stable Claim Number: ${successText}`);
    const claimNumber = claimNumberMatch[0];

    await mobilePage.screenshot({ path: path.join(artifactDir, "mobile-claim-submitted.png"), fullPage: true });
    audits.mobileSuccess = await audit(mobilePage, "H mobile claim success", true);

    const claim = oneSql(`
      select
        c.id::text as id,
        c.request_id::text as request_id,
        c.warranty_id::text as warranty_id,
        c.claim_number,
        c.category::text as category,
        c.affected_area,
        c.description,
        c.status::text as status,
        c.submitted_at::text as submitted_at,
        c.closed_at::text as closed_at
      from public.warranty_claims c
      where c.warranty_id = ${sqlUuid(warranty.id)}
    `, "H submitted Claim");

    assert(claim.claim_number === claimNumber, "Rendered Claim Number differs from authoritative Claim row.");
    assert(claim.warranty_id === warranty.id, "Claim is not bound to the verified Warranty.");
    assert(claim.category === "bubbling", `Unexpected Claim category ${claim.category}.`);
    assert(claim.affected_area === "غطاء المحرك — الجهة اليمنى", "Claim affected area changed before persistence.");
    assert(claim.description === "ظهرت فقاعات واضحة في طبقة الحماية بعد التركيب وتحتاج مراجعة الشركة.", "Claim description changed before persistence.");
    assert(claim.status === "submitted", `New Claim must be submitted, got ${claim.status}.`);
    assert(claim.closed_at === null, "New Claim must remain open.");
    assert(/^[0-9a-f-]{36}$/i.test(claim.request_id), "Claim request id is missing.");
    assert(/^PG-C-[0-9]{8,}$/.test(claim.claim_number), `Claim Number shape invalid: ${claim.claim_number}.`);
    assert(countSql(`select id from public.warranty_claims where warranty_id = ${sqlUuid(warranty.id)} and closed_at is null`) === 1,
      "Warranty must have exactly one open Claim after intake.");

    const event = oneSql(`
      select
        e.id::text as id,
        e.action_request_id::text as action_request_id,
        e.event_kind::text as event_kind,
        e.actor_profile_id::text as actor_profile_id,
        e.actor_kind::text as actor_kind,
        e.reason,
        e.event_data,
        e.created_at::text as created_at
      from public.warranty_claim_events e
      where e.claim_id = ${sqlUuid(claim.id)} and e.event_kind = 'submitted'
    `, "H submitted Claim event");
    assert(event.action_request_id === claim.request_id, "Claim submitted event must share intake request identity.");
    assert(event.actor_profile_id === null, "Customer verified-phone event must not invent an authenticated Profile.");
    assert(event.actor_kind === "customer_verified_phone", `Unexpected Claim event actor ${event.actor_kind}.`);
    assert(event.reason === null, "Submitted Claim event must not contain a decision reason.");
    assert(Number(event.event_data?.evidence_count) === 1, `Claim event evidence count mismatch: ${JSON.stringify(event.event_data)}.`);
    assert(countSql(`select id from public.warranty_claim_events where claim_id = ${sqlUuid(claim.id)} and event_kind = 'submitted'`) === 1,
      "Claim must have exactly one submitted event.");

    const evidence = oneSql(`
      select id::text as id, claim_id::text as claim_id, evidence_kind, storage_path, mime_type, size_bytes, created_at::text as created_at
      from public.warranty_claim_evidence
      where claim_id = ${sqlUuid(claim.id)}
    `, "H committed Claim evidence");
    assert(evidence.evidence_kind === "customer_submission", `Unexpected evidence kind ${evidence.evidence_kind}.`);
    assert(evidence.mime_type === "image/png", `Unexpected evidence MIME ${evidence.mime_type}.`);
    assert(Number(evidence.size_bytes) === png.length, `Evidence size mismatch ${evidence.size_bytes} vs ${png.length}.`);
    assert(/^[0-9a-f-]{36}\/[0-9a-f]{64}\.png$/i.test(evidence.storage_path), `Evidence path is not server-owned draft/hash identity: ${evidence.storage_path}.`);
    assertBodyExcludes(evidence.storage_path, [
      roll.public_code,
      warranty.customer_name,
      warranty.customer_phone,
      warranty.customer_email,
      warranty.vehicle_vin,
      warranty.vehicle_plate,
      claim.claim_number,
    ], "Claim evidence object path");
    assert(countSql(`select id from storage.objects where bucket_id = 'warranty-claim-evidence' and name = ${sqlText(evidence.storage_path)}`) === 1,
      "Committed Claim evidence Storage object is missing.");

    const draft = oneSql(`
      select id::text as id, warranty_id::text as warranty_id, state, submitted_claim_id::text as submitted_claim_id
      from private.warranty_claim_drafts
      where submitted_claim_id = ${sqlUuid(claim.id)}
    `, "H submitted Claim draft tombstone");
    assert(draft.state === "submitted", `Claim draft should end as submitted tombstone, got ${draft.state}.`);
    assert(draft.warranty_id === warranty.id, "Submitted Claim draft Warranty mismatch.");
    assert(countSql(`select storage_path from private.warranty_claim_draft_evidence where draft_id = ${sqlUuid(draft.id)}`) === 0,
      "Transient Claim draft evidence rows must be removed after commit.");

    const notifications = manySql(`
      select
        n.recipient_profile_id::text as recipient_profile_id,
        n.event_type,
        n.source_domain,
        n.source_event_key,
        n.attention_level,
        n.title,
        n.body,
        n.action_path,
        n.push_eligible
      from public.notifications n
      where n.event_type = 'warranty.claim_submitted'
        and n.source_domain = 'warranty_claim'
        and n.source_event_key = ${sqlText(`warranty_claim_events:${event.id}`)}
      order by n.recipient_profile_id
    `);
    assert(notifications.length >= 1, "Submitted Claim did not create a durable Admin notification.");
    for (const notification of notifications) {
      assert(notification.attention_level === "action_required", "Claim notification must be action_required.");
      assert(notification.action_path === `/operations/claims/${claim.id}/review`, `Claim notification handoff changed: ${notification.action_path}.`);
      assert(notification.push_eligible === true, "Claim submitted notification must remain push eligible.");
      assert(notification.title === "مطالبة ضمان جديدة تحتاج مراجعة", `Unexpected Claim notification title: ${notification.title}.`);
      assert(notification.body.includes(claim.claim_number), "Claim notification body omitted Claim Number.");
      assertBodyExcludes(notification.body, [warranty.customer_phone, warranty.customer_email, warranty.vehicle_vin], "Admin Claim notification body");
    }

    await mobilePage.reload({ waitUntil: "networkidle" });
    await mobilePage.getByText("المطالبة الحالية", { exact: true }).waitFor();
    await mobilePage.getByText(claim.claim_number, { exact: true }).waitFor();
    await mobilePage.getByText("لا يمكن إنشاء مطالبة أخرى قبل إغلاق المطالبة الحالية.", { exact: true }).waitFor();
    assert(await mobilePage.getByRole("heading", { name: "صف لنا المشكلة" }).count() === 0,
      "Open Claim must suppress the new-Claim form.");
    assert(countSql(`select id from public.warranty_claims where warranty_id = ${sqlUuid(warranty.id)}`) === 1,
      "Reload duplicated the Claim.");
    audits.mobileOpenClaim = await audit(mobilePage, "H mobile open Claim status", true);

    await mobilePage.goto(`${baseUrl}/w/${roll.public_code}`, { waitUntil: "networkidle" });
    const publicWarrantyBody = await mobilePage.locator("body").innerText();
    assert(!publicWarrantyBody.includes(claim.claim_number), "Public Warranty surface leaked Claim Number without phone verification.");
    assertBodyExcludes(publicWarrantyBody, [claim.id, warranty.customer_phone, warranty.vehicle_vin], "Public Warranty after Claim");

    const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "ar-EG" });
    desktopPage = await desktopContext.newPage();
    attachDiagnostics(desktopPage, "desktop", runtimeErrors, failedResponses);

    await desktopPage.goto(`${baseUrl}/w/${roll.public_code}/claim`, { waitUntil: "networkidle" });
    await desktopPage.getByLabel("رقم الهاتف المسجل — بصيغة دولية").fill(warranty.customer_phone);
    await desktopPage.getByRole("button", { name: "متابعة" }).click();
    await desktopPage.getByText("المطالبة الحالية", { exact: true }).waitFor();
    await desktopPage.getByText(claim.claim_number, { exact: true }).waitFor();
    await desktopPage.getByText("تم استلام المطالبة", { exact: true }).waitFor();
    await desktopPage.getByText("1", { exact: true }).first().waitFor();
    audits.desktopOpenClaim = await audit(desktopPage, "H desktop open Claim status", false);
    await desktopPage.screenshot({ path: path.join(artifactDir, "desktop-open-claim.png"), fullPage: true });

    fs.writeFileSync(path.join(artifactDir, "summary.json"), JSON.stringify({
      roll: { serialNumber: roll.serial_number, publicCode: roll.public_code },
      warranty: { id: warranty.id, warrantyNumber: warranty.warranty_number },
      claim,
      event,
      evidence,
      notificationCount: notifications.length,
      audits,
      runtimeErrors,
      failedResponses,
    }, null, 2));
  } catch (error) {
    mobileFailure = mobilePage ? await failureSnapshot(mobilePage, "mobile") : null;
    if (desktopPage) desktopFailure = await failureSnapshot(desktopPage, "desktop");
    throw error;
  }

  assert(runtimeErrors.length === 0, `Runtime browser errors: ${JSON.stringify(runtimeErrors)}`);
  const unexpectedFailures = failedResponses.filter((item) => !item.url.includes("/_next/image"));
  assert(unexpectedFailures.length === 0, `Unexpected HTTP failures: ${JSON.stringify(unexpectedFailures)}`);
} catch (error) {
  fs.writeFileSync(path.join(artifactDir, "failure.json"), JSON.stringify({
    message: error instanceof Error ? error.message : String(error),
    mobileFailure,
    desktopFailure,
    runtimeErrors,
    failedResponses,
  }, null, 2));
  throw error;
} finally {
  await browser.close();
}

console.log("ACC-01-H customer Warranty Claim browser acceptance passed.");
