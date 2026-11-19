// SCHOOLNET S4-B.1 : tests unitaires locaux - zero connexion Supabase.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {resolve,dirname} from "node:path";
import {
  isTeacherSchoolCourseContext,
  isAdminSchoolCourseCatalog,
} from "../src/features/schools/lib/schoolCourseBridgeModel.ts";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=path=>readFileSync(resolve(root,path),"utf8");
const assignment=()=>({
 assignmentId:"a1",schoolId:"A",schoolName:"Ecole A",classId:"c1",
 className:"6e A",schoolYear:"2026-2027",subjectName:"Mathématiques",
});
const link=()=>({
 courseId:"co1",courseTitle:"Mathématiques 6e",schoolId:"A",
 schoolName:"Ecole A",classId:"c1",className:"6e A",
 schoolYear:"2026-2027",subjectName:"Mathématiques",assignmentId:"a1",
});
const catalog=()=>({schoolId:"A",courses:[{
 courseId:"co1",courseTitle:"Mathématiques 6e",classId:"c1",
 className:"6e A",schoolYear:"2026-2027",subjectName:"Mathématiques",
 teacherName:"Professeur",
}]});

test("S4-B.1 01 — contexte professeur minimal et vide accepté",()=>{
 assert.equal(isTeacherSchoolCourseContext({assignments:[],links:[]}),true);
});
test("S4-B.1 02 — affectations et rattachements valides",()=>{
 assert.equal(isTeacherSchoolCourseContext({assignments:[assignment()],links:[link()]}),true);
});
test("S4-B.1 03 — données nominatives élèves ou champs supplémentaires refusés",()=>{
 assert.equal(isTeacherSchoolCourseContext({assignments:[assignment()],links:[],students:[]}),false);
 assert.equal(isTeacherSchoolCourseContext({assignments:[{...assignment(),student_name:"Secret"}],links:[]}),false);
});
test("S4-B.1 04 — champ manquant ou chaîne vide refusé",()=>{
 const a=assignment();delete a.subjectName;
 assert.equal(isTeacherSchoolCourseContext({assignments:[a],links:[]}),false);
 assert.equal(isTeacherSchoolCourseContext({assignments:[{...assignment(),schoolId:"  "}],links:[]}),false);
});
test("S4-B.1 05 — rattachements dupliqués refusés",()=>{
 assert.equal(isTeacherSchoolCourseContext({assignments:[assignment(),assignment()],links:[]}),false);
 assert.equal(isTeacherSchoolCourseContext({assignments:[assignment()],links:[link(),link()]}),false);
});
test("S4-B.1 06 — objets mal formés et tableaux remplacés refusés",()=>{
 assert.equal(isTeacherSchoolCourseContext({assignments:{},links:[]}),false);
 assert.equal(isTeacherSchoolCourseContext({assignments:[],links:null}),false);
 assert.equal(isTeacherSchoolCourseContext(null),false);
});
test("S4-B.1 07 — catalogue administratif établissement valide",()=>{
 assert.equal(isAdminSchoolCourseCatalog(catalog(),"A"),true);
 assert.equal(isAdminSchoolCourseCatalog({schoolId:"A",courses:[]},"A"),true);
});
test("S4-B.1 08 — réponse d'une école différente refusée",()=>{
 assert.equal(isAdminSchoolCourseCatalog(catalog(),"B"),false);
 assert.equal(isAdminSchoolCourseCatalog(catalog(),""),false);
});
test("S4-B.1 09 — aucun champ élève ni lien personnel injecté",()=>{
 assert.equal(isAdminSchoolCourseCatalog({...catalog(),students:[]},"A"),false);
 assert.equal(isAdminSchoolCourseCatalog({...catalog(),courses:[{...catalog().courses[0],studentId:"user"}]},"A"),false);
});
test("S4-B.1 10 — titres vides et cours dupliqués refusés",()=>{
 assert.equal(isAdminSchoolCourseCatalog({...catalog(),courses:[{...catalog().courses[0],courseTitle:" "}]},"A"),false);
 assert.equal(isAdminSchoolCourseCatalog({...catalog(),courses:[...catalog().courses,...catalog().courses]},"A"),false);
});
test("S4-B.1 11 — catalogue V1 immuable, schema de liaison privé",()=>{
 const sql=read("supabase/proposals/s4b1_school_course_bridge.sql");
 assert.match(sql,/CREATE TABLE schoolnet_private\.school_course_links/);
 assert.match(sql,/ALTER TABLE schoolnet_private\.school_course_links ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/REVOKE ALL ON TABLE schoolnet_private\.school_course_links/);
 assert.doesNotMatch(sql,/ALTER TABLE public\.courses|UPDATE public\.courses|DELETE FROM public\.courses|DROP TABLE public\.courses/);
 assert.doesNotMatch(sql,/CREATE POLICY .* ON public\.courses/);
});
test("S4-B.1 12 — controle serveur teacher + affectation S3-C + origine stricte",()=>{
 const sql=read("supabase/proposals/s4b1_school_course_bridge.sql");
 assert.match(sql,/public\.get_my_role\(\)::text IS DISTINCT FROM 'teacher'/);
 assert.match(sql,/a\.teacher_id=v_uid AND a\.status='active'/);
 assert.match(sql,/m\.member_role='teacher' AND m\.status='active'/);
 assert.match(sql,/c\.learning_context='school'/);
 assert.match(sql,/https:\/\/schoolnet-snowy\.vercel\.app/);
});
test("S4-B.1 13 — pas d'import automatique des inscrits V1",()=>{
 const sql=read("supabase/proposals/s4b1_school_course_bridge.sql");
 assert.match(sql,/EXISTS\(SELECT 1 FROM public\.course_enrollments/);
 assert.match(sql,/EXISTS\(SELECT 1 FROM public\.student_progress/);
 assert.match(sql,/EXISTS\(SELECT 1 FROM public\.course_teachers/);
 assert.doesNotMatch(sql,/INSERT INTO public\.course_enrollments/);
 assert.doesNotMatch(sql,/GRANT .* ON TABLE public\.courses/);
});
test("S4-B.1 14 — catalogue administrateur protégé par le garde S3-C",()=>{
 const sql=read("supabase/proposals/s4b1_school_course_bridge.sql");
 assert.match(sql,/schoolnet_private\.assert_s3c_access\(p_school_id,false\)/);
 assert.match(sql,/school_course_links l/);
 assert.match(sql,/a\.status='active'/);
});
test("S4-B.1 15 — façades invoker, helpers definer privés, anon révoqué",()=>{
 const sql=read("supabase/proposals/s4b1_school_course_bridge.sql");
 assert.equal((sql.match(/CREATE FUNCTION public\.schoolnet_/g)||[]).length,4);
 assert.equal((sql.match(/CREATE FUNCTION schoolnet_private\./g)||[]).length,4);
 assert.equal((sql.match(/SECURITY INVOKER/g)||[]).length,4);
 assert.equal((sql.match(/SECURITY DEFINER/g)||[]).length,4);
 assert.match(sql,/FROM PUBLIC,anon,authenticated/);
 assert.match(sql,/TO authenticated/);
});
test("S4-B.1 16 — nouvelles interfaces protégées par rôle et sélection tenant",()=>{
 const router=read("src/routes/router.tsx");
 const nav=read("src/layouts/DashboardLayout.tsx");
 const local=read("src/features/schools/pages/LocalSchoolCourses.tsx");
 assert.match(router,/RoleGate allowed=\{\["school_admin"\]\}/);
 assert.match(router,/path: "school\/courses"/);
 assert.match(nav,/to="\/app\/school\/courses"/);
 assert.match(local,/filterSchoolsForLocalAdmin/);
 assert.match(local,/data\.schoolId!==schoolId/);
});
test("S4-B.1 17 — enseignant rattache explicitement, Preview interdite",()=>{
 const teacher=read("src/features/teacher/components/TeacherSchoolCourseLinker.tsx");
 const page=read("src/features/teacher/pages/TeacherCourses.tsx");
 const api=read("src/features/schools/lib/schoolCourseBridgeApi.ts");
 assert.match(page,/TeacherSchoolCourseLinker/);
 assert.match(teacher,/linkTeacherSchoolCourse/);
 assert.match(teacher,/unlinkTeacherSchoolCourse/);
 assert.match(teacher,/assignedIds/);
 assert.match(api,/areSchoolAssignmentsReadOnly\(\)/);
 assert.match(api,/supabase\.rpc\("schoolnet_teacher_link_school_course"/);
});
test("S4-B.1 18 — tests SQL hermétiques et rollback sans données réelles",()=>{
 const sql=read("tests/s4b1-tenant-ci/fixtures/course-bridge-a-b.sql");
 const wf=read(".github/workflows/schoolnet-s4b1-tenant-ci.yml");
 assert.match(sql,/S4B1_TENANT_A_B_PASS/);
 assert.match(sql,/ROLLBACK;\s*$/);
 assert.match(wf,/127\.0\.0\.1/);
 assert.match(wf,/s4b1_school_course_bridge\.sql/);
 assert.doesNotMatch(wf,/supabase db push|supabase link|secrets\./);
});
