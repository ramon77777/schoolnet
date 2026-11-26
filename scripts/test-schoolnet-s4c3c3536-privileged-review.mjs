import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,readdirSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";

const root=fileURLToPath(new URL("../",import.meta.url));
const read=p=>readFileSync(path.join(root,p),"utf8").replace(/\r\n/g,"\n");
const json=p=>JSON.parse(read(p));
const audit=json("tests/s4c3c3536/privileged-review-observation.json");
const installed=json("tests/s4c3c3535/installed-effect-inventory.json");
const snapshot=json("tests/s4c3c3534/readonly-parity-observation.json");
const recovery=json("tests/s4c3c3533/recovery-readiness.json");
const ledger=json("tests/s4c3c3534/ledger-statement-evidence.json");
const pkg=json("package.json");
const vercel=json("vercel.json");
const branch="feature/schoolnet-s4c3c3536-privileged-review-recovery-20261126";

test("C3.5.3.6: audit is a point-in-time catalog review, never a live authorization assertion",()=>{
 assert.equal(audit.workPackage,"S4-C.3-C.3.5.3.6");
 assert.equal(audit.observationDate,"2026-11-26");
 assert.equal(audit.projectRef,installed.projectRef);
 assert.equal(audit.projectRef,snapshot.projectRef);
 assert.equal(audit.projectRef,recovery.projectRef);
 assert.equal(audit.accessScope,"CATALOG_ONLY_NO_USER_ROWS");
 assert.equal(audit.productionSqlWrites,0);
 assert.equal(audit.studentRowsRead,0);
 assert.equal(audit.functionBodiesCopiedToGithub,false);
 assert.equal(audit.independentlyVerifiedJwtBehavior,false);
 assert.equal(audit.reviewStatus,"STATIC_REVIEW_REQUIRES_DISPOSABLE_AUTH_TESTS");
});

test("C3.5.3.6: five precise function identities with safe grants and role context",()=>{
 assert.equal(audit.functions.length,5);
 const observed=new Map(installed.objects.filter(x=>x.kind==="function").map(x=>[x.name,x]));
 for(const f of audit.functions){
  assert.equal(f.changeApproved,false);
  assert.equal(f.ownerRole,"postgres");
  assert.equal(typeof f.anonExecute,"boolean");
  assert.equal(typeof f.authenticatedExecute,"boolean");
  assert.equal(f.referencesEditableUserMetadata,false);
  const name=f.signature.slice(0,f.signature.indexOf("("));
  if(name==="public.get_my_role")continue;
  const previous=observed.get(name);
  assert.ok(previous,"Missing prior inventory function "+name);
  assert.equal(f.securityDefiner,previous.securityDefinerObserved);
  assert.equal(f.searchPath,previous.searchPathObserved);
  assert.equal(f.anonExecute,previous.anonExecuteObserved);
  assert.equal(f.authenticatedExecute,previous.authenticatedExecuteObserved);
  assert.equal(f.resultType,previous.returnTypeObserved);
 }
 assert.equal(new Set(audit.functions.map(x=>x.signature)).size,5);
});

test("C3.5.3.6: legacy role helper scopes the profile to auth.uid, but remains under review",()=>{
 const role=audit.functions.find(x=>x.signature==="public.get_my_role()");
 assert.ok(role);
 assert.equal(role.category,"ROLE_HELPER");
 assert.equal(role.securityDefiner,true);
 assert.equal(role.searchPath,"public");
 assert.equal(role.anonExecute,true);
 assert.equal(role.authenticatedExecute,true);
 assert.equal(role.usesAuthUid,true);
 assert.equal(role.sourceReadsOwnProfileRoleByAuthUid,true);
 assert.equal(role.referencesEditableUserMetadata,false);
 assert.match(role.interpretation,/not tested|not.*test/i);
 assert.equal(audit.context.publicSchemaCreateDeniedForAnonAuthenticated,true);
 assert.equal(audit.context.privateSchemaCreateDeniedForAnonAuthenticated,true);
 for(const p of audit.schemaRoleCapabilities){
  assert.equal(p.publicCreate,false);
  assert.equal(p.privateCreate,false);
 }
});

test("C3.5.3.6: two privileged trigger functions are review candidates, not claimed exploits",()=>{
 const triggers=audit.functions.filter(x=>x.category==="TRIGGER_HELPER");
 assert.equal(triggers.length,2);
 assert.deepEqual(triggers.map(x=>x.signature).sort(),[
  "public.notify_assessment_correction_published()",
  "public.trigger_refresh_progress_from_assessment_submission()",
 ]);
 for(const t of triggers){
  assert.equal(t.securityDefiner,true);
  assert.equal(t.anonExecute,true);
  assert.equal(t.resultType,"trigger");
  assert.equal(t.changeApproved,false);
  assert.ok(t.interpretation.includes("not")||t.interpretation.includes("ne"));
 }
 assert.equal(audit.context.triggerReturningFunctionsAreNotConfirmedDirectlyInvokable,true);
 assert.equal(audit.context.incidentConfirmed,false);
});

