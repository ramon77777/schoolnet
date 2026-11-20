import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {isStudentOfficialAssessmentPreview} from
 "../src/features/student/lib/studentSchoolAssessmentPreviewModel.ts";

const read=path=>readFileSync(path,"utf8");
const sql=read("supabase/proposals/s4b3b1_student_official_assessment_preview.sql");
const appliedSql=read("supabase/migrations/20261120145127_schoolnet_s4b3b1_student_official_assessment_preview.sql");
const rollback=read("supabase/verification/s4b3b1_student_official_assessment_preview_rollback_manual.sql");
const scenario=read("tests/s4b3b1-tenant-ci/fixtures/preview-a-b.sql");
const model=read("src/features/student/lib/studentSchoolAssessmentPreviewModel.ts");
const api=read("src/features/student/lib/studentSchoolAssessmentPreviewApi.ts");
const page=read("src/features/student/pages/StudentSchoolAssessmentPreview.tsx");
const catalog=read("src/features/student/components/StudentSchoolCourseAssessments.tsx");
const router=read("src/routes/router.tsx");
const ci=read(".github/workflows/schoolnet-s4b3b1-preview-ci.yml");

const courseId="70000000-0000-4000-8000-000000000001";
const assessmentId="a0000000-0000-4000-8000-000000000001";
function validPreview(){
 return {
  courseId,assessmentId,title:"Quiz publié",type:"quiz",
  description:"Calcul mental",dueAt:"2026-11-25T09:00:00+00:00",
  timeLimitMinutes:15,maxScore:20,submissionMode:"online",examContentMode:null,
  instructionFileName:null,sectionTitle:"Nombres",questions:[
   {id:"question1",type:"mcq",prompt:"2+2 ?",orderIndex:1,choices:[
    {id:"choice1",text:"3",orderIndex:1},
    {id:"choice2",text:"4",orderIndex:2},
   ]},
   {id:"question2",type:"short_text",prompt:"Expliquez.",orderIndex:2,choices:[]},
  ],
 };
}

