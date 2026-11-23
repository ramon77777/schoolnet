import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {
 buildOfficialAnswerPayload,isOfficialAttemptState,
 isOfficialOnlineMode,remainingAttemptSeconds,restoreOfficialAnswers,
} from "../src/features/student/lib/studentSchoolAssessmentAttemptModel.ts";

const read=(p)=>readFileSync(p,"utf8");
const sql=read("supabase/proposals/s4b3b2_official_assessment_attempts.sql");
const rollback=read("supabase/verification/s4b3b2_official_assessment_attempts_rollback_manual.sql");
const fixture=read("tests/s4b3b2-tenant-ci/fixtures/attempts-a-b.sql");
const route=read("src/routes/router.tsx");
const page=read("src/features/student/pages/StudentSchoolAssessmentTake.tsx");
const preview=read("src/features/student/pages/StudentSchoolAssessmentPreview.tsx");
const api=read("src/features/student/lib/studentSchoolAssessmentAttemptApi.ts");
const workflow=read(".github/workflows/schoolnet-s4b3b2-attempts-ci.yml");

const courseId="70000000-0000-4000-8000-000000000001";
const assessmentId="a0000000-0000-4000-8000-000000000001";
const questions=[
 {id:"q-1",type:"mcq",prompt:"2+2 ?",orderIndex:1,choices:[
  {id:"choice-a",text:"3",orderIndex:1},{id:"choice-b",text:"4",orderIndex:2},
 ]},
 {id:"q-2",type:"short_text",prompt:"Justifiez.",orderIndex:2,choices:[]},
 {id:"q-3",type:"true_false",prompt:"3 est impair.",orderIndex:3,choices:[
  {id:"choice-c",text:"Vrai",orderIndex:1},{id:"choice-d",text:"Faux",orderIndex:2},
 ]},
];
const state=()=>({
 courseId,assessmentId,attemptId:"attempt-1",status:"in_progress",
 startedAt:"2026-11-23T11:00:00Z",submittedAt:null,
 serverNow:"2026-11-23T11:01:00Z",
 dueAt:"2026-11-24T11:00:00Z",expiresAt:"2026-11-23T11:15:00Z",
 freeformAnswer:null,answers:[
  {questionId:"q-1",choiceId:"choice-b",answerText:null},
  {questionId:"q-2",choiceId:null,answerText:"4"},
 ],
});

