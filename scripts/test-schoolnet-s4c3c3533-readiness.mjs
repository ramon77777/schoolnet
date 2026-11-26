import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (relative) => readFileSync(path.join(root, relative), "utf8").replace(/\r\n/g, "\n");
const json = (relative) => JSON.parse(read(relative));
const manifest = json("tests/s4c3c353/migration-reconciliation.manifest.json");
const gates = json("tests/s4c3c3533/recovery-readiness.json");
const vercel = json("vercel.json");
const pack = json("package.json");
const doc = read("docs/releases/SCHOOLNET_S4C3C3533_MIGRATIONS_BACKUP_RESTORE.md");
const seed = read("tests/s4c3c3533/fixtures/backup-restore-seed.sql");
const ci = read(".github/workflows/schoolnet-s4c3c3533-backup-readiness-ci.yml");
const branch = "feature/schoolnet-s4c3c3533-backup-restore-gates-20261126";

test("C3.5.3.3: every historical migration remains an uncertified source", () => {
  assert.equal(gates.workPackage, "S4-C.3-C.3.5.3.3");
  assert.equal(gates.sourceManifest, "tests/s4c3c353/migration-reconciliation.manifest.json");
  assert.equal(gates.projectRef, "anttmbhaphkhmkoqsofd");
  assert.equal(manifest.comparison.reconciliationStatus, "BLOCKED_NO_DEPLOY");
  assert.equal(manifest.comparison.registeredRemoteVersions, 62);
  assert.equal(manifest.comparison.repositoryMigrationFiles, 54);
  assert.equal(gates.provenance.historyOnly.length, 10);
  assert.equal(gates.provenance.repositoryOnly.length, 2);
  const byVersion = new Map(gates.provenance.historyOnly.map((x) => [x.version, x]));
  assert.equal(byVersion.size, 10);
  for (const historical of manifest.historyOnly) {
    const item = byVersion.get(historical.version);
    assert.ok(item, "Missing historical version gate: " + historical.version);
    assert.equal(item.originalSqlVerified, false);
    assert.equal(item.evidence, historical.candidates.length === 0 ? "SOURCE_NOT_FOUND" : "CANDIDATE_ONLY");
  }
  assert.equal(manifest.historyOnly.filter((x) => x.candidates.length > 0).length, 9);
  assert.equal(byVersion.get("20261113124329").evidence, "SOURCE_NOT_FOUND");
  assert.deepEqual(
    gates.provenance.repositoryOnly.map((x) => x.version).sort(),
    manifest.repositoryOnly.map((x) => x.version).sort(),
  );
  assert.ok(gates.provenance.repositoryOnly.every((x) =>
    x.remoteState === "NOT_IN_REGISTERED_HISTORY" && x.effectiveSchemaVerified === false));
  assert.equal(gates.provenance.historicalSourceCertification, "BLOCKED");
  assert.equal(gates.provenance.migrationHistoryRepairAuthorized, false);
});

test("C3.5.3.3: no SQL repair, remote backup claim, or release authorization is implied", () => {
  assert.equal(gates.productionWritesAllowed, false);
  assert.equal(gates.releaseReadiness, "BLOCKED");
  assert.deepEqual(gates.approvals, {
    productionSQL: false, hostedSandboxResume: false, mainMerge: false, vercelProduction: false,
  });
  for (const field of [
    "databaseExport", "databaseArchiveIntegrity", "authCoverage", "storageObjectCoverage",
    "privateOffsiteCopy", "disposableFullRestore",
  ]) {
    assert.ok(/^(NOT_PERFORMED|NOT_VERIFIED)$/.test(gates.backups[field]), "Unproven backup gate: " + field);
  }
  assert.equal(gates.backups.credentialExposure, "PROHIBITED");
  const migrationFiles = readdirSync(path.join(root, "supabase/migrations"))
    .filter((name) => /^\d{14}_.+\.sql$/.test(name));
  assert.equal(migrationFiles.length, 54, "Cannot introduce undocumented historical migrations");
  for (const historical of gates.provenance.historyOnly) {
    assert.ok(!migrationFiles.some((name) => name.startsWith(historical.version + "_")));
  }
});

test("C3.5.3.3: isolated branch cannot trigger Vercel and QA is explicitly registered", () => {
  assert.equal(vercel.git.deploymentEnabled[branch], false);
  assert.equal(pack.scripts["qa:s4c3c3533"],
    "node --test scripts/test-schoolnet-s4c3c3533-readiness.mjs");
  assert.match(ci, /pull_request:/);
  assert.match(ci, /feature\/schoolnet-s4c3c353-schema-reconciliation-20261126/);
  assert.match(ci, /permissions:\n  contents: read/);
  assert.match(ci, /persist-credentials: false/);
  assert.doesNotMatch(ci, /supabase (?:link|db push|db reset|migration repair)|--remote|--linked|secrets\.|SUPABASE_DB_URL|SUPABASE_ACCESS_TOKEN/i);
});

test("C3.5.3.3: synthetic restore CI never reads hosted data or imports production SQL", () => {
  assert.match(ci, /image: postgres:17/);
  assert.match(ci, /--network host/);
  assert.match(ci, /backup-restore-seed\.sql/);
  assert.match(ci, /pg_dump/);
  assert.match(ci, /pg_restore/);
  assert.match(ci, /sha256sum/);
  assert.match(ci, /schoolnet_ci_restore/);
  assert.match(ci, /test "\$SOURCE" = "\$RESTORED"/);
  assert.match(ci, /if: always\(\)/);
  assert.doesNotMatch(ci, /supabase\/proposals\/|supabase\/migrations\/.*\.sql|curl |wget |https?:\/\//i);
  assert.match(seed, /CREATE SCHEMA schoolnet_ci_backup/);
  assert.match(seed, /SYNTHETIC_A/);
  assert.match(seed, /SYNTHETIC_B/);
  assert.match(seed, /SYNTHETIC_C/);
  assert.doesNotMatch(seed, /auth\.users|public\.profiles|assessment_submissions|schoolnet_private/);
});

test("C3.5.3.3: documented restoration limits explicitly cover DB, Auth, Storage, and user approval", () => {
  for (const token of [
    "20261113124329", "supabase db dump", "Auth", "Storage",
    "SCHOOLNET_BACKUPS_PRIVES", "SHA256", "A/B", "aucune restauration",
    "GO SQL", "GO fusion", "PostgreSQL",
  ]) {
    assert.ok(doc.includes(token), "Missing documented safeguard: " + token);
  }
  assert.match(doc, /ne sauvegarde pas les fichiers Storage/i);
  assert.match(doc, /données fictives|trois lignes fictives/i);
});
