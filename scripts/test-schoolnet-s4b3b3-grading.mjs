import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 isTeacherOfficialCopies,isTeacherOfficialGradeReceipt,
 isStudentOfficialPublishedResult,formatOfficialPoints,
} from "../src/features/schools/lib/officialTeacherGradingModel.ts";

const read=(path)=>readFileSync(path,"utf8");
const sql=read("supabase/proposals/s4b3b3_official_teacher_grading.sql");
const rollback=read("supabase/verification/s4b3b3_official_teacher_grading_rollback_manual.sql");
const teacherPage=read("src/features/teacher/pages/TeacherOfficialCorrections.tsx");
const studentPage=read("src/features/student/pages/StudentSchoolAssessmentTake.tsx");
const teacherDetail=read("src/features/teacher/pages/TeacherAssessmentDetail.tsx");
const api=read("src/features/schools/lib/officialTeacherGradingApi.ts");
const routes=read("src/routes/router.tsx");
const scenario=read("tests/s4b3b3-tenant-ci/fixtures/corrections-a-b.sql");
const ci=read(".github/workflows/schoolnet-s4b3b3-grading-ci.yml");
const assessmentId="a0000000-0000-4000-8000-000000000001";
const sample=()=>({
 assessmentId,courseId:"70000000-0000-4000-8000-000000000001",
 title:"Quiz A",maxScore:20,classSize:2,
 counts:{notStarted:1,inProgress:0,submitted:1,graded:0,published:0},
 questions:[{id:"q-1",type:"short_text",prompt:"8*6",orderIndex:1,choices:[]}],
 copies:[{
  id:"copy-1",studentName:"Élève A",status:"submitted",
  startedAt:"2026-11-23T11:33:00Z",
  submittedAt:"2026-11-23T11:34:00Z",
  gradedAt:null,publishedAt:null,score:null,feedback:null,
  freeformAnswer:null,
  answers:[{questionId:"q-1",choiceId:null,answerText:"48"}],
 }],
});
test("B3 teacher - accepte la projection scolaire exacte",()=>{
 assert.equal(isTeacherOfficialCopies(sample(),assessmentId),true);
 assert.equal(formatOfficialPoints(17.5).includes("17"),true);
});
test("B3 teacher - refuse toute propriété ou identité superflue",()=>{
 for(const prop of ["studentId","email","secret","parentId","authRole","rawMeta"]){
  assert.equal(isTeacherOfficialCopies({...sample(),[prop]:"probe"},assessmentId),false,prop);
  const x=sample();x.copies[0][prop]="probe";
  assert.equal(isTeacherOfficialCopies(x,assessmentId),false,"copy."+prop);
 }
 assert.equal(isTeacherOfficialCopies(sample(),"wrong-id"),false);
});
test("B3 teacher - copie in_progress ne peut pas exposer ses réponses ou notes",()=>{
 const x=sample();
 x.copies[0].status="in_progress";
 assert.equal(isTeacherOfficialCopies(x,assessmentId),false);
 x.copies[0].answers=[];
 assert.equal(isTeacherOfficialCopies(x,assessmentId),true);
 x.copies[0].score=1;
 assert.equal(isTeacherOfficialCopies(x,assessmentId),false);
});
test("B3 teacher - rejette note hors contrat et champs de correction annexes",()=>{
 const x=sample();
 x.copies[0].status="graded";
 x.copies[0].score=17;
 x.copies[0].gradedAt="2026-11-23T11:35:00Z";
 assert.equal(isTeacherOfficialCopies(x,assessmentId),true);
 x.copies[0].score=25;
 assert.equal(isTeacherOfficialCopies(x,assessmentId),true); // limite réelle imposée en SQL par max_score.
 x.copies[0].answers[0].isCorrect=true;
 assert.equal(isTeacherOfficialCopies(x,assessmentId),false);
});
test("B3 grade - requiert un reçu exact, sans publication implicite",()=>{
 const receipt={
  submissionId:"copy-1",status:"graded",score:17,maxScore:20,
  feedback:"Bonne démarche",gradedAt:"2026-11-23T11:35:00Z",publishedAt:null,
 };
 assert.equal(isTeacherOfficialGradeReceipt(receipt,"copy-1"),true);
 assert.equal(isTeacherOfficialGradeReceipt({...receipt,score:21},"copy-1"),false);
 assert.equal(isTeacherOfficialGradeReceipt({...receipt,status:"published",publishedAt:null},"copy-1"),false);
 assert.equal(isTeacherOfficialGradeReceipt({...receipt,answerKey:"48"},"copy-1"),false);
});
test("B3 student result - impossible avant publication, contrat strict",()=>{
 const result={
  assessmentId,submissionId:"copy-1",score:17,maxScore:20,
  feedback:"Bien",gradedAt:"2026-11-23T11:35:00Z",
  publishedAt:"2026-11-23T11:36:00Z",
 };
 assert.equal(isStudentOfficialPublishedResult(result,assessmentId),true);
 assert.equal(isStudentOfficialPublishedResult({...result,isCorrect:true},assessmentId),false);
 assert.equal(isStudentOfficialPublishedResult({...result,publishedAt:null},assessmentId),false);
 assert.equal(isStudentOfficialPublishedResult({...result,score:30},assessmentId),false);
 assert.equal(isStudentOfficialPublishedResult({...result,assessmentId:"other"},assessmentId),false);
});
test("B3 SQL - auth teacher et contexte scolaire stricts",()=>{
 assert.match(sql,/CREATE FUNCTION schoolnet_private\.teacher_official_grading_link/);
 assert.match(sql,/teacher_school_assessment_context/);
 assert.match(sql,/public\.get_my_role\(\)::text IS DISTINCT FROM 'teacher'/);
 assert.match(sql,/public\.schoolnet_school_teacher_subject_assignments/);
 assert.match(sql,/public\.schoolnet_school_student_class_assignments/);
 assert.match(sql,/public\.schoolnet_school_memberships/);
 assert.match(sql,/public\.schoolnet_schools/);
 assert.match(sql,/schoolnet_private\.school_assessment_links/);
 assert.match(sql,/S4B3B3_ACCESS_DENIED/);
 assert.match(sql,/SET search_path=pg_catalog/);
});
test("B3 SQL - note globale manuelle, publication explicite, sans score client élève",()=>{
 assert.match(sql,/p_score numeric DEFAULT NULL,p_feedback text DEFAULT NULL/);
 assert.match(sql,/p_action NOT IN \('grade','publish'\)/);
 assert.match(sql,/status='graded'/);
 assert.match(sql,/status='published'/);
 assert.match(sql,/p_score>v_a\.max_score/);
 assert.match(sql,/p_score<>round\(p_score,2\)/);
 assert.match(sql,/FOR UPDATE/);
 assert.match(sql,/S4B3B3_CANNOT_PUBLISH/);
 assert.doesNotMatch(sql,/DROP TABLE|TRUNCATE|ALTER TABLE/);
});
test("B3 SQL - trigger V1 garde et notification officielle dirigée au bon lien",()=>{
 assert.match(sql,/S4-B\.3-B\.3 : les corrections officielles/);
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.notify_assessment_correction_published/);
 assert.match(sql,/school:assessment:result:published/);
 assert.match(sql,/\/app\/student\/school-courses\//);
 assert.match(sql,/ON CONFLICT DO NOTHING/);
 assert.match(rollback,/CREATE OR REPLACE FUNCTION public\.notify_assessment_correction_published/);
 assert.match(rollback,/S4B3B3_OFFICIAL_GRADING_ROLLBACK_PASS/);
});
test("B3 SQL - résultat étudiant seulement published, aucune note avant",()=>{
 assert.match(sql,/schoolnet_private\.student_school_assessment_preview/);
 assert.match(sql,/s\.student_id=v_uid AND s\.status::text='published'/);
 assert.match(sql,/s\.score IS NOT NULL AND s\.published_at IS NOT NULL/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.schoolnet_student_official_published_result/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.schoolnet_student_official_published_result/);
});
test("B3 interface - aucune lecture ni écriture directe des tables de copies",()=>{
 assert.match(api,/supabase\.rpc\("schoolnet_teacher_official_copies"/);
 assert.match(api,/supabase\.rpc\("schoolnet_teacher_official_grade"/);
 assert.match(api,/supabase\.rpc\("schoolnet_student_official_published_result"/);
 assert.doesNotMatch(api,/\.from\(|\.insert\(|\.update\(|\.delete\(/);
 assert.match(routes,/teacher\/assessments\/:id\/official-corrections/);
 assert.match(teacherDetail,/getSchoolAssessmentTeacherContext/);
 assert.match(teacherDetail,/context\.eligible&&context\.linked/);
 assert.match(teacherPage,/Enregistrer la correction/);
 assert.match(teacherPage,/Publier le résultat/);
 assert.match(teacherPage,/window\.confirm/);
 assert.match(teacherPage,/SafeRichText/);
 assert.doesNotMatch(teacherPage,/dangerouslySetInnerHTML|\.from\("assessment_submissions"\)/);
});
test("B3 élève - résultat uniquement après publication, chronomètre clos",()=>{
 assert.match(studentPage,/getStudentOfficialPublishedResult/);
 assert.match(studentPage,/state\?\.status!=="published"/);
 assert.match(studentPage,/Résultat officiel publié/);
 assert.match(studentPage,/finished\?"Évaluation terminée":durationLabel\(seconds\)/);
 assert.match(studentPage,/state\.status==="graded".*Votre copie est corrigée/s);
});
test("B3 tests PostgreSQL - A/B, notes, refus, publications, notifications",()=>{
 for(const name of [
 "B3_PASS_STUDENT_RESULT_HIDDEN_BEFORE_GRADE",
 "B3_FAIL_IN_PROGRESS_ANSWERS_LEAK",
 "B3_FAIL_TENANT_CROSS_READ","B3_FAIL_TENANT_CROSS_GRADE",
 "B3_PASS_ROLE_ISOLATION","B3_FAIL_GRADE_OVER_MAX",
 "B3_FAIL_PUBLISH_BEFORE_GRADE","B3_PASS_MANUAL_GRADE_STILL_PRIVATE",
 "B3_PASS_GRADE_CONFIDENTIAL_UNTIL_PUBLISH",
 "B3_PASS_OFFICIAL_NOTIFICATION_ONCE","B3_PASS_CROSS_SCHOOL_STUDENT_RESULT_DENIED",
 "S4B3B3_OFFICIAL_TEACHER_A_B_PASS",
 ])assert.ok(scenario.includes(name),name);
});
test("B3 CI - base locale jetable, rollback manuel, jamais de migration principale",()=>{
 assert.match(ci,/npm run qa:s4b3b3/);
 assert.match(ci,/npm run build/);
 assert.match(ci,/supabase start -x/);
 assert.match(ci,/s4b3b3_official_teacher_grading\.sql/);
 assert.match(ci,/s4b3b3-tenant-ci\/fixtures\/corrections-a-b\.sql/);
 assert.match(ci,/s4b3b3_official_teacher_grading_rollback_manual\.sql/);
 assert.match(ci,/supabase stop --no-backup/);
 assert.doesNotMatch(ci,/supabase db push|vercel deploy|vercel --prod/);
});
