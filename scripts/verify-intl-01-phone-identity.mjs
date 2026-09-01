import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function dbContainerName() {
  const names = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" })
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
  const name = names.find((value) => value.startsWith("supabase_db_"));
  assert(name, "Supabase database container was not found for INTL-01 verification.");
  return name;
}

function querySql(sql) {
  return execFileSync(
    "docker",
    [
      "exec", "-i", dbContainerName(), "psql", "-At", "-v", "ON_ERROR_STOP=1",
      "-U", "postgres", "-d", "postgres", "-c", sql,
    ],
    { encoding: "utf8" },
  ).trim();
}

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function normalizeViaDb(value) {
  return querySql(`
    select coalesce(private.normalize_warranty_claim_phone(${sqlText(value)}), '<NULL>');
  `);
}

const canonicalCases = [
  ["+201012345678", "+201012345678"],
  ["00201012345678", "+201012345678"],
  [" +٢٠ (١٠) ١٢٣٤-٥٦٧٨ ", "+201012345678"],
  ["+۲۰ ۱۰ ۱۲۳۴ ۵۶۷۸", "+201012345678"],
  ["+971 50 123 4567", "+971501234567"],
];

for (const [input, expected] of canonicalCases) {
  const actual = normalizeViaDb(input);
  assert(actual === expected, `INTL-01 expected ${JSON.stringify(input)} -> ${expected}, got ${actual}.`);
}

for (const input of [
  "01012345678",
  "0501234567",
  "+0201012345678",
  "+20ABC123456",
  "+",
  "",
]) {
  const actual = normalizeViaDb(input);
  assert(actual === "<NULL>", `INTL-01 must reject ambiguous/malformed phone ${JSON.stringify(input)}, got ${actual}.`);
}

for (const role of ["public", "anon", "authenticated", "service_role"]) {
  const helperAllowed = querySql(`
    select has_function_privilege(
      ${sqlText(role)},
      'private.normalize_warranty_claim_phone(text)'::regprocedure,
      'EXECUTE'
    );
  `);
  assert(helperAllowed === "f", `${role} must not execute the private INTL-01 normalization helper.`);
}

const activationSignature =
  "public.activate_roll_warranty(uuid,text,text,text,text,text,text,smallint,text,text,text)";
const correctionSignature =
  "public.correct_warranty_details(uuid,uuid,text,text,text,text,text,smallint,text,text,text,text)";

assert(querySql(`select has_function_privilege('authenticated', '${activationSignature}', 'EXECUTE');`) === "t",
  "Authenticated Center boundary must retain explicit Warranty Activation execute privilege.");
assert(querySql(`select has_function_privilege('authenticated', '${correctionSignature}', 'EXECUTE');`) === "t",
  "Authenticated Admin boundary must retain explicit Warranty correction execute privilege.");

for (const role of ["anon", "service_role"]) {
  assert(querySql(`select has_function_privilege('${role}', '${activationSignature}', 'EXECUTE');`) === "f",
    `${role} must not execute the public Warranty Activation boundary.`);
  assert(querySql(`select has_function_privilege('${role}', '${correctionSignature}', 'EXECUTE');`) === "f",
    `${role} must not execute the public Warranty correction boundary.`);
}

const privateActivationSignature =
  "private.activate_roll_warranty_pre_intl01(uuid,text,text,text,text,text,text,smallint,text,text,text)";
const privateCorrectionSignature =
  "private.correct_warranty_details_pre_intl01(uuid,uuid,text,text,text,text,text,smallint,text,text,text,text)";

for (const role of ["public", "anon", "authenticated", "service_role"]) {
  assert(querySql(`select has_function_privilege('${role}', '${privateActivationSignature}', 'EXECUTE');`) === "f",
    `${role} must not bypass INTL-01 through the private activation continuation.`);
  assert(querySql(`select has_function_privilege('${role}', '${privateCorrectionSignature}', 'EXECUTE');`) === "f",
    `${role} must not bypass INTL-01 through the private correction continuation.`);
}

const activationDefinition = querySql(`select pg_get_functiondef('${activationSignature}'::regprocedure);`);
const correctionDefinition = querySql(`select pg_get_functiondef('${correctionSignature}'::regprocedure);`);
assert(activationDefinition.includes("private.normalize_warranty_claim_phone"),
  "Public Warranty Activation must canonicalize phone identity before delegation.");
assert(activationDefinition.includes("private.activate_roll_warranty_pre_intl01"),
  "Public Warranty Activation must delegate to the qualified private engine.");
assert(correctionDefinition.includes("private.normalize_warranty_claim_phone"),
  "Public Warranty correction must canonicalize phone identity before delegation.");
assert(correctionDefinition.includes("private.correct_warranty_details_pre_intl01"),
  "Public Warranty correction must delegate to the qualified audited engine.");

const helperSource = readFileSync("lib/warranty/international-phone.ts", "utf8");
const activationUi = readFileSync("components/warranties/warranty-activation-flow.tsx", "utf8");
const supportUi = readFileSync("components/warranties/admin-warranty-support.tsx", "utf8");
const claimUi = readFileSync("app/(public)/w/[publicCode]/claim/claim-client.tsx", "utf8");

assert(helperSource.includes("INTERNATIONAL_PHONE_GUIDANCE_AR"),
  "INTL-01 shared customer guidance is missing.");
assert(activationUi.includes("normalizeInternationalPhone") && activationUi.includes("INTERNATIONAL_PHONE_GUIDANCE_AR"),
  "Warranty Activation UI must use the shared INTL-01 phone contract/guidance.");
assert(supportUi.includes("normalizeInternationalPhone") && supportUi.includes("INTERNATIONAL_PHONE_GUIDANCE_AR"),
  "Admin Warranty correction UI must use the shared INTL-01 phone contract/guidance.");
assert(claimUi.includes("normalizeInternationalPhone") && claimUi.includes("INTERNATIONAL_PHONE_GUIDANCE_AR"),
  "Customer Claim verification UI must use the shared INTL-01 phone contract/guidance.");
assert(!claimUi.includes("01xxxxxxxxx"),
  "Customer Claim verification must not regress to an Egypt-local phone placeholder.");

console.log("INTL-01 international phone identity contracts verified.");
