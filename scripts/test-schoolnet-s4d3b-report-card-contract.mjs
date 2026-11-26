import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 isAuthorizedReportCardPreview,validateAuthorizedReportCardPreview,
} from "../src/features/official-documents/lib/schoolAuthorizedReportCardModel.ts";
import {
 DEMO_SCHOOLS,makeDemoGradeConfig,makeDemoCurriculum,
 makeDemoGeneralPreview,
} from "../src/features/schools/lib/schoolOfficialGeneralAveragesDemo.ts";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8")
 .replace(/\r\n/g,"\n");
const sql=read("supabase/proposals/s4d3b_school_report_card_authorized_preview.sql");
const api=read("src/features/official-documents/lib/schoolAuthorizedReportCardApi.ts");
const ui=read("src/features/official-documents/pages/SchoolAuthorizedStudentReportCard.tsx");
const fixture=read("src/features/official-documents/lib/schoolAuthorizedReportCardDevFixture.ts");
const page=read("src/features/schools/pages/LocalSchoolOfficialGeneralAverages.tsx");
const workflow=read(".github/workflows/schoolnet-s4d3b-authorized-report-card-ci.yml");
const release=read("docs/releases/SCHOOLNET_S4D3B_AUTHORIZED_SUBJECT_REPORT_CARD_2026-11-26.md");
const vercel=JSON.parse(read("vercel.json"));
const pkg=JSON.parse(read("package.json"));
const branch="feature/schoolnet-s4d3b-authorized-subject-lines-20261126";
const conf=makeDemoGradeConfig(DEMO_SCHOOLS[0].id);
const scope={
 schoolId:DEMO_SCHOOLS[0].id,schoolYearId:conf.years[0].id,
 classId:conf.subjects[0].classId,periodId:conf.periods[0].id,
};
const curriculum=makeDemoCurriculum(scope);
const general=makeDemoGeneralPreview(scope);
const preview=(student,subjectScores,states)=>{
 const subjects=curriculum.subjects.map((s,i)=>({
  subjectId:s.subjectId,subjectName:s.subjectName,coefficient:s.coefficient,
  state:states[i],averageOn20:subjectScores[i],
  includedAssessments:states[i]==="not_configured"?0:1,
  publishedAssessments:states[i]==="ready"?1:0,
  missingAssessments:states[i]==="incomplete"?1:0,
 }));
 return {
  projection:"schoolnet_v2_report_card_provisional_v1",
  ...scope,
  studentId:student.studentId,studentName:student.studentName,
  schoolAdminScoped:true,previewOnly:true,documentState:"provisional",
  state:student.state,averageOn20:student.averageOn20,
  expectedSubjects:student.expectedSubjects,readySubjects:student.readySubjects,
  subjects,
 };
};
const clone=v=>structuredClone(v);
const ready=general.students[0];
const zero=general.students[1];
const incomplete=general.students[2];
const missing=general.students[3];
const readyDoc=preview(ready,[17.17,16.42,15.92],["ready","ready","ready"]);
const zeroDoc=preview(zero,[0,0,0],["ready","ready","ready"]);
const incompleteDoc=preview(incomplete,[11,12,null],["ready","ready","incomplete"]);
const missingDoc=preview(missing,[11,null,null],["ready","not_configured","not_configured"]);

