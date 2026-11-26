import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root=fileURLToPath(new URL("../",import.meta.url));
const file=(relative)=>readFileSync(path.join(root,relative));
const text=(relative)=>file(relative).toString("utf8");
const json=(relative)=>JSON.parse(text(relative));
const manifest=json("tests/s4c3c353/migration-reconciliation.manifest.json");
const schema=json("tests/s4c3c353/live-schema-contract.json");
const overlay=text("tests/s4c3c353/fixtures/real-schema-compatibility.sql");
const ci=text(".github/workflows/schoolnet-s4c3c353-compatibility-ci.yml");
const http=text("tests/s4c3c35-supabase-ci/official-averages-http.mjs");
const vercel=json("vercel.json");
const packageJson=json("package.json");
const blobSha=(data)=>createHash("sha1").update(`blob ${data.length}\0`).update(data).digest("hex");
// Compare checkout bytes after EOL normalization, but authenticate exact committed Git bytes.
// A source SQL blob can itself contain mixed LF/CRLF, so hashing a globally
// normalized working copy would NOT preserve the immutable Git blob fingerprint.
const normalizeEol=(data)=>data.toString("utf8").replace(/\r\n/g,"\n");
const committedBlob=(relative)=>execFileSync("git",["show",`HEAD:${relative}`],{
 cwd:root,maxBuffer:32*1024*1024
});
const assertGitSourceUnchanged=(relative,expectedSha)=>{
 const original=committedBlob(relative);
 assert.equal(blobSha(original),expectedSha,`Committed Git blob differs: ${relative}`);
 assert.equal(normalizeEol(file(relative)),normalizeEol(original),
  `Working-tree content differs beyond checkout line endings: ${relative}`);
};

test("C3-C.3.5.3.2: historical migration gap is explicit and never silently repaired",()=>{
 assert.equal(manifest.workPackage,"S4-C.3-C.3.5.3.2");
 assert.equal(manifest.comparison.registeredRemoteVersions,62);
 assert.equal(manifest.comparison.repositoryMigrationFiles,54);
 assert.equal(manifest.comparison.reconciliationStatus,"BLOCKED_NO_DEPLOY");
 assert.equal(manifest.historyOnly.length,10);
 assert.equal(manifest.repositoryOnly.length,2);
 assert.equal(new Set(manifest.historyOnly.map(x=>x.version)).size,10);
 assert.equal(new Set(manifest.repositoryOnly.map(x=>x.version)).size,2);
 assert.deepEqual(manifest.historyOnly.map(x=>x.version).sort(),[
  "20261112140100","20261113124329","20261123105413","20261123125725",
  "20261123143017","20261124075811","20261124133104","20261124150608",
  "20261125104641","20261125132844"
 ]);
 const migrationFiles=readdirSync(path.join(root,"supabase/migrations"))
  .filter(name=>/^\d{14}_.+\.sql$/.test(name));
 assert.equal(migrationFiles.length,54,"baseline was created from a fixed Git tree");
 for(const record of manifest.historyOnly){
  assert.ok(!migrationFiles.some(name=>name.startsWith(record.version+"_")),
   "Never invent or install a live migration from an unverified proposal");
 }
});

test("C3-C.3.5.3.2: nine historical groups have SHA-verified candidate proposals, not verified originals",()=>{
 const missing=manifest.historyOnly.find(x=>x.version==="20261113124329");
 assert.equal(missing.provenance,"ORIGINAL_SOURCE_NOT_VERIFIED");
 assert.deepEqual(missing.candidates,[]);
 assert.equal(manifest.historyOnly.filter(x=>x.candidates.length>0).length,9);
 let candidateCount=0;
 for(const item of manifest.historyOnly){
  for(const c of item.candidates){
   assert.ok(c.path.startsWith("supabase/proposals/"));
   assert.match(c.blobSha,/^[a-f0-9]{40}$/);
   assertGitSourceUnchanged(c.path,c.blobSha);
   candidateCount++;
  }
 }
 assert.equal(candidateCount,10,"one historical group has two linked SQL proposals");
 for(const r of manifest.repositoryOnly){
  assert.ok(r.path.startsWith("supabase/migrations/"));
  assertGitSourceUnchanged(r.path,r.blobSha);
 }
});

