// Historical path retained so Database Quality wiring remains stable.
// BAR-01 replaces the obsolete GS1-only GTIN contract with Product Barcode V1
// while preserving the Cube E public Roll resolver/privacy regressions.

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function dbContainerName() {
  const names = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" })
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
  const name = names.find((value) => value.startsWith("supabase_db_"));
  assert(name, "Supabase database container was not found for BAR-01 verification.");
  return name;
}

function runSql(sql, { tuplesOnly = false } = {}) {
  const args = [
    "exec",
    "-i",
    dbContainerName(),
    "psql",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    "postgres",
    "-d",
    "postgres",
  ];
  if (tuplesOnly) args.push("-At");
  return execFileSync("docker", args, {
    input: sql,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
}

function scalar(sql) {
  return runSql(`${sql.trim().replace(/;$/, "")};\n`, { tuplesOnly: true }).trim();
}

function expectSqlFailure(sql, expectedMessage, label) {
  let output = "";
  let failed = false;
  try {
    runSql(sql);
  } catch (error) {
    failed = true;
    output = `${error?.stdout ?? ""}\n${error?.stderr ?? ""}\n${error?.message ?? ""}`;
  }
  assert(failed, `${label} unexpectedly succeeded.`);
  assert(output.includes(expectedMessage), `${label} failed for the wrong reason: ${output}`);
}

function sqlUuid(value) {
  assert(/^[0-9a-f-]{36}$/i.test(value), `Unsafe UUID fixture value: ${value}`);
  return `'${value}'::uuid`;
}

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function anonScalar(sql) {
  return runSql(`set role anon;\n${sql.trim().replace(/;$/, "")};\nreset role;\n`, { tuplesOnly: true }).trim();
}

assert(
  scalar(`
    select count(*)
    from pg_constraint
    where conrelid = 'public.products'::regclass
      and conname = 'products_gtin_valid'
  `) === "0",
  "Obsolete GS1-only products_gtin_valid constraint still exists.",
);

assert(
  scalar(`
    select count(*)
    from pg_constraint
    where conrelid = 'public.products'::regclass
      and conname = 'products_barcode_v1_valid'
  `) === "1",
  "Product Barcode V1 database constraint is missing.",
);

const barcodeConstraint = scalar(`
  select pg_get_constraintdef(oid)
  from pg_constraint
  where conrelid = 'public.products'::regclass
    and conname = 'products_barcode_v1_valid'
`);
assert(
  barcodeConstraint.includes("{1,32}"),
  `Barcode constraint does not enforce the 1-32 digit boundary: ${barcodeConstraint}`,
);
assert(!barcodeConstraint.includes("is_valid_gtin"), "Barcode constraint still delegates to GS1 GTIN validation.");

const uniqueIndex = scalar(`
  select indexdef
  from pg_indexes
  where schemaname = 'public'
    and tablename = 'products'
    and indexname = 'products_gtin_unique'
`);
assert(uniqueIndex.includes("CREATE UNIQUE INDEX"), "Non-null Product Barcode uniqueness index is missing.");
assert(
  uniqueIndex.includes("gtin IS NOT NULL"),
  `Product Barcode uniqueness index lost its partial-null contract: ${uniqueIndex}`,
);

assert(
  scalar(`
    select count(*)
    from pg_trigger as trigger
    where trigger.tgrelid = 'public.products'::regclass
      and trigger.tgfoid = 'private.prevent_produced_product_gtin_change()'::regprocedure
      and not trigger.tgisinternal
  `) === "1",
  "Produced Product Barcode identity lock trigger is missing.",
);

const lockFunction = scalar(`
  select pg_get_functiondef('private.prevent_produced_product_gtin_change()'::regprocedure)
`);
assert(
  lockFunction.includes("barcode is locked after assignment"),
  "Produced Product lock function was not upgraded to the Barcode V1 contract.",
);

const fixtureA = randomUUID();
const fixtureB = randomUUID();
const suffixA = fixtureA.replaceAll("-", "").slice(0, 10);
const suffixB = fixtureB.replaceAll("-", "").slice(0, 10);

runSql(`
insert into public.products (
  id,
  code,
  gtin,
  name,
  slug,
  product_type,
  category,
  version_name,
  width_mm,
  length_m,
  thickness_mil,
  weight_kg,
  origin_country,
  default_warranty_months,
  marketing_description,
  technical_description,
  warranty_coverage,
  care_instructions,
  publication_status
) values
(
  ${sqlUuid(fixtureA)},
  ${sqlText(`BAR01-${suffixA.toUpperCase()}`)},
  null,
  'BAR-01 validation fixture A',
  ${sqlText(`bar01-${suffixA}`)},
  'PPF',
  'Paint Protection Film',
  'BAR-01',
  1524,
  15,
  7.5,
  12.5,
  'USA',
  120,
  'BAR-01 validation fixture.',
  'BAR-01 validation fixture.',
  'BAR-01 test coverage.',
  'BAR-01 test care.',
  'draft'
),
(
  ${sqlUuid(fixtureB)},
  ${sqlText(`BAR01-${suffixB.toUpperCase()}`)},
  null,
  'BAR-01 validation fixture B',
  ${sqlText(`bar01-${suffixB}`)},
  'PPF',
  'Paint Protection Film',
  'BAR-01',
  1524,
  15,
  7.5,
  12.5,
  'USA',
  120,
  'BAR-01 validation fixture.',
  'BAR-01 validation fixture.',
  'BAR-01 test coverage.',
  'BAR-01 test care.',
  'draft'
);
`);

assert(
  scalar(`select coalesce(gtin, '<NULL>') from public.products where id = ${sqlUuid(fixtureA)}`) === "<NULL>",
  "Barcode must remain optional for a Product.",
);

runSql(`update public.products set gtin = '7' where id = ${sqlUuid(fixtureA)};`);
assert(scalar(`select gtin from public.products where id = ${sqlUuid(fixtureA)}`) === "7", "One-digit Barcode was not accepted.");

const maxBarcode = "12345678901234567890123456789012";
runSql(`update public.products set gtin = ${sqlText(maxBarcode)} where id = ${sqlUuid(fixtureA)};`);
assert(
  scalar(`select gtin from public.products where id = ${sqlUuid(fixtureA)}`) === maxBarcode,
  "32-digit Barcode was not preserved exactly.",
);

const nonGs1Barcode = "4006381333932";
runSql(`update public.products set gtin = ${sqlText(nonGs1Barcode)} where id = ${sqlUuid(fixtureA)};`);
assert(
  scalar(`select gtin from public.products where id = ${sqlUuid(fixtureA)}`) === nonGs1Barcode,
  "A numeric Product Barcode was incorrectly rejected by the obsolete GS1 check-digit rule.",
);

const leadingZeroBarcode = "0000123";
runSql(`update public.products set gtin = ${sqlText(leadingZeroBarcode)} where id = ${sqlUuid(fixtureA)};`);
assert(
  scalar(`select gtin from public.products where id = ${sqlUuid(fixtureA)}`) === leadingZeroBarcode,
  "Leading zeros were not preserved exactly.",
);

expectSqlFailure(
  `update public.products set gtin = '12A34' where id = ${sqlUuid(fixtureB)};`,
  "products_barcode_v1_valid",
  "Non-digit Product Barcode",
);
expectSqlFailure(
  `update public.products set gtin = '123456789012345678901234567890123' where id = ${sqlUuid(fixtureB)};`,
  "products_barcode_v1_valid",
  "33-digit Product Barcode",
);
expectSqlFailure(
  `update public.products set gtin = ' 12345' where id = ${sqlUuid(fixtureB)};`,
  "products_barcode_v1_valid",
  "Whitespace-prefixed Product Barcode",
);

runSql(`update public.products set gtin = '1234567890' where id = ${sqlUuid(fixtureA)};`);
expectSqlFailure(
  `update public.products set gtin = '1234567890' where id = ${sqlUuid(fixtureB)};`,
  "products_gtin_unique",
  "Duplicate Product Barcode",
);

runSql(`delete from public.products where id in (${sqlUuid(fixtureA)}, ${sqlUuid(fixtureB)});`);

// Production Foundation already proves in the same Database Quality run that a
// Product with gtin=NULL can create a Production Order. Production Boundaries
// then leaves this generated Product/Roll fixture for the post-production lock.
const producedProductId = scalar(`
  select id::text
  from public.products
  where code = 'PG-PRODUCTION-BOUNDARY'
`);
assert(/^[0-9a-f-]{36}$/i.test(producedProductId), "Production Boundaries Product fixture is missing.");
assert(
  scalar(`select coalesce(gtin, '<NULL>') from public.products where id = ${sqlUuid(producedProductId)}`) === "<NULL>",
  "Generated Production fixture unexpectedly started with a Barcode.",
);
assert(
  Number(scalar(`
    select count(*)
    from public.production_orders
    where product_id = ${sqlUuid(producedProductId)}
      and status = 'generated'
  `)) > 0,
  "BAR-01 lock verification requires the generated Production Boundaries fixture.",
);

const producedBarcode = "0004006381333932";
runSql(`update public.products set gtin = ${sqlText(producedBarcode)} where id = ${sqlUuid(producedProductId)};`);
assert(
  scalar(`select gtin from public.products where id = ${sqlUuid(producedProductId)}`) === producedBarcode,
  "One-time Product Barcode assignment after generated production did not persist exactly.",
);

expectSqlFailure(
  `update public.products set gtin = '0004006381333933' where id = ${sqlUuid(producedProductId)};`,
  "Produced Product barcode is locked after assignment",
  "Produced Product Barcode reassignment",
);
expectSqlFailure(
  `update public.products set gtin = null where id = ${sqlUuid(producedProductId)};`,
  "Produced Product barcode is locked after assignment",
  "Produced Product Barcode clearing",
);

assert(
  scalar(`select gtin from public.products where id = ${sqlUuid(producedProductId)}`) === producedBarcode,
  "Produced Product Barcode drifted after rejected mutations.",
);

// Public QR resolution requires the Product itself to be active and published;
// these are public-eligibility flags, not physical identity fields.
runSql(`
update public.products
set status = 'active', publication_status = 'published'
where id = ${sqlUuid(producedProductId)};
`);
const producedSlug = scalar(`select slug from public.products where id = ${sqlUuid(producedProductId)}`);
const generatedSerial = scalar(`
  select r.serial_number
  from public.rolls r
  join public.production_orders po on po.id = r.production_order_id
  where r.product_id = ${sqlUuid(producedProductId)}
    and po.status = 'generated'
  order by r.serial_number
  limit 1
`);
assert(
  /^PG-R-[0-9]{8}-[0-9]{8}-[0-9]{2}-[0-9]{4,5}$/.test(generatedSerial),
  "Generated Roll resolver fixture is missing.",
);

let anonRollCount = null;
try {
  anonRollCount = Number(anonScalar("select count(*) from public.rolls"));
} catch {
  // Permission denial is also an acceptable non-exposure outcome.
}
assert(
  anonRollCount === null || anonRollCount === 0,
  `Anonymous role can browse operational Rolls: count=${anonRollCount}`,
);
assert(
  scalar(`select has_function_privilege('anon', 'public.resolve_public_roll_product_slug(text)', 'EXECUTE')`) === "t",
  "Anonymous role lost the narrow public Roll resolver contract.",
);

assert(
  anonScalar(`select public.resolve_public_roll_product_slug(${sqlText(generatedSerial)})`) === producedSlug,
  "Public Roll resolver did not return the eligible Product slug.",
);
assert(
  anonScalar("select public.resolve_public_roll_product_slug('PG-R-20260814-99999999-99-9999')") === "",
  "Unknown Roll resolver response leaked data or became non-null.",
);
assert(
  anonScalar("select public.resolve_public_roll_product_slug('not-a-roll')") === "",
  "Malformed Roll resolver response leaked data or became non-null.",
);

const voidedProductId = scalar(`
  select id::text
  from public.products
  where code = 'PG-PRODUCTION-TEST'
`);
assert(/^[0-9a-f-]{36}$/i.test(voidedProductId), "Production Foundation voided Product fixture is missing.");
runSql(`
update public.products
set status = 'active', publication_status = 'published'
where id = ${sqlUuid(voidedProductId)};
`);
const voidedSerial = scalar(`
  select r.serial_number
  from public.rolls r
  join public.production_orders po on po.id = r.production_order_id
  where r.product_id = ${sqlUuid(voidedProductId)}
    and po.status = 'voided'
  order by r.serial_number
  limit 1
`);
assert(
  /^PG-R-[0-9]{8}-[0-9]{8}-[0-9]{2}-[0-9]{4,5}$/.test(voidedSerial),
  "Voided Roll resolver fixture is missing.",
);
assert(
  anonScalar(`select public.resolve_public_roll_product_slug(${sqlText(voidedSerial)})`) === "",
  "Voided Production Roll unexpectedly remained publicly resolvable.",
);

console.log("BAR-01 Product Barcode V1, produced identity lock and Cube E public Roll privacy/resolver verification PASS");
