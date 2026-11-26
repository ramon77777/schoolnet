import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root=fileURLToPath(new URL("../",import.meta.url));
const read=p=>readFileSync(path.join(root,p),"utf8").replace(/\r\n/g,"\n");
const json=p=>JSON.parse(read(p));
const objectInventory=json("tests/s4c3c3535/installed-effect-inventory.json");
const remoteLedger=json("tests/s4c3c3534/ledger-statement-evidence.json");
const originalManifest=json("tests/s4c3c353/migration-reconciliation.manifest.json");
const previousAudit=json("tests/s4c3c3534/readonly-parity-observation.json");
const recoverability=json("tests/s4c3c3533/recovery-readiness.json");
const vercel=json("vercel.json");
const pack=json("package.json");
const branch="feature/schoolnet-s4c3c3535-effect-inventory-20261126";
const originalGit=p=>execFileSync("git",["show","HEAD:"+p],{cwd:root,maxBuffer:32*1024*1024}).toString("utf8");
const cleanComments=s=>s.replace(/--[^\r\n]*/g,"");
const patterns=[
 ["table",/\bCREATE\s+(?:UNLOGGED\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_]+\.[a-z_][a-z0-9_]*)/giu],
 ["function",/\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([a-z_]+\.[a-z_][a-z0-9_]*)\s*\(/giu],
 ["trigger",/\bCREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\s+([a-z_][a-z0-9_]*)/giu],
 ["policy",/\bCREATE\s+POLICY\s+([a-z_][a-z0-9_]*)/giu],
];

test("C3.5.3.5: immutable historical source set is 10 SHA-verified ledger versions",()=>{
 assert.equal(objectInventory.workPackage,"S4-C.3-C.3.5.3.5");
 assert.equal(objectInventory.sourceVersionCount,10);
 assert.equal(objectInventory.projectRef,remoteLedger.projectRef);
 assert.equal(objectInventory.projectRef,recoverability.projectRef);
 assert.equal(originalManifest.comparison.registeredRemoteVersions,62);
 assert.equal(originalManifest.comparison.repositoryMigrationFiles,54);
 assert.equal(remoteLedger.allTenStoredSqlTextsFingerprintVerified,true);
 assert.equal(previousAudit.migrationHistory.storedLedgerStatementsPresent,10);
 assert.deepEqual(remoteLedger.versions.map(v=>v.version).sort(),originalManifest.historyOnly.map(v=>v.version).sort());
 assert.equal(objectInventory.observationDate,"2026-11-26");
});

test("C3.5.3.5: enumerate CREATE declarations from committed Git blobs, no regression in object origin",()=>{
 const expected=[];
 for(const version of remoteLedger.versions){
  const clean=cleanComments(originalGit(version.paths[0]));
  for(const [kind,re] of patterns){
   for(const m of clean.matchAll(re))expected.push({kind,name:m[1],version:version.version});
  }
 }
 assert.equal(expected.length,objectInventory.sourceOccurrences);
 const keys=[...new Set(expected.map(x=>x.kind+"|"+x.name))].sort();
 const recorded=objectInventory.objects.map(x=>x.kind+"|"+x.name).sort();
 assert.deepEqual(recorded,keys);
 for(const entry of objectInventory.objects){
  const from=[...new Set(expected.filter(x=>x.kind===entry.kind&&x.name===entry.name).map(x=>x.version))].sort();
  assert.deepEqual(entry.declaredIn,from,"Unexpected historical origin: "+entry.name);
  assert.equal(entry.present,true,"Declared historical object currently missing: "+entry.name);
 }
});

test("C3.5.3.5: 65/65 current catalog names found, with explicit type coverage",()=>{
 assert.equal(objectInventory.uniqueObjectCount,65);
 assert.equal(objectInventory.objects.length,65);
 assert.equal(objectInventory.sourceOccurrences,67);
 const want={function:50,table:9,trigger:5,policy:1};
 for(const [kind,number] of Object.entries(want)){
  const group=objectInventory.objects.filter(x=>x.kind===kind);
  assert.equal(group.length,number);
  assert.equal(objectInventory.counts[kind].expected,number);
  assert.equal(objectInventory.counts[kind].found,number);
  assert.ok(group.every(x=>x.present));
 }
});

test("C3.5.3.5: all nine historical tables have RLS, and five named triggers are active",()=>{
 const tabs=objectInventory.objects.filter(x=>x.kind==="table");
 assert.equal(tabs.length,9);
 for(const entry of tabs){
  assert.equal(entry.rlsEnabledObserved,true,entry.name);
  assert.equal(typeof entry.rlsForcedObserved,"boolean");
 }
 for(const entry of objectInventory.objects.filter(x=>x.kind==="trigger")){
  assert.equal(entry.enabledObserved,"O");
  assert.match(entry.attachedToObserved,/^[a-z_]+\.[a-z_][a-z0-9_]*$/);
 }
 const policy=objectInventory.objects.filter(x=>x.kind==="policy");
 assert.equal(policy.length,1);
 assert.equal(policy[0].name,"schoolnet_family_token_insert_auth");
 assert.equal(policy[0].attachedToObserved,"schoolnet_family_auth_proof.token_issue_observations");
});

