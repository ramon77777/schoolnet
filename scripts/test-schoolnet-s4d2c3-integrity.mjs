import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { orderSchoolExportStudents } from "../src/features/official-documents/lib/schoolSyntheticRosterOrder.ts";
import { makeSyntheticPreviewDocument } from "../src/features/official-documents/lib/schoolSyntheticPreviewDocument.ts";
import { renderSyntheticPreviewPdf } from "../src/features/official-documents/lib/schoolSyntheticPreviewPdf.ts";
import { renderSyntheticPreviewXlsx } from "../src/features/official-documents/lib/schoolSyntheticPreviewXlsx.ts";
import { makeSyntheticExportCase } from "./fixtures/schoolnet-s4d2c2-synthetic-preview.mjs";

const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8").replace(/\r\n/g,"\n");
const latin=bytes=>Buffer.from(bytes).toString("latin1");
const uuid=i=>"00000000-0000-4000-8000-"+String(i).padStart(12,"0");
const student=(name,i)=>({
 studentId:uuid(i),studentName:name,
 state:"ready",averageOn20:0,completedItems:3,expectedItems:3,
});
const document=(f)=>makeSyntheticPreviewDocument(
 f.projection,f.request,f.viewer,f.labels,f.generatedAt);

test("S4-D.2c.3: deterministic accent-tolerant ordering with UUID tie breaker",()=>{
 const input=[
  student("Yao",9),student("Émilie",4),student("Aïcha",3),
  student("Emilie",2),student("Aicha",1),student("Yao",5),
 ];
 const key=x=>x.map(s=>s.studentId);
 const expected=key(orderSchoolExportStudents(input));
 assert.deepEqual(expected,[uuid(1),uuid(3),uuid(2),uuid(4),uuid(5),uuid(9)]);
 assert.deepEqual(key(orderSchoolExportStudents(input.slice().reverse())),expected);
 assert.deepEqual(key(orderSchoolExportStudents([input[2],input[4],input[1],input[5],input[3],input[0]])),expected);
});
test("S4-D.2c.3: student records and input array remain unchanged",()=>{
 const a=Object.freeze(student("Yao",1));
 const b=Object.freeze(student("Abou",2));
 const input=Object.freeze([a,b]);
 const result=orderSchoolExportStudents(input);
 assert.deepEqual(result.map(x=>x.studentName),["Abou","Yao"]);
 assert.deepEqual(input.map(x=>x.studentName),["Yao","Abou"]);
 assert.equal(result[0],b);
});
test("S4-D.2c.3: duplicate full names accepted, duplicate IDs forbidden",()=>{
 assert.deepEqual(orderSchoolExportStudents([student("Awa",9),student("Awa",1)]).map(x=>x.studentId),
  [uuid(1),uuid(9)]);
 assert.throws(()=>orderSchoolExportStudents([student("Awa",1),student("Aya",1)]),/Identité/);
 assert.throws(()=>orderSchoolExportStudents([student("Aya",1),student("Aya",1)]),/Identité/);
 assert.throws(()=>orderSchoolExportStudents([student(" \t Aya",9)]),/Identité/);
 assert.throws(()=>orderSchoolExportStudents([]),/Effectif/);
});
test("S4-D.2c.3: immutable projection builds the same PDF roster for any backend row order",()=>{
 const f=makeSyntheticExportCase();
 const orig=JSON.stringify(f.projection);
 const a=document(f);
 const pdfA=renderSyntheticPreviewPdf(a);
 f.projection.students.reverse();
 const b=document(f);
 assert.deepEqual(a.rows,b.rows);
 assert.deepEqual(pdfA,renderSyntheticPreviewPdf(b));
 assert.notEqual(JSON.stringify(f.projection),orig);
 assert.equal(a.rows.length,13);
 assert.equal(a.rows[0].studentName,"Élève synthétique 001");
 assert.equal(a.rows[1].averageOn20,0);
 assert.equal(a.rows[2].averageOn20,null);
});
test("S4-D.2c.3: Excel roster remains identical to PDF and format does not change sorting",()=>{
 const f=makeSyntheticExportCase();
 const pdf=document(f);
 const xlsxFixture=makeSyntheticExportCase({format:"xlsx"});
 xlsxFixture.projection.students.reverse();
 const sheet=document(xlsxFixture);
 assert.deepEqual(pdf.rows,sheet.rows);
 const bytes=renderSyntheticPreviewXlsx(sheet);
 assert.ok(bytes.length>5000);
 const asLatin=latin(bytes);
 assert.ok(asLatin.includes("xl/worksheets/sheet1.xml"));
 assert.equal(sheet.completionUnit,"évaluations");
});
test("S4-D.2c.3: every school label field must be explicitly scoped and allowlisted",()=>{
 const f=makeSyntheticExportCase();
 const bad={...f.labels,legacyV1SchoolName:"École X"};
 assert.throws(()=>makeSyntheticPreviewDocument(
  f.projection,f.request,f.viewer,bad,f.generatedAt),/Métadonnées/);
 assert.throws(()=>makeSyntheticPreviewDocument(
  f.projection,f.request,f.viewer,{...f.labels,schoolYearId:uuid(999)},f.generatedAt),/Métadonnées/);
 assert.throws(()=>makeSyntheticPreviewDocument(
  f.projection,f.request,f.viewer,{...f.labels,subjectId:uuid(999)},f.generatedAt),/Métadonnées/);
 assert.throws(()=>makeSyntheticPreviewDocument(
  f.projection,f.request,f.viewer,{...f.labels,source:"UNTRUSTED_BROWSER_TEXT"},f.generatedAt),/Métadonnées/);
});
test("S4-D.2c.3: 250 students allowed, 251 and forged identity rejected",()=>{
 const f=makeSyntheticExportCase({rowCount:250});
 assert.equal(document(f).rows.length,250);
 assert.throws(()=>orderSchoolExportStudents(new Array(251).fill(student("Awa",1))),/Effectif/);
 const first=structuredClone(f.projection.students[0]);
 first.studentId=f.projection.students[1].studentId;
 f.projection.students[0]=first;
 assert.throws(()=>document(f),/périmètre|non conforme/);
});
test("S4-D.2c.3: PDF short synthetic audit reference is distinguishing suffix",()=>{
 const f=makeSyntheticExportCase();
 const d=document(f);
 const pdf=latin(renderSyntheticPreviewPdf(d));
 assert.match(pdf,/00000090/);
 assert.doesNotMatch(pdf,/R.f.rence de recette : 00000000(?:\s|\\)/);
 assert.equal(d.auditId,"00000000-0000-4000-8000-000000000090");
});
test("S4-D.2c.3: no production data or grant bypass introduced",()=>{
 const hub=read("src/features/official-documents/pages/SchoolOfficialDocumentsHub.tsx");
 const bridge=read("src/features/official-documents/lib/schoolOfficialExportPreviewBridge.ts");
 const js=read("src/features/official-documents/lib/schoolSyntheticRosterOrder.ts");
 const model=read("src/features/official-documents/lib/schoolSyntheticPreviewDocument.ts");
 const config=JSON.parse(read("vercel.json"));
 const pkg=JSON.parse(read("package.json"));
 const workflow=read(".github/workflows/schoolnet-s4d2c3-synthetic-integrity-ci.yml");
 const branch="feature/schoolnet-s4d2c3-synthetic-identity-order-20261126";
 assert.equal(config.git.deploymentEnabled[branch],false);
 assert.equal(pkg.scripts["qa:s4d2c3"],
  "node --experimental-strip-types --test scripts/test-schoolnet-s4d2c3-integrity.mjs");
 assert.match(bridge,/SCHOOLNET_REAL_EXPORTS_RELEASED = false/);
 assert.match(model,/orderSchoolExportStudents\(projection\.students\)/);
 assert.ok(!hub.includes("schoolSyntheticRosterOrder"));
 assert.ok(!hub.includes("schoolSyntheticPreviewPdf"));
 for(const s of [js,model,workflow]){
  assert.doesNotMatch(s,/supabase\.rpc|supabase\.from|service_role|SUPABASE_DB_URL|db push|migration repair|fetch\(/i);
 }
 assert.match(workflow,/permissions:\n  contents: read/);
 assert.match(workflow,/persist-credentials: false/);
 assert.doesNotMatch(workflow,/secrets\.|vercel deploy|supabase start/);
 assert.match(read("docs/releases/SCHOOLNET_S4D2C3_SYNTHETIC_INTEGRITY_2026-11-26.md"),/métadonnées/i);
});