test("S4-D.3b: accepted school-admin subject rows match existing verified C3-C4 average",()=>{
 assert.ok(isAuthorizedReportCardPreview(readyDoc,scope,ready.studentId,curriculum,general));
 assert.equal(validateAuthorizedReportCardPreview(
  readyDoc,scope,ready.studentId,curriculum,general),readyDoc);
 assert.deepEqual(readyDoc.subjects.map(x=>x.subjectName),
  ["Mathématiques","Français","Sciences"]);
 assert.deepEqual(readyDoc.subjects.map(x=>x.coefficient),[2,1,1]);
 assert.equal(readyDoc.averageOn20,16.67);
 assert.equal(readyDoc.readySubjects,3);
});
test("S4-D.3b: published zero remains 0, never absent",()=>{
 assert.equal(zero.averageOn20,0);
 assert.ok(isAuthorizedReportCardPreview(zeroDoc,scope,zero.studentId,curriculum,general));
 assert.deepEqual(zeroDoc.subjects.map(x=>x.averageOn20),[0,0,0]);
});
test("S4-D.3b: incomplete subject remains NULL, ready subjects retain own available results",()=>{
 assert.equal(incomplete.averageOn20,null);
 assert.ok(isAuthorizedReportCardPreview(incompleteDoc,scope,
  incomplete.studentId,curriculum,general));
 assert.deepEqual(incompleteDoc.subjects.map(x=>x.averageOn20),[11,12,null]);
 assert.equal(incompleteDoc.subjects[2].missingAssessments,1);
});
test("S4-D.3b: not configured subject never receives an invented grade",()=>{
 assert.equal(missing.state,"not_configured");
 assert.ok(isAuthorizedReportCardPreview(missingDoc,scope,missing.studentId,curriculum,general));
 assert.deepEqual(missingDoc.subjects.map(x=>x.averageOn20),[11,null,null]);
});
test("S4-D.3b: no IDOR: wrong student, school, class, year or period",()=>{
 for(const other of [
  {schoolId:DEMO_SCHOOLS[1].id},{classId:conf.subjects[3].classId},
  {schoolYearId:"00000000-0000-4000-8000-000000000999"},
  {periodId:conf.periods[1].id},
 ]) assert.equal(isAuthorizedReportCardPreview(
   readyDoc,{...scope,...other},ready.studentId,curriculum,general),false);
 assert.equal(isAuthorizedReportCardPreview(readyDoc,scope,zero.studentId,curriculum,general),false);
});
test("S4-D.3b: subject forgery, duplicate, omission, unknown subject and raw grade keys fail closed",()=>{
 const variants=[
  ((v)=>{v.subjects[0].subjectName="Fake subject"}),
  ((v)=>{v.subjects[0].coefficient=999}),
  ((v)=>{v.subjects[1].subjectId=v.subjects[0].subjectId}),
  ((v)=>{v.subjects.pop()}),
  ((v)=>{v.subjects[1].averageOn20=21}),
  ((v)=>{v.subjects[1].score=20}),
  ((v)=>{v.rawGrades=[{score:20}]}),
  ((v)=>{v.subjects[1].publishedAssessments=2}),
  ((v)=>{v.subjects[0].missingAssessments=1}),
  ((v)=>{v.subjects[0].state="incomplete"}),
  ((v)=>{v.subjects[0].averageOn20=null}),
  ((v)=>{v.subjects[0].averageOn20=4}),
 ];
 for(const mutate of variants){
  const v=clone(readyDoc);mutate(v);
  assert.equal(isAuthorizedReportCardPreview(v,scope,ready.studentId,curriculum,general),
   false,"Mismatched row must fail closed");
 }
});
test("S4-D.3b: no unapproved curriculum, missing or foreign general cohort",()=>{
 const foreign=makeDemoGeneralPreview({
  ...scope,schoolId:DEMO_SCHOOLS[1].id,
 });
 assert.equal(isAuthorizedReportCardPreview(readyDoc,scope,ready.studentId,
  {...curriculum,status:"draft"},general),false);
 assert.equal(isAuthorizedReportCardPreview(readyDoc,scope,ready.studentId,
  curriculum,foreign),false);
 assert.throws(()=>validateAuthorizedReportCardPreview({...readyDoc,
  studentName:"Unrelated pupil"},scope,ready.studentId,curriculum,general),/refusé/);
});
test("S4-D.3b: SQL calls the SAME kernel, rechecks admin and roster, hides raw notes",()=>{
 for(const token of [
  "schoolnet_private.c3c3_school_class_year(",
  "schoolnet_private.compute_official_general_average_preview(",
  "auth.uid()","schoolnet_school_memberships","member_role='student'",
  "member_role='teacher'","ta.status='active'","cl.status='active'",
  "sa.status='active'","ca.status='approved'","include_in_average=true",
  "sub.status::text='published'","sub.published_at IS NOT NULL",
  "v_average->'subjects'","SECURITY DEFINER SET search_path=pg_catalog",
  "SECURITY INVOKER SET search_path=pg_catalog",
  "REVOKE ALL ON FUNCTION","TO authenticated",
 ]) assert.ok(sql.includes(token),"missing security marker "+token);
 assert.ok(!sql.includes("INSERT INTO")&&!sql.includes("UPDATE public."));
 assert.ok(!sql.includes("DROP TABLE"));
 assert.match(sql,/PROPOSAL ONLY, NOT A MIGRATION/);
 assert.match(sql,/RETURN jsonb_build_object\(/);
 assert.ok(sql.includes("'studentId',p_student_id"));
 assert.ok(!sql.includes("'score',sub.score"));
});
test("S4-D.3b: browser sends only school/period/class/student IDs, never actor or grade",()=>{
 assert.match(api,/supabase\.rpc\(SCHOOL_REPORT_CARD_RPC/);
 assert.match(api,/p_student_id: studentId/);
 assert.doesNotMatch(api,/p_teacher_id:|p_actor_id:|p_grade:|service_role/);
 assert.match(api,/viewer\.role !== "school_admin"/);
 assert.match(api,/validateAuthorizedReportCardPreview/);
 assert.match(api,/PGRST202/);
});
test("S4-D.3b: live absence is a visible pending state and NEVER falls back to fake grades",()=>{
 assert.match(ui,/isReportCardRpcPending\(error\)/);
 assert.match(ui,/Activation SQL du bulletin V2 en attente/);
 assert.match(ui,/Aucune donnée de secours n'est inventée/);
 assert.match(ui,/result\?\.key===key/);
 assert.match(ui,/cancelled=true/);
 assert.match(ui,/readAuthorizedStudentReportCard/);
 assert.match(ui,/localDemo \? await import/);
 assert.match(fixture,/import\.meta\.env\.DEV/);
 assert.match(fixture,/moyennes par matière sont purement illustratives|made-up illustration values/i);
});
test("S4-D.3b: UI reuses existing school-admin scoped student selection and logout context",()=>{
 assert.match(page,/role === "school_admin"/);
 assert.match(page,/selectedReview\?\.scopeKey === reviewKey/);
 assert.match(page,/currentCurriculum\?\.status === "approved"/);
 assert.match(page,/currentPreview\?\.state === "preview"/);
 assert.match(page,/SchoolAuthorizedStudentReportCard/);
 assert.match(page,/revisionKey=\{reviewKey\}/);
 assert.match(ui,/Détail des matières pour le bulletin/);
 assert.match(ui,/Moyenne générale · Non publiée/);
 assert.match(ui,/publié|Non publiée|Non publié/);
 assert.doesNotMatch(ui,/window\.print|download=|onClick=.*export|publier/i);
});
test("S4-D.3b: production remains blocked and CI requires actual ephemeral Auth/JWT",()=>{
 assert.equal(vercel.git.deploymentEnabled[branch],false);
 assert.equal(pkg.scripts["qa:s4d3b"],
  "node --experimental-strip-types --test scripts/test-schoolnet-s4d3b-report-card-contract.mjs");
 assert.match(workflow,/npm run qa:s4d3b/);
 assert.match(workflow,/npm run qa:s4d3a/);
 assert.match(workflow,/supabase\/setup-cli@v1/);
 assert.match(workflow,/report-card-http\.mjs/);
 assert.match(workflow,/supabase stop --no-backup/);
 assert.match(workflow,/permissions:\n  contents: read/);
 assert.match(workflow,/persist-credentials: false/);
 assert.doesNotMatch(workflow,/secrets\.|SUPABASE_ACCESS_TOKEN|SUPABASE_DB_URL|--remote|--linked/);
 assert.match(release,/Bulletins V2/);
});
