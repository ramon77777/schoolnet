import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {
 safeSchoolResourceUrl,isStudentSchoolCourseCatalog,isStudentSchoolCourseDetail,
} from "../src/features/student/lib/studentSchoolCoursesModel.ts";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(resolve(root,p),"utf8");
const course=()=>({courseId:"course-a",title:"Mathématiques",description:null,
 schoolId:"school-a",schoolName:"Collège A",classId:"6a",className:"6e A",
 schoolYear:"2026-2027",subjectName:"Mathématiques"});
const detail=()=>({courseId:"course-a",title:"Mathématiques",description:"",
 schoolName:"Collège A",className:"6e A",schoolYear:"2026-2027",
 subjectName:"Mathématiques",sections:[{id:"s1",title:"Chapitre 1",orderIndex:0}],
 resources:[{id:"r1",sectionId:"s1",title:"PDF",type:"pdf",
 url:"https://example.org/chapitre.pdf",isDownloadable:true}]});

test("S4-B.2 01 - catalogue eleve vide valide",()=>{
 assert.equal(isStudentSchoolCourseCatalog({courses:[]}),true);
});
test("S4-B.2 02 - cours scolaire complet valide",()=>{
 assert.equal(isStudentSchoolCourseCatalog({courses:[course()]}),true);
});
test("S4-B.2 03 - aucune colonne d'identite eleve ou enseignant en plus",()=>{
 assert.equal(isStudentSchoolCourseCatalog({courses:[{...course(),studentId:"secret"}]}),false);
 assert.equal(isStudentSchoolCourseCatalog({courses:[course()],students:[]}),false);
});
test("S4-B.2 04 - cours double refuse",()=>{
 assert.equal(isStudentSchoolCourseCatalog({courses:[course(),course()]}),false);
});
test("S4-B.2 05 - cours invalide, absence d'etablissement refuse",()=>{
 assert.equal(isStudentSchoolCourseCatalog({courses:[{...course(),schoolId:""}]}),false);
 assert.equal(isStudentSchoolCourseCatalog({courses:{}}),false);
 assert.equal(isStudentSchoolCourseCatalog(null),false);
});
test("S4-B.2 06 - detail valide et ressources sous section",()=>{
 assert.equal(isStudentSchoolCourseDetail(detail(),"course-a"),true);
});
test("S4-B.2 07 - refuse detail d'un autre cours",()=>{
 assert.equal(isStudentSchoolCourseDetail(detail(),"course-b"),false);
});
test("S4-B.2 08 - refuse colonnes nominatives ou evaluatives",()=>{
 assert.equal(isStudentSchoolCourseDetail({...detail(),students:[]}, "course-a"),false);
 assert.equal(isStudentSchoolCourseDetail({...detail(),grades:[]}, "course-a"),false);
 assert.equal(isStudentSchoolCourseDetail({...detail(),resources:[{...detail().resources[0],ownerEmail:"private"}]},"course-a"),false);
});
test("S4-B.2 09 - refuse section de cours inconnu",()=>{
 assert.equal(isStudentSchoolCourseDetail({...detail(),resources:[{...detail().resources[0],sectionId:"unrelated"}]},"course-a"),false);
});
test("S4-B.2 10 - refuse doublons de sections et ressources",()=>{
 const d=detail();
 assert.equal(isStudentSchoolCourseDetail({...d,sections:[...d.sections,...d.sections]},"course-a"),false);
 assert.equal(isStudentSchoolCourseDetail({...d,resources:[...d.resources,...d.resources]},"course-a"),false);
});
test("S4-B.2 11 - accepte URL HTTPS sans credentials",()=>{
 assert.equal(safeSchoolResourceUrl("https://example.org/chap.pdf?x=1"),true);
});
test("S4-B.2 12 - refuse javascript, file, http et credentials",()=>{
 for(const url of ["javascript:alert(1)","file:///etc/passwd",
 "http://example.org","https://user:pass@example.org","data:text/html,hi"]){
  assert.equal(safeSchoolResourceUrl(url),false,url);
 }
});
test("S4-B.2 13 - refuse espaces et caracteres de controle URL",()=>{
 assert.equal(safeSchoolResourceUrl("https://example.org/a\nb"),false);
 assert.equal(safeSchoolResourceUrl("https://example.org/a b"),false);
 assert.equal(safeSchoolResourceUrl("https://"),false);
});
test("S4-B.2 14 - detail exige une URL securisee",()=>{
 const d=detail();
 assert.equal(isStudentSchoolCourseDetail({...d,resources:[{...d.resources[0],url:"javascript:alert(1)"}]},"course-a"),false);
});
test("S4-B.2 15 - schema SQL sans mutation de V1",()=>{
 const sql=read("supabase/proposals/s4b2_student_school_courses.sql");
 assert.equal((sql.match(/CREATE FUNCTION /g)||[]).length,5);
 assert.doesNotMatch(sql,/CREATE POLICY.*public\.(courses|resources)/);
 assert.doesNotMatch(sql,/ALTER TABLE public\./);
 assert.doesNotMatch(sql,/INSERT INTO public\.(course_enrollments|student_progress|courses)/);
 assert.match(sql,/schoolnet_private\.school_course_links/);
});
test("S4-B.2 16 - garde d'acces exige classe et membre eleve actifs",()=>{
 const sql=read("supabase/proposals/s4b2_student_school_courses.sql");
 for(const pat of [/public\.get_my_role\(\)::text='student'/,
 /student_a\.status='active'/,/student_m\.status='active'/,
 /teacher_m\.status='active'/,/a\.status='active'/,
 /co\.status='active'/,/s\.status='active'/,/l\.status='active'/]){
 assert.match(sql,pat);
 }
});
test("S4-B.2 17 - controle les ressources de lecture publique et le cours",()=>{
 const sql=read("supabase/proposals/s4b2_student_school_courses.sql");
 assert.match(sql,/r\.visibility='public_to_course'/);
 assert.match(sql,/r\.course_id=co\.id/);
 assert.match(sql,/sec\.course_id=co\.id/);
 assert.match(sql,/r\.url ~\*/);
});
test("S4-B.2 18 - fonctions privees definer, publiques invoker et anon interdit",()=>{
 const sql=read("supabase/proposals/s4b2_student_school_courses.sql");
 assert.equal((sql.match(/SECURITY DEFINER/g)||[]).length,3);
 assert.equal((sql.match(/SECURITY INVOKER/g)||[]).length,2);
 assert.match(sql,/FROM PUBLIC,anon,authenticated/);
 assert.match(sql,/TO authenticated/);
});
test("S4-B.2 19 - interfaces eleves distinctes de V1",()=>{
 const routes=read("src/routes/router.tsx");
 const courses=read("src/features/student/pages/StudentCourses.tsx");
 const menu=read("src/layouts/DashboardLayout.tsx");
 assert.match(routes,/path: "student\/school-courses"/);
 assert.match(routes,/path: "student\/school-courses\/:courseId"/);
 assert.match(courses,/to="\/app\/student\/school-courses"/);
 assert.match(menu,/to="\/app\/student\/school-courses"/);
});
test("S4-B.2 20 - pas de fallback en cours libre ni de mutation client",()=>{
 const api=read("src/features/student/lib/studentSchoolCoursesApi.ts");
 const list=read("src/features/student/pages/StudentSchoolCourses.tsx");
 const details=read("src/features/student/pages/StudentSchoolCourseDetail.tsx");
 assert.match(api,/supabase\.rpc\("schoolnet_student_school_courses"/);
 assert.match(api,/supabase\.rpc\("schoolnet_student_school_course_detail"/);
 assert.doesNotMatch(api,/course_enrollments|student_progress|from\("resources"\)/);
 assert.doesNotMatch(list,/supabase\.from\(/);
 assert.doesNotMatch(details,/supabase\.from\(/);
});
test("S4-B.2 21 - recette A/B hermetique en rollback",()=>{
 const testSql=read("tests/s4b2-tenant-ci/fixtures/student-courses-a-b.sql");
 const workflow=read(".github/workflows/schoolnet-s4b2-tenant-ci.yml");
 assert.match(testSql,/S4B2_TENANT_A_B_PASS/);
 assert.match(testSql,/ROLLBACK;\s*$/);
 assert.match(workflow,/127\.0\.0\.1/);
 assert.match(workflow,/s4b2_student_school_courses\.sql/);
 assert.doesNotMatch(workflow,/supabase db push|supabase link|secrets\./);
});
test("S4-B.2 22 - ressources V1 publiques documentees",()=>{
 const doc=read("docs/releases/SCHOOLNET_S4B2_COURS_ELEVES_2026-11-20.md");
 assert.match(doc,/course-resources/);
 assert.match(doc,/public/);
 assert.match(doc,/ne protège pas|ne garantit pas/);
});
