import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {availablePeriods,isSchoolGradeConfig,validCoefficient}
 from "../src/features/schools/lib/schoolGradeConfigurationModel.ts";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const sql=read("supabase/proposals/s4c3a_official_periods_coefficients.sql");
const api=read("src/features/schools/lib/schoolGradeConfigurationApi.ts");
const ui=read("src/features/schools/pages/LocalSchoolGradeConfiguration.tsx");
const routes=read("src/routes/router.tsx");
const nav=read("src/layouts/DashboardLayout.tsx");
const base={
 schoolId:"school-A",
 years:[{id:"year-1",name:"2026-2027",startsOn:"2026-09-01",endsOn:"2027-07-01"}],
 periods:[{id:"period-1",schoolYearId:"year-1",code:"T1",name:"Trimestre 1",
 startsOn:"2026-09-01",endsOn:"2026-12-20",isLocked:false}],
 subjects:[{classId:"class-1",className:"6e A",schoolYearId:"year-1",
 subjectId:"subject-1",subjectName:"Mathématiques"}],
 subjectSettings:[{periodId:"period-1",classId:"class-1",subjectId:"subject-1",coefficient:2}],
 assessments:[{assessmentId:"assessment-1",title:"Nombres entiers",
 classId:"class-1",schoolYearId:"year-1",subjectId:"subject-1",
 periodId:"period-1",coefficient:1,includeInAverage:false}],
};
test("C3-A: contrat strict, refus des notes et identites dans la projection",()=>{
 assert.equal(isSchoolGradeConfig(base),true);
 assert.equal(isSchoolGradeConfig({...base,studentName:"Elève"}),false);
 assert.equal(isSchoolGradeConfig({...base,assessments:[{...base.assessments[0],score:20}]}),false);
 assert.equal(isSchoolGradeConfig({...base,assessments:[...base.assessments,base.assessments[0]]}),false);
 assert.equal(isSchoolGradeConfig({...base,schoolId:"school-B",years:[...base.years,base.years[0]]}),false);
});
test("C3-A: annexe de période, classe et matière doit rester cohérente",()=>{
 assert.equal(isSchoolGradeConfig({...base,assessments:[{...base.assessments[0],schoolYearId:"other"}]}),false);
 assert.equal(isSchoolGradeConfig({...base,subjectSettings:[{...base.subjectSettings[0],periodId:"foreign"}]}),false);
 assert.equal(isSchoolGradeConfig({...base,periods:[{...base.periods[0],schoolYearId:"foreign"}]}),false);
 assert.equal(isSchoolGradeConfig({...base,subjects:[]}),false);
 assert.equal(isSchoolGradeConfig({...base,assessments:[{...base.assessments[0],
  periodId:null,coefficient:1}]}),false);
 assert.equal(isSchoolGradeConfig({...base,assessments:[{...base.assessments[0],
  periodId:null,coefficient:null,includeInAverage:false}]}),true);
});
test("C3-A: coefficients bornes, périodes par année",()=>{
 assert.equal(validCoefficient(1),true);
 assert.equal(validCoefficient(0.25),true);
 assert.equal(validCoefficient(20),true);
 for(const n of [0,-1,20.01,0.251,NaN,Infinity])assert.equal(validCoefficient(n),false);
 assert.deepEqual(availablePeriods(base,"year-1").map(p=>p.id),["period-1"]);
 assert.deepEqual(availablePeriods(base,"year-B"),[]);
});
test("C3-A: séparation V1 et isolation school-admin coté serveur",()=>{
 for(const guard of [
  "schoolnet_private.assert_s3c_access(p_school_id,false)",
  "schoolnet_private.assert_s3c_access(p_school_id,true)",
  "school_grading_periods","school_period_subject_coefficients",
  "school_official_assessment_coefficients",
  "school_assessment_links","school_course_links",
  "schoolnet_school_teacher_subject_assignments",
  "schoolnet_school_memberships","school_id=p_school_id",
  "S4C3A_PERIOD_OVERLAP","S4C3A_PERIOD_LOCKED",
  "S4C3A_ASSESSMENT_OUTSIDE_SCHOOL","S4C3A_SUBJECT_OUTSIDE_SCHOOL",
  "S4C3A_YEAR_NOT_ASSIGNED","REVOKE ALL ON schoolnet_private."
 ])assert.ok(sql.includes(guard),guard);
 assert.doesNotMatch(sql,/\bUPDATE\s+public\.|\bDELETE\s+FROM\s+public\.|\bINSERT\s+INTO\s+public\./i);
 assert.doesNotMatch(sql,/\bDROP TABLE\b|\bTRUNCATE\b/i);
 assert.match(sql,/ALTER TABLE schoolnet_private\.school_grading_periods ENABLE ROW LEVEL SECURITY/);
});
test("C3-A: RPC exclusives et aucune lecture directe des notes dans le navigateur",()=>{
 assert.match(api,/supabase\.rpc\("schoolnet_school_grading_configuration"/);
 assert.match(api,/supabase\.rpc\("schoolnet_school_upsert_grading_period"/);
 assert.match(api,/supabase\.rpc\("schoolnet_school_set_subject_coefficient"/);
 assert.match(api,/supabase\.rpc\("schoolnet_school_set_assessment_coefficient"/);
 assert.doesNotMatch(api,/\.from\(|\.insert\(|\.update\(|\.delete\(/);
 assert.doesNotMatch(ui,/\.from\(|assessment_submissions|student_period_averages|report_cards/);
 assert.match(ui,/filterSchoolsForLocalAdmin/);
 assert.match(ui,/configFor===key/);
 assert.match(ui,/window\.confirm/);
 assert.match(ui,/Activation SQL en attente/);
 assert.match(routes,/school\/grading-settings/);
 assert.match(nav,/Périodes et coefficients/);
});
