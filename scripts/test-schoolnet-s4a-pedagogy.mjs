// SCHOOLNET S4-A : tests purement locaux, aucune connexion Supabase requise.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildSchoolPedagogyOverview} from "../src/features/schools/lib/schoolPedagogyOverview.ts";

const fixture=()=>({
  school_id:"ecole-a",events:[],classes:[],students:[],teachers:[],
  subjects:[],student_assignments:[],teacher_assignments:[],
});
const classRow=(id,name="6e A",year="2025-2026")=>({
  id,name,school_year:year,school_year_id:"annee-"+year,level_name:"Sixième",
});
const student=(id,classId="classe-1",year="2025-2026",status="active",active=true)=>({
  id:"affectation-"+id+"-"+classId,class_id:classId,
  school_year_id:"annee-"+year,student_id:id,student_name:"Nom privé",
  status,effective_active:active,assigned_at:"2026-01-01",revoked_at:null,
});
const teacher=(id,subjectId="math",classId="classe-1",status="active",active=true)=>({
  id:"affectation-"+id+"-"+subjectId,class_id:classId,
  school_year_id:"annee-2025-2026",teacher_id:id,teacher_name:"Nom privé",
  subject_id:subjectId,subject_name:subjectId==="math"?"Mathématiques":"Sciences",
  status,effective_active:active,assigned_at:"2026-01-01",revoked_at:null,
});
const read=(p)=>readFileSync(new URL(p,import.meta.url),"utf8");

