import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {makeTeacherOfficialAveragesDemoCatalog,makeTeacherOfficialAveragesDemoPreview}
 from "../src/features/teacher/lib/teacherOfficialAveragesDevFixture.ts";
import {isTeacherOfficialAveragesCatalog}
 from "../src/features/teacher/lib/teacherOfficialAveragesCatalogModel.ts";
import {isTeacherOfficialSubjectAverages}
 from "../src/features/teacher/lib/teacherOfficialAveragesModel.ts";
import {paginateOfficialAverageRows}
 from "../src/features/teacher/lib/teacherOfficialAveragesTableModel.ts";
const cat=makeTeacherOfficialAveragesDemoCatalog();
const first=cat.assignments[0];
const choice={schoolId:first.schoolId,classId:first.classId,
 subjectId:first.subjectId,periodId:first.periods[0].id};
test("C3B4: strict catalogue, only fictional class metadata",()=>{
 assert.equal(isTeacherOfficialAveragesCatalog(cat),true);
 assert.equal(cat.assignments.length,3);
 assert.equal(JSON.stringify(cat).includes("averageOn20"),false);
});
test("C3B4: 47 students, two schools, three pages",()=>{
 const result=makeTeacherOfficialAveragesDemoPreview(choice);
 assert.equal(isTeacherOfficialSubjectAverages(result,choice),true);
 assert.equal(result.students.length,47);
 const page3=paginateOfficialAverageRows(result.students,"","all",3);
 assert.equal(page3.pageCount,3);
 assert.equal(page3.rows.length,7);
});
test("C3B4: 12.50, published zero, missing, unconfigured",()=>{
 const rows=makeTeacherOfficialAveragesDemoPreview(choice).students;
 assert.equal(rows[0].averageOn20,12.5);
 assert.equal(rows[1].averageOn20,0);
 assert.equal(rows[2].state,"incomplete");
 assert.equal(rows[2].averageOn20,null);
 assert.equal(rows[3].state,"not_configured");
 const t2=makeTeacherOfficialAveragesDemoPreview({...choice,periodId:first.periods[1].id});
 assert.equal(isTeacherOfficialSubjectAverages(t2),true);
 assert.equal(t2.students.every(r=>r.averageOn20===null),true);
});
test("C3B4: invalid selection rejected; demo only in local DEV",()=>{
 assert.throws(()=>makeTeacherOfficialAveragesDemoPreview({...choice,schoolId:"20000000-0000-4000-8000-000000000099"}));
 const file=readFileSync(new URL("../src/features/teacher/lib/teacherOfficialAveragesDevFixture.ts",import.meta.url),"utf8");
 assert.match(file,/import\.meta\.env\.DEV/);
 assert.match(file,/window\.location\.hostname/);
 assert.match(file,/schoolnet_c3b4_demo/);
 const api=readFileSync(new URL("../src/features/teacher/lib/teacherOfficialAveragesApi.ts",import.meta.url),"utf8");
 assert.match(api,/if\(import\.meta\.env\.DEV\)/);
 assert.match(api,/supabase\.rpc\("schoolnet_teacher_official_subject_averages"/);
});
