import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  listFictionalReportCardStudents,
  makeFictionalReportCard,
} from "../src/features/official-documents/lib/schoolFictionalReportCardPreview.ts";
import {
  DEMO_SCHOOLS,makeDemoGradeConfig,makeDemoGeneralPreview,
} from "../src/features/schools/lib/schoolOfficialGeneralAveragesDemo.ts";

const read=(path)=>readFileSync(new URL("../"+path,import.meta.url),"utf8")
  .replace(/\r\n/g,"\n");
const component=read("src/features/official-documents/pages/SchoolFictionalReportCardDemo.tsx");
const model=read("src/features/official-documents/lib/schoolFictionalReportCardPreview.ts");
const hub=read("src/features/official-documents/pages/SchoolOfficialDocumentsHub.tsx");
const router=read("src/routes/router.tsx");
const bridge=read("src/features/official-documents/lib/schoolOfficialExportPreviewBridge.ts");
const workflow=read(".github/workflows/schoolnet-s4d3a-fictional-bulletin-ci.yml");
const docs=read("docs/releases/SCHOOLNET_S4D3A_FICTIONAL_BULLETIN_PREVIEW_2026-11-26.md");
const packageFile=JSON.parse(read("package.json"));
const vercel=JSON.parse(read("vercel.json"));
const branch="feature/schoolnet-s4d3a-fictional-reportcard-preview-20261126";
const students=listFictionalReportCardStudents();
const demoScope=(()=>{
  const cfg=makeDemoGradeConfig(DEMO_SCHOOLS[0].id);
  return {
    schoolId:DEMO_SCHOOLS[0].id,
    schoolYearId:cfg.years[0].id,
    classId:cfg.subjects[0].classId,
    periodId:cfg.periods[0].id,
  };
})();
const basePreview=makeDemoGeneralPreview(demoScope);

test("S4-D.3a: roster contains only the original 13 fictitious students",()=>{
  assert.equal(students.length,13);
  assert.deepEqual(students.map(s=>s.studentId),
    basePreview.students.map(s=>s.studentId));
  assert.deepEqual(students.map(s=>s.studentName),
    basePreview.students.map(s=>s.studentName));
  assert.deepEqual(students.reduce((t,s)=>{
    t[s.state]=(t[s.state]??0)+1;return t;
  },{}),{ready:8,incomplete:3,not_configured:2});
  assert.ok(students.every(s=>s.studentName.startsWith("Élève fictif ")));
});

test("S4-D.3a: report card binds exact original school, year, class, period and pupil",()=>{
  const report=makeFictionalReportCard(students[0].studentId);
  assert.ok(report);
  assert.equal(report.schoolName,"Établissement fictif A");
  assert.match(report.className,/6e B/);
  assert.match(report.yearName,/2026/);
  assert.match(report.periodName,/1er trimestre/);
  assert.deepEqual(report.scope,demoScope);
  assert.deepEqual(report.student,basePreview.students[0]);
  assert.notEqual(report.student,basePreview.students[0]);
  assert.equal(report.generalAverageOn20,basePreview.students[0].averageOn20);
});

test("S4-D.3a: three subjects and weights are from approved C.3-C.4 demo curriculum",()=>{
  const report=makeFictionalReportCard(students[0].studentId);
  assert.ok(report);
  assert.deepEqual(report.subjects.map(s=>s.subjectName),[
    "Mathématiques","Français","Sciences",
  ]);
  assert.deepEqual(report.subjects.map(s=>s.coefficient),[2,1,1]);
  assert.equal(report.subjects.length,3);
  assert.equal(report.student.expectedSubjects,3);
  assert.equal(report.missingSubjectBreakdown,false);
  const calculated=Math.round(report.subjects.reduce(
    (sum,row)=>sum+(row.simulatedAverageOn20??0)*row.coefficient,0
  )/4*100)/100;
  assert.equal(calculated,report.weightedControlOn20);
  assert.ok(Math.abs(calculated-report.generalAverageOn20)<=0.01);
});

test("S4-D.3a: all complete fictional averages reconcile with simulated subject rows",()=>{
  for(const student of students.filter(s=>s.state==="ready")){
    const report=makeFictionalReportCard(student.studentId);
    assert.ok(report);
    assert.ok(report.subjects.every(s=>
      typeof s.simulatedAverageOn20==="number" &&
      s.simulatedAverageOn20>=0 && s.simulatedAverageOn20<=20));
    assert.ok(Math.abs((report.weightedControlOn20??-1)-
      (report.generalAverageOn20??-1))<=0.01);
  }
});

test("S4-D.3a: valid zero is not mistaken for a missing grade",()=>{
  const zero=students.find(s=>basePreview.students.find(
    p=>p.studentId===s.studentId)?.averageOn20===0);
  assert.ok(zero);
  const report=makeFictionalReportCard(zero.studentId);
  assert.ok(report);
  assert.equal(report.student.state,"ready");
  assert.equal(report.generalAverageOn20,0);
  assert.equal(report.weightedControlOn20,0);
  assert.deepEqual(report.subjects.map(s=>s.simulatedAverageOn20),[0,0,0]);
});

