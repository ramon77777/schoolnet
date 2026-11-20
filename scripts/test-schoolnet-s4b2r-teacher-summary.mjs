import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { splitTeacherCourseResources } from "../src/features/teacher/lib/teacherCourseResources.ts";
import { isTeacherCourseClassSummary } from "../src/features/teacher/lib/teacherCourseClassSummaryModel.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = path => readFileSync(resolve(root,path),"utf8");
const row = (id, section_id = null) => ({id,section_id,title:id,url:"https://example.org/a"});
const summary = (isOfficial=true,officialStudentCount=1) => ({
 courseId:"school-a-course",isOfficial,officialStudentCount,
});

test("S4B2-R 01 - ressources vides donnent total zero",()=>{
 const v=splitTeacherCourseResources([], [{id:"chapter-1"}]);
 assert.equal(v.total,0);
 assert.equal(v.general.length,0);
 assert.equal(v.bySection.get("chapter-1")?.length,0);
});
test("S4B2-R 02 - une ressource de chapitre reste liee",()=>{
 const v=splitTeacherCourseResources([row("a","chapter-1")], [{id:"chapter-1"}]);
 assert.equal(v.total,1);
 assert.deepEqual(v.bySection.get("chapter-1")?.map(r=>r.id),["a"]);
});
test("S4B2-R 03 - une ressource generale est comptee et visible",()=>{
 const v=splitTeacherCourseResources([row("a")], [{id:"chapter-1"}]);
 assert.equal(v.total,1);
 assert.equal(v.general[0].id,"a");
});
test("S4B2-R 04 - le cas reel 1 chapitre + 1 generale affiche 2",()=>{
 const v=splitTeacherCourseResources([row("a","chapter-1"),row("b")],[{id:"chapter-1"}]);
 assert.equal(v.total,2);
 assert.deepEqual(v.bySection.get("chapter-1")?.map(x=>x.id),["a"]);
 assert.deepEqual(v.general.map(x=>x.id),["b"]);
});
test("S4B2-R 05 - section inconnue visible en anomalies sans perte",()=>{
 const v=splitTeacherCourseResources([row("a","old-section"),row("b")],[{id:"chapter-1"}]);
 assert.equal(v.total,2);
 assert.deepEqual(v.unmatched.map(x=>x.id),["a"]);
 assert.deepEqual(v.general.map(x=>x.id),["b"]);
});
test("S4B2-R 06 - aucune mutation des entrees",()=>{
 const rows=[row("a","1"),row("b")],before=structuredClone(rows),sections=[{id:"1"}];
 splitTeacherCourseResources(rows,sections);
 assert.deepEqual(rows,before);
 assert.deepEqual(sections,[{id:"1"}]);
});
test("S4B2-R 07 - plusieurs sections isolees",()=>{
 const v=splitTeacherCourseResources([row("a","1"),row("b","2"),row("c","1")],[{id:"1"},{id:"2"}]);
 assert.deepEqual(v.bySection.get("1")?.map(x=>x.id),["a","c"]);
 assert.deepEqual(v.bySection.get("2")?.map(x=>x.id),["b"]);
});
test("S4B2-R 08 - tous les types de ressources participent au total enseignant",()=>{
 const resources=[{...row("a"),visibility:"teacher_only"},{...row("b","s1"),visibility:"public_to_course"}];
 const v=splitTeacherCourseResources(resources,[{id:"s1"}]);
 assert.equal(v.total,2);
});
test("S4B2-R 09 - contrat RPC officiel valide",()=>{
 assert.equal(isTeacherCourseClassSummary(summary(), "school-a-course"),true);
});
test("S4B2-R 10 - un cours libre actif n'est pas un cours officiel",()=>{
 assert.equal(isTeacherCourseClassSummary(summary(false,0), "school-a-course"),true);
});
test("S4B2-R 11 - identifiant different refuse",()=>{
 assert.equal(isTeacherCourseClassSummary(summary(),"school-b-course"),false);
});
test("S4B2-R 12 - aucun identifiant, nom ou note d'eleve dans le contrat",()=>{
 for(const key of ["students","studentId","studentName","grades","email"]){
  assert.equal(isTeacherCourseClassSummary({...summary(),[key]:"secret"},"school-a-course"),false);
 }
});
test("S4B2-R 13 - compteurs invalides refuses",()=>{
 for(const value of [-1,1.2,NaN,Infinity,"1",null]){
  assert.equal(isTeacherCourseClassSummary(summary(true,value),"school-a-course"),false);
 }
 assert.equal(isTeacherCourseClassSummary({...summary(),officialStudentCount:undefined},"school-a-course"),false);
});
test("S4B2-R 14 - un cours non officiel doit toujours compter zero",()=>{
 assert.equal(isTeacherCourseClassSummary(summary(false,2),"school-a-course"),false);
});
test("S4B2-R 15 - RPC serveur uniquement, pas de lecture directe des affectations",()=>{
 const api=read("src/features/teacher/lib/teacherCourseClassSummaryApi.ts");
 const page=read("src/features/teacher/pages/TeacherCourseDetail.tsx");
 assert.match(api,/supabase\.rpc\(\s*"schoolnet_teacher_course_class_summary"/);
 assert.doesNotMatch(api,/\.from\("schoolnet_school_student_class_assignments"\)/);
 assert.doesNotMatch(page,/\.from\("schoolnet_school_student_class_assignments"\)/);
});
test("S4B2-R 16 - compteurs ressources / effectifs V1 distincts",()=>{
 const page=read("src/features/teacher/pages/TeacherCourseDetail.tsx");
 assert.match(page,/setResourceCount\(groupedResources\.total\)/);
 assert.match(page,/Ressources générales/);
 assert.match(page,/TeacherResourceList items=\{generalResources\}/);
 assert.match(page,/Élèves de la classe officielle/);
 assert.match(page,/Inscriptions individuelles \(V1\)/);
 assert.match(page,/Progression V1/);
 assert.match(page,/course_enrollments/);
 assert.match(page,/student_progress/);
});
test("S4B2-R 17 - SQL: uniquement 2 fonctions, droit teacher cote serveur",()=>{
 const sql=read("supabase/proposals/s4b2r_teacher_course_class_summary.sql");
 assert.equal((sql.match(/^CREATE FUNCTION /gm)||[]).length,2);
 assert.match(sql,/auth\.uid\(\)/);
 assert.match(sql,/public\.get_my_role\(\)::text IS DISTINCT FROM 'teacher'/);
 assert.match(sql,/co\.created_by=v_uid/);
 assert.match(sql,/m\.member_role='student' AND m\.status='active'/);
 assert.match(sql,/a\.status='active'/);
 assert.match(sql,/l\.status='active'/);
 assert.match(sql,/RETURN jsonb_build_object\(/);
 assert.doesNotMatch(sql,/^\s*(?:INSERT INTO|UPDATE public\.|DELETE FROM|ALTER TABLE|DROP TABLE)/mi);
});
test("S4B2-R 18 - SQL sans donnees nominatives ni acces anonyme",()=>{
 const sql=read("supabase/proposals/s4b2r_teacher_course_class_summary.sql");
 assert.equal((sql.match(/SECURITY DEFINER/g)||[]).length,1);
 assert.equal((sql.match(/SECURITY INVOKER/g)||[]).length,1);
 assert.match(sql,/FROM PUBLIC,anon,authenticated/);
 assert.match(sql,/TO authenticated/);
 assert.match(sql,/SET search_path=pg_catalog/g);
 assert.doesNotMatch(sql,/jsonb_build_object\([^;]*(?:full_name|student_id|email)/);
});
test("S4B2-R 19 - isolation SQL sur sandbox avec revocations et rollback",()=>{
 const fixture=read("tests/s4b2-tenant-ci/fixtures/student-courses-a-b.sql");
 const ci=read(".github/workflows/schoolnet-s4b2-tenant-ci.yml");
 assert.match(fixture,/S4B2R_PASS_TEACHER_A_NO_PII/);
 assert.match(fixture,/S4B2R_PASS_TEACHER_B_ISOLATION/);
 assert.match(fixture,/S4B2R_PASS_NON_TEACHER_DENIAL/);
 assert.match(fixture,/S4B2R_PASS_REVOKED_STUDENT_COUNT/);
 assert.match(fixture,/S4B2R_PASS_REVOKED_LINK/);
 assert.match(fixture,/ROLLBACK;\s*$/);
 assert.match(ci,/s4b2r_teacher_course_class_summary\.sql/);
 assert.match(ci,/127\.0\.0\.1/);
 assert.doesNotMatch(ci,/supabase db push|supabase link|secrets\./);
});
test("S4B2-R 20 - migration principale et inscriptions V1 restees intactes",()=>{
 const doc=read("docs/releases/SCHOOLNET_S4B2_R_ENSEIGNANT_RESSOURCES_EFFECTIFS_2026-11-20.md");
 assert.match(doc,/aucune migration.{0,50}principal/i);
 assert.match(doc,/course_enrollments/);
 assert.match(doc,/Aucun élève/i);
});
