import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {filterSupervision,isSchoolAssessmentSupervision,supervisionTotals}
 from "../src/features/schools/lib/schoolAssessmentSupervisionModel.ts";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const sql=read("supabase/proposals/s4b3c2_school_assessment_supervision.sql");
const api=read("src/features/schools/lib/schoolAssessmentSupervisionApi.ts");
const page=read("src/features/schools/pages/LocalSchoolAssessmentSupervision.tsx");
const router=read("src/routes/router.tsx");
const nav=read("src/layouts/DashboardLayout.tsx");
const rollback=read("supabase/verification/s4b3c2_school_assessment_supervision_rollback_manual.sql");
const row={
 assessmentId:"a1",title:"Maths 6e",type:"quiz",status:"published",dueAt:null,
 courseId:"c1",courseTitle:"Maths",classId:"cl1",className:"6e A",
 schoolYearId:"y1",schoolYear:"2026-2027",
 subjectId:"s1",subjectName:"Mathématiques",teacherId:"t1",teacherName:"M. A",
 inProgress:1,submitted:2,graded:3,published:4,
};
test("C2 : contrat strict et aucune donnee nominative eleve",()=>{
 assert.equal(isSchoolAssessmentSupervision({schoolId:"sch1",assessmentCount:1,assessments:[row]}),true);
 for(const secret of ["studentId","score","feedback","answers","studentName"]){
  assert.equal(isSchoolAssessmentSupervision({schoolId:"sch1",assessmentCount:1,assessments:[{...row,[secret]:"private"}]}),false);
 }
});
test("C2 : refuse doublons, compteur tronque et mauvais types",()=>{
 assert.equal(isSchoolAssessmentSupervision({schoolId:"sch1",assessmentCount:2,assessments:[row,row]}),false);
 assert.equal(isSchoolAssessmentSupervision({schoolId:"sch1",assessmentCount:2,assessments:[row]}),false);
 assert.equal(isSchoolAssessmentSupervision({schoolId:"sch1",assessmentCount:1,assessments:[{...row,graded:-1}]}),false);
 assert.equal(isSchoolAssessmentSupervision({schoolId:"sch1",assessmentCount:1,assessments:[{...row,type:"other"}]}),false);
});
test("C2 : filtres appliques a la meme population que les compteurs",()=>{
 const another={...row,assessmentId:"a2",classId:"cl2",className:"5e B",
  type:"exam",status:"draft",submitted:8};
 const result=filterSupervision([row,another],{schoolYearId:"",classId:"cl1",
 subjectId:"",teacherId:"",type:"",status:"",search:"maths"});
 assert.deepEqual(result,[row]);
 assert.deepEqual(supervisionTotals(result),{inProgress:1,submitted:2,graded:3,published:4});
});
test("C2 : controle du role local, affiliation et rattachement explicite",()=>{
 for(const guard of ["assert_s3c_access","school_assessment_links","school_course_links",
   "schoolnet_school_teacher_subject_assignments","schoolnet_school_student_class_assignments",
   "schoolnet_school_memberships","schoolnet_schools","al.status='active'",
   "ta.status='active'","s.status::text='submitted'","s.status::text='published'",
   "S4B3C2_TOO_MANY_ASSESSMENTS"]){assert.ok(sql.includes(guard),guard);}
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.schoolnet_school_assessment_supervision\(uuid\) FROM PUBLIC,anon,authenticated/);
 assert.doesNotMatch(sql,/\bTRUNCATE\b|\bDROP TABLE\b|\bUPDATE\s+public\.|\bINSERT\s+INTO\b/i);
});
test("C2 : navigation et lecture RPC unique, sans SELECT direct sur les copies",()=>{
 assert.match(api,/supabase\.rpc\("schoolnet_school_assessment_supervision"/);
 assert.doesNotMatch(api,/\.from\(|\.insert\(|\.update\(|\.delete\(/);
 assert.match(page,/filterSchoolsForLocalAdmin/);
 assert.match(page,/payloadFor===key/);
 assert.match(page,/let cancelled=false/);
 assert.match(router,/school\/assessments/);
 assert.match(nav,/Évaluations officielles/);
});
test("C2 : aucun acces note, rollback cible",()=>{
 assert.doesNotMatch(sql,/jsonb_build_object\([\s\S]*?'score'\s*,/i);
 assert.match(rollback,/S4B3C2_ROLLBACK_GUARD_FAILED/);
 assert.match(rollback,/DROP FUNCTION public\.schoolnet_school_assessment_supervision/);
});
