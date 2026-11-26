import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,readdirSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";

const root=fileURLToPath(new URL("../",import.meta.url));
const read=relative=>readFileSync(path.join(root,relative),"utf8").replace(/\r\n/g,"\n");
const json=relative=>JSON.parse(read(relative));
const manifest=json("tests/s4c3c3538/isolated-target-readiness.json");
const matrix=json("tests/s4c3c3538/recovery-acceptance-matrix.json");
const previous=json("tests/s4c3c3533/recovery-readiness.json");
const phase7=read("docs/releases/SCHOOLNET_S4C3C3537_FICTITIOUS_RESTORE_REHEARSAL_2026-11-26.md");
const doc=read("docs/releases/SCHOOLNET_S4C3C3538_ISOLATED_RESTORE_TARGET_PREPARATION_2026-11-26.md");
const ci=read(".github/workflows/schoolnet-s4c3c3538-restore-preflight-ci.yml");
const packageFile=json("package.json");
const vercel=json("vercel.json");
const branch="feature/schoolnet-s4c3c3538-isolated-restore-preflight-20261126";

test("C3.5.3.8: user approved documentation only, not any private restoration",()=>{
 assert.equal(manifest.workPackage,"S4-C.3-C.3.5.3.8");
 assert.equal(manifest.preparedOn,"2026-11-26");
 assert.equal(manifest.phase,"TARGET_SELECTION_AND_ISOLATION_DESIGN_ONLY");
 assert.equal(manifest.approvals.documentationPreparation,true);
 assert.equal(manifest.releaseGate,"BLOCKED_NO_RESTORE_GO");
 assert.ok(manifest.nextDecision.includes("explicitly choose isolated target"));
 for(const [k,v] of Object.entries(manifest.approvals)){
  if(k!=="documentationPreparation")assert.equal(v,false,k+": no implicit GO");
 }
});

test("C3.5.3.8: real archives are not opened, copied, uploaded or processed",()=>{
 for(const field of [
  "environmentCreated","projectOrServiceProvisioned","remoteOrLocalDatabaseTouched",
  "privateArchiveOpened","privateArchiveMoved","privateArchiveUploaded",
  "realSchoolDataProcessed","principalSupabaseWriteAllowed"
 ])assert.equal(manifest[field],false,field);
 assert.equal(matrix.status,"PLANNED_NOT_EXECUTED");
 assert.equal(matrix.canProceedToRealBackup,false);
 assert.equal(matrix.realRestoreCertified,false);
 assert.equal(matrix.approvalForHosting,false);
});

test("C3.5.3.8: target remains unselected and an independent explicit GO is required",()=>{
 assert.equal(manifest.targetDecision.selectedTarget,null);
 assert.equal(manifest.targetDecision.status,"AWAITING_EXPLICIT_SELECTION");
 assert.equal(manifest.targetDecision.noDefaultSelection,true);
 assert.equal(manifest.targetDecision.prohibitGithubActionsForRealArchive,true);
 assert.equal(manifest.targetDecision.prohibitSameProductionDatabaseAsTarget,true);
 const opts=manifest.targetDecision.alternatives;
 assert.deepEqual(opts.map(x=>x.id).sort(),["isolated_offline_host","separate_hosted_project"]);
 assert.equal(opts[1].paidCloudRequired,"MAY_INCUR_COST");
 assert.equal(opts[1].realDataCompatibleOnlyAfterApproval,true);
 assert.ok(opts.every(x=>x.conditions.length>=5));
});

test("C3.5.3.8: isolation, encryption, capacity, egress and retention remain unverified",()=>{
 const keys=[
  "ownerOfTargetAssigned","costAndQuotasReviewed","allowedRegionAndHostingReviewed",
  "backupStorageEncryptionReviewed","capacityAndPgVersionChecked",
  "pgExtensionsRolesPoliciesAssessed","authenticatedSessionsAndKeysPlanApproved",
  "storageByteInventoryAndPermissionsReviewed","outboundEmailSmsDisabledAndProven",
  "externalWebhooksDisabledAndProven","egressIsolationValidated",
  "independentDnsAndCredentialsValidated","rollbackAndDestructionRunbookApproved",
  "incidentResponseContactAssigned","dataRetentionPeriodApproved",
  "permittedEvidenceFormatApproved"
 ];
 assert.deepEqual(Object.keys(manifest.controls).sort(),keys.sort());
 for(const k of keys)assert.equal(manifest.controls[k],false,k);
});

test("C3.5.3.8: thirteen DB/Auth/Storage acceptance gates must all remain NOT_STARTED",()=>{
 assert.equal(matrix.workPackage,manifest.workPackage);
 assert.equal(matrix.planVersion,1);
 assert.equal(matrix.acceptanceTests.length,13);
 assert.equal(new Set(matrix.acceptanceTests.map(x=>x.id)).size,13);
 assert.ok(matrix.acceptanceTests.every(x=>x.required&&x.status==="NOT_STARTED"));
 for(const key of [
  "TARGET_INDEPENDENT","HOST_PG_COMPATIBILITY","STORAGE_CAPACITY_ENCRYPTION",
  "EGRESS_NETWORK_BLOCK","MESSAGING_WEBHOOKS_DISABLED",
  "AUTH_SESSIONS_KEYS_SEPARATED","STORAGE_BYTES_SOURCE_AVAILABLE",
  "BACKUP_FORMAT_AND_SCOPE","DATA_RETENTION_AND_DESTRUCTION",
  "REAL_ARCHIVE_ACCESS_GO","DB_RESTORE_GO","AUTH_AND_STORAGE_RESTORE_GO",
  "ROLLBACK_REHEARSAL"
 ])assert.ok(matrix.acceptanceTests.some(x=>x.id===key),key);
 assert.ok(matrix.stopIfAny.length>=8);
});

