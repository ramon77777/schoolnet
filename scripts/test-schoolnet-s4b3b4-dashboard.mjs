import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {isStudentOfficialDashboard} from "../src/features/student/lib/studentOfficialDashboardModel.ts";

const read=(name)=>readFileSync(new URL("../"+name,import.meta.url),"utf8");
const sql=read("supabase/proposals/s4b3b4_student_official_dashboard.sql");
const rollback=read("supabase/verification/s4b3b4_student_official_dashboard_rollback_manual.sql");
const api=read("src/features/student/lib/studentOfficialDashboardApi.ts");
const page=read("src/features/student/pages/StudentDashboard.tsx");
const officialComponent=read("src/features/student/components/StudentOfficialDashboardSummary.tsx");
const fixture=read("tests/s4b3b4-tenant-ci/fixtures/dashboard-a-b.sql");
const ci=read(".github/workflows/schoolnet-s4b3b4-dashboard-ci.yml");
const course={
  courseId:"course-a",title:"Mathematiques",description:null,schoolId:"school-a",
  schoolName:"Ecole A",classId:"class-a",className:"6e A",schoolYear:"2026-2027",
  subjectName:"Mathematiques",
};
const attempt=(status="not_started")=>({
  assessmentId:"quiz-a",courseId:"course-a",title:"Quiz",type:"quiz",
  dueAt:"2026-11-30T12:00:00Z",maxScore:20,status,
  submittedAt:status==="not_started"?null:"2026-11-23T12:00:00Z",
  score:status==="published"?20:null,
  publishedAt:status==="published"?"2026-11-23T12:10:00Z":null,
});
test("B4 contrat : cours officiels et statut publie valide",()=>{
  assert.equal(isStudentOfficialDashboard({courses:[course],assessments:[attempt("published")]}),true);
  assert.equal(isStudentOfficialDashboard({courses:[],assessments:[]}),true);
});
test("B4 : aucune note avant publication (submitted, graded)",()=>{
  for(const status of ["submitted","graded","in_progress"]){
    assert.equal(isStudentOfficialDashboard({courses:[course],assessments:[{...attempt(status),score:20}]}),false);
    assert.equal(isStudentOfficialDashboard({courses:[course],assessments:[{...attempt(status),publishedAt:"2026-11-23T12:10:00Z"}]}),false);
  }
});
test("B4 : aucune identite, aucune propriete en trop",()=>{
  assert.equal(isStudentOfficialDashboard({courses:[{...course,studentId:"hidden"}],assessments:[]}),false);
  assert.equal(isStudentOfficialDashboard({courses:[course],assessments:[{...attempt(),feedback:"secret"}]}),false);
});
test("B4 : rejette les evaluations et cours etrangers ou dupliques",()=>{
  assert.equal(isStudentOfficialDashboard({courses:[course],assessments:[{...attempt(),courseId:"other"}]}),false);
  assert.equal(isStudentOfficialDashboard({courses:[course,course],assessments:[]}),false);
  assert.equal(isStudentOfficialDashboard({courses:[course],assessments:[attempt(),attempt()]}),false);
});
test("B4 SQL : une seule RPC et l'acces classe securise existant",()=>{
  assert.match(sql,/schoolnet_private\.student_school_courses\(\)/);
  assert.match(sql,/schoolnet_private\.student_school_course_assessments/);
  assert.match(sql,/s\.student_id=v_uid/);
  assert.match(sql,/s\.status::text='published'/);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.schoolnet_student_official_dashboard/);
  assert.match(sql,/S4B3B4_POSTFLIGHT_FAILED/);
  assert.doesNotMatch(sql,/\b(?:TRUNCATE|ALTER TABLE|DROP TABLE|INSERT INTO|UPDATE public\.)\b/i);
});
test("B4 : navigateur sans SELECT direct des notes officielles",()=>{
  assert.match(api,/supabase\.rpc\("schoolnet_student_official_dashboard"\)/);
  assert.doesNotMatch(api,/\.from\(|\.insert\(|\.update\(|\.delete\(/);
  assert.match(page,/StudentOfficialDashboardSummary/);
  assert.match(officialComponent,/getStudentOfficialDashboard/);
  assert.match(officialComponent,/student\/school-courses/);
});
test("B4 : conservation V1, pas de faux calcul de moyenne trimestrielle",()=>{
  assert.match(page,/course_enrollments/);
  assert.match(page,/student_progress/);
  assert.match(page,/homework_submissions/);
  assert.doesNotMatch(page,/student_period_averages/);
  assert.match(officialComponent,/Moyenne des résultats publiés/);
  assert.match(page,/Moyenne publiée — V1/);
});
test("B4 : scenario PostgreSQL A\\/B et rollback cible",()=>{
  assert.match(fixture,/B4_PASS_STUDENT_A_PUBLISHED_SCORE/);
  assert.match(fixture,/B4_PASS_STUDENT_B_ISOLATED/);
  assert.match(rollback,/S4B3B4_STUDENT_OFFICIAL_DASHBOARD_ROLLBACK_PASS/);
  assert.match(ci,/s4b3b4_student_official_dashboard\.sql/);
  assert.match(ci,/qa:s4b3b4/);
});