test("C3-C.3.5.3.2: LF, mixed EOL, and Windows CRLF checkout retain Git source integrity",()=>{
 const example=manifest.historyOnly.find(x=>x.version==="20261123105413").candidates[0];
 const committed=committedBlob(example.path);
 const committedText=committed.toString("utf8");
 assert.match(committedText,/\r\n/,"Historical SQL includes mixed line endings");
 assert.match(committedText,/(?<!\r)\n/,"Historical SQL also includes LF-only lines");
 const simulatedWindows=Buffer.from(normalizeEol(committed).replace(/\n/g,"\r\n"),"utf8");
 assert.equal(normalizeEol(simulatedWindows),normalizeEol(committed));
 assert.equal(blobSha(committed),example.blobSha,"Original blob SHA remains exact");
 assert.notEqual(normalizeEol(Buffer.concat([simulatedWindows,Buffer.from("-- unexpected SQL edit\r\n")])),
  normalizeEol(committed),"A real SQL edit must still be detected");
});

test("C3-C.3.5.3.2: actual types and SELECT + RLS distinction are modeled without claims of exact policy parity",()=>{
 assert.equal(schema.postgresql,"17.6");
 assert.equal(schema.requiredTables.length,17);
 assert.ok(schema.enums.user_role.includes("school_admin"));
 assert.deepEqual(schema.enums.assessment_status,["draft","published","closed"]);
 assert.deepEqual(schema.enums.submission_status,["in_progress","submitted","graded","published"]);
 assert.deepEqual(schema.enums.course_status,["active","archived"]);
 assert.equal(schema.importantColumns["public.profiles"].role,"user_role");
 assert.equal(schema.importantColumns["public.assessment_submissions"].status,"submission_status");
 for(const table of ["public.profiles","public.assessment_submissions"]){
  assert.equal(schema.grants[table].anonSelect,true);
  assert.equal(schema.grants[table].authenticatedSelect,true);
  assert.equal(schema.grants[table].rls,true);
 }
 assert.equal(schema.grants["public.schoolnet_school_student_class_assignments"].authenticatedSelect,false);
 assert.equal(schema.getMyRole.returnType,"user_role");
 assert.match(overlay,/CREATE TYPE public\.user_role AS ENUM/);
 assert.match(overlay,/CREATE TYPE public\.submission_status AS ENUM/);
 assert.match(overlay,/RETURNS public\.user_role/);
 assert.match(overlay,/GRANT SELECT ON TABLE public\.assessment_submissions TO anon,authenticated/);
 assert.match(overlay,/GRANT SELECT ON TABLE public\.schoolnet_school_memberships TO authenticated/);
 assert.match(overlay,/CREATE POLICY c353_submissions_own_fixture/);
 assert.match(overlay,/student_id=\(SELECT auth\.uid\(\)\)/);
 assert.match(overlay,/to_regclass\('schoolnet_private\.school_official_curricula'\) IS NOT NULL/);
 assert.doesNotMatch(overlay,/CREATE (?:OR REPLACE )?FUNCTION auth\.uid|CREATE SCHEMA auth/);
 assert.ok(schema.limitations.some(x=>/Synthetic CI/i.test(x)));
});

test("C3-C.3.5.3.2: real HTTP integration fixture runs on disposable localhost and revokes foreign grade access",()=>{
 assert.match(ci,/127\.0\.0\.1 -p 55422/);
 assert.match(ci,/supabase start -x realtime,storage-api/);
 assert.match(ci,/supabase stop --no-backup/);
 assert.match(ci,/real-schema-compatibility\.sql/);
 assert.match(ci,/supabase\/proposals\/s4c3c3_official_curriculum_and_general_average_kernel\.sql/);
 assert.match(ci,/supabase\/proposals\/s4c3c3_school_admin_official_general_averages_rpc\.sql/);
 assert.match(ci,/SCHOOLNET_C353_SCHEMA_PARITY=1/);
 assert.match(http,/REAL_SCHEMA_PARITY/);
 assert.match(http,/own\.every\(row=>row\.student_id===users\.student_a1\.id\)/);
 assert.match(http,/assert\.deepEqual\(rows,\[\]/);
 assert.doesNotMatch(ci,/supabase (?:link|db push|db reset|migration repair)|--remote|--linked|SUPABASE_DB_URL|SUPABASE_ACCESS_TOKEN|secrets\./);
 assert.match(ci,/permissions:\r?\n  contents: read/);
});

test("C3-C.3.5.3.2: no production Git/Vercel publication from isolated branch",()=>{
 assert.equal(vercel.git.deploymentEnabled["feature/schoolnet-s4c3c353-schema-reconciliation-20261126"],false);
 assert.match(ci,/feature\/schoolnet-s4c3c352-official-rpc-real-auth-20261126/);
 assert.match(ci,/cancel-in-progress: true/);
 assert.equal(packageJson.scripts["qa:s4c3c353"],
  "node --test scripts/test-schoolnet-s4c3c353-schema-reconciliation.mjs");
 assert.ok(manifest.guardrails.some(x=>/main branch merge/i.test(x)));
});