test("C3.5.3.5: function signatures and grants are observations, NOT a correctness certification",()=>{
 const fns=objectInventory.objects.filter(x=>x.kind==="function");
 assert.equal(fns.length,50);
 for(const fn of fns){
  assert.equal(typeof fn.signatureObserved,"string");
  assert.equal(typeof fn.returnTypeObserved,"string");
  assert.ok(fn.returnTypeObserved.length>0);
  assert.equal(typeof fn.searchPathObserved,"string");
  assert.equal(typeof fn.securityDefinerObserved,"boolean");
  assert.equal(typeof fn.anonExecuteObserved,"boolean");
  assert.equal(typeof fn.authenticatedExecuteObserved,"boolean");
 }
 assert.equal(objectInventory.allObjectDefinitionsIdenticalToRecordedSql,false);
 assert.equal(objectInventory.securityReviewOpen,true);
 assert.ok(objectInventory.limitations.some(x=>/not definition equivalence|not yet compared/.test(x)));
});

test("C3.5.3.5: inherited SECURITY DEFINER trigger functions get a dedicated review, no invented exploit",()=>{
 const review=objectInventory.objects.filter(x=>x.kind==="function"&&x.securityDefinerObserved&&x.anonExecuteObserved);
 assert.deepEqual(review.map(x=>x.name).sort(),[
  "public.notify_assessment_correction_published",
  "public.trigger_refresh_progress_from_assessment_submission",
 ]);
 assert.ok(review.every(x=>x.returnTypeObserved==="trigger"));
 assert.ok(previousAudit.limitations.some(x=>x.includes("get_my_role")));
});

test("C3.5.3.5: original migration folder remains untouched and two inert source texts stay separate",()=>{
 const migrations=readdirSync(path.join(root,"supabase/migrations")).filter(n=>/^\d{14}_.+\.sql$/.test(n));
 assert.equal(migrations.length,54);
 assert.equal(originalManifest.historyOnly.length,10);
 for(const v of originalManifest.historyOnly)assert.ok(!migrations.some(m=>m.startsWith(v.version+"_")));
 assert.equal(remoteLedger.recoveredRemoteOnlyStatementAsInertText,1);
 assert.equal(remoteLedger.recoveredCompositeStatementAsInertText,1);
 for(const item of remoteLedger.versions.filter(x=>x.kind.includes("RECOVERED_NONEXECUTABLE"))){
  assert.match(item.paths[0],/^tests\/s4c3c3534\/recovered-ledger\/.*\.sql\.txt$/);
 }
});

test("C3.5.3.5: existing backup, Auth and Storage gates stay unresolved",()=>{
 assert.equal(objectInventory.restoredBackupFullyVerified,false);
 assert.equal(objectInventory.goForDeployment,false);
 assert.equal(recoverability.releaseReadiness,"BLOCKED");
 assert.equal(recoverability.backups.disposableFullRestore,"NOT_PERFORMED");
 assert.equal(recoverability.backups.authCoverage,"NOT_VERIFIED");
 assert.equal(recoverability.backups.storageObjectCoverage,"NOT_VERIFIED");
 assert.equal(recoverability.approvals.productionSQL,false);
 assert.equal(recoverability.approvals.mainMerge,false);
});

test("C3.5.3.5: current audit is SELECT-only, no production writes or school rows",()=>{
 assert.equal(objectInventory.sqlWritesOnHostedProject,0);
 assert.equal(objectInventory.schoolRowsRead,0);
 assert.equal(objectInventory.historyLedgerModified,false);
 const doc=read("docs/releases/SCHOOLNET_S4C3C3535_INSTALLED_EFFECTS_AND_RECOVERY_GATE_2026-11-26.md");
 for(const token of ["65 / 65","SECURITY DEFINER","Auth","Storage","restauration","GO","Supabase principal"]){
  assert.ok(doc.includes(token),"Missing release caution: "+token);
 }
 assert.ok(doc.includes("n'est pas une certification"));
});

test("C3.5.3.5: isolated CI, nondeploy branch and package command remain nonproduction",()=>{
 const ci=read(".github/workflows/schoolnet-s4c3c3535-effect-inventory-ci.yml");
 assert.equal(vercel.git.deploymentEnabled[branch],false);
 assert.equal(pack.scripts["qa:s4c3c3535"],"node --test scripts/test-schoolnet-s4c3c3535-effect-inventory.mjs");
 assert.match(ci,/permissions:\n  contents: read/);
 assert.match(ci,/persist-credentials: false/);
 assert.match(ci,/qa:s4c3c3535/);
 assert.doesNotMatch(ci,/supabase (?:start|link|db push|db reset|migration repair)|--remote|--linked|secrets\.|SUPABASE_DB_URL|SUPABASE_ACCESS_TOKEN|curl |wget /i);
 assert.equal(objectInventory.goForDeployment,false);
});
