import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,readdirSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
import path from "node:path";

const root=fileURLToPath(new URL("../",import.meta.url));
const read=relative=>readFileSync(path.join(root,relative),"utf8").replace(/\r\n/g,"\n");
const json=relative=>JSON.parse(read(relative));
const snapshot=json("tests/s4c3c3534/readonly-parity-observation.json");
const manifest=json("tests/s4c3c353/migration-reconciliation.manifest.json");
const restore=json("tests/s4c3c3533/recovery-readiness.json");
const ledger=json("tests/s4c3c3534/ledger-statement-evidence.json");
const gitBlob=relative=>execFileSync("git",["show","HEAD:"+relative],{
 cwd:root,maxBuffer:32*1024*1024
});
const md5=bytes=>createHash("md5").update(bytes).digest("hex");
const vercel=json("vercel.json");
const pkg=json("package.json");
const branch="feature/schoolnet-s4c3c3534-readonly-parity-audit-20261126";

test("C3-C.3.5.3.4: a metadata-only hosted observation never claims to be a restored backup",()=>{
 assert.equal(snapshot.workPackage,"S4-C.3-C.3.5.3.4");
 assert.equal(snapshot.projectRef,restore.projectRef);
 assert.equal(snapshot.observationDate,"2026-11-26");
 assert.equal(snapshot.postgresMajor,17);
 assert.equal(snapshot.metadataOnly,true);
 assert.equal(snapshot.studentRecordsInspected,false);
 assert.equal(snapshot.hostedWritesPerformed,false);
 assert.equal(snapshot.readiness.status,"BLOCKED_NO_DEPLOY");
 assert.equal(snapshot.readiness.originalHistoricalSqlCertified,false);
 assert.equal(snapshot.readiness.backupFullRestoreProven,false);
 assert.equal(snapshot.readiness.authStorageRecoverabilityProven,false);
});

test("C3-C.3.5.3.4: live history count still agrees with the immutable 10+2 reconciliation",()=>{
 const m=snapshot.migrationHistory;
 assert.equal(m.remoteRegistered,manifest.comparison.registeredRemoteVersions);
 assert.equal(m.githubMigrationFilesAtBaseline,manifest.comparison.repositoryMigrationFiles);
 assert.equal(m.historyOnly,10);
 assert.equal(m.repositoryOnly,2);
 assert.deepEqual([...m.historyOnlyVersions].sort(),manifest.historyOnly.map(x=>x.version).sort());
 assert.deepEqual([...m.repoOnlyVersions].sort(),manifest.repositoryOnly.map(x=>x.version).sort());
 assert.equal(m.lastRegisteredVersion,"20261125132844");
 const files=readdirSync(path.join(root,"supabase/migrations"))
  .filter(name=>/^\d{14}_.+\.sql$/u.test(name));
 assert.equal(files.length,54,"No historical migration may be added in this audit");
 for(const item of manifest.historyOnly)assert.ok(!files.some(x=>x.startsWith(item.version+"_")));
});

test("C3-C.3.5.3.4: 10 remote history SQL originals remain uncertified",()=>{
 assert.equal(snapshot.migrationHistory.historicalSourceBaselineStatus,
  "10_ORIGINALS_NOT_CERTIFIED_AT_C3532_SNAPSHOT");
 assert.equal(snapshot.migrationHistory.storedLedgerStatementsPresent,10);
 assert.equal(snapshot.migrationHistory.exactExistingCandidateTexts,8);
 assert.equal(snapshot.migrationHistory.archivedNonExecutableLedgerSources,2);
 assert.equal(snapshot.migrationHistory.storedStatementEqualityVerified,true);
 assert.equal(snapshot.migrationHistory.previouslyMissingGitSourceVersion,"20261113124329");
 assert.equal(snapshot.readiness.historicalSqlTextRecoveredFromLedger,true);
 const orphan=manifest.historyOnly.find(x=>x.version===snapshot.migrationHistory.orphanOriginalSource);
 assert.ok(orphan);
 assert.equal(orphan.provenance,"ORIGINAL_SOURCE_NOT_VERIFIED");
 assert.deepEqual(orphan.candidates,[]);
 assert.equal(manifest.historyOnly.filter(x=>x.candidates.length>0).length,9);
 assert.ok(manifest.historyOnly.every(x=>x.provenance!=="EXECUTED_SQL_CERTIFIED"));
 assert.ok(restore.provenance.historyOnly.every(x=>x.originalSqlVerified===false));
 assert.equal(restore.provenance.historicalSourceCertification,"BLOCKED");
 assert.equal(snapshot.migrationHistory.migrationHistoryRepairApproved,false);
});

test("C3-C.3.5.3.4: all five server label columns truly exist, without invented schema",()=>{
 const labels=snapshot.labelSources;
 assert.deepEqual(Object.keys(labels).sort(),[
  "public.schoolnet_schools.name","public.school_years.name","public.classes.name",
  "schoolnet_private.school_grading_periods.name","public.academic_subjects.name"
 ].sort());
 assert.ok(Object.values(labels).every(x=>x==="text"));
 for(const table of [
  "public.schoolnet_schools","public.school_years","public.classes",
  "public.academic_subjects","schoolnet_private.school_grading_periods"
 ]) assert.equal(snapshot.requiredObjects[table],true);
});