test("B2 contract - accepte la copie du seul eleve, sans grade",()=>{
 assert.equal(isOfficialAttemptState(state(),courseId,assessmentId),true);
 assert.equal(isOfficialAttemptState({...state(),status:"not_started",attemptId:null,startedAt:null,answers:[]},courseId,assessmentId),true);
 assert.equal(isOfficialAttemptState({...state(),assessmentId:"wrong"},courseId,assessmentId),false);
 for(const forbidden of ["score","points","is_correct","feedback","studentId","grade","correctAnswer"]){
  assert.equal(isOfficialAttemptState({...state(),[forbidden]:"leak"},courseId,assessmentId),false,forbidden);
 }
 assert.equal(isOfficialAttemptState({...state(),answers:[{...state().answers[0],isCorrect:true}]},courseId,assessmentId),false);
 assert.equal(isOfficialAttemptState({...state(),answers:[state().answers[0],state().answers[0]]},courseId,assessmentId),false);
});
test("B2 payload - correspond aux questions autorisees et aux choix reels",()=>{
 const input={"q-1":"choice-b","q-2":"    48    ","q-3":"choice-c","fake":"forged"};
 const arr=buildOfficialAnswerPayload(questions,input);
 assert.deepEqual(arr,[
  {questionId:"q-1",choiceId:"choice-b",answerText:null},
  {questionId:"q-2",choiceId:null,answerText:"48"},
  {questionId:"q-3",choiceId:"choice-c",answerText:null},
 ]);
 assert.deepEqual(buildOfficialAnswerPayload(questions,{"q-1":"wrong","q-2":"  "}),[]);
 assert.deepEqual(restoreOfficialAnswers(questions,state()),{"q-1":"choice-b","q-2":"4"});
});
test("B2 timer - affichage base sur l'heure serveur, non autorite de validation",()=>{
 const s=state();
 assert.equal(remainingAttemptSeconds(s,1000,1000),14*60);
 assert.equal(remainingAttemptSeconds(s,1000,2000),14*60-1);
 assert.equal(remainingAttemptSeconds(s,1000,999999999),0);
 assert.equal(remainingAttemptSeconds({...s,expiresAt:null},1000,1000),null);
});
test("B2 modes en ligne uniquement (sujet fichier bloque)",()=>{
 assert.equal(isOfficialOnlineMode("online","online_questions"),true);
 assert.equal(isOfficialOnlineMode("online",null),true);
 assert.equal(isOfficialOnlineMode("file_upload",null),false);
 assert.equal(isOfficialOnlineMode("online","file_only"),false);
 assert.equal(isOfficialOnlineMode("online","file_and_questions"),false);
});
test("B2 SQL - seule RPC atomique, definer prive et ACL refusees a anon",()=>{
 assert.match(sql,/CREATE FUNCTION schoolnet_private\.student_school_assessment_attempt/);
 assert.match(sql,/CREATE FUNCTION public\.schoolnet_student_school_assessment_attempt/);
 assert.match(sql,/SECURITY DEFINER/);
 assert.match(sql,/SECURITY INVOKER/);
 assert.match(sql,/SET search_path=pg_catalog/);
 assert.match(sql,/PERFORM schoolnet_private\.student_school_assessment_preview/);
 assert.match(sql,/p_action NOT IN \('read','start','save','submit'\)/);
 assert.match(sql,/ON CONFLICT \(assessment_id,student_id\) DO NOTHING/);
 assert.match(sql,/FOR UPDATE/);
 assert.match(sql,/S4B3B2_TIME_EXPIRED/);
 assert.match(sql,/S4B3B2_DUPLICATE_QUESTION/);
 assert.match(sql,/S4B3B2_FOREIGN_CHOICE/);
 assert.match(sql,/S4B3B2_FILE_MODE_NOT_READY/);
 assert.match(sql,/S4B3B2_OFFICIAL_ATTEMPTS_SQL_PASS/);
 assert.match(sql,/is_correct\s*\)\s*VALUES[\s\S]*?NULL/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.schoolnet_student_school_assessment_attempt/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.schoolnet_student_school_assessment_attempt[\s\S]*?TO authenticated/);
});
test("B2 SQL - absence de notation, liens V1 ou identites fournies par le client",()=>{
 assert.doesNotMatch(sql,/CREATE POLICY .* PERMISSIVE|GRANT SELECT ON public\.submission_answers/i);
 assert.doesNotMatch(sql,/p_student_id|p_score|p_grade|p_submitted_at|p_started_at/i);
 assert.match(sql,/v_uid uuid:=auth\.uid\(\)/);
 assert.match(sql,/schoolnet_private\.school_assessment_links/);
 assert.match(sql,/ne jamais alimenter student_progress V1/);
 assert.match(sql,/notifications de copies officielles attendent/);
 assert.doesNotMatch(sql,/\b(?:INSERT INTO public\.student_progress|INSERT INTO public\.course_enrollments)\b/i);
});
test("B2 frontend - routes V2, sans acces direct aux tables verrouillees",()=>{
 assert.match(route,/student\/school-courses\/:courseId\/assessments\/:assessmentId\/take/);
 assert.match(route,/element: <StudentSchoolAssessmentTake \/>/);
 assert.match(preview,/Commencer ou reprendre l'évaluation/);
 assert.match(page,/requestOfficialAttempt\(courseId,assessmentId,action/);
 assert.match(page,/SafeRichText/);
 assert.match(page,/window\.confirm\("Remettre définitivement/);
 assert.match(page,/Modifications non enregistrées/);
 assert.doesNotMatch(api,/\.from\(|\.insert\(|\.update\(|\.delete\(/);
 assert.match(api,/supabase\.rpc\("schoolnet_student_school_assessment_attempt"/);
 assert.doesNotMatch(page,/dangerouslySetInnerHTML|\.from\("assessment_submissions"\)/);
});
test("B2 tests PG - refus A/B, etats, validations et V1 sans regression",()=>{
 for(const marker of [
  "B2_PASS_STUDENT_A_ATOMIC_AND_IDEMPOTENT","B2_FAIL_FOREIGN_CHOICE_ALLOWED",
  "B2_FAIL_ANSWER_FORGERY","B2_FAIL_EDIT_AFTER_SUBMIT",
  "B2_FAIL_CROSS_TENANT_READ","B2_PASS_SERVER_DEADLINE",
  "B2_PASS_PARENT_TEACHER_UNASSIGNED_DENIED","B2_PASS_LEGACY_V1_UNCHANGED",
  "B2_FAIL_DIRECT_RLS_READ","S4B3B2_A_B_SECURE_ATTEMPTS_PASS",
 ])assert.ok(fixture.includes(marker),marker);
});
test("B2 rollback - ne supprime aucun objet V1 et restaure les 2 triggers",()=>{
 assert.match(rollback,/DROP FUNCTION public\.schoolnet_student_school_assessment_attempt/);
 assert.match(rollback,/DROP FUNCTION schoolnet_private\.student_school_assessment_attempt/);
 assert.match(rollback,/CREATE OR REPLACE FUNCTION public\.trigger_refresh_progress_from_assessment_submission/);
 assert.match(rollback,/CREATE OR REPLACE FUNCTION schoolnet_private\.notify_teacher_on_submission/);
 assert.match(rollback,/S4B3B2_ROLLBACK_PASS/);
 assert.doesNotMatch(rollback,/\b(?:DROP TABLE|TRUNCATE|DELETE FROM public)\b/);
});
test("B2 CI - aucun Supabase principal ni publication Vercel",()=>{
 assert.match(workflow,/npm run qa:s4b3b2/);
 assert.match(workflow,/npm run build/);
 assert.match(workflow,/supabase start -x/);
 assert.match(workflow,/s4b3b2_official_assessment_attempts\.sql/);
 assert.match(workflow,/s4b3b2-tenant-ci\/fixtures\/attempts-a-b\.sql/);
 assert.match(workflow,/s4b3b2_official_assessment_attempts_rollback_manual\.sql/);
 assert.match(workflow,/supabase stop --no-backup/);
 assert.doesNotMatch(workflow,/supabase db push|apply_migration|vercel deploy|vercel --prod/);
});
