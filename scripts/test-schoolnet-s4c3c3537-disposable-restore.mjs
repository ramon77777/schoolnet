import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,readdirSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";

const root=fileURLToPath(new URL("../",import.meta.url));
const read=p=>readFileSync(path.join(root,p),"utf8").replace(/\r\n/g,"\n");
const json=p=>JSON.parse(read(p));
const script=read("tests/s4c3c3537/run-disposable-restore.sh");
const fixture=read("tests/s4c3c3537/disposable-school-fixture.sql");
const roles=read("tests/s4c3c3537/disposable-role-setup.sql");
const ci=read(".github/workflows/schoolnet-s4c3c3537-disposable-restore-ci.yml");
const doc=read("docs/releases/SCHOOLNET_S4C3C3537_FICTITIOUS_RESTORE_REHEARSAL_2026-11-26.md");
const recovery=json("tests/s4c3c3533/recovery-readiness.json");
const audit=json("tests/s4c3c3536/privileged-review-observation.json");
const pkg=json("package.json");
const vercel=json("vercel.json");
const branch="feature/schoolnet-s4c3c3537-fictitious-pg-restore-20261126";

test("C3.5.3.7: runner hard-fails outside disposable GitHub Linux with local-only endpoints",()=>{
 for(const text of ["GITHUB_ACTIONS","RUNNER_OS","GITHUB_WORKSPACE","RUNNER_TEMP","CI",
  "SUPABASE_DB_URL","SUPABASE_ACCESS_TOKEN","DATABASE_URL","exit 66","exit 67"]){
   assert.ok(script.includes(text),"missing guard "+text);
 }
 assert.ok(script.includes("SOURCE=55432")&&script.includes("TARGET=55433"));
 assert.match(script,/127\.0\.0\.1/g);
 assert.doesNotMatch(script,/(?:supabase\.co|supabase link|--linked|--remote|db push|migration repair|https:\/\/|curl |wget )/i);
 assert.match(script,/mktemp -d/);
 assert.match(script,/trap 'rm -rf "\$TMP"' EXIT/);
});

test("C3.5.3.7: CI uses two independent PostgreSQL 17 containers with synthetic-only passwords",()=>{
 assert.match(ci,/source:\n\s+image: postgres:17\.6/);
 assert.match(ci,/target:\n\s+image: postgres:17\.6/);
 assert.match(ci,/55432:5432/);
 assert.match(ci,/55433:5432/);
 assert.match(ci,/POSTGRES_DB: schoolnet_synthetic/g);
 assert.match(ci,/POSTGRES_PASSWORD: schoolnet_fictitious_ci_only/g);
 assert.match(ci,/permissions:\n  contents: read/);
 assert.match(ci,/persist-credentials: false/);
 assert.doesNotMatch(ci,/(?:secrets\.|SUPABASE_DB_URL|SUPABASE_ACCESS_TOKEN|service_role|supabase start|supabase link|migration repair|db push|--remote)/i);
});

test("C3.5.3.7: SQL fixture does not touch Supabase Auth, existing tables or real grades",()=>{
 assert.match(fixture,/CREATE SCHEMA schoolnet_rehearsal/);
 assert.match(fixture,/CREATE TABLE schoolnet_rehearsal\.students/);
 assert.match(fixture,/CREATE TABLE schoolnet_rehearsal\.mock_auth_accounts/);
 assert.match(fixture,/CREATE TABLE schoolnet_rehearsal\.mock_storage_metadata/);
 const code=fixture.replace(/--[^\n]*/g,"");
 for(const marker of ["public.profiles","auth.users","storage.objects","schoolnet_private.","service_role",
   "schoolnet_schools","CREATE FUNCTION"]){
   assert.ok(!code.includes(marker),"forbidden live object reference "+marker);
 }
 assert.equal((code.match(/\bCREATE TABLE\b/g)||[]).length,3);
 assert.equal((code.match(/\bCREATE POLICY\b/g)||[]).length,6);
 assert.equal((code.match(/\bENABLE ROW LEVEL SECURITY\b/g)||[]).length,3);
 assert.equal((code.match(/\bFORCE ROW LEVEL SECURITY\b/g)||[]).length,3);
});