test("C3.5.3.6: existing teacher RPC stays INVOKER while private grading helper needs JWT checks",()=>{
 const facade=audit.functions.find(x=>x.category==="PUBLIC_RPC_FACADE");
 const helper=audit.functions.find(x=>x.category==="PRIVATE_GRADING_HELPER");
 assert.ok(facade&&helper);
 assert.equal(facade.securityDefiner,false);
 assert.equal(facade.searchPath,"pg_catalog");
 assert.equal(facade.anonExecute,false);
 assert.equal(facade.authenticatedExecute,true);
 assert.equal(helper.securityDefiner,true);
 assert.equal(helper.searchPath,"pg_catalog");
 assert.equal(helper.anonExecute,false);
 assert.equal(helper.authenticatedExecute,true);
 assert.equal(helper.usesAuthUid,true);
 assert.equal(helper.mentionsSchoolMembershipOrAssignment,true);
 assert.equal(audit.independentlyVerifiedJwtBehavior,false);
});

test("C3.5.3.6: Supabase security advisor issues are classified, never counted as confirmed incidents",()=>{
 const scan=audit.advisoryScan;
 assert.equal(scan.categories.length,5);
 assert.deepEqual(scan.categories.map(x=>x.name).sort(),[
  "anon_security_definer_function_executable",
  "auth_leaked_password_protection",
  "authenticated_security_definer_function_executable",
  "function_search_path_mutable",
  "rls_enabled_no_policy",
 ]);
 assert.deepEqual(scan.categories.map(x=>x.count),[18,14,45,114,1]);
 assert.ok(scan.categories.every(x=>/^https:\/\/supabase\.com\/docs\//.test(x.remediation)));
 assert.equal(scan.automaticFixApproved,false);
 assert.match(scan.note,/not 178 distinct vulnerabilities/i);
 assert.equal(audit.context.incidentConfirmed,false);
});

test("C3.5.3.6: archive integrity is not a real Auth/DB/Storage restore",()=>{
 assert.equal(audit.recovery.databaseArchiveLocalIntegrityPreviouslyReported,true);
 for(const key of [
  "independentDatabaseRestorePerformed","authRecoveryVerified",
  "storageByteRecoveryVerified","bucketPoliciesVerifiedAfterRestore",
  "emailSmsAndWebhooksDisabledOnRecoveryTarget","targetHostApproved",
  "productionAccessOrMigrationAuthorized","fullRollbackTestVerified"
 ]) assert.equal(audit.recovery[key],false,key);
 assert.equal(recovery.releaseReadiness,"BLOCKED");
 assert.equal(recovery.backups.disposableFullRestore,"NOT_PERFORMED");
 assert.equal(recovery.backups.storageObjectCoverage,"NOT_VERIFIED");
 assert.equal(recovery.backups.authCoverage,"NOT_VERIFIED");
 assert.equal(installed.restoredBackupFullyVerified,false);
});

test("C3.5.3.6: no false migration / main / Vercel / real-file go",()=>{
 assert.equal(ledger.allTenStoredSqlTextsFingerprintVerified,true);
 assert.equal(installed.uniqueObjectCount,65);
 assert.equal(snapshot.readiness.historicalSqlTextRecoveredFromLedger,true);
 assert.equal(audit.releaseGates.status,"BLOCKED_REVIEW_AND_RESTORE_REQUIRED");
 for(const k of [
  "historicalRegistryChanged","realGradeExportsReleased","mainMergeApproved",
  "vercelProductionApproved","supabasePrincipalWriteApproved","anyRestorationApproved"
 ]) assert.equal(audit.releaseGates[k],false);
 const active=readdirSync(path.join(root,"supabase/migrations")).filter(x=>/^\d{14}_.+\.sql$/.test(x));
 assert.equal(active.length,54);
 assert.equal(recovery.approvals.productionSQL,false);
 assert.equal(recovery.approvals.mainMerge,false);
});

test("C3.5.3.6: written recovery protocol has independent target and strict approval gates",()=>{
 const doc=read("docs/releases/SCHOOLNET_S4C3C3536_PRIVILEGED_FUNCTIONS_RECOVERY_PLAN_2026-11-26.md");
 for(const token of [
  "Phase A","Phase B","Phase C","Phase D",
  "Auth","Storage","octets","restauration","supabase/migrations",
  "AUCUNE AUTORISATION DE RESTAURATION","SECURITY DEFINER",
  "65 / 65","GO","Supabase principal","SCHOOLNET_REAL_EXPORTS_RELEASED = false"
 ])assert.ok(doc.includes(token),"Missing disaster recovery protection: "+token);
 assert.match(doc,/ne contiennent pas les objets binaires Storage/);
 assert.match(doc,/accord explicite/);
 assert.match(doc,/aucune correction/i);
});

test("C3.5.3.6: isolated GitHub CI and Vercel rollout remain disabled",()=>{
 const ci=read(".github/workflows/schoolnet-s4c3c3536-privileged-review-ci.yml");
 const bridge=read("src/features/official-documents/lib/schoolOfficialExportPreviewBridge.ts");
 assert.equal(vercel.git.deploymentEnabled[branch],false);
 assert.equal(pkg.scripts["qa:s4c3c3536"],
  "node --test scripts/test-schoolnet-s4c3c3536-privileged-review.mjs");
 assert.match(ci,/permissions:\n  contents: read/);
 assert.match(ci,/persist-credentials: false/);
 assert.match(ci,/qa:s4c3c3536/);
 assert.doesNotMatch(ci,/secrets\.|SUPABASE_ACCESS_TOKEN|SUPABASE_DB_URL|supabase start|db push|migration repair|--remote|--linked|vercel deploy|curl |wget /);
 assert.match(bridge,/SCHOOLNET_REAL_EXPORTS_RELEASED = false/);
});
