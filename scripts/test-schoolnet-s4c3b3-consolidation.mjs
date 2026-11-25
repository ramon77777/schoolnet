import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {paginateOfficialAverageRows} from "../src/features/teacher/lib/teacherOfficialAveragesTableModel.ts";

const students=Array.from({length:45},(_,i)=>({
 studentId:String(i).padStart(36,"0"),studentName:"Élève "+String(i+1).padStart(2,"0"),
 includedAssessments:2,publishedAssessments:i%3===0?1:2,
 state:i%3===0?"incomplete":i%3===1?"ready":"not_configured",
 averageOn20:i%3===1?12.5:null,
}));

test("C3-B.3: pagination and ordering are stable",()=>{
 const first=paginateOfficialAverageRows(students,"","all",1);
 const third=paginateOfficialAverageRows(students,"","all",3);
 assert.equal(first.total,45);
 assert.equal(first.pageCount,3);
 assert.equal(first.rows.length,20);
 assert.equal(third.rows.length,5);
 assert.equal(third.currentPage,3);
 assert.deepEqual(new Set([...first.rows,...paginateOfficialAverageRows(students,"","all",2).rows,...third.rows].map(x=>x.studentId)).size,45);
});

test("C3-B.3: filtering, accent-insensitive casing and page clamping",()=>{
 const result=paginateOfficialAverageRows(students," élève 01 ","ready",999);
 assert.equal(result.currentPage,1);
 assert.equal(result.total,4);
 assert.equal(result.rows.every(r=>r.state==="ready"),true);
 assert.equal(paginateOfficialAverageRows(students,"not found","all",2).total,0);
 assert.equal(paginateOfficialAverageRows(students,"","all",0).currentPage,1);
 assert.equal(paginateOfficialAverageRows(students,"","all",NaN).currentPage,1);
});

test("C3-B.3: no mutation of student rows or original array",()=>{
 const original=students.map(s=>({...s}));
 paginateOfficialAverageRows(students,"","all",2);
 assert.deepEqual(students,original);
});

test("C3-B.3: UI remains teacher scoped, read-only and V1 separate",()=>{
 const page=readFileSync(new URL("../src/features/teacher/pages/TeacherOfficialAverages.tsx",import.meta.url),"utf8");
 assert.match(page,/getTeacherOfficialAveragesCatalog/);
 assert.match(page,/getTeacherOfficialSubjectAverages/);
 assert.match(page,/paginateOfficialAverageRows/);
 assert.match(page,/statusFilter/);
 assert.match(page,/md:hidden/);
 assert.match(page,/Activation SQL en attente/);
 assert.match(page,/row.state==="ready"/);
 assert.doesNotMatch(page,/supabase\.from\(|\.insert\(|\.update\(|\.delete\(/);
});