test("C3-C.3.5.3.4: installed teacher RPC is preserved; general averages, export SQL stay absent",()=>{
 const f=snapshot.functionObservation;
 assert.deepEqual(f["public.schoolnet_teacher_official_subject_averages(uuid,uuid,uuid,uuid)"],{
  present:true,returnType:"jsonb",securityDefiner:false,
  searchPath:"pg_catalog",anonExecute:false,authenticatedExecute:true,
 });
 assert.deepEqual(f["public.get_my_role()"],{
  present:true,returnType:"user_role",securityDefiner:true,
  searchPath:"public",anonExecute:true,authenticatedExecute:true,
 });
 for(const name of [
  "public.schoolnet_school_official_general_averages(uuid,uuid,uuid)",
  "public.schoolnet_official_export_preview(uuid,uuid,uuid,text,uuid,text,text)",
  "public.schoolnet_official_export_labels(uuid,uuid,uuid,text,uuid)"
 ])assert.deepEqual(f[name],{present:false});
 for(const tbl of [
  "schoolnet_private.school_official_curricula",
  "schoolnet_private.school_official_curriculum_subjects",
  "schoolnet_private.school_export_preview_audit"
 ])assert.equal(snapshot.requiredObjects[tbl],false);
 assert.ok(snapshot.limitations.some(s=>s.includes("get_my_role")&&s.includes("public")));
});

test("C3-C.3.5.3.4: legacy grading safety is observed but not misrepresented as certified SQL",()=>{
 const m=snapshot.repositoryOnlyMigrationEffectiveSchema["20261109140104"];
 assert.equal(m.remoteLedgerEntry,false);
 assert.equal(m.result,"KEY_PROTECTIVE_EFFECTS_PRESENT_SOURCE_NOT_CERTIFIED");
 assert.equal(m.originalMigrationExecutionProven,false);
 for(const key of ["observedLegacyPublish","observedLegacyMarkGraded"]){
  const v=m[key];
  assert.equal(v.present,true);
  assert.equal(v.creatorCheckPattern,true);
  assert.equal(v.securityDefiner,true);
  assert.equal(v.searchPath,"pg_catalog");
  assert.equal(v.anonExecute,false);
 }
 assert.equal(m.observedRecalculate.present,true);
 assert.equal(m.observedRecalculate.anonExecute,false);
 assert.equal(m.observedRecalculate.authenticatedExecute,false);
 assert.equal(m.observedTriggerExists,true);
});

test("C3-C.3.5.3.4: rollover migration has NOT installed its functional tables and RPC",()=>{
 const m=snapshot.repositoryOnlyMigrationEffectiveSchema["20261110090000"];
 assert.equal(m.remoteLedgerEntry,false);
 assert.equal(m.result,"ROLLOVER_FEATURE_OBJECTS_NOT_INSTALLED");
 assert.equal(m.originalMigrationExecutionProven,false);
 for(const key of [
  "observedYearRolloverDecisionsTable","observedYearRolloverRunsTable",
  "observedYearRolloverSaveRpc","observedYearRolloverFinalizeRpc",
  "observedGuardTrigger"
 ]) assert.equal(m[key],false);
 assert.equal(m.observedExistingAdminYearSwitchRpc,true);
});

