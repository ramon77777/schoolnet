import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 isTeacherOfficialAverageOptions,resolveTeacherOfficialAveragePicker,
} from "../src/features/teacher/lib/teacherOfficialAverageOptionsModel.ts";

const id=n=>String(n).padStart(8,"0")+"-0000-4000-8000-000000000001";
const schoolA=id(1),schoolB=id(2),yearA=id(3),yearB=id(4);
const clsA=id(5),clsB=id(6),math=id(7),history=id(8);
const a1={assignmentId:id(9),schoolId:schoolA,schoolName:"Collège A",schoolYearId:yearA,
 schoolYearName:"2026-2027",classId:clsA,className:"6e A",subjectId:math,subjectName:"Maths"};
const a2={assignmentId:id(10),schoolId:schoolA,schoolName:"Collège A",schoolYearId:yearA,
 schoolYearName:"2026-2027",classId:clsA,className:"6e A",subjectId:history,subjectName:"Histoire"};
const b1={assignmentId:id(11),schoolId:schoolB,schoolName:"Collège B",schoolYearId:yearB,
 schoolYearName:"2027-2028",classId:clsB,className:"5e B",subjectId:math,subjectName:"Maths"};
const pA1={id:id(12),schoolId:schoolA,schoolYearId:yearA,code:"T1",
 name:"Premier trimestre",startsOn:"2026-09-15",endsOn:"2026-12-18",isLocked:false};
const pA2={id:id(13),schoolId:schoolA,schoolYearId:yearA,code:"T2",
 name:"Deuxième trimestre",startsOn:"2027-01-03",endsOn:"2027-03-19",isLocked:true};
const pB1={id:id(14),schoolId:schoolB,schoolYearId:yearB,code:"T1",
 name:"Premier trimestre",startsOn:"2027-09-15",endsOn:"2027-12-18",isLocked:false};
const context={teacherScoped:true,assignments:[a1,a2,b1],periods:[pA2,pB1,pA1]};

test("C3B2UI: accept only minimal server-scoped metadata",()=>{
 assert.equal(isTeacherOfficialAverageOptions(context),true);
 assert.equal(isTeacherOfficialAverageOptions({ ...context,students:[] }),false);
 assert.equal(isTeacherOfficialAverageOptions({ ...context,teacherScoped:false }),false);
 assert.equal(isTeacherOfficialAverageOptions({ ...context,assignments:[a1,a1] }),false);
 assert.equal(isTeacherOfficialAverageOptions({ ...context,periods:[pA1,pA1] }),false);
 assert.equal(isTeacherOfficialAverageOptions({ ...context,assignments:[{
  ...a1,score:18,
 }] }),false);
 assert.equal(isTeacherOfficialAverageOptions({ ...context,periods:[{
  ...pA1,studentName:"intrus",
 }] }),false);
 assert.equal(isTeacherOfficialAverageOptions({ ...context,periods:[{
  ...pA1,schoolYearId:id(90),
 }] }),false);
 assert.equal(isTeacherOfficialAverageOptions({ ...context,periods:[{
  ...pA1,startsOn:"2026-12-20",endsOn:"2026-12-01",
 }] }),false);
});
test("C3B2UI: school/year/class/subject cascades are always internally coherent",()=>{
 const first=resolveTeacherOfficialAveragePicker(context);
 assert.deepEqual(first.choice,{schoolId:schoolA,schoolYearId:yearA,
  classId:clsA,subjectId:math,periodId:pA1.id});
 assert.equal(first.schools.length,2);
 assert.equal(first.subjects.length,2);
 assert.deepEqual(first.periods.map(p=>p.id),[pA1.id,pA2.id]);
 const foreign=resolveTeacherOfficialAveragePicker(context,{
  schoolId:schoolB,schoolYearId:yearA,classId:clsA,
  subjectId:history,periodId:pA2.id,
 });
 assert.deepEqual(foreign.choice,{schoolId:schoolB,schoolYearId:yearB,
  classId:clsB,subjectId:math,periodId:pB1.id});
 assert.equal(foreign.assignment?.assignmentId,b1.assignmentId);
 assert.equal(foreign.period?.schoolId,schoolB);
 const empty=resolveTeacherOfficialAveragePicker({
  teacherScoped:true,assignments:[],periods:[],
 });
 assert.equal(empty.assignment,null);
 assert.equal(empty.period,null);
 assert.equal(empty.choice.periodId,"");
});
test("C3B2UI: no periods implies no grades, even with active assignment",()=>{
 const noPeriod=resolveTeacherOfficialAveragePicker({
  teacherScoped:true,assignments:[a1],periods:[],
 });
 assert.equal(noPeriod.assignment?.assignmentId,a1.assignmentId);
 assert.equal(noPeriod.period,null);
 assert.equal(noPeriod.choice.subjectId,math);
});
test("C3B2UI: role-gated route, dedicated navigation and no V1 mix",()=>{
 const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
 const route=read("src/routes/router.tsx");
 const teacherScope=route.slice(route.indexOf('allowed={["teacher"]}'),route.indexOf('allowed={["school_admin"]}'));
 assert.match(teacherScope,/path: "teacher\/official-averages"/);
 assert.match(teacherScope,/<TeacherOfficialAverages \/>/);
 const nav=read("src/layouts/DashboardLayout.tsx");
 assert.match(nav,/user\.role === "teacher"[\s\S]*?to="\/app\/teacher\/official-averages"/);
 assert.match(nav,/to="\/app\/teacher\/averages"/);
 const page=read("src/features/teacher/pages/TeacherOfficialAverages.tsx");
 assert.match(page,/previewFor===requestKey/);
 assert.match(page,/user\.role==="teacher"/);
 assert.match(page,/Activation SQL en attente/);
 assert.match(page,/Notes manquantes/);
 assert.match(page,/Moyennes prévisionnelles de la matière/);
 assert.doesNotMatch(page,/supabase\.from\(/);
 assert.doesNotMatch(page,/student_period_averages|teacher_class_average_results/);
 const api=read("src/features/teacher/lib/teacherOfficialAverageOptionsApi.ts");
 assert.match(api,/supabase\.rpc\("schoolnet_teacher_official_average_options"\)/);
 assert.doesNotMatch(api,/supabase\.from\(/);
});
test("C3B2UI: SQL is read-only with auth.uid and role checks, grants not public",()=>{
 const sql=readFileSync(new URL(
  "../supabase/proposals/s4c3b2ui_teacher_average_options.sql",
  import.meta.url),"utf8");
 assert.match(sql,/auth\.uid\(\)/);
 assert.match(sql,/public\.get_my_role\(\)/);
 assert.match(sql,/member\.user_id=v_uid/);
 assert.match(sql,/member\.status='active'/);
 assert.match(sql,/assignment\.revoked_at IS NULL/);
 assert.match(sql,/SECURITY DEFINER/);
 assert.match(sql,/SECURITY INVOKER/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.schoolnet_teacher_official_average_options/);
 const executableSql=sql.split("\n").filter(line=>!line.trimStart().startsWith("--")).join("\n");
 assert.doesNotMatch(executableSql,/\bassessment_submissions\b|\bstudent_id\b|\bscore\b|\bfeedback\b|\banswers\b/gi);
 assert.doesNotMatch(sql,/\bUPDATE\b|\bINSERT INTO\b|\bDELETE FROM\b/i);
});
