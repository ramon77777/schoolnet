// SCHOOLNET 5D-H: local-only tests, no Auth/Storage/SQL connections.
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  ENROLLMENT_DOCUMENT_BROWSER_DELETE_BLOCKED,
  ENROLLMENT_DOCUMENT_DELETE_NOTICE,
  persistEnrollmentDocumentSafely,
} from "../src/features/enrollments/lib/enrollmentDocumentSafety.ts";
import {resolveAuthorizedCurrentYearClasses} from
  "../src/features/parent/lib/parentYearClassProposal.ts";

const read=(path)=>readFile(new URL(path,import.meta.url),"utf8");
const y25="2025-2026",y26="2026-2027";
const idA="student-a",idB="student-b",idX="not-my-child";
const links=[{student_id:idA},{student_id:idB}];
const cls=[{id:"c25",name:"6e A"},{id:"c26",name:"5e B"}];
const enroll=(student_id,school_year_id,class_id,status="active")=>({
  student_id,school_year_id,class_id,status,
});
const annual=(overrides={})=>resolveAuthorizedCurrentYearClasses({
 verifiedParentLinks:links,currentYearId:y26,
 annualEnrollments:[enroll(idA,y25,"c25"),enroll(idA,y26,"c26")],
 classes:cls,...overrides,
});

