import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function indexOfOrThrow(source, needle, message) {
  const index = source.indexOf(needle);
  assert(index >= 0, message);
  return index;
}

const ownAction = read("app/operations/account/actions.ts");
const ownPage = read("app/operations/account/page.tsx");
const nav = read("components/operations-nav.tsx");
const confirm = read("components/ui/confirm-submit-button.tsx");
const usersList = read("app/operations/users/page.tsx");
const userEdit = read("app/operations/users/[id]/edit/page.tsx");

// Self-service password change must remain authenticated, use the existing password policy,
// validate confirmation server-side, and only then update the current Supabase Auth user.
const authGuard = indexOfOrThrow(ownAction, "await requireOperationalProfile()", "Self-service password change must require an operational profile.");
const newPasswordParse = indexOfOrThrow(ownAction, 'parseOperationalUserPassword(formData, "new_password")', "New password must use the existing operational-user password parser.");
const confirmationParse = indexOfOrThrow(ownAction, 'parseOperationalUserPassword(formData, "confirm_password")', "Password confirmation must use the existing operational-user password parser.");
const mismatchGuard = indexOfOrThrow(ownAction, "password !== confirmation", "Password confirmation mismatch must be rejected server-side.");
const authUpdate = indexOfOrThrow(ownAction, "supabase.auth.updateUser({ password })", "Self-service password change must update the authenticated Supabase user.");
assert(authGuard < newPasswordParse && newPasswordParse < confirmationParse && confirmationParse < mismatchGuard && mismatchGuard < authUpdate,
  "Self-service password checks must occur before the authoritative Auth mutation.");

// Account UI must expose two bounded password fields, clear feedback, and an explicit confirmation.
assert(ownPage.includes('name="new_password"') && ownPage.includes('name="confirm_password"'), "Account page must collect and confirm the new password.");
assert((ownPage.match(/minLength=\{12\}/g) ?? []).length === 2, "Both self-service password fields must enforce the existing 12-character minimum in the browser.");
assert((ownPage.match(/maxLength=\{128\}/g) ?? []).length === 2, "Both self-service password fields must enforce the existing 128-character maximum in the browser.");
assert(ownPage.includes("<ConfirmSubmitButton") && ownPage.includes("تأكيد التغيير"), "Self-service password replacement must require explicit confirmation.");
assert(ownPage.includes("تم تغيير كلمة المرور بنجاح"), "Self-service password change must provide explicit success feedback.");
assert(nav.match(/href="\/operations\/account"/g)?.length === 2, "Account security must be reachable from both desktop and mobile user identity surfaces.");

// Shared confirmation may be conditional only when explicit sensitive-field baselines are supplied.
assert(confirm.includes("confirmWhenChanged?: readonly ConfirmWhenChangedField[]"), "ConfirmSubmitButton must expose the optional sensitive-change contract.");
const formDataRead = indexOfOrThrow(confirm, "const submitted = new FormData(form)", "Conditional confirmation must inspect the actual submitted form values.");
const sensitiveChange = indexOfOrThrow(confirm, "const sensitiveChange = confirmWhenChanged.some", "Conditional confirmation must compare the configured sensitive fields.");
const directSubmit = indexOfOrThrow(confirm, "if (!sensitiveChange)", "Non-sensitive edits must be allowed to submit without confirmation friction.");
const showDialog = indexOfOrThrow(confirm, "dialogRef.current?.showModal()", "Sensitive changes must still use native dialog confirmation.");
assert(formDataRead < sensitiveChange && sensitiveChange < directSubmit && directSubmit < showDialog,
  "Conditional confirmation must decide before opening the native dialog.");

// Role/entity binding is the only conditional part of ordinary profile editing.
assert(userEdit.includes('name: "role"') && userEdit.includes('name: "country_agent_id"') && userEdit.includes('name: "dealer_id"') && userEdit.includes('name: "installation_center_id"'),
  "Operational role and every entity binding must be covered by conditional confirmation.");
assert(!userEdit.includes('name: "display_name", initialValue:'), "Display-name-only edits must not be promoted to sensitive confirmation.");
assert(!userEdit.includes('name: "phone", initialValue:'), "Phone-only edits must not be promoted to sensitive confirmation.");

// Existing Admin emergency controls remain intact but receive explicit confirmation.
for (const label of [
  "تغيير بريد تسجيل الدخول؟",
  "إعادة ضبط كلمة مرور هذا الحساب؟",
  "إيقاف الحساب؟",
  "إعادة تفعيل الحساب؟",
]) {
  assert(userEdit.includes(label), `User edit screen is missing explicit confirmation: ${label}`);
}
assert(usersList.includes('title={isActive ? "إيقاف الحساب؟" : "إعادة تفعيل الحساب؟"}'), "User list must confirm both suspension and reactivation.");
assert(!usersList.includes('type="submit" className="button button-primary">إعادة التفعيل</button>'), "User list must not reintroduce unconfirmed reactivation.");

console.log("ID-01 account-security contracts verified: self-service password change and sensitive-change confirmations are constrained to the frozen scope.");
