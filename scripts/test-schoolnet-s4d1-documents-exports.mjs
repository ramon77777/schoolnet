import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 OFFICIAL_EXPORT_KINDS,OFFICIAL_EXPORT_FORMATS,OFFICIAL_EXPORT_CADENCES,
 OFFICIAL_EXPORT_STATES,planSchoolOfficialExport,
} from "../src/features/official-documents/lib/schoolOfficialExportPlanning.ts";

const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8").replace(/\r\n/g,"\n");
const page=read("src/features/official-documents/pages/SchoolOfficialDocumentsHub.tsx");
const model=read("src/features/official-documents/lib/schoolOfficialExportPlanning.ts");
const routes=read("src/routes/router.tsx");
const nav=read("src/layouts/DashboardLayout.tsx");
const dashboard=read("src/features/schools/pages/LocalSchoolDashboard.tsx");
const legacy=read("src/features/report-cards/lib/adminReportCardsApi.ts");
const sqlApi=read("src/features/schools/lib/schoolOfficialGeneralAveragesApi.ts");
const vercel=JSON.parse(read("vercel.json"));
const pkg=JSON.parse(read("package.json"));
const ci=read(".github/workflows/schoolnet-s4d1-official-documents-ci.yml");
const doc=read("docs/releases/SCHOOLNET_S4D1_REPORT_CARDS_EXPORTS_2026-11-26.md");
const branch="feature/schoolnet-s4d1-reportcards-exports-foundation-20261126";
const scope={schoolId:"school-A",schoolYearId:"year-2026",classId:"class-6B",periodId:"T1-id"};
const teacher={viewerId:"teacher-id",role:"teacher",scope,kind:"subject_period",cadence:"trimester",format:"pdf",state:"provisional",subjectId:"math-id"};
const context={
 viewerId:"teacher-id",role:"teacher",membershipActive:true,
 allowedSchoolIds:["school-A"],
 teacherSubjectAssignments:[{schoolId:"school-A",schoolYearId:"year-2026",classId:"class-6B",subjectId:"math-id"}],
 summaryExportDelegations:[],periodConfigured:true,
 annualPolicyApproved:false,annualPeriodsComplete:false,
 v2ProjectionAvailable:true,publishedSnapshotId:null,
};
const blockers=(r,c)=>planSchoolOfficialExport(r,c).blockers;