test("C3.5.3.7: A/B fixture is entirely fake and protects authentic zero vs NULL",()=>{
 for(const value of ["schoolnet_rehearsal_a","schoolnet_rehearsal_b",
   "schoolnet_rehearsal_guest"]){
   assert.ok(roles.includes("CREATE ROLE "+value+" NOLOGIN"));
 }
 assert.match(fixture,/Élève fictif 001/);
 assert.match(fixture,/Élève fictif 005/);
 assert.match(fixture,/0\.00,'ready'/);
 assert.match(fixture,/NULL,'incomplete'/);
 assert.match(fixture,/synthetic-admin-a@example\.test/);
 assert.match(fixture,/synthetic-teacher-b@example\.test/);
 assert.ok(!fixture.includes("@schoolnet")&&!fixture.includes("@gmail"));
});

test("C3.5.3.7: actual pg_dump -Fc and pg_restore are used with a separate target",()=>{
 for(const marker of [
  "pg pg_dump -Fc","--no-owner --schema=schoolnet_rehearsal",
  "pg pg_restore --exit-on-error --single-transaction --no-owner",
  "-p \"$SOURCE\"","-p \"$TARGET\"",
  "pg pg_restore -l","sha256sum -c",
 ]) assert.ok(script.includes(marker),"missing backup proof "+marker);
 assert.match(script,/Independent empty target|Target empty/);
 assert.match(script,/Tamper|tampered/i);
});

test("C3.5.3.7: restored RLS and school separation are tested under PostgreSQL roles",()=>{
 for(const marker of [
  "Six RLS policies preserved","Three RLS-enabled tables",
  "SET ROLE schoolnet_rehearsal_a","SET ROLE schoolnet_rehearsal_b",
  "SET ROLE schoolnet_rehearsal_guest","A cannot read B","B cannot read A",
  "Real zero distinct from missing average","Guest forbidden",
  "Mock Auth A scope",
 ])assert.ok(script.includes(marker));
 assert.match(fixture,/GRANT SELECT ON ALL TABLES/);
});

test("C3.5.3.7: Storage file bytes are independently archived and matched to restored metadata",()=>{
 for(const marker of ["sha256sum blobs/*","tar -cf","tar -xf",
  "mock_storage_metadata","bytes_sha256","A blob/metadata parity","B blob/metadata parity",
  "Fake blob tampering detected","Fake blob recovery repeated"]){
   assert.ok(script.includes(marker),"missing separate blob handling "+marker);
 }
 assert.ok(script.includes("C3537_REAL_STORAGE_SERVICE_RESTORE=NOT_PERFORMED"));
 assert.ok(script.includes("C3537_REAL_GOTRUE_RESTORE=NOT_PERFORMED"));
 assert.ok(script.includes("C3537_PRODUCTION_GO=FALSE"));
});

test("C3.5.3.7: no contradiction with earlier recovery-readiness block",()=>{
 assert.equal(recovery.releaseReadiness,"BLOCKED");
 assert.equal(recovery.approvals.productionSQL,false);
 assert.equal(recovery.approvals.mainMerge,false);
 assert.equal(recovery.backups.disposableFullRestore,"NOT_PERFORMED");
 assert.equal(audit.recovery.independentDatabaseRestorePerformed,false);
 assert.equal(audit.recovery.storageByteRecoveryVerified,false);
 assert.equal(audit.releaseGates.status,"BLOCKED_REVIEW_AND_RESTORE_REQUIRED");
});

test("C3.5.3.7: written acceptance criteria distinguish fake mocks from real Auth and Storage",()=>{
 for(const marker of ["PostgreSQL 17","fictives","Auth","Storage",
  "GoTrue","octets","restauration","GO","Supabase principal",
  "données réelles","AUCUNE","validation Windows"]){
   assert.ok(doc.includes(marker),"Missing clarification "+marker);
 }
 assert.match(doc,/ne prouve pas une restauration complète/i);
});

test("C3.5.3.7: branch is disabled for Vercel, package has static Windows QA only",()=>{
 assert.equal(vercel.git.deploymentEnabled[branch],false);
 assert.equal(pkg.scripts["qa:s4c3c3537"],
   "node --test scripts/test-schoolnet-s4c3c3537-disposable-restore.mjs");
 assert.ok(!pkg.scripts["qa:s4c3c3537"].includes("bash"));
 assert.match(ci,/npm run qa:s4c3c3537/);
 assert.match(ci,/bash tests\/s4c3c3537\/run-disposable-restore\.sh/);
 const migrationCount=readdirSync(path.join(root,"supabase/migrations"))
  .filter(f=>/^\d{14}_.+\.sql$/.test(f)).length;
 assert.equal(migrationCount,54);
 const bridge=read("src/features/official-documents/lib/schoolOfficialExportPreviewBridge.ts");
 assert.match(bridge,/SCHOOLNET_REAL_EXPORTS_RELEASED = false/);
});
