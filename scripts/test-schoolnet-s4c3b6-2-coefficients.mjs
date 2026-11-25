import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {isTeacherCoefficientSettings,isSchoolTeacherCoefficientDelegations}
 from "../src/features/teacher/lib/teacherCoefficientModel.ts";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const school="20000000-0000-4000-8000-000000000001";
const assignment={assignmentId:"a1",classId:"c1",className:"6e A",
 schoolYearId:"y1",schoolYearName:"2026-2027",subjectId:"s1",
 subjectName:"Mathématiques",canEditSubjectCoefficient:false};
const period={id:"p1",schoolYearId:"y1",code:"T1",name:"Premier trimestre",
 startsOn:"2026-09-15",endsOn:"2026-12-18",isLocked:false};
const config={schoolId:school,assignments:[assignment],periods:[period],
 subjectSettings:[{periodId:"p1",classId:"c1",subjectId:"s1",coefficient:2}],
 assessments:[{assessmentId:"e1",title:"Contrôle",classId:"c1",schoolYearId:"y1",
 subjectId:"s1",periodId:"p1",coefficient:1,includeInAverage:true}],history:[]};
test("B6.2: strict teacher configuration",()=>{
 assert.equal(isTeacherCoefficientSettings(config),true);
 assert.equal(isTeacherCoefficientSettings({...config,grades:[20]}),false);
 assert.equal(isTeacherCoefficientSettings({...config,subjectSettings:[{...config.subjectSettings[0],coefficient:0.001}]}),false);
 assert.equal(isTeacherCoefficientSettings({...config,assessments:[{...config.assessments[0],classId:"c2"}]}),false);
 assert.equal(isTeacherCoefficientSettings({...config,periods:[{...period,schoolYearId:"y2"}]}),false);
 assert.equal(isTeacherCoefficientSettings({...config,history:[{action:"teacher_subject_coefficient",
  at:"2026-11-25T12:00:00+00:00",periodId:"p1",assessmentId:null,classId:"c1",
  subjectId:"s1",previousValue:null,currentValue:{coefficient:2}}]}),true);
});
test("B6.2: strict school-admin delegation catalog",()=>{
 const c={schoolId:school,assignments:[{assignmentId:"a1",teacherName:"Prof A",
 className:"6e A",subjectName:"Mathématiques",schoolYearName:"2026-2027",
 canEditSubjectCoefficient:false}]};
 assert.equal(isSchoolTeacherCoefficientDelegations(c),true);
 assert.equal(isSchoolTeacherCoefficientDelegations({...c,studentId:"student"}),false);
});
test("B6.2: SQL uses auth.uid, assignment delegation, period locks, audit",()=>{
 const sql=read("supabase/proposals/s4c3b6_teacher_coefficients_delegation.sql");
 for(const item of ["auth.uid()","public.get_my_role()","schoolnet_private.assert_s3c_access",
  "can_edit_subject_coefficient","p.is_locked","S4C3B6_SUBJECT_DELEGATION_REQUIRED",
  "S4C3B6_ASSESSMENT_NOT_MINE","school_teacher_coefficient_events",
  "ENABLE ROW LEVEL SECURITY","REVOKE ALL","SECURITY INVOKER",
  "S4C3B6_POSTFLIGHT_FAILED"])assert.ok(sql.includes(item),item);
 assert.doesNotMatch(sql,/UPDATE public\.assessment_submissions|UPDATE public\.student_period_averages|DELETE FROM public\.assessments/i);
});
test("B6.2: frontend uses scoped RPC only, never direct grade tables",()=>{
 const api=read("src/features/teacher/lib/teacherCoefficientApi.ts");
 for(const rpc of ["schoolnet_teacher_coefficient_settings","schoolnet_teacher_set_assessment_coefficient",
  "schoolnet_teacher_set_subject_coefficient","schoolnet_school_teacher_coefficient_delegations",
  "schoolnet_school_set_teacher_coefficient_delegation"])
  assert.ok(api.includes('supabase.rpc("'+rpc+'"'),rpc);
 assert.doesNotMatch(api,/supabase\.from\(|\.insert\(|\.update\(|\.delete\(/);
 const ui=read("src/features/teacher/pages/TeacherCoefficients.tsx");
 assert.match(ui,/user\.role==="teacher"&&!user\.isDemo/);
 assert.match(ui,/canEditSubjectCoefficient/);
 assert.match(ui,/Activation SQL B\.6\.2 en attente/);
 const admin=read("src/features/schools/components/SchoolTeacherCoefficientDelegations.tsx");
 assert.match(admin,/user\.role==="school_admin"/);
 assert.match(admin,/getSchoolTeacherCoefficientDelegations/);
 assert.match(read("src/routes/router.tsx"),/teacher\/coefficients/);
 const layout=read("src/layouts/DashboardLayout.tsx");
 const studentStart=layout.indexOf('user.role === "student"');
 const parentStart=layout.indexOf('user.role === "parent"');
 const teacherStart=layout.indexOf('user.role === "teacher"');
 assert.ok(studentStart>=0&&parentStart>studentStart&&teacherStart>parentStart);
 assert.doesNotMatch(layout.slice(studentStart,parentStart),/teacher\/coefficients/);
 assert.match(layout.slice(teacherStart),/to="\/app\/teacher\/coefficients"/);
 assert.equal((layout.match(/to="\/app\/teacher\/coefficients"/g)??[]).length,1);
 assert.match(read("src/features/schools/pages/LocalSchoolGradeConfiguration.tsx"),/SchoolTeacherCoefficientDelegations/);
});
test("B6.2: CI fixtures test A/B, locked, revoked, rollback",()=>{
 const fixture=read("tests/s4c3b6-tenant-ci/fixtures/teacher-coefficients-a-b.sql");
 for(const word of ["S4C3B6_PASS_CROSS_ADMIN_DENIED","S4C3B6_PASS_TEACHER_SCOPED_READ",
  "S4C3B6_PASS_OWN_ASSESSMENT_AUDITED","S4C3B6_PASS_IMMEDIATE_DELEGATION_REVOCATION",
  "S4C3B6_PASS_LOCKED_PERIOD_DENIED","S4C3B6_PASS_MEMBERSHIP_REVOCATION",
  "S4C3B6_PASS_ANON_DENIED","S4C3B6_A_B_FIXTURE_ROLLED_BACK"])
  assert.ok(fixture.includes(word),word);
 const workflow=read(".github/workflows/schoolnet-s4c3b2-teacher-averages-ci.yml");
 assert.match(workflow,/teacher-coefficients-a-b\.sql/);
 assert.match(workflow,/npm run qa:s4c3b6-2/);
});
