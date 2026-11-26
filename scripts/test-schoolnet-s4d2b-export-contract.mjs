import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isOfficialExportProjection } from "../src/features/official-documents/lib/schoolOfficialExportProjectionModel.ts";

const file=(path)=>readFileSync(new URL("../"+path,import.meta.url),"utf8").replace(/\r\n/g,"\n");
const sql=file("supabase/proposals/s4d2b_official_export_provisional_preview.sql");
const ci=file(".github/workflows/schoolnet-s4d2b-secure-export-ci.yml");
const docs=file("docs/releases/SCHOOLNET_S4D2B_EXPORT_PROJECTION_2026-11-26.md");
const packageJson=JSON.parse(file("package.json"));
const vercel=JSON.parse(file("vercel.json"));
const branch="feature/schoolnet-s4d2b-secure-export-projection-20261126";
const uid="00000000-0000-4000-8000-000000000010";
const school="00000000-0000-4000-8000-000000000011";
const period="00000000-0000-4000-8000-000000000040";
const cls="00000000-0000-4000-8000-000000000030";
const year="00000000-0000-4000-8000-000000000020";
const audit="00000000-0000-4000-8000-000000000099";
const math="00000000-0000-4000-8000-000000000050";
const scope={schoolId:school,periodId:period,classId:cls,kind:"class_general",subjectId:null,format:"pdf"};
const base={
 projection:"schoolnet_v2_export_provisional_v1",previewOnly:true,
 documentState:"provisional",kind:"class_general",format:"pdf",schoolId:school,
 schoolYearId:year,classId:cls,periodId:period,subjectId:null,
 completionUnit:"matières",studentCount:2,auditId:audit,
 students:[
  {studentId:uid,studentName:"Élève fictif A",state:"ready",
   averageOn20:0,completedItems:3,expectedItems:3},
  {studentId:"00000000-0000-4000-8000-000000000012",
   studentName:"Élève fictif B",state:"incomplete",averageOn20:null,
   completedItems:2,expectedItems:3}
 ]
};
const copy=(x)=>structuredClone(x);

