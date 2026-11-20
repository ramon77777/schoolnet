import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {
 isSchoolAssessmentTeacherContext,
 isStudentOfficialAssessmentCatalog,
} from "../src/features/schools/lib/schoolAssessmentBridgeModel.ts";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=path=>readFileSync(resolve(root,path),"utf8");
const course="70000000-0000-4000-8000-000000000001";
const assessment="a0000000-0000-4000-8000-000000000001";
const context=(overrides={})=>({
 assessmentId:assessment,courseId:course,title:"Quiz 6e",
 status:"published",eligible:true,linked:true,
 schoolName:"College A",className:"6e A",subjectName:"Mathématiques",
 ...overrides,
});
const catalog=(overrides={})=>({
 courseId:course,assessments:[{
  assessmentId:assessment,title:"Quiz 6e",type:"quiz",
  dueAt:"2026-11-25T09:00:00+00:00",
 }],...overrides,
});
test("S4B3A 01 - contexte enseignant actif reconnu",()=>{
 assert.equal(isSchoolAssessmentTeacherContext(context(),assessment),true);
});
test("S4B3A 02 - contexte ancien cours libre non officiel valide",()=>{
 assert.equal(isSchoolAssessmentTeacherContext(context({
 eligible:false,linked:false,schoolName:null,className:null,subjectName:null,
 }),assessment),true);
});
test("S4B3A 03 - contexte ne doit jamais nommer un élève",()=>{
 assert.equal(isSchoolAssessmentTeacherContext(context({studentName:"Secret"}),assessment),false);
});
test("S4B3A 04 - identifiant et role hors contrat rejetes",()=>{
 assert.equal(isSchoolAssessmentTeacherContext(context(),"assessment-B"),false);
 assert.equal(isSchoolAssessmentTeacherContext(context({eligible:"true"}),assessment),false);
});
test("S4B3A 05 - éligible doit contenir établissement/classe/matière",()=>{
 assert.equal(isSchoolAssessmentTeacherContext(context({schoolName:null}),assessment),false);
});
test("S4B3A 06 - association non autorisée si non éligible",()=>{
 assert.equal(isSchoolAssessmentTeacherContext(context({
 eligible:false,linked:true,schoolName:null,className:null,subjectName:null,
 }),assessment),false);
});
test("S4B3A 07 - catalogue vide conforme pour un cours sans évaluation",()=>{
 assert.equal(isStudentOfficialAssessmentCatalog({courseId:course,assessments:[]},course),true);
});
test("S4B3A 08 - catalogue publié conforme",()=>{
 assert.equal(isStudentOfficialAssessmentCatalog(catalog(),course),true);
});
test("S4B3A 09 - catalogue d'un autre cours refusé",()=>{
 assert.equal(isStudentOfficialAssessmentCatalog(catalog(),"cours-autre"),false);
});
test("S4B3A 10 - aucune note ni soumission dans la réponse",()=>{
 for(const extra of ["score","studentName","studentId","answers","feedback","questionText"]){
  const a=catalog();
  a.assessments[0][extra]="secret";
  assert.equal(isStudentOfficialAssessmentCatalog(a,course),false);
 }
});
test("S4B3A 11 - doubles ID refusés",()=>{
 const a=catalog();a.assessments.push({...a.assessments[0]});
 assert.equal(isStudentOfficialAssessmentCatalog(a,course),false);
});
test("S4B3A 12 - type d'évaluation contrôlé",()=>{
 for(const t of ["hack","",null,"closed"]){
  assert.equal(isStudentOfficialAssessmentCatalog(catalog({
   assessments:[{assessmentId:assessment,title:"Test",type:t,dueAt:null}],
  }),course),false);
 }
});
test("S4B3A 13 - échéance nulle autorisée, date invalide refusée",()=>{
 const row={assessmentId:assessment,title:"Test",type:"exam",dueAt:null};
 assert.equal(isStudentOfficialAssessmentCatalog(catalog({assessments:[row]}),course),true);
 assert.equal(isStudentOfficialAssessmentCatalog(catalog({assessments:[{...row,dueAt:"hier"}]}),course),false);
});
test("S4B3A 14 - pas de mutation des parcours étudiant V1",()=>{
 const detail=read("src/features/student/pages/StudentSchoolCourseDetail.tsx");
 const page=read("src/features/student/components/StudentSchoolCourseAssessments.tsx");
 assert.match(detail,/StudentSchoolCourseAssessments/);
 assert.match(page,/getStudentSchoolCourseAssessments/);
 assert.doesNotMatch(page,/course_enrollments|insert\(|assessment_submissions/);
 assert.doesNotMatch(page,/\/app\/student\/assessments\/\$\{/);
});
test("S4B3A 15 - enseignant : opt-in visible uniquement sur la fiche d'évaluation",()=>{
 const detail=read("src/features/teacher/pages/TeacherAssessmentDetail.tsx");
 const component=read("src/features/teacher/components/TeacherSchoolAssessmentLinker.tsx");
 assert.match(detail,/TeacherSchoolAssessmentLinker/);
 assert.match(component,/Rattacher à la classe/);
 assert.match(component,/areSchoolAssignmentsReadOnly/);
 assert.match(component,/linkSchoolAssessment/);
 assert.match(component,/unlinkSchoolAssessment/);
 assert.match(component,/remises et les notes officielles ne sont pas encore activées/);
});
test("S4B3A 16 - RPC exclusivement, pas d'accès aux tables privées depuis React",()=>{
 const api=read("src/features/schools/lib/schoolAssessmentBridgeApi.ts");
 assert.match(api,/supabase\.rpc\(/);
 assert.doesNotMatch(api,/supabase\.from\(/);
 assert.doesNotMatch(api,/service_role|school_assessment_links/);
});
test("S4B3A 17 - table privée, policies fermées, huit fonctions RPC",()=>{
 const sql=read("supabase/proposals/s4b3a_school_assessment_links.sql");
 assert.match(sql,/CREATE TABLE schoolnet_private\.school_assessment_links/);
 assert.match(sql,/ALTER TABLE schoolnet_private\.school_assessment_links ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/REVOKE ALL ON TABLE schoolnet_private\.school_assessment_links/);
 assert.equal((sql.match(/^CREATE FUNCTION /gm)||[]).length,8);
 assert.equal((sql.match(/SECURITY DEFINER/g)||[]).length,4);
 assert.equal((sql.match(/SECURITY INVOKER/g)||[]).length,4);
 assert.match(sql,/FROM PUBLIC,anon,authenticated/);
 assert.match(sql,/TO authenticated/);
});
test("S4B3A 18 - protections SQL en base et séparation de la V1",()=>{
 const sql=read("supabase/proposals/s4b3a_school_assessment_links.sql");
 assert.match(sql,/student_school_course_access\(p_course_id\)/);
 assert.match(sql,/teacher_course_class_summary\(v_course\)/);
 assert.match(sql,/a\.status::text='published'/);
 assert.match(sql,/AND al\.status='active'/);
 assert.match(sql,/a\.created_by=l\.teacher_id/);
 assert.match(sql,/IS DISTINCT FROM 'https:\/\/schoolnet-snowy\.vercel\.app'/);
 assert.doesNotMatch(sql,/^\s*(?:INSERT INTO public\.(?:course_enrollments|submissions|assessments)|UPDATE public\.(?:assessments|assessment_submissions)|DELETE FROM public\.)/mi);
});
test("S4B3A 19 - contrôle multiécoles et révocation dans la fixture SQL",()=>{
 const fixture=read("tests/s4b3-tenant-ci/fixtures/assessments-a-b.sql");
 for(const marker of [
  "S4B3A_PASS_EMPTY_BEFORE_OPT_IN",
  "S4B3A_PASS_TEACHER_A",
  "S4B3A_PASS_TEACHER_B",
  "S4B3A_PASS_STUDENT_A",
  "S4B3A_PASS_STUDENT_B",
  "S4B3A_PASS_UNLINK_HIDDEN",
  "S4B3A_PASS_REVOKED_STUDENT",
  "S4B3A_PASS_ANON",
  "S4B3A_PASS_V1_UNCHANGED",
 ]){
  assert.match(fixture,new RegExp(marker));
 }
 assert.match(fixture,/ROLLBACK;\s*$/);
});
test("S4B3A 20 - rollback ne supprime pas les modules scolaires S4-B",()=>{
 const sql=read("supabase/verification/s4b3a_school_assessment_links_rollback_manual.sql");
 assert.match(sql,/S4B3A_ROLLBACK_PASS/);
 assert.match(sql,/schoolnet_student_school_courses\(\)/);
 assert.match(sql,/schoolnet_teacher_course_class_summary\(uuid\)/);
 assert.doesNotMatch(sql,/DROP TABLE public\.assessments/);
});
