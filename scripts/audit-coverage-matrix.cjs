const fs = require("fs");
const path = require("path");

const matrixPath = path.join(__dirname, "..", "docs", "prl-e2e-01-v1-coverage-matrix.md");
const content = fs.readFileSync(matrixPath, "utf8");

const lines = content.split("\n").filter((line) => line.startsWith("| `"));
console.log(`Total table rows matched: ${lines.length}`);

const rows = [];
const seenIds = new Set();
const duplicateIds = [];

for (const line of lines) {
  const parts = line.split("|").map((s) => s.trim());
  const id = parts[1].replace(/`/g, "");
  const domain = parts[2];
  const surface = parts[3];
  const role = parts[4];
  const preconditions = parts[5];
  const action = parts[6];
  const result = parts[7];
  const assertion = parts[8];
  const negative = parts[9];
  const device = parts[10];
  const testGate = parts[11];
  const status = parts[12];
  const evidence = parts[13];

  if (seenIds.has(id)) {
    duplicateIds.push(id);
  }
  seenIds.add(id);

  rows.push({
    id,
    domain,
    surface,
    role,
    device,
    testGate,
    status,
    evidence,
  });
}

console.log(`Total parsed rows: ${rows.length}`);
console.log(`Unique IDs: ${seenIds.size}`);
console.log(`Duplicates: ${duplicateIds.length === 0 ? "NONE (0)" : duplicateIds.join(", ")}`);

// Group by prefix
const prefixMap = {};
for (const row of rows) {
  const prefix = row.id.split("-")[0];
  prefixMap[prefix] = (prefixMap[prefix] || 0) + 1;
}
console.log("\nRow count by domain prefix:");
for (const [prefix, count] of Object.entries(prefixMap)) {
  console.log(`  ${prefix.padEnd(8)}: ${count} rows`);
}

// Group by primary operational surface / flow (The "67" census)
const surfaceMap = new Map();
for (const row of rows) {
  // Normalize surface to broad operational screen / endpoint
  const baseSurface = row.surface.split("(")[0].trim();
  const key = `${row.domain} :: ${baseSurface}`;
  if (!surfaceMap.has(key)) {
    surfaceMap.set(key, []);
  }
  surfaceMap.get(key).push(row.id);
}
console.log(`\nDistinct functional surfaces / operational screens: ${surfaceMap.size}`);

// Identify rows requiring physical hardware or external config
const externalGateRows = [];
for (const row of rows) {
  const combined = `${row.device} ${row.status} ${row.evidence}`;
  if (
    combined.includes("REAL-DEVICE REQUIRED") ||
    combined.includes("PHYSICAL-PRINT REQUIRED") ||
    combined.includes("Camera") ||
    combined.includes("SMTP") ||
    combined.includes("Native Push") ||
    combined.includes("A2HS")
  ) {
    externalGateRows.push({
      id: row.id,
      domain: row.domain,
      surface: row.surface,
      device: row.device,
      reason: row.status.includes("REQUIRED") ? row.status : row.device,
    });
  }
}
console.log(`\nRows with External Hardware / SMTP Gates: ${externalGateRows.length}`);
for (const eg of externalGateRows) {
  console.log(`  - ${eg.id.padEnd(10)} [${eg.domain}] ${eg.surface} (${eg.reason})`);
}