test("S4-D.2b: server preview is strict school, class, period, state and exact shape",()=>{
 assert.equal(isOfficialExportProjection(base,scope),true);
 assert.equal(isOfficialExportProjection({...base,schoolId:"another-school"},scope),false);
 assert.equal(isOfficialExportProjection({...base,periodId:"wrong"},scope),false);
 assert.equal(isOfficialExportProjection({...base,classId:"wrong"},scope),false);
 assert.equal(isOfficialExportProjection({...base,documentState:"published"},scope),false);
 assert.equal(isOfficialExportProjection({...base,previewOnly:false},scope),false);
 assert.equal(isOfficialExportProjection({...base,auditId:"not-uuid"},scope),false);
 assert.equal(isOfficialExportProjection({...base,secret:"extra"},scope),false);
 assert.equal(isOfficialExportProjection({...base,students:[base.students[0]]},scope),false);
});
test("S4-D.2b: teacher projection requires a subject and evaluation units",()=>{
 const teacher={...scope,kind:"subject_period",subjectId:math,format:"xlsx"};
 const data={...base,kind:"subject_period",subjectId:math,format:"xlsx",completionUnit:"évaluations"};
 assert.equal(isOfficialExportProjection(data,teacher),true);
 assert.equal(isOfficialExportProjection({...data,completionUnit:"matières"},teacher),false);
 assert.equal(isOfficialExportProjection({...data,subjectId:null},teacher),false);
});
test("S4-D.2b: valid zero is retained, invalid or missing values never become zero",()=>{
 assert.equal(isOfficialExportProjection(base,scope),true);
 let value=copy(base);value.students[0].averageOn20=null;
 assert.equal(isOfficialExportProjection(value,scope),false);
 value=copy(base);value.students[1].averageOn20=0;
 assert.equal(isOfficialExportProjection(value,scope),false);
 value=copy(base);value.students[0].averageOn20=20.00001;
 assert.equal(isOfficialExportProjection(value,scope),false);
 value=copy(base);value.students[0].completedItems=2;
 assert.equal(isOfficialExportProjection(value,scope),false);
 value=copy(base);value.students[1].assessmentId="secret";
 assert.equal(isOfficialExportProjection(value,scope),false);
 value=copy(base);value.students[1].studentId=uid;
 assert.equal(isOfficialExportProjection(value,scope),false);
});
test("S4-D.2b: SQL proposal uses exclusively approved existing school-scoped sources",()=>{
 assert.match(sql,/schoolnet_private\.school_official_general_averages\(/);
 assert.match(sql,/schoolnet_private\.teacher_official_subject_averages\(/);
 assert.match(sql,/auth\.uid\(\)/);
 assert.match(sql,/public\.get_my_role\(\)/);
 assert.match(sql,/member_role=v_role AND m\.status='active' AND m\.revoked_at IS NULL/);
 assert.match(sql,/v_source->>'schoolId' IS DISTINCT FROM p_school_id::text/);
 assert.match(sql,/v_source->>'classId' IS DISTINCT FROM p_class_id::text/);
 assert.match(sql,/v_source->>'periodId' IS DISTINCT FROM p_period_id::text/);
 assert.match(sql,/p_document_state IS DISTINCT FROM 'provisional'/);
 assert.match(sql,/p_format IS NULL OR p_format NOT IN \('pdf','xlsx'\)/);
 assert.doesNotMatch(sql,/FROM public\.assessment_submissions|JOIN public\.assessment_submissions/i);
 assert.doesNotMatch(sql,/(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+)?public\./i);
});
test("S4-D.2b: private audit has no scores or student identifiers and cannot be queried",()=>{
 const create=sql.slice(sql.indexOf("CREATE TABLE schoolnet_private.school_export_preview_audit"),sql.indexOf("CREATE INDEX s4d2b_export_issue_audit_scope"));
 assert.match(create,/actor_id uuid NOT NULL/);
 assert.match(create,/student_count integer NOT NULL/);
 assert.doesNotMatch(create,/\bscore\b|\bstudent_id\b|\bname\b|\braw\b|\bjson\b|token|email/i);
 assert.match(sql,/ALTER TABLE schoolnet_private\.school_export_preview_audit ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/REVOKE ALL ON TABLE schoolnet_private\.school_export_preview_audit/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.schoolnet_official_export_preview/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.schoolnet_official_export_preview/);
 assert.match(sql,/SECURITY INVOKER/);
 assert.match(sql,/SECURITY DEFINER SET search_path=pg_catalog/);
 assert.match(sql,/has_function_privilege\('anon'/);
});
test("S4-D.2b: no unsupported official or annual documents are produced",()=>{
 assert.match(sql,/school_admin' AND p_kind='class_general'/);
 assert.match(sql,/teacher' AND p_kind='subject_period'/);
 assert.match(sql,/S4D2B_EXPORT_PERMISSION_NOT_IMPLEMENTED/);
 assert.doesNotMatch(sql,/CREATE FUNCTION\s+[^\s]*(?:pdf_render|xlsx_render)|snapshot_sign|annual_avg/i);
 assert.match(docs,/annuel|annuelle/);
 assert.match(docs,/aucun déploiement/i);
});
test("S4-D.2b: isolated real Auth CI and nonproduction workflows",()=>{
 assert.equal(vercel.git.deploymentEnabled[branch],false);
 assert.equal(packageJson.scripts["qa:s4d2b"],
  "node --experimental-strip-types --test scripts/test-schoolnet-s4d2b-export-contract.mjs");
 assert.match(ci,/pull_request:/);
 assert.match(ci,/feature\/schoolnet-s4d2a-fictitious-pdf-xlsx-renderers-20261126/);
 assert.match(ci,/supabase\/setup-cli@v1/);
 assert.match(ci,/official-export-http\.mjs/);
 assert.match(ci,/permissions:\n  contents: read/);
 assert.match(ci,/persist-credentials: false/);
 assert.doesNotMatch(ci,/secrets\.|SUPABASE_DB_URL|SUPABASE_ACCESS_TOKEN|db push|migration repair|--linked|vercel deploy/);
});
