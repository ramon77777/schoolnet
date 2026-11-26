import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  getGeneralStudentReview,
} from "../src/features/schools/lib/schoolGeneralStudentReview.ts";
import { displayGeneralAverage } from "../src/features/schools/lib/schoolOfficialGeneralAveragesModel.ts";
import {
  DEMO_SCHOOLS, makeDemoGradeConfig, makeDemoCurriculum,
  makeDemoGeneralPreview,
} from "../src/features/schools/lib/schoolOfficialGeneralAveragesDemo.ts";

const read = (p) => readFileSync(new URL("../"+p, import.meta.url),"utf8").replace(/\r\n/g,"\n");
const page=read("src/features/schools/pages/LocalSchoolOfficialGeneralAverages.tsx");
const helper=read("src/features/schools/lib/schoolGeneralStudentReview.ts");
const api=read("src/features/schools/lib/schoolOfficialGeneralAveragesApi.ts");
const routes=read("src/routes/router.tsx");
const vercel=JSON.parse(read("vercel.json"));
const pkg=JSON.parse(read("package.json"));
const ci=read(".github/workflows/schoolnet-s4c5-student-review-ci.yml");
const branch="feature/schoolnet-s4c5-general-student-review-20261126";
const config=makeDemoGradeConfig(DEMO_SCHOOLS[0].id);
const scope={
  schoolId:DEMO_SCHOOLS[0].id,
  schoolYearId:config.years[0].id,
  classId:config.subjects[0].classId,
  periodId:config.periods[0].id,
};
const preview=makeDemoGeneralPreview(scope);
const row=(state)=>preview.students.find(s=>s.state===state);

test("S4-C.5: fiche individuelle bâtie uniquement sur la projection approuvée",()=>{
  assert.equal(makeDemoCurriculum(scope).status,"approved");
  const student=preview.students[0];
  const detail=getGeneralStudentReview(preview,scope,student.studentId);
  assert.ok(detail);
  assert.equal(detail.student.studentId,student.studentId);
  assert.equal(detail.student.studentName,student.studentName);
  assert.equal(detail.remainingSubjects,student.expectedSubjects-student.readySubjects);
  assert.match(detail.explanation,/provisoire et non publiée/);
  assert.notEqual(detail.student,student,"A copied summary must not modify projection rows");
});

test("S4-C.5: une moyenne zéro reste une vraie moyenne, pas une absence",()=>{
  const zero=preview.students.find(s=>s.averageOn20===0);
  assert.ok(zero);
  const detail=getGeneralStudentReview(preview,scope,zero.studentId);
  assert.ok(detail);
  assert.equal(detail.student.state,"ready");
  assert.equal(detail.student.averageOn20,0);
  assert.equal(detail.remainingSubjects,0);
  assert.match(displayGeneralAverage(detail.student),/0,00/);
});

test("S4-C.5: résultat incomplet reste sans moyenne affichée",()=>{
  const target=row("incomplete");
  assert.ok(target);
  const detail=getGeneralStudentReview(preview,scope,target.studentId);
  assert.ok(detail);
  assert.equal(detail.student.averageOn20,null);
  assert.equal(displayGeneralAverage(detail.student),"—");
  assert.ok(detail.remainingSubjects>0);
  assert.match(detail.explanation,/incomplètes/);
});

test("S4-C.5: matières non configurées : aucun calcul ni moyenne inventés",()=>{
  const target=row("not_configured");
  assert.ok(target);
  const detail=getGeneralStudentReview(preview,scope,target.studentId);
  assert.ok(detail);
  assert.equal(detail.student.averageOn20,null);
  assert.equal(displayGeneralAverage(detail.student),"—");
  assert.match(detail.explanation,/ne sont pas configurées/);
});

