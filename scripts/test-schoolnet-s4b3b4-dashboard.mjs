import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {isStudentOfficialDashboard} from "../src/features/student/lib/studentOfficialDashboardModel.ts";
import {combineStudentDashboards} from "../src/features/student/lib/studentCombinedDashboardModel.ts";

const read=(name)=>readFileSync(new URL("../"+name,import.meta.url),"utf8");
const sql=read("supabase/proposals/s4b3b4_student_official_dashboard.sql");
const rollback=read("supabase/verification/s4b3b4_student_official_dashboard_rollback_manual.sql");
const api=read("src/features/student/lib/studentOfficialDashboardApi.ts");
const page=read("src/features/student/pages/StudentDashboard.tsx");
const officialComponent=read("src/features/student/components/StudentOfficialDashboardSummary.tsx");
const helper=read("src/features/student/lib/studentCombinedDashboardModel.ts");
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
  assert.match(page,/getStudentOfficialDashboard/);
  assert.doesNotMatch(officialComponent,/supabase\.rpc|\.from\(/);
  assert.match(page,/combineStudentDashboards/);
  assert.match(officialComponent,/student\/school-courses/);
});
test("B4 : conservation V1, pas de faux calcul de moyenne trimestrielle",()=>{
  assert.match(page,/course_enrollments/);
  assert.match(page,/student_progress/);
  assert.match(page,/homework_submissions/);
  assert.doesNotMatch(page,/student_period_averages/);
  assert.match(page,/Moyenne des résultats publiés/);
  assert.match(page,/Moyenne publiée V1/);
  assert.match(page,/Évaluations réalisées par cours/);
  assert.match(helper,/assessments\.set\(a\.assessmentId/);
});
test("B4 : scenario PostgreSQL A\\/B et rollback cible",()=>{
  assert.match(fixture,/B4_PASS_STUDENT_A_PUBLISHED_SCORE/);
  assert.match(fixture,/B4_PASS_STUDENT_B_ISOLATED/);
  assert.match(rollback,/S4B3B4_STUDENT_OFFICIAL_DASHBOARD_ROLLBACK_PASS/);
  assert.match(ci,/s4b3b4_student_official_dashboard\.sql/);
  assert.match(ci,/qa:s4b3b4/);
});

const legacyCourse={id:"course-a",title:"Mathematiques V1"};
const legacyQuiz={
  id:"quiz-a",course_id:"course-a",title:"Quiz commun",
  type:"Quiz",completed:true,scorePercent:50,
  due_at:"2026-12-03T12:00:00Z",submittedAt:"2026-11-20T10:00:00Z",
  created_at:"2026-11-19T10:00:00Z",
};
const now=Date.parse("2026-11-24T12:00:00Z");
test("B4 finition : resultat officiel 20/20 dans tous les indicateurs generaux",()=>{
 const result=combineStudentDashboards([] ,[],{courses:[course],assessments:[attempt("published")]},now);
 assert.equal(result.courseCount,1);
 assert.equal(result.assessmentCount,1);
 assert.equal(result.completedCount,1);
 assert.equal(result.pendingCount,0);
 assert.equal(result.publishedCount,1);
 assert.equal(result.averageScore,100);
 assert.equal(result.completionRate,100);
 assert.equal(result.quizCount,1);
 assert.equal(result.courseProgressData[0].progression,100);
 assert.equal(result.assessmentMixData[0].value,1);
 assert.equal(result.scoreTrendData[0].score,100);
});
test("B4 finition : cours et evaluations uniques si V1 et V2 se recouvrent",()=>{
 const result=combineStudentDashboards([legacyCourse],[legacyQuiz],
  {courses:[course],assessments:[attempt("published")]},now);
 assert.equal(result.courseCount,1);
 assert.equal(result.assessmentCount,1);
 assert.equal(result.completedCount,1);
 assert.equal(result.averageScore,100);
 assert.equal(result.quizCount,1);
 assert.equal(result.publishedCount,1);
});
test("B4 finition : pas de fuite du score grade ou submitted avant publication",()=>{
 for(const status of ["submitted","graded"]){
  const result=combineStudentDashboards([legacyCourse],[legacyQuiz],
   {courses:[course],assessments:[attempt(status)]},now);
  assert.equal(result.completedCount,1);
  assert.equal(result.publishedCount,0);
  assert.equal(result.averageScore,null);
  assert.equal(result.scoreTrendData.length,0);
 }
});
test("B4 finition : cours libres seuls sans RPC V2 restent fonctionnels",()=>{
 const result=combineStudentDashboards([legacyCourse],[legacyQuiz],
  {courses:[],assessments:[]},now);
 assert.equal(result.courseCount,1);
 assert.equal(result.completedCount,1);
 assert.equal(result.averageScore,50);
});
test("B4 finition : evaluations futures V2 et liens officiels corrects",()=>{
 const future={...attempt(),assessmentId:"future-b",dueAt:"2026-11-30T18:00:00Z"};
 const result=combineStudentDashboards([] ,[],
  {courses:[course],assessments:[future,attempt("published")]},now);
 assert.equal(result.pendingCount,1);
 assert.equal(result.assessmentCount,2);
 assert.equal(result.upcomingAssessments.length,1);
 assert.equal(result.upcomingAssessments[0].id,"future-b");
 assert.equal(result.upcomingAssessments[0].url,
  "/app/student/school-courses/course-a/assessments/future-b/take");
});
test("B4 finition : une moyenne trimestrielle n'est jamais inventee",()=>{
 const result=combineStudentDashboards([],[],
  {courses:[course],assessments:[attempt("published")]},now);
 assert.equal(result.averageScore,100);
 assert.equal("termAverage" in result,false);
 assert.equal("semesterAverage" in result,false);
 assert.match(page,/pas une moyenne trimestrielle/);
});