test("S4-D.1: export coverage includes PDF XLSX trimester semester annual and distinct report status",()=>{
 assert.deepEqual(OFFICIAL_EXPORT_KINDS,["subject_period","class_subjects","class_general"]);
 assert.deepEqual(OFFICIAL_EXPORT_FORMATS,["pdf","xlsx"]);
 assert.deepEqual(OFFICIAL_EXPORT_CADENCES,["trimester","semester","annual"]);
 assert.deepEqual(OFFICIAL_EXPORT_STATES,["provisional","published"]);
});
test("S4-D.1: teacher assigned subject allowed only for server review, never direct download",()=>{
 const r=planSchoolOfficialExport(teacher,context);
 assert.equal(r.eligibleForServerReview,true);
 assert.equal(r.realDownloadAvailable,false);
 assert.equal(r.statusLabel,"RELEVÉ PROVISOIRE — NON PUBLIÉ");
 assert.deepEqual(blockers({...teacher,subjectId:"french-id"},context),["SUBJECT_NOT_ASSIGNED"]);
});
test("S4-D.1: wrong tenant, revoked teacher, mismatched identity denied",()=>{
 assert.ok(blockers({...teacher,scope:{...scope,schoolId:"school-B"}},context).includes("OTHER_SCHOOL"));
 assert.ok(blockers(teacher,{...context,membershipActive:false}).includes("INACTIVE_MEMBER"));
 assert.ok(blockers({...teacher,viewerId:"impostor"},context).includes("MISMATCHED_USER_OR_ROLE"));
});
test("S4-D.1: teacher all-subject and general export require delegation unrelated to coefficients",()=>{
 for(const kind of ["class_subjects","class_general"])
  assert.ok(blockers({...teacher,kind,subjectId:null},context).includes("SPECIFIC_EXPORT_DELEGATION_REQUIRED"));
 assert.doesNotMatch(model,/coefficient.*canExportSchoolwideResults/i);
});
test("S4-D.1: specific teacher delegation must match kind school class year and period",()=>{
 const kind="class_general",request={...teacher,kind,subjectId:null};
 const grant={...scope,kind,canExportSchoolwideResults:true};
 assert.equal(planSchoolOfficialExport(request,{...context,summaryExportDelegations:[grant]}).eligibleForServerReview,true);
 assert.ok(blockers(request,{...context,summaryExportDelegations:[{...grant,periodId:"T2-id"}]})
  .includes("SPECIFIC_EXPORT_DELEGATION_REQUIRED"));
 assert.ok(blockers({...request,kind:"class_subjects"},{...context,summaryExportDelegations:[grant]})
  .includes("SPECIFIC_EXPORT_DELEGATION_REQUIRED"));
});
test("S4-D.1: school_admin may plan assigned-school all-subject exports, never cross-school",()=>{
 const a={...teacher,role:"school_admin",viewerId:"admin-id"};
 const c={...context,role:"school_admin",viewerId:"admin-id",teacherSubjectAssignments:[]};
 for(const kind of OFFICIAL_EXPORT_KINDS)
  assert.equal(planSchoolOfficialExport({...a,kind,subjectId:kind==="subject_period"?"math-id":null},c)
   .eligibleForServerReview,true);
 assert.ok(blockers({...a,scope:{...scope,schoolId:"school-B"}},c).includes("OTHER_SCHOOL"));
});
test("S4-D.1: annual exports blocked without approved weighting or complete periods",()=>{
 const a={...teacher,cadence:"annual",scope:{...scope,periodId:null}};
 assert.ok(blockers(a,context).includes("ANNUAL_POLICY_PENDING"));
 assert.ok(blockers(a,context).includes("ANNUAL_PERIODS_INCOMPLETE"));
 assert.equal(planSchoolOfficialExport(a,{...context,annualPolicyApproved:true,annualPeriodsComplete:true})
  .eligibleForServerReview,true);
 assert.ok(blockers({...a,scope},context).includes("INVALID_SCOPE"));
});
test("S4-D.1: only configured periods eligible for trimester or semester",()=>{
 assert.ok(blockers({...teacher,scope:{...scope,periodId:null}},context).includes("MISSING_PERIOD"));
 assert.ok(blockers({...teacher,cadence:"semester"},{...context,periodConfigured:false}).includes("MISSING_PERIOD"));
});
test("S4-D.1: published documents require a frozen publication snapshot",()=>{
 const p={...teacher,state:"published",format:"xlsx"};
 assert.ok(blockers(p,context).includes("PUBLICATION_SNAPSHOT_REQUIRED"));
 const ready=planSchoolOfficialExport(p,{...context,publishedSnapshotId:"snapshot-id"});
 assert.equal(ready.eligibleForServerReview,true);
 assert.equal(ready.realDownloadAvailable,false);
 assert.equal(ready.fileExtension,".xlsx");
 assert.equal(ready.statusLabel,"DOCUMENT OFFICIEL PUBLIÉ");
});
test("S4-D.1: unready projection and missing subject selection fail closed",()=>{
 assert.ok(blockers(teacher,{...context,v2ProjectionAvailable:false}).includes("V2_PROJECTION_PENDING"));
 assert.ok(blockers({...teacher,subjectId:null},context).includes("SUBJECT_REQUIRED"));
 assert.ok(blockers({...teacher,kind:"class_general"},context).includes("SUBJECT_NOT_APPLICABLE"));
});
test("S4-D.1: new routes belong exclusively to school_admin and teacher without V1 RPC",()=>{
 assert.match(routes,/path: "teacher\/official-exports", element: <SchoolOfficialDocumentsHub actor="teacher"/);
 assert.match(routes,/path: "school\/official-documents", element: <SchoolOfficialDocumentsHub actor="school_admin"/);
 assert.match(routes,/RoleGate allowed=\{\["teacher"\]\}/);
 assert.match(routes,/RoleGate allowed=\{\["school_admin"\]\}/);
 assert.match(nav,/to="\/app\/teacher\/official-exports"/);
 assert.match(nav,/to="\/app\/school\/official-documents"/);
 assert.match(dashboard,/to="\/app\/school\/official-documents"/);
 assert.match(page,/user\.role === actor/);
 assert.match(page,/!user\.isDemo/);
 assert.match(page,/schoolnet_s4d_demo/);
 assert.match(page,/import\.meta\.env\.DEV/);
 assert.doesNotMatch(page,/supabase\.|publish_admin_report_card|generate_report_cards_for_class|student_period_averages/);
 assert.match(legacy,/generate_report_cards_for_class/);
 assert.match(sqlApi,/schoolnet_school_official_general_averages/);
});
test("S4-D.1: PDF and XLSX buttons truly disabled, with no export of real data",()=>{
 assert.match(page,/<button disabled type="button"[^>]+>\s*Exporter PDF/);
 assert.match(page,/Exporter Excel \(\.xlsx\) — bientôt/);
 assert.match(page,/Aucun fichier exporté à cette étape/);
 assert.match(page,/RECETTE LOCALE — CONFIGURATION 100 % FICTIVE/);
 assert.match(doc,/pondération annuelle/);
 assert.match(doc,/SECURITY/);
 assert.doesNotMatch(page,/Blob\(|saveAs\(|window\.open\(/);
});
test("S4-D.1: draft branch remains nondeploying and no production SQL is written",()=>{
 assert.equal(vercel.git.deploymentEnabled[branch],false);
 assert.equal(pkg.scripts["qa:s4d1"],
  "node --experimental-strip-types --test scripts/test-schoolnet-s4d1-documents-exports.mjs");
 assert.match(ci,/pull_request:/);
 assert.match(ci,/feature\/schoolnet-s4c3c4-general-averages-ui-20261126/);
 assert.match(ci,/permissions:\n  contents: read/);
 assert.match(ci,/persist-credentials: false/);
 assert.doesNotMatch(ci,/supabase (?:link|db push|db reset|migration repair)|secrets\.|SUPABASE_DB_URL|SUPABASE_ACCESS_TOKEN|deploy/);
});
