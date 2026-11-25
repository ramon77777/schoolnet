import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {selectTeacherAverageSpace,countTeacherLegacyAverageClasses}
 from "../src/features/teacher/lib/teacherAveragesHubModel.ts";

const read=(path)=>readFileSync(new URL(path,import.meta.url),"utf8");
test("B6.1: school-only teacher opens the secure official averages",()=>{
 assert.deepEqual(selectTeacherAverageSpace(2,0,"free"),{layout:"official",tab:"official"});
});
test("B6.1: V1-only teacher keeps the historical average engine",()=>{
 assert.deepEqual(selectTeacherAverageSpace(0,2,"official"),{layout:"free",tab:"free"});
});
test("B6.1: dual teacher gets both independent tabs, default official",()=>{
 assert.deepEqual(selectTeacherAverageSpace(2,3,null),{layout:"dual",tab:"official"});
 assert.deepEqual(selectTeacherAverageSpace(2,3,"free"),{layout:"dual",tab:"free"});
 assert.deepEqual(selectTeacherAverageSpace(2,3,"invalid"),{layout:"dual",tab:"official"});
});
test("B6.1: empty catalog, invalid counts and V1 deduplication",()=>{
 assert.deepEqual(selectTeacherAverageSpace(0,0,null),{layout:"empty",tab:null});
 assert.throws(()=>selectTeacherAverageSpace(-1,0,null));
 assert.throws(()=>selectTeacherAverageSpace(1.2,0,null));
 assert.equal(countTeacherLegacyAverageClasses(null),0);
 assert.equal(countTeacherLegacyAverageClasses([{class_id:"c1"},{class_id:"c1"},{class_id:"c2"}]),2);
 assert.throws(()=>countTeacherLegacyAverageClasses([{wrong:"id"}]));
});
test("B6.1: one menu entry and protected legacy URLs survive",()=>{
 const nav=read("../src/layouts/DashboardLayout.tsx");
 const teacher=nav.slice(nav.indexOf('user.role === "teacher" && ('),nav.indexOf('user.role === "school_admin" && ('));
 assert.equal((teacher.match(/📊 Moyennes/g)||[]).length,1);
 assert.doesNotMatch(teacher,/📐 Moyennes officielles/);
 const router=read("../src/routes/router.tsx");
 assert.match(router,/teacher\/averages",\s*element: <TeacherAveragesHub/);
 assert.match(router,/teacher\/averages\/free", element: <TeacherAverages/);
 assert.match(router,/teacher\/official-averages", element: <TeacherOfficialAverages/);
});
test("B6.1: navigation probes never request grade rows or write to Supabase",()=>{
 const hub=read("../src/features/teacher/pages/TeacherAveragesHub.tsx");
 assert.match(hub,/getTeacherOfficialAveragesCatalog\(\)/);
 assert.match(hub,/supabase\.rpc\("teacher_average_classes"\)/);
 assert.doesNotMatch(hub,/supabase\.from\(|teacher_class_average_results|teacher_student_subject_averages|\.insert\(|\.update\(/);
 assert.match(hub,/Promise\.all\(/);
 assert.match(hub,/role==="teacher"&&!user\.isDemo/);
 const official=read("../src/features/teacher/pages/TeacherOfficialAverages.tsx");
 assert.match(official,/\{embedded=false\}/);
});