test("H 01 - direct browser deletion is forbidden without a server process",()=>{
 assert.equal(ENROLLMENT_DOCUMENT_BROWSER_DELETE_BLOCKED,true);
 assert.match(ENROLLMENT_DOCUMENT_DELETE_NOTICE,/suppression.*suspendue/i);
});
test("H 02 - successful Storage upload and metadata confirmation are ordered once",async()=>{
 const calls=[];const state=await persistEnrollmentDocumentSafely(
 async()=>{calls.push("upload");},async()=>{calls.push("metadata");});
 assert.equal(state,"saved");assert.deepEqual(calls,["upload","metadata"]);
});
test("H 03 - rejected Storage upload never writes metadata",async()=>{
 const calls=[];const state=await persistEnrollmentDocumentSafely(
 async()=>{calls.push("upload");throw Error("offline");},
 async()=>{calls.push("metadata");});
 assert.equal(state,"storage_failed");assert.deepEqual(calls,["upload"]);
});
test("H 04 - uncertain metadata INSERT never runs a destructive compensation",async()=>{
 const calls=[];const state=await persistEnrollmentDocumentSafely(
 async()=>{calls.push("upload");},
 async()=>{calls.push("metadata");throw Error("HTTP timeout after commit");});
 assert.equal(state,"metadata_unconfirmed");
 assert.deepEqual(calls,["upload","metadata"]);
});
test("H 05 - successful uploaded object is retained even on register rejection",async()=>{
 let uploads=0,registers=0;const state=await persistEnrollmentDocumentSafely(
 async()=>{uploads++;},async()=>{registers++;throw Error("conflict");});
 assert.deepEqual({state,uploads,registers},{state:"metadata_unconfirmed",uploads:1,registers:1});
});
test("H 06 - component invokes safe helper and verifies metadata row",async()=>{
 const ui=await read("../src/features/enrollments/components/AdminEnrollmentDocuments.tsx");
 assert.match(ui,/persistEnrollmentDocumentSafely\(/);
 assert.match(ui,/\.select\("id"\)\s*\.single\(\)/);
 assert.match(ui,/outcome === "metadata_unconfirmed"/);
});
test("H 07 - component never deletes a Storage object from browser",async()=>{
 const ui=await read("../src/features/enrollments/components/AdminEnrollmentDocuments.tsx");
 assert.doesNotMatch(ui,/\.from\(BUCKET\)\s*\.remove\(/);
 assert.doesNotMatch(ui,/\.from\(["']student-enrollment-documents["']\)\s*\.remove\(/);
 assert.doesNotMatch(ui,/async function remove\(item: DocumentRow\)/);
});
test("H 08 - component never deletes metadata from browser",async()=>{
 const ui=await read("../src/features/enrollments/components/AdminEnrollmentDocuments.tsx");
 assert.doesNotMatch(ui,/\.from\("student_enrollment_documents"\)\s*\.delete\(/);
 assert.doesNotMatch(ui,/\.delete\(\)\s*\.eq\("id", item\.id\)/);
});
test("H 09 - removal control is visibly blocked and not clickable",async()=>{
 const ui=await read("../src/features/enrollments/components/AdminEnrollmentDocuments.tsx");
 assert.match(ui,/Suppression suspendue/);
 assert.match(ui,/disabled=\{ENROLLMENT_DOCUMENT_BROWSER_DELETE_BLOCKED \|\|/);
 assert.match(ui,/ENROLLMENT_DOCUMENT_DELETE_NOTICE/);
 assert.doesNotMatch(ui,/onClick=\{\(\) => void remove/);
});
test("H 10 - private download and normal upload are preserved",async()=>{
 const ui=await read("../src/features/enrollments/components/AdminEnrollmentDocuments.tsx");
 assert.match(ui,/\.upload\(objectPath, file, \{ contentType: file\.type, upsert: false \}\)/);
 assert.match(ui,/\.download\(item\.storage_path\)/);
 assert.match(ui,/MAX_SIZE = 10 \* 1024 \* 1024/);
});
test("H 11 - Storage SQL proposal is explicitly PG17 disposable only",async()=>{
 const sql=await read("../supabase/proposals/20261118_schoolnet_lot5dh_storage_delete_SANDBOX_ONLY.sql");
 assert.match(sql,/SANDBOX_ONLY/);
 assert.match(sql,/current_database\(\)<>'schoolnet_lot5d_ci'/);
 assert.match(sql,/server_version_num/);
 assert.match(sql,/to_regclass\('storage\.objects'\)/);
});
test("H 12 - Storage client DELETE policy is denied, without privilege escalation",async()=>{
 const sql=await read("../supabase/proposals/20261118_schoolnet_lot5dh_storage_delete_SANDBOX_ONLY.sql");
 assert.match(sql,/DROP POLICY schoolnet_enrollment_docs_storage_admin_delete ON storage\.objects/);
 assert.match(sql,/CREATE POLICY schoolnet_enrollment_docs_storage_admin_delete/);
 assert.match(sql,/FOR DELETE TO authenticated USING \(false\)/);
 assert.doesNotMatch(sql,/\bGRANT\s+(?:EXECUTE|ALL)/);
});
test("H 13 - no Storage INSERT or SELECT rules are replaced",async()=>{
 const sql=await read("../supabase/proposals/20261118_schoolnet_lot5dh_storage_delete_SANDBOX_ONLY.sql");
 assert.doesNotMatch(sql,/DROP POLICY .*_insert/);
 assert.doesNotMatch(sql,/DROP POLICY .*_select/);
 assert.match(sql,/old_count<>1/);
});
test("H 14 - fixture tests old DELETE before replacing it",async()=>{
 const sql=await read("./lot5d/5dh_storage_delete_before_postgresql17.sql");
 assert.match(sql,/H-PRE 01/);
 assert.match(sql,/SET LOCAL ROLE authenticated/);
 assert.match(sql,/ROLLBACK;/);
});
test("H 15 - fixture asserts new DELETE refusal and existing SELECT/INSERT",async()=>{
 const sql=await read("./lot5d/5dh_storage_delete_after_postgresql17.sql");
 assert.match(sql,/H-POST 02/);
 assert.match(sql,/H-POST 04/);
 assert.match(sql,/H-POST 06/);
 assert.match(sql,/ROLLBACK;/);
});
test("H 16 - Parent resolver uses canonical verified links, not child_ids",()=>{
 const results=annual({annualEnrollments:[
   enroll(idA,y26,"c26"),enroll(idX,y26,"c25"),
 ]});
 assert.deepEqual(results.map(x=>x.studentId),[idA,idB]);
 assert.equal(results[0].className,"5e B");
 assert.equal(results[1].state,"unassigned");
});
test("H 17 - current annual class outranks most recent historical class",()=>{
 const r=annual();
 assert.equal(r[0].state,"current");
 assert.equal(r[0].className,"5e B");
});
test("H 18 - draft and completed statuses cannot imply active class",()=>{
 for(const status of ["draft","completed","cancelled","withdrawn"]){
  const r=annual({annualEnrollments:[enroll(idA,y26,"c26",status)]});
  assert.equal(r[0].state,"unassigned",status);
 }
});
test("H 19 - contradictory duplicate active enrollments fail closed",()=>{
 const r=annual({annualEnrollments:[
  enroll(idA,y26,"c25"),enroll(idA,y26,"c26"),
 ]});
 assert.deepEqual(r[0],{studentId:idA,state:"conflict",className:null});
});
test("H 20 - missing year context or inaccessible enrollment data stays unknown",()=>{
 for(const extra of [{currentYearId:null},{annualEnrollments:null}]){
  const r=annual(extra);
  assert.equal(r[0].state,"unavailable");
 }
});
test("H 21 - unreadable class metadata stays unknown, not unassigned",()=>{
 const r=annual({classes:[]});
 assert.equal(r[0].state,"unavailable");
});
test("H 22 - Parent UI labels existing class as historical, with no new direct SQL grant",async()=>{
 const ui=await read("../src/features/parent/pages/ParentChildren.tsx");
 assert.match(ui,/Dernière classe connue \(année non confirmée\)/);
 assert.match(ui,/Cette classe est historique/);
 assert.doesNotMatch(ui,/from\('student_enrollments'\)/);
 assert.match(ui,/from\('parent_links'\)/);
});
test("H 23 - TeacherClasses explains static demonstration data",async()=>{
 const ui=await read("../src/features/teacher/pages/TeacherClasses.tsx");
 assert.match(ui,/Aperçu illustratif : classes et élèves fictifs/);
 assert.match(ui,/useMemo/);
});
test("H 24 - no real server or production execution in this Lot",async()=>{
 const wf=await read("../.github/workflows/schoolnet-quality.yml");
 const proposal=await read("../supabase/proposals/20261118_schoolnet_lot5dh_storage_delete_SANDBOX_ONLY.sql");
 assert.match(wf,/lot5d_storage_hardening:/);
 assert.match(wf,/postgres:17-alpine/);
 assert.match(wf,/npm run qa:lot5d:h/);
 assert.doesNotMatch(wf,/supabase db push|vercel --prod/i);
 assert.doesNotMatch(proposal,/\bCREATE\s+(?:FUNCTION|ROLE)\b/i);
});
