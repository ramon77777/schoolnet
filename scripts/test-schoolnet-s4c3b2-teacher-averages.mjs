import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {isTeacherOfficialSubjectAverages}
 from "../src/features/teacher/lib/teacherOfficialAveragesModel.ts";
import {isTeacherOfficialAveragesCatalog,isTeacherOfficialAveragesActivationPending}
 from "../src/features/teacher/lib/teacherOfficialAveragesCatalogModel.ts";

const x="10000000-0000-4000-8000-000000000001";
const y="20000000-0000-4000-8000-000000000002";
const z="30000000-0000-4000-8000-000000000003";
const c="40000000-0000-4000-8000-000000000004";
const subject="50000000-0000-4000-8000-000000000005";
const student="60000000-0000-4000-8000-000000000006";
const data={
 schoolId:x,schoolYearId:y,periodId:z,classId:c,subjectId:subject,
 subjectCoefficient:2,teacherScoped:true,previewOnly:true,
 students:[{studentId:student,studentName:"Eleve fictif",
  includedAssessments:2,publishedAssessments:2,
  state:"ready",averageOn20:12.5}],
};
const expectScope={schoolId:x,periodId:z,classId:c,subjectId:subject};

test("C3-B.2: strict role/subject scoped response and published preview",()=>{
 assert.equal(isTeacherOfficialSubjectAverages(data,expectScope),true);
 assert.equal(isTeacherOfficialSubjectAverages(data,{...expectScope,schoolId:y}),false);
 assert.equal(isTeacherOfficialSubjectAverages({...data,previewOnly:false}),false);
 assert.equal(isTeacherOfficialSubjectAverages({...data,teacherScoped:false}),false);
 assert.equal(isTeacherOfficialSubjectAverages({...data,teacherId:student}),false);
});

test("C3-B.2: no unpublished scores, feedback, rankings or foreign student",()=>{
 for(const row of [
  {...data.students[0],averageOn20:null},
  {...data.students[0],feedback:"secret"},
  {...data.students[0],rank:1},
  {...data.students[0],publishedAssessments:3},
  {...data.students[0],averageOn20:21},
  {...data.students[0],state:"published"},
  {...data.students[0],state:"incomplete",averageOn20:0},
 ]){
  assert.equal(isTeacherOfficialSubjectAverages({...data,students:[row]}),false);
 }
 assert.equal(isTeacherOfficialSubjectAverages(
  {...data,students:[data.students[0],data.students[0]]}),false);
});

test("C3-B.2: unpublished and no coefficient remain non-calculable",()=>{
 const incomplete={...data.students[0],publishedAssessments:1,state:"incomplete",averageOn20:null};
 assert.equal(isTeacherOfficialSubjectAverages({...data,students:[incomplete]}),true);
 const missing={...data.students[0],includedAssessments:0,
  publishedAssessments:0,state:"not_configured",averageOn20:null};
 assert.equal(isTeacherOfficialSubjectAverages({
  ...data,subjectCoefficient:null,students:[missing],
 }),true);
 assert.equal(isTeacherOfficialSubjectAverages({
  ...data,subjectCoefficient:null,students:[data.students[0]],
 }),false);
});

test("C3-B.2: SQL is read-only, teacher scoped and avoids legacy averages",()=>{
 const sql=readFileSync(new URL(
 "../supabase/proposals/s4c3b2_teacher_official_subject_averages.sql",
 import.meta.url),"utf8");
 assert.match(sql,/auth\.uid\(\)/);
 assert.match(sql,/public\.get_my_role\(\)/);
 assert.match(sql,/teacher_assignment\.teacher_id=v_uid/);
 assert.match(sql,/membership\.member_role='student'/);
 assert.match(sql,/submission\.status::text='published'/);
 assert.match(sql,/setting\.include_in_average IS TRUE/);
 assert.match(sql,/assessment\.created_by=v_uid/);
 assert.match(sql,/SECURITY INVOKER/);
 assert.match(sql,/SECURITY DEFINER/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.schoolnet_teacher_official_subject_averages/);
 assert.doesNotMatch(sql,/\bUPDATE\s+public\.assessment_submissions|\bDELETE\s+FROM\s+public\.assessment_submissions|\bINSERT\s+INTO\s+public\.assessment_submissions/i);
 assert.doesNotMatch(sql,/student_period_averages|average_grade_entries|grading_periods V1/i);
});