test("C3-C.3.5.3.4: audit SQL is SELECT-only, never a migration or remote action",()=>{
 const query=read("tests/s4c3c3534/readonly-catalog-audit.sql")
  .split("\n").filter(line=>!line.trimStart().startsWith("--")).join("\n");
 const statements=query.split(";").map(s=>s.trim()).filter(Boolean);
 assert.equal(statements.length,4);
 assert.ok(statements.every(s=>s.startsWith("SELECT ")));
 for(const statement of statements){
  assert.doesNotMatch(statement,/\b(?:insert|update|delete|create|alter|drop|truncate|grant|revoke|call|execute|copy|pg_read_file|dblink)\b/iu);
  assert.doesNotMatch(statement,/\b(?:auth\.users|assessment_submissions|student_enrollments)\b/iu);
 }
 assert.match(query,/pg_catalog\.pg_proc/);
 assert.match(query,/has_function_privilege\('anon'/);
 assert.match(query,/to_regclass\('public\.school_year_rollover_decisions'\)/);
});

test("C3-C.3.5.3.4: production release and unrecovered Auth/Storage backup gates remain closed",()=>{
 assert.equal(restore.productionWritesAllowed,false);
 assert.equal(restore.releaseReadiness,"BLOCKED");
 for(const gate of [
  "originalHistoricalSqlCertified","backupFullRestoreProven",
  "authStorageRecoverabilityProven","productionSqlGo",
  "hostedSandboxGo","mainMergeGo","vercelDeployGo","realDocumentExportEnabled"
 ])assert.equal(snapshot.readiness[gate],false);
 assert.deepEqual(restore.approvals,{
  productionSQL:false,hostedSandboxResume:false,mainMerge:false,vercelProduction:false,
 });
 assert.equal(restore.backups.disposableFullRestore,"NOT_PERFORMED");
});

test("C3-C.3.5.3.4: branch is nondeploying, CI has no hosted data path",()=>{
 const ci=read(".github/workflows/schoolnet-s4c3c3534-readonly-parity-ci.yml");
 const doc=read("docs/releases/SCHOOLNET_S4C3C3534_READONLY_PARITY_2026-11-26.md");
 assert.equal(vercel.git.deploymentEnabled[branch],false);
 assert.equal(pkg.scripts["qa:s4c3c3534"],
  "node --test scripts/test-schoolnet-s4c3c3534-readonly-parity.mjs");
 assert.match(ci,/permissions:\n  contents: read/);
 assert.match(ci,/persist-credentials: false/);
 assert.match(ci,/qa:s4c3c3534/);
 assert.doesNotMatch(ci,/(?:supabase start|supabase link|db push|migration repair|--remote|--linked|secrets\.|SUPABASE_ACCESS_TOKEN|SUPABASE_DB_URL)/iu);
 for(const token of ["CLI v3","get_my_role","13 novembre","restauration","Supabase principal","20261110090000"]){
  assert.ok(doc.includes(token),"Missing caution: "+token);
 }
 assert.match(doc,/AUCUNE ACTION DE MIGRATION AUTORISÉE/);
});


test("C3-C.3.5.3.4: 10 historical SQL statements have source-text MD5-equal Git blobs",()=>{
 assert.equal(ledger.workPackage,snapshot.workPackage);
 assert.equal(ledger.projectRef,snapshot.projectRef);
 assert.equal(ledger.remoteVersionsWithNonemptyRecordedSql,10);
 assert.equal(ledger.statementsPerVersion,1);
 assert.equal(ledger.versions.length,10);
 assert.equal(ledger.matchedExistingCandidateExactly,8);
 assert.equal(ledger.recoveredRemoteOnlyStatementAsInertText,1);
 assert.equal(ledger.recoveredCompositeStatementAsInertText,1);
 assert.equal(ledger.allTenStoredSqlTextsFingerprintVerified,true);
 assert.equal(ledger.originalTextArchivedUnderMigrations,false);
 assert.equal(ledger.productionExecutionIndependentlyVerified,false);
 assert.equal(new Set(ledger.versions.map(x=>x.version)).size,10);
 assert.deepEqual(ledger.versions.map(x=>x.version).sort(),manifest.historyOnly.map(x=>x.version).sort());
 for(const v of ledger.versions){
  assert.match(v.md5,/^[0-9a-f]{32}$/);
  assert.ok(Number.isInteger(v.chars)&&v.chars>1000);
  const inputPath=v.paths[0];
  assert.ok(inputPath.startsWith("supabase/proposals/")||
    inputPath.startsWith("tests/s4c3c3534/recovered-ledger/"));
  const source=gitBlob(inputPath);
  assert.equal(source.toString("utf8").length,v.chars,
    "Stored ledger source length: "+v.version);
  assert.equal(md5(source),v.md5,
    "Exact committed Git bytes must match observed remote SQL MD5: "+v.version);
 }
});

test("C3-C.3.5.3.4: the two recovered originals are inert evidence, never migrations",()=>{
 const recovered=ledger.versions.filter(v=>v.kind.includes("RECOVERED_NONEXECUTABLE"));
 assert.equal(recovered.length,2);
 assert.deepEqual(recovered.map(v=>v.version).sort(),["20261113124329","20261125104641"]);
 for(const v of recovered){
  assert.ok(v.paths[0].endsWith(".sql.txt"));
  assert.ok(v.paths[0].startsWith("tests/s4c3c3534/recovered-ledger/"));
  const code=gitBlob(v.paths[0]).toString("utf8");
  assert.ok(code.startsWith("-- SCHOOLNET"));
  assert.doesNotMatch(v.paths[0],/supabase\/migrations\//);
 }
 const history=ledger.versions.find(v=>v.version==="20261113124329");
 assert.equal(history.kind,"REMOTE_TEXT_RECOVERED_NONEXECUTABLE");
 assert.equal(history.paths.length,1);
 const combo=ledger.versions.find(v=>v.version==="20261125104641");
 assert.equal(combo.kind,"REMOTE_COMPOSITE_RECOVERED_NONEXECUTABLE");
 assert.equal(combo.composite.headerChars,184);
 const whole=gitBlob(combo.paths[0]).toString("utf8");
 const first=gitBlob(combo.composite.firstCandidate).toString("utf8");
 const second=gitBlob(combo.composite.secondCandidate).toString("utf8");
 assert.equal(whole,whole.slice(0,184)+first+"\n"+second,
  "Composite recorded SQL must preserve its historical wrapper and full component text");
 assert.equal(combo.composite.separator,"\n");
 assert.equal(md5(Buffer.from(whole,"utf8")),combo.md5);
});