test("S4-A 01 - catalogue vide: zéro officiel, pas de classe inventée",()=>{
 const r=buildSchoolPedagogyOverview(fixture(),"ecole-a");
 assert.deepEqual(r.classes,[]);assert.equal(r.classCount,0);
 assert.equal(r.assignedStudentCount,0);assert.equal(r.teachingAssignmentCount,0);
});
test("S4-A 02 - tenant différent: refus total, jamais recyclé entre écoles",()=>{
 const c=fixture();c.classes.push(classRow("classe-1"));
 assert.throws(()=>buildSchoolPedagogyOverview(c,"ecole-b"),/ne correspond pas/);
});
test("S4-A 03 - tenant vide interdit",()=>{
 assert.throws(()=>buildSchoolPedagogyOverview(fixture(),""),/ne correspond pas/);
});
test("S4-A 04 - classes homonymes mais années distinctes ne fusionnent pas",()=>{
 const c=fixture();c.classes.push(classRow("a","6e A","2025-2026"),classRow("b","6e A","2026-2027"));
 const r=buildSchoolPedagogyOverview(c,"ecole-a");
 assert.equal(r.classCount,2);assert.equal(r.classes[0].schoolYear,"2026-2027");
});
test("S4-A 05 - élèves affectés réellement: statut actif et membership actif",()=>{
 const c=fixture();c.classes.push(classRow("classe-1"));
 c.student_assignments.push(student("e1"),student("e2"),student("e3","classe-1","2025-2026","revoked"),student("e4","classe-1","2025-2026","active",false));
 const r=buildSchoolPedagogyOverview(c,"ecole-a");
 assert.equal(r.assignedStudentCount,2);assert.equal(r.classes[0].studentsAssigned,2);
});
test("S4-A 06 - affectation portant une autre année exclue",()=>{
 const c=fixture();c.classes.push(classRow("classe-1"));c.student_assignments.push(student("e1","classe-1","2026-2027"));
 assert.equal(buildSchoolPedagogyOverview(c,"ecole-a").assignedStudentCount,0);
});
test("S4-A 07 - affectation portant une classe absente exclue",()=>{
 const c=fixture();c.student_assignments.push(student("e1","classe-b"));
 assert.equal(buildSchoolPedagogyOverview(c,"ecole-a").assignedStudentCount,0);
});
test("S4-A 08 - doublons d'affectation élève n'augmentent pas les effectifs",()=>{
 const c=fixture();c.classes.push(classRow("classe-1"));c.student_assignments.push(student("e1"),student("e1"));
 assert.equal(buildSchoolPedagogyOverview(c,"ecole-a").assignedStudentCount,1);
});
test("S4-A 09 - enseignant affecté à deux matières: 1 enseignant, 2 interventions",()=>{
 const c=fixture();c.classes.push(classRow("classe-1"));
 c.teacher_assignments.push(teacher("t1"),teacher("t1","science"));
 const r=buildSchoolPedagogyOverview(c,"ecole-a");
 assert.equal(r.assignedTeacherCount,1);assert.equal(r.teachingAssignmentCount,2);
 assert.deepEqual(r.classes[0].subjects,["Mathématiques","Sciences"]);
});
test("S4-A 10 - affectations enseignant révoquées ou non effectives ignorées",()=>{
 const c=fixture();c.classes.push(classRow("classe-1"));
 c.teacher_assignments.push(teacher("t1","math","classe-1","revoked"),teacher("t2","math","classe-1","active",false));
 assert.equal(buildSchoolPedagogyOverview(c,"ecole-a").assignedTeacherCount,0);
});
test("S4-A 11 - double entrée enseignant/matière dédupliquée",()=>{
 const c=fixture();c.classes.push(classRow("classe-1"));c.teacher_assignments.push(teacher("t1"),teacher("t1"));
 assert.equal(buildSchoolPedagogyOverview(c,"ecole-a").teachingAssignmentCount,1);
});
test("S4-A 12 - affiliations et affectations restent des KPI distincts",()=>{
 const c=fixture();c.classes.push(classRow("classe-1"));
 c.students.push({id:"e1",full_name:"Privé",status:"active"},{id:"e2",full_name:"Privé",status:"active"});
 c.teachers.push({id:"t1",full_name:"Privé",status:"active"});
 c.student_assignments.push(student("e1"));
 const r=buildSchoolPedagogyOverview(c,"ecole-a");
 assert.equal(r.affiliatedStudentCount,2);assert.equal(r.assignedStudentCount,1);
 assert.equal(r.affiliatedTeacherCount,1);assert.equal(r.assignedTeacherCount,0);
});
test("S4-A 13 - agrégat ne renvoie aucun nom d'élève ou enseignant",()=>{
 const c=fixture();c.classes.push(classRow("classe-1"));
 c.student_assignments.push(student("e1"));c.teacher_assignments.push(teacher("t1"));
 const r=JSON.stringify(buildSchoolPedagogyOverview(c,"ecole-a"));
 assert.equal(r.includes("Nom privé"),false);
});
test("S4-A 14 - seul catalogue RPC scolaire S3-C: aucun accès direct legacy",()=>{
 const s=read("../src/features/schools/pages/LocalSchoolPedagogy.tsx");
 assert.match(s,/getLocalSchoolAssignmentsCatalog\(schoolId\)/);
 assert.doesNotMatch(s,/\.from\(["'](?:courses|classes|student_enrollments|course_enrollments)["']\)/);
});
test("S4-A 15 - rôle local seulement et données effacées si établissement change",()=>{
 const s=read("../src/features/schools/pages/LocalSchoolPedagogy.tsx");
 const router=read("../src/routes/router.tsx");
 assert.match(router,/RoleGate allowed=\{\["school_admin"\]\}/);
 assert.match(router,/path: "school\/pedagogy"/);
 assert.match(s,/setCatalog\(null\)/);
 assert.match(s,/catalog\.school_id === schoolId/);
 assert.match(s,/cancelled/);
});
test("S4-A 16 - modules historiques restent verrouillés en navigation locale",()=>{
 const page=read("../src/features/schools/pages/LocalSchoolPedagogy.tsx");
 const layout=read("../src/layouts/DashboardLayout.tsx");
 assert.match(layout,/to="\/app\/school\/pedagogy"/);
 assert.doesNotMatch(page,/\/app\/teacher\/courses|\/app\/admin\/report-cards/);
 assert.match(page,/Cours, évaluations et bulletins/);
});
test("S4-A 17 - écran en lecture seule : zéro mutation depuis S4-A",()=>{
 const s=read("../src/features/schools/pages/LocalSchoolPedagogy.tsx");
 assert.doesNotMatch(s,/\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.upload\(|schoolnet_school_assign_student/);
});