test("C3-B.2: frontend calls only guarded RPC, not grade tables",()=>{
 const api=readFileSync(new URL(
  "../src/features/teacher/lib/teacherOfficialAveragesApi.ts",import.meta.url),"utf8");
 assert.match(api,/supabase\.rpc\("schoolnet_teacher_official_subject_averages"/);
 assert.doesNotMatch(api,/supabase\.from\(/);
 assert.doesNotMatch(api,/assessment_submissions|student_period_averages/);
});


test("C3-B.2 UI: catalogue d'affectations valide, sans notes individuelles",()=>{
 const period={id:z,code:"T1",name:"Premier trimestre",
  startsOn:"2026-09-15",endsOn:"2026-12-18",isLocked:false};
 const a={assignmentId:student,schoolId:x,schoolName:"College A",
  schoolYearId:y,schoolYearName:"2026-2027",classId:c,className:"6e A",
  subjectId:subject,subjectName:"Mathématiques",periods:[period]};
 const catalogue={assignments:[a]};
 assert.equal(isTeacherOfficialAveragesCatalog(catalogue),true);
 assert.equal(isTeacherOfficialAveragesCatalog({assignments:[]}),true);
 assert.equal(isTeacherOfficialAveragesCatalog({...catalogue,students:[data.students[0]]}),false);
 assert.equal(isTeacherOfficialAveragesCatalog({assignments:[{...a,score:20}]}),false);
 assert.equal(isTeacherOfficialAveragesCatalog({assignments:[a,a]}),false);
 assert.equal(isTeacherOfficialAveragesCatalog({assignments:[{...a,periods:[period,period]}]}),false);
 assert.equal(isTeacherOfficialAveragesCatalog({assignments:[{...a,periods:[{...period,endsOn:"2026-08-01"}]}]}),false);
 assert.equal(isTeacherOfficialAveragesActivationPending({
  code:"PGRST202",message:"schema cache"}),true);
 assert.equal(isTeacherOfficialAveragesActivationPending({
  code:"42501",message:"permission denied"}),false);
});

test("C3-B.2 UI: catalogue SQL strict, RPC lecture seule et permissions",()=>{
 const sql=readFileSync(new URL(
  "../supabase/proposals/s4c3b2_teacher_official_averages_catalog.sql",
  import.meta.url),"utf8");
 assert.match(sql,/auth\.uid\(\)/);
 assert.match(sql,/public\.get_my_role\(\)/);
 assert.match(sql,/assignment\.teacher_id=v_uid/);
 assert.match(sql,/assignment\.revoked_at IS NULL/);
 assert.match(sql,/membership\.user_id=v_uid/);
 assert.match(sql,/membership\.revoked_at IS NULL/);
 assert.match(sql,/assignment\.school_year_id/);
 assert.match(sql,/period\.school_year_id=eligible\.year_id/);
 assert.match(sql,/SECURITY DEFINER SET search_path=pg_catalog/);
 assert.match(sql,/SECURITY INVOKER SET search_path=pg_catalog/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.schoolnet_teacher_official_averages_catalog/);
 assert.doesNotMatch(sql,/assessment_submissions|student_period_averages|submission_answers|score|feedback/i);
 const api=readFileSync(new URL(
  "../src/features/teacher/lib/teacherOfficialAveragesCatalogApi.ts",
  import.meta.url),"utf8");
 assert.match(api,/supabase\.rpc\("schoolnet_teacher_official_averages_catalog"\)/);
 assert.doesNotMatch(api,/supabase\.from\(/);
});

test("C3-B.2 UI: route officielle conservée dans le menu Moyennes unifié, sans publication",()=>{
 const routes=readFileSync(new URL("../src/routes/router.tsx",import.meta.url),"utf8");
 const sidebar=readFileSync(new URL("../src/layouts/DashboardLayout.tsx",import.meta.url),"utf8");
 const page=readFileSync(new URL(
  "../src/features/teacher/pages/TeacherOfficialAverages.tsx",import.meta.url),"utf8");
 assert.match(routes,/teacher\/official-averages/);
 assert.match(routes,/TeacherOfficialAverages/);
 assert.doesNotMatch(sidebar,/to="\/app\/teacher\/official-averages"/);
 assert.match(routes,/TeacherAveragesHub/);
 assert.match(routes,/teacher\/averages\/free/);
 assert.match(sidebar,/to="\/app\/teacher\/averages"/);
 assert.match(page,/user\.role==="teacher"/);
 assert.match(page,/!user\.isDemo/);
 assert.match(page,/getTeacherOfficialAveragesCatalog\(/);
 assert.match(page,/getTeacherOfficialSubjectAverages\(/);
 assert.match(page,/Prévisualisation uniquement/);
 assert.match(page,/row\.state==="ready"/);
 assert.match(page,/Activation SQL en attente/); // user-facing unavailable state
 assert.doesNotMatch(page,/supabase\.from\(|supabase\.auth|\.insert\(|\.update\(|\.delete\(/);
 assert.doesNotMatch(page,/Exporter les notes|Publier les moyennes|Envoyer aux parents/);
});