test("S4-C.5: ni élève inexistant ni périmètre d'une autre classe/école/période",()=>{
  const student=preview.students[0];
  assert.equal(getGeneralStudentReview(preview,scope,"00000000-0000-4000-8000-000000000999"),null);
  assert.equal(getGeneralStudentReview(preview,{...scope,schoolId:DEMO_SCHOOLS[1].id},student.studentId),null);
  assert.equal(getGeneralStudentReview(preview,{...scope,classId:"00000000-0000-4000-8000-000000000345"},student.studentId),null);
  assert.equal(getGeneralStudentReview(preview,{...scope,periodId:config.periods[1].id},student.studentId),null);
  assert.equal(getGeneralStudentReview(preview,{...scope,schoolYearId:"00000000-0000-4000-8000-000000000999"},student.studentId),null);
});

test("S4-C.5: aucune fiche pour un programme absent, non approuvé ou projection malformée",()=>{
  const student=preview.students[0];
  const wrong={...scope,periodId:config.periods[1].id};
  const missing=makeDemoGeneralPreview(wrong);
  assert.equal(missing.state,"not_configured");
  assert.equal(getGeneralStudentReview(missing,wrong,student.studentId),null);
  assert.equal(getGeneralStudentReview(null,scope,student.studentId),null);
  assert.equal(getGeneralStudentReview({...preview,rawGrades:[]},scope,student.studentId),null);
  assert.equal(getGeneralStudentReview({...preview,studentCount:999},scope,student.studentId),null);
});

test("S4-C.5: une note forgée sur un élève incomplet invalide tout l'aperçu",()=>{
  const student=row("incomplete");
  assert.ok(student);
  const tampered=structuredClone(preview);
  const entry=tampered.students.find(s=>s.studentId===student.studentId);
  assert.ok(entry);
  entry.averageOn20=13.5;
  assert.equal(getGeneralStudentReview(tampered,scope,student.studentId),null);
});

test("S4-C.5: composant intégré au tableau existant, session school_admin et contexte anti-fuite",()=>{
  assert.match(routes,/RoleGate allowed=\{\["school_admin"\]\}/);
  assert.match(routes,/path: "school\/official-general-averages"/);
  assert.match(page,/!user\.isDemo/);
  assert.match(page,/getGeneralStudentReview\(currentPreview, scope, selectedReview\.studentId\)/);
  assert.match(page,/selectedReview\?\.scopeKey === reviewKey/);
  assert.match(page,/setSelectedReview\(null\)/);
  assert.match(page,/aria-expanded=\{selectedStudentReview\?\.student\.studentId === student\.studentId\}/);
  assert.match(page,/colSpan=\{5\}/);
  assert.match(page,/Fiche individuelle · Aperçu privé non publié/);
  assert.match(page,/Fermer la fiche/);
});

test("S4-C.5: ni backend changé, ni export réel, ni création ou publication de bulletin",()=>{
  assert.match(helper,/isOfficialGeneralPreview\(raw, scope\)/);
  assert.doesNotMatch(helper,/supabase|\.rpc\(|\.from\(|fetch\(|window\.|localStorage/);
  assert.doesNotMatch(page,/supabase\.rpc|\.from\(|student_period_averages|publish_admin_report_card|Télécharger|Exporter/);
  assert.match(page,/Aucun recalcul local, aucune note brute, aucun bulletin créé ou publié/);
  assert.match(api,/isOfficialGeneralPreview\(data, scope\)/);
  assert.equal(vercel.git.deploymentEnabled[branch],false);
  assert.equal(pkg.scripts["qa:s4c5"],
    "node --experimental-strip-types --test scripts/test-schoolnet-s4c5-general-student-review.mjs");
  assert.match(ci,/permissions:\n  contents: read/);
  assert.match(ci,/persist-credentials: false/);
  assert.doesNotMatch(ci,/secrets\.|SUPABASE_ACCESS_TOKEN|SUPABASE_DB_URL|supabase (?:link|db push|migration repair)|vercel deploy/);
});
