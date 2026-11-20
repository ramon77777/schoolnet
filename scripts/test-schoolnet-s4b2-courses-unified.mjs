import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  selectStudentCourseTab,
  groupOfficialCoursesBySchool,
} from "../src/features/student/lib/studentCourseTabs.ts";

const root=resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source=(name)=>readFileSync(resolve(root,name), "utf8");
const item=(id,schoolId,schoolName,className,title)=>({
  courseId:id,schoolId,schoolName,className,title,
});

test("S4B2-UX 01 - prefere les cours officiels pour un eleve scolarise",()=>{
  assert.equal(selectStudentCourseTab(null,1),"official");
});
test("S4B2-UX 02 - eleve independant arrive sur ses cours complementaires",()=>{
  assert.equal(selectStudentCourseTab(null,0),"complementary");
});
test("S4B2-UX 03 - chargement initial conserve le choix scolaire",()=>{
  assert.equal(selectStudentCourseTab(null,null),"official");
});
test("S4B2-UX 04 - lien explicite officiel prime meme sans cours",()=>{
  assert.equal(selectStudentCourseTab("official",0),"official");
});
test("S4B2-UX 05 - choix complementaire conserve meme avec des cours scolaires",()=>{
  assert.equal(selectStudentCourseTab("complementary",5),"complementary");
});
test("S4B2-UX 06 - parametre tab inconnu ne detourne pas le parcours",()=>{
  assert.equal(selectStudentCourseTab("admin",2),"official");
  assert.equal(selectStudentCourseTab("invalid",0),"complementary");
});
test("S4B2-UX 07 - regroupement vide d'un eleve libre",()=>{
  assert.deepEqual(groupOfficialCoursesBySchool([]),[]);
});
test("S4B2-UX 08 - des ecoles differentes restent distinctes",()=>{
  const g=groupOfficialCoursesBySchool([
    item("a","school-a","Collège Test","6e A","Maths"),
    item("b","school-b","Collège Test","6e B","Francais"),
  ]);
  assert.equal(g.length,2);
  assert.notEqual(g[0].schoolId,g[1].schoolId);
});
test("S4B2-UX 09 - regroupement multi-classes par etablissement",()=>{
  const g=groupOfficialCoursesBySchool([
    item("a","school-a","College A","5e A","Maths"),
    item("b","school-a","College A","6e A","Francais"),
    item("c","school-a","College A","6e A","Maths"),
  ]);
  assert.equal(g.length,1);
  assert.deepEqual(g[0].courses.map(x=>x.courseId),["a","b","c"]);
});
test("S4B2-UX 10 - tri des etablissements stable et entrées non mutees",()=>{
  const a=item("a","school-z","Zed","6e A","A");
  const b=item("b","school-a","Alpha","6e A","B");
  const input=[a,b];
  const grouped=groupOfficialCoursesBySchool(input);
  assert.equal(grouped[0].schoolId,"school-a");
  assert.deepEqual(input,[a,b]);
});
test("S4B2-UX 11 - un seul menu Mes cours pour l'apprenant",()=>{
  const nav=source("src/layouts/DashboardLayout.tsx");
  assert.match(nav,/to="\/app\/student\/courses"/);
  assert.doesNotMatch(nav,/to="\/app\/student\/school-courses"/);
  assert.equal((nav.match(/📘 Mes cours/g)||[]).length,1);
});
test("S4B2-UX 12 - les deux onglets partagent une seule page",()=>{
  const page=source("src/features/student/pages/StudentCourses.tsx");
  assert.match(page,/role="tablist"/);
  assert.match(page,/Cours de mon établissement/);
  assert.match(page,/Cours complémentaires/);
  assert.match(page,/role="tabpanel"/);
  assert.match(page,/aria-selected=\{activeTab === "official"\}/);
  assert.match(page,/aria-selected=\{activeTab === "complementary"\}/);
  assert.match(page,/<StudentSchoolCourses onCatalogLoaded=\{onOfficialLoaded\}/);
});
test("S4B2-UX 13 - ancien lien redirige vers le bon onglet",()=>{
  const router=source("src/routes/router.tsx");
  assert.match(router,/path: "student\/school-courses", element: <Navigate to="\/app\/student\/courses\?tab=official" replace \/>/);
  assert.match(router,/path: "student\/school-courses\/:courseId"/);
  const detail=source("src/features/student/pages/StudentSchoolCourseDetail.tsx");
  assert.match(detail,/to="\/app\/student\/courses\?tab=official"/);
});
test("S4B2-UX 14 - l'acces officiel conserve la RPC et l'isolation serveur",()=>{
  const panel=source("src/features/student/pages/StudentSchoolCourses.tsx");
  const api=source("src/features/student/lib/studentSchoolCoursesApi.ts");
  assert.match(panel,/getStudentSchoolCourses\(\)/);
  assert.match(api,/supabase\.rpc\("schoolnet_student_school_courses"/);
  assert.doesNotMatch(panel,/supabase\.from\(/);
  assert.doesNotMatch(api,/course_enrollments|student_progress/);
});
test("S4B2-UX 15 - cours libres et progression V1 preserves",()=>{
  const page=source("src/features/student/pages/StudentCourses.tsx");
  for(const name of ["course_enrollments","student_progress","onOpen","CourseCard","progress_percent"]){
    assert.match(page,new RegExp(name));
  }
  assert.match(page,/navigate\(\x60\/app\/student\/courses\/\$\{course.id\}\x60\)/);
});
test("S4B2-UX 16 - aucun changement de politique ou migration Supabase",()=>{
  const router=source("src/routes/router.tsx");
  const panel=source("src/features/student/pages/StudentSchoolCourses.tsx");
  assert.doesNotMatch(router,/schoolnet_private/);
  assert.doesNotMatch(panel,/service_role|rpc\("schoolnet_teacher_/);
});