test("C3.5.3.8: private data and credentials are banned from GitHub evidence",()=>{
 assert.equal(manifest.acceptedEvidence.length,5);
 assert.ok(manifest.forbiddenEvidence.length>=4);
 for(const token of ["Dump reel","Mot de passe","Archive de sauvegarde reelle","Journal SQL"]){
  assert.ok(manifest.forbiddenEvidence.some(x=>x.includes(token)),token);
 }
 const source=read("tests/s4c3c3538/isolated-target-readiness.json")+
   read("tests/s4c3c3538/recovery-acceptance-matrix.json");
 assert.doesNotMatch(source,/(?:sb_secret_|service_role\s*=\s*["'][^"']|postgres(?:ql)?:\/\/[^\s"']+|eyJ[A-Za-z0-9_-]{55,})/i);
 assert.ok(manifest.acceptedEvidence.every(x=>!x.includes("token")));
});

test("C3.5.3.8: synthetic PostgreSQL practice cannot prove full private Auth/Storage restore",()=>{
 assert.ok(phase7.includes("ne prouve pas une restauration complète"));
 assert.equal(manifest.tests.previousSyntheticPostgresRestore,true);
 assert.equal(manifest.tests.productionRestoreProved,false);
 assert.equal(manifest.tests.ciUsesRealBackup,false);
 assert.equal(manifest.tests.liveGoTrueRestored,false);
 assert.equal(manifest.tests.liveStorageRestored,false);
 assert.equal(previous.backups.disposableFullRestore,"NOT_PERFORMED");
 assert.equal(previous.backups.authCoverage,"NOT_VERIFIED");
 assert.equal(previous.backups.storageObjectCoverage,"NOT_VERIFIED");
 assert.equal(previous.releaseReadiness,"BLOCKED");
});

test("C3.5.3.8: docs require disabled notifications, separate credentials and release approvals",()=>{
 for(const token of [
  "SMTP","SMS","webhooks","storage","Auth","GoTrue","Supabase principal",
  "GitHub Actions","restauration","octets","GO 1","GO 2","GO 3","GO 4"
 ])assert.ok(doc.toLowerCase().includes(token.toLowerCase()),token);
 assert.ok(doc.includes("aucune cible choisie ou provisionnée"));
 assert.ok(doc.includes("AUCUNE RESTAURATION AUTORISÉE"));
 assert.ok(doc.includes("AUCUNE restauration réelle"));
 assert.ok(doc.includes("Aucun")&&doc.includes("pg_dump")&&doc.includes("pg_restore"));
});

test("C3.5.3.8: documented restore method accounts for distinct formats and Storage bytes",()=>{
 for(const marker of [
  "fichier téléchargé depuis le Dashboard","dump SQL CLI",
  "sauvegarde physique","pg_restore","octets",
  "mots de passe","PostgreSQL","version","chiffré",
  "retour arrière","suppression"
 ])assert.ok(doc.toLowerCase().includes(marker.toLowerCase()),marker);
 assert.match(doc,/https:\/\/supabase\.com\/docs\/guides\/platform\/backups/);
 assert.match(doc,/https:\/\/supabase\.com\/docs\/guides\/local-development\/restoring-downloaded-backup/);
});

test("C3.5.3.8: no new SQL migrations, no real deployment or release",()=>{
 const files=readdirSync(path.join(root,"supabase/migrations"))
  .filter(n=>/^\d{14}_.+\.sql$/.test(n));
 assert.equal(files.length,54);
 assert.ok(files.every(x=>!x.includes("c3538")));
 assert.equal(manifest.approvals.migrationRepair,false);
 assert.equal(manifest.approvals.productionMigration,false);
 assert.equal(manifest.approvals.mainMerge,false);
 assert.equal(manifest.approvals.vercelDeploy,false);
 assert.equal(manifest.approvals.releaseRealExports,false);
});

test("C3.5.3.8: CI has no secrets, hosted Supabase access, backup upload or restore",()=>{
 assert.match(ci,/permissions:\n  contents: read/);
 assert.match(ci,/persist-credentials: false/);
 assert.match(ci,/qa:s4c3c3538/);
 assert.doesNotMatch(ci,/(?:secrets\.|pull_request_target|supabase (?:start|link|db|migration)|pg_dump|pg_restore|psql|docker|curl |wget |service_role|postgres:\/\/|SUPABASE_ACCESS_TOKEN|SUPABASE_DB_URL|--remote|--linked|vercel deploy)/i);
 assert.doesNotMatch(ci,/(?:upload-artifact|download-artifact|actions\/cache)/i);
});

test("C3.5.3.8: Vercel is blocked and actual school exports remain disabled",()=>{
 assert.equal(vercel.git.deploymentEnabled[branch],false);
 assert.equal(packageFile.scripts["qa:s4c3c3538"],
  "node --test scripts/test-schoolnet-s4c3c3538-isolation-plan.mjs");
 const bridge=read("src/features/official-documents/lib/schoolOfficialExportPreviewBridge.ts");
 assert.match(bridge,/SCHOOLNET_REAL_EXPORTS_RELEASED = false/);
 assert.equal(manifest.approvals.releaseRealExports,false);
});
