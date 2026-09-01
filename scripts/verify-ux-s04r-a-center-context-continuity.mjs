import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function includes(source, snippet, message) {
  assert.ok(source.includes(snippet), `${message}: expected ${JSON.stringify(snippet)}`);
}

function excludes(source, snippet, message) {
  assert.ok(!source.includes(snippet), `${message}: forbidden ${JSON.stringify(snippet)}`);
}

const openingPage = read("app/operations/rolls/open/page.tsx");
const openingFlow = read("components/rolls/roll-opening-flow.tsx");
const issueNewPage = read("app/operations/rolls/issues/new/page.tsx");
const issueFlow = read("components/rolls/roll-preinstall-issue-flow.tsx");
const issueDetail = read("app/operations/rolls/issues/[id]/page.tsx");
const inspectionDetail = read("app/operations/claim-inspections/[id]/page.tsx");
const resolutionTask = read("app/operations/claim-resolution-tasks/[id]/page.tsx");
const warrantyActivationPage = read("app/operations/warranties/activate/page.tsx");

includes(openingPage, 'searchParams: Promise<{ roll?: string; task?: string }>', "Opening page bounded context contract");
includes(openingPage, 'normalizeRollSerial(params.roll ?? "")', "Opening page Roll context normalization");
includes(openingPage, 'UUID_PATTERN.test(params.task ?? "")', "Opening page task context must be UUID-bounded");
includes(openingPage, 'href={taskHref ?? "/operations/rolls"}', "Opening page exact task return");
includes(openingPage, "initialSerial={initialSerial}", "Opening flow must receive exact Roll context");
includes(openingPage, "taskId={taskId}", "Opening flow must receive bounded task context");

includes(openingFlow, 'initialSerial = ""', "Opening flow initial Roll contract");
includes(openingFlow, 'taskId = null', "Opening flow task contract");
includes(openingFlow, 'useState(() => normalizeRollSerial(initialSerial) ?? "")', "Opening flow must preserve normalized Roll input");
includes(openingFlow, '/operations/warranties/activate?roll=${encodedSerial}', "Normal opening must continue to Warranty Activation with exact Roll");
includes(openingFlow, '/operations/rolls/issues/new?roll=${encodedSerial}${taskSuffix}', "Opening must continue to pre-install issue with exact Roll/task context");
includes(openingFlow, '/operations/claim-resolution-tasks/${taskId}', "Replacement opening must return to exact assigned task");
includes(openingFlow, "مع بقاء الحيازة الحالية للمركز بدون تغيير", "Opening UX must not imply custody movement");

includes(issueNewPage, 'searchParams: Promise<{ roll?: string; task?: string }>', "Issue page bounded context contract");
includes(issueNewPage, 'normalizeRollSerial(params.roll ?? "")', "Issue page Roll context normalization");
includes(issueNewPage, 'UUID_PATTERN.test(params.task ?? "")', "Issue page task context must be UUID-bounded");
includes(issueNewPage, 'href={taskHref ?? "/operations/rolls/issues"}', "Issue page exact task return");
includes(issueNewPage, "initialSerial={initialSerial}", "Issue flow must receive exact Roll context");
includes(issueNewPage, "taskId={taskId}", "Issue flow must receive bounded task context");

includes(issueFlow, 'useState(() => normalizeRollSerial(initialSerial) ?? "")', "Issue flow must preserve normalized Roll input");
includes(issueFlow, '/operations/claim-resolution-tasks/${taskId}', "Issue flow must return to exact replacement task");
includes(issueFlow, '/operations/rolls/issues/${completedIssueId}?task=${encodeURIComponent(taskId)}', "Replacement issue detail must retain bounded task context");
includes(issueFlow, "لا تكمل استخدام الرول أو إغلاق المهمة حتى تحسم الشركة البلاغ", "Replacement issue must explicitly block physical continuation");

includes(warrantyActivationPage, 'searchParams: Promise<{ roll?: string }>', "Warranty Activation must accept exact Roll continuation");
includes(warrantyActivationPage, 'initialSerial={initialSerial}', "Warranty Activation must preserve Roll context");
includes(issueDetail, 'searchParams: Promise<{ task?: string }>', "Issue detail bounded task context contract");
includes(issueDetail, 'profile.role === "center" && uuidPattern.test(requestedTaskId)', "Issue detail task context must be UUID-bounded and Center-only");
includes(issueDetail, 'href={taskHref ?? "/operations/rolls/issues"}', "Issue detail must return to exact replacement task when present");
includes(issueDetail, '/operations/warranties/activate?roll=${encodeURIComponent(issue.serial_number)}', "Cleared ordinary Center issue must continue to Warranty Activation with exact Roll");
includes(issueDetail, 'issue.status === "cleared_for_use" || issue.status === "reported_in_error"', "Only non-blocking issue outcomes may offer continuation");
includes(issueDetail, "العودة إلى مهمة التنفيذ", "Replacement issue outcomes must return to the exact task rather than Warranty Activation");
includes(issueDetail, "لا تستخدم الرول. انتظر تنسيق الشركة لاسترداده", "Return-required issue must explicitly block physical use");
includes(issueDetail, "قرار الإرجاع لا ينقل العهدة", "Return-required issue must not imply custody movement");

includes(inspectionDetail, "<LocalDateTime value={inspection.requested_at} />", "Inspection request instant must stay viewer-local");
excludes(inspectionDetail, "Africa/Cairo", "Inspection must not force Cairo time");

includes(resolutionTask, "<LocalDateTime value={task.assigned_at} />", "Resolution assignment instant must stay viewer-local");
excludes(resolutionTask, "Africa/Cairo", "Resolution task must not force Cairo time");
includes(resolutionTask, "replacementTaskContext", "Replacement task must build bounded physical detour context");
includes(resolutionTask, "roll=${encodeURIComponent(task.replacement_roll_serial)}&task=${encodeURIComponent(task.resolution_id)}", "Replacement detours must preserve exact Roll and task");
includes(resolutionTask, "/operations/rolls/open?${replacementTaskContext}", "Replacement opening must receive exact context");
includes(resolutionTask, "/operations/rolls/issues/new?${replacementTaskContext}", "Replacement issue must receive exact context");
excludes(resolutionTask, "Cube J", "Center physical guidance must not expose internal Cube names");
excludes(resolutionTask, "Cube K", "Center physical guidance must not expose internal Cube names");
includes(resolutionTask, "لا تستخدم الرول ولا تغلق المهمة قبل حسم بلاغ الجودة الحالي", "Pending quality must block use and completion");
includes(resolutionTask, "لا تستخدم هذا الرول. صدر له قرار إرجاع", "Return-required replacement must block use");

for (const source of [openingPage, openingFlow, issueNewPage, issueFlow, issueDetail, resolutionTask]) {
  excludes(source, "returnTo", "S04R-A must not introduce an arbitrary return URL channel");
  excludes(source, "return_url", "S04R-A must not introduce an arbitrary return URL channel");
  excludes(source, "redirectTo", "S04R-A must not introduce an arbitrary return URL channel");
}

console.log("UX-S04R-A Center context continuity contracts verified.");