test("S4-D.3a: incomplete and not configured never get guessed subject marks",()=>{
  for(const state of ["incomplete","not_configured"]){
    const student=students.find(s=>s.state===state);
    assert.ok(student);
    const report=makeFictionalReportCard(student.studentId);
    assert.ok(report);
    assert.equal(report.generalAverageOn20,null);
    assert.equal(report.weightedControlOn20,null);
    assert.equal(report.missingSubjectBreakdown,true);
    assert.deepEqual(report.subjects.map(s=>s.simulatedAverageOn20),
      [null,null,null]);
    assert.equal(report.student.state,state);
  }
});

test("S4-D.3a: student ID from another establishment cannot open report card",()=>{
  const config=makeDemoGradeConfig(DEMO_SCHOOLS[1].id);
  const otherScope={
    schoolId:DEMO_SCHOOLS[1].id,
    schoolYearId:config.years[0].id,
    classId:config.subjects[0].classId,
    periodId:config.periods[0].id,
  };
  const other=makeDemoGeneralPreview(otherScope);
  assert.equal(other.state,"preview");
  assert.equal(makeFictionalReportCard(other.students[0].studentId),null);
  assert.equal(makeFictionalReportCard("00000000-0000-4000-8000-000000000999"),null);
  assert.equal(makeFictionalReportCard(""),null);
  assert.equal(makeFictionalReportCard(null),null);
  assert.equal(makeFictionalReportCard(undefined),null);
});

test("S4-D.3a: output is always explicit NON PUBLISHED NON OFFICIAL demo",()=>{
  for(const student of students){
    const report=makeFictionalReportCard(student.studentId);
    assert.ok(report);
    assert.equal(report.source,"schoolnet_v2_synthetic_report_card_v1");
    assert.equal(report.fictional,true);
    assert.equal(report.published,false);
    assert.equal(report.printableOfficialDocument,false);
    assert.equal(report.attendance,null);
    assert.equal(report.ranking,null);
    assert.equal(report.staffComment,null);
  }
  assert.match(component,/SPÉCIMEN FICTIF/);
  assert.match(component,/SPÉCIMEN — DONNÉES 100 % FICTIVES — DOCUMENT NON VALABLE/);
  assert.match(component,/elles ne représentent pas des évaluations ni des notes/i);
});

test("S4-D.3a: UI is a real responsive individual bulletin with selector and subject table",()=>{
  assert.match(component,/Prévisualisation d'un bulletin scolaire/);
  assert.match(component,/setStudentId\(event\.target\.value\)/);
  assert.match(component,/makeFictionalReportCard\(studentId\)/);
  assert.match(component,/aria-label=\{"Maquette de bulletin non publié/);
  assert.match(component,/Bulletin scolaire/);
  assert.match(component,/Élève à prévisualiser/);
  assert.match(component,/Résultats par matière/);
  assert.match(component,/Moyenne générale · non publiée/);
  assert.match(component,/Rang","Non disponible/);
  assert.match(component,/Absences","Non disponible/);
  assert.match(component,/Non renseignée/);
  assert.match(component,/Résultats incomplets ou matières non configurées/);
});

test("S4-D.3a: rendered only when local DEV flag, real school_admin and role gate",()=>{
  assert.match(hub,/import\.meta\.env\.DEV/);
  assert.match(hub,/schoolnet_s4d_demo/);
  assert.match(hub,/!user\.isDemo && user\.role === actor/);
  assert.match(hub,/\{allowed && <div className="space-y-6">/);
  assert.match(hub,/\{demo && actor === "school_admin" &&\s*<SchoolFictionalReportCardDemo \/>\}/);
  assert.match(router,/path: "school\/official-documents", element: <SchoolOfficialDocumentsHub actor="school_admin" \/>/);
  assert.doesNotMatch(hub,/schoolnet_s4d_demo=1.*\|\|.*true/);
});

test("S4-D.3a: no Supabase call, print/download/publication or V1 grade reuse in card",()=>{
  assert.doesNotMatch(model,/supabase|\.rpc\(|\.from\(|fetch\(|localStorage|window\./);
  assert.doesNotMatch(component,/supabase|\.rpc\(|\.from\(|fetch\(|localStorage|window\.print|\.click\(\)|download|publish/);
  assert.match(model,/makeDemoGeneralPreview/);
  assert.match(model,/makeDemoCurriculum/);
  assert.match(model,/isOfficialGeneralPreview/);
  assert.match(bridge,/SCHOOLNET_REAL_EXPORTS_RELEASED = false/);
  assert.equal(vercel.git.deploymentEnabled[branch],false);
});

test("S4-D.3a: CI and Windows command are deterministic with CRLF-safe QA",()=>{
  assert.equal(packageFile.scripts["qa:s4d3a"],
    "node --experimental-strip-types --test scripts/test-schoolnet-s4d3a-fictional-bulletin.mjs");
  assert.match(read("scripts/test-schoolnet-s4d3a-fictional-bulletin.mjs"),
    /replace\(\/\\r\\n\/g,"\\n"\)/);
  assert.match(workflow,/permissions:\n  contents: read/);
  assert.match(workflow,/persist-credentials: false/);
  assert.match(workflow,/npm run qa:s4d3a/);
  assert.match(workflow,/npm run qa:s4c5/);
  assert.match(workflow,/npm run build/);
  assert.doesNotMatch(workflow,/secrets\.|SUPABASE_DB_URL|SUPABASE_ACCESS_TOKEN|db push|migration repair/);
  assert.match(docs,/bulletin V2/);
  assert.match(docs,/fictives/);
});