test("La migration 20261120145127 est la copie exacte du SQL déjà appliqué",()=>{
 assert.equal(appliedSql,sql);
 assert.match(appliedSql,/S4B3B1_PREVIEW_SQL_PASS/);
 assert.match(appliedSql,/S4B3B1_POSTFLIGHT_FAILED/);
 assert.match(appliedSql,/CREATE FUNCTION public\.schoolnet_student_school_assessment_preview/);
 assert.match(appliedSql,/CREATE FUNCTION schoolnet_private\.student_school_assessment_preview/);
});
test("Projection JSON strictement conforme et champs publics uniquement",()=>{
 const data=validPreview();
 assert.equal(isStudentOfficialAssessmentPreview(data,courseId,assessmentId),true);
 assert.equal(isStudentOfficialAssessmentPreview(data,"other",assessmentId),false);
 assert.equal(isStudentOfficialAssessmentPreview(data,courseId,"other"),false);
 assert.equal(isStudentOfficialAssessmentPreview({...data,privateKey:1},courseId,assessmentId),false);
 assert.equal(isStudentOfficialAssessmentPreview({...data,studentId:"secret"},courseId,assessmentId),false);
 assert.equal(isStudentOfficialAssessmentPreview({...data,score:12},courseId,assessmentId),false);
 assert.equal(isStudentOfficialAssessmentPreview({...data,isCorrect:true},courseId,assessmentId),false);
 assert.equal(isStudentOfficialAssessmentPreview({...data,dueAt:"invalid"},courseId,assessmentId),false);
 assert.equal(isStudentOfficialAssessmentPreview({...data,maxScore:-1},courseId,assessmentId),false);
 assert.equal(isStudentOfficialAssessmentPreview({...data,questions:[{...data.questions[0],correctAnswer:1}]},courseId,assessmentId),false);
 assert.equal(isStudentOfficialAssessmentPreview({...data,questions:[{...data.questions[0],choices:[
  {id:"choice1",text:"4",orderIndex:1,is_correct:true},
 ]}]},courseId,assessmentId),false);
 assert.equal(isStudentOfficialAssessmentPreview({...data,questions:[data.questions[0],data.questions[0]]},courseId,assessmentId),false);
 assert.equal(isStudentOfficialAssessmentPreview({...data,questions:[{...data.questions[0],choices:[
  {id:"choice1",text:"2",orderIndex:1},{id:"choice1",text:"4",orderIndex:2},
 ]}]},courseId,assessmentId),false);
});
test("Types autorisés et variantes sans question dans le moteur V1",()=>{
 const data=validPreview();
 assert.equal(isStudentOfficialAssessmentPreview({...data,type:"assignment",questions:[]},courseId,assessmentId),true);
 assert.equal(isStudentOfficialAssessmentPreview({...data,type:"exam",examContentMode:"file_only",questions:[]},courseId,assessmentId),true);
 assert.equal(isStudentOfficialAssessmentPreview({...data,type:"other"},courseId,assessmentId),false);
 assert.equal(isStudentOfficialAssessmentPreview({...data,questions:[{...data.questions[0],type:"unknown"}]},courseId,assessmentId),false);
});
test("La nouvelle API n'expose ni bonne réponse ni copie V1",()=>{
 assert.match(sql,/schoolnet_private\.student_school_course_access\(p_course_id\)/);
 assert.match(sql,/public\.get_my_role\(\)::text IS DISTINCT FROM 'student'/);
 assert.match(sql,/al\.status='active'/);
 assert.match(sql,/a\.status::text='published'/);
 assert.match(sql,/l\.teacher_id=a\.created_by/);
 assert.match(sql,/a\.course_id=p_course_id/);
 assert.match(sql,/S4B3B1_ACCESS_DENIED/);
 assert.match(sql,/jsonb_build_object\(/);
 assert.doesNotMatch(sql,/'is_correct'|'isCorrect'|'graded_by'|'correct_answer'|'studentId'/);
 assert.doesNotMatch(sql,/\b(?:INSERT INTO|UPDATE public\.|DELETE FROM|TRUNCATE)\b/i);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.schoolnet_student_school_assessment_preview/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.schoolnet_student_school_assessment_preview[\s\S]*?TO authenticated;/);
 assert.match(sql,/SECURITY INVOKER/);
 assert.match(sql,/SECURITY DEFINER/);
 assert.match(sql,/SET search_path=pg_catalog/);
 assert.match(sql,/S4B3B1_PREVIEW_SQL_PASS/);
});
test("Le client passe exclusivement par RPC et vérifie les identifiants",()=>{
 assert.match(api,/supabase\.rpc\(/);
 assert.match(api,/schoolnet_student_school_assessment_preview/);
 assert.match(api,/p_course_id:courseId,p_assessment_id:assessmentId/);
 assert.match(api,/isStudentOfficialAssessmentPreview\(data,courseId,assessmentId\)/);
 assert.doesNotMatch(api,/\.from\(|\.insert\(|\.update\(|\.delete\(/);
});
test("Route élève V2 isolée des pages de soumission V1",()=>{
 assert.match(router,/student\/school-courses\/:courseId\/assessments\/:assessmentId/);
 assert.match(router,/element: <StudentSchoolAssessmentPreview \/>/);
 assert.match(catalog,/Voir l'évaluation/);
 assert.match(catalog,/"\/app\/student\/school-courses\/"\+courseId\+"\/assessments\/"\+a\.assessmentId/);
 assert.doesNotMatch(catalog,/\/app\/student\/assessments\/"\+a\.assessmentId/);
 assert.match(page,/getStudentOfficialAssessmentPreview\(courseId,assessmentId\)/);
 assert.match(page,/allowed=!authLoading&&!!user&&!user\.isDemo&&user\.role==="student"/);
 assert.doesNotMatch(page,/\bsupabase\b|dangerouslySetInnerHTML|<form|<input|type="submit"/);
});
test("Chargement rafraichissable et sans donnée d'un ancien compte",()=>{
 assert.match(page,/const key=\[user\?\.id\?\?"",courseId\?\?"",assessmentId\?\?""\]\.join/);
 assert.match(page,/const current=canLoad&&loadedFor===key\?data:null/);
 assert.match(page,/cancelled=true/);
 assert.match(page,/Lecture seule/);
 assert.match(page,/aucune réponse n'est sélectionnable ou enregistrée/);
 assert.match(page,/La saisie des réponses et les remises ne sont pas encore activées|enregistrer ou remettre cette évaluation/);
});
test("Double protection anti-fuite depuis la base vers le navigateur",()=>{
 assert.match(model,/exactKeys\(data,previewKeys\)/);
 assert.match(model,/exactKeys\(question,questionKeys\)/);
 assert.match(model,/exactKeys\(choice,choiceKeys\)/);
 assert.doesNotMatch(model,/isCorrect\s*:/);
});
test("Tests A/B : accès autorisé et refus pour d'autres établissements ou statuts",()=>{
 for(const marker of [
  "B1_PASS_A_SAFE_QUESTIONS",
  "B1_FAIL_LEAK_ANSWER_OR_GRADE",
  "B1_PASS_B_OWN_COURSE_AND_CROSS_TENANT_DENIED",
  "B1_PASS_TEACHER_PARENT_AND_UNASSIGNED_DENIED",
  "B1_PASS_DRAFT_UNLINKED_AND_V1_DENIED",
  "B1_PASS_UNPUBLISHED_DENIED",
  "B1_PASS_REVOKED_DENIED",
  "B1_PASS_NO_SUBMISSION_OR_PROGRESS_WRITES",
 ]){
  assert.match(scenario,new RegExp(marker));
 }
});
test("Rollback dédié ne retire pas B.0, N ni les données V1",()=>{
 assert.match(rollback,/S4B3B1_PREVIEW_ROLLBACK_PASS/);
 assert.match(rollback,/DROP FUNCTION public\.schoolnet_student_school_assessment_preview/);
 assert.match(rollback,/DROP FUNCTION schoolnet_private\.student_school_assessment_preview/);
 assert.doesNotMatch(rollback,/\b(?:DROP TABLE|TRUNCATE|DELETE FROM|DROP POLICY|DROP TRIGGER)\b/);
});
test("CI ne touche que le Postgres local jetable et compile l'interface",()=>{
 assert.match(ci,/supabase start -x/);
 assert.match(ci,/s4b3b1_student_official_assessment_preview\.sql/);
 assert.match(ci,/20261120145127_schoolnet_s4b3b1_student_official_assessment_preview\.sql/);
 assert.match(ci,/s4b3b1-tenant-ci\/fixtures\/preview-a-b\.sql/);
 assert.match(ci,/s4b3b1_student_official_assessment_preview_rollback_manual\.sql/);
 assert.match(ci,/supabase stop --no-backup/);
 assert.match(ci,/npm run qa:s4b3b1/);
 assert.match(ci,/npm run build/);
 assert.doesNotMatch(ci,/supabase db push|supabase db reset --linked|vercel --prod/);
});
