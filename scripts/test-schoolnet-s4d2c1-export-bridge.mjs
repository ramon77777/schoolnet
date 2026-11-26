import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  OFFICIAL_EXPORT_RPC_NAME, SCHOOLNET_REAL_EXPORTS_RELEASED,
  makeOfficialExportRpcArgs, assertMatchingOfficialExportProjection,
  isExportRpcNotInstalled, reviewOfficialExportWithRpc,
} from "../src/features/official-documents/lib/schoolOfficialExportPreviewBridge.ts";

const path=(p)=>readFileSync(new URL("../"+p,import.meta.url),"utf8").replace(/\r\n/g,"\n");
const schoolA="00000000-0000-4000-8000-000000000010";
const schoolB="00000000-0000-4000-8000-000000000011";
const year="00000000-0000-4000-8000-000000000020";
const cls="00000000-0000-4000-8000-000000000030";
const period="00000000-0000-4000-8000-000000000040";
const math="00000000-0000-4000-8000-000000000050";
const teacherId="00000000-0000-4000-8000-000000000060";
const adminId="00000000-0000-4000-8000-000000000061";
const studentA="00000000-0000-4000-8000-000000000070";
const studentB="00000000-0000-4000-8000-000000000071";
const auditId="00000000-0000-4000-8000-000000000080";
const teacher={id:teacherId,role:"teacher",isDemo:false};
const admin={id:adminId,role:"school_admin",isDemo:false};
const scope={schoolId:schoolA,schoolYearId:year,classId:cls,periodId:period};
const tReq={viewerId:teacherId,role:"teacher",scope,kind:"subject_period",
  cadence:"trimester",state:"provisional",format:"pdf",subjectId:math};
const aReq={...tReq,viewerId:adminId,role:"school_admin",kind:"class_general",subjectId:null};

const reply={
 projection:"schoolnet_v2_export_provisional_v1",previewOnly:true,
 documentState:"provisional",kind:"subject_period",format:"pdf",
 schoolId:schoolA,schoolYearId:year,classId:cls,periodId:period,
 subjectId:math,completionUnit:"évaluations",studentCount:2,auditId,
 students:[
  {studentId:studentA,studentName:"Élève test A",state:"ready",
   averageOn20:0,completedItems:3,expectedItems:3},
  {studentId:studentB,studentName:"Élève test B",state:"incomplete",
   averageOn20:null,completedItems:2,expectedItems:3},
 ]
};
const clone=(x)=>structuredClone(x);

test("S4-D.2c.1: teacher request generates an exact server RPC allowlist",()=>{
 const args=makeOfficialExportRpcArgs(tReq,teacher);
 assert.deepEqual(args,{
  p_school_id:schoolA,p_period_id:period,p_class_id:cls,
  p_kind:"subject_period",p_subject_id:math,p_format:"pdf",
  p_document_state:"provisional"
 });
 assert.equal(OFFICIAL_EXPORT_RPC_NAME,"schoolnet_official_export_preview");
 assert.ok(!JSON.stringify(args).includes(teacherId));
 assert.ok(!JSON.stringify(args).includes(year));
});
test("S4-D.2c.1: school administrator request allows class general only",()=>{
 assert.deepEqual(makeOfficialExportRpcArgs(aReq,admin),{
  p_school_id:schoolA,p_period_id:period,p_class_id:cls,
  p_kind:"class_general",p_subject_id:null,p_format:"pdf",
  p_document_state:"provisional"
 });
 assert.throws(()=>makeOfficialExportRpcArgs({...aReq,kind:"subject_period",subjectId:math},admin));
 assert.throws(()=>makeOfficialExportRpcArgs({...aReq,kind:"class_subjects"},admin));
});
test("S4-D.2c.1: role mismatch, missing auth, and demo users fail closed",()=>{
 assert.throws(()=>makeOfficialExportRpcArgs(tReq,null));
 assert.throws(()=>makeOfficialExportRpcArgs(tReq,{...teacher,isDemo:true}));
 assert.throws(()=>makeOfficialExportRpcArgs(tReq,admin));
 assert.throws(()=>makeOfficialExportRpcArgs({...tReq,viewerId:adminId},teacher));
 assert.throws(()=>makeOfficialExportRpcArgs({...tReq,role:"school_admin"},teacher));
 assert.throws(()=>makeOfficialExportRpcArgs({...tReq,viewerId:"not-a-uuid"},teacher));
});
test("S4-D.2c.1: no unapproved annual, published, subjectless or foreign scope",()=>{
 assert.throws(()=>makeOfficialExportRpcArgs({...tReq,cadence:"annual",scope:{...scope,periodId:null}},teacher));
 assert.throws(()=>makeOfficialExportRpcArgs({...tReq,state:"published"},teacher));
 assert.throws(()=>makeOfficialExportRpcArgs({...tReq,kind:"class_general",subjectId:null},teacher));
 assert.throws(()=>makeOfficialExportRpcArgs({...tReq,subjectId:null},teacher));
 assert.throws(()=>makeOfficialExportRpcArgs({...tReq,subjectId:"bad"},teacher));
 assert.throws(()=>makeOfficialExportRpcArgs({...tReq,scope:{...scope,schoolId:"bad"}},teacher));
 assert.throws(()=>makeOfficialExportRpcArgs({...tReq,scope:{...scope,periodId:null}},teacher));
 assert.throws(()=>makeOfficialExportRpcArgs({...tReq,scope:{...scope,schoolYearId:"bad"}},teacher));
});
test("S4-D.2c.1: strict response checking also validates school YEAR",()=>{
 const result=assertMatchingOfficialExportProjection(reply,tReq,teacher);
 assert.equal(result.students[0].averageOn20,0);
 assert.equal(result.students[1].averageOn20,null);
 assert.throws(()=>assertMatchingOfficialExportProjection({...reply,schoolId:schoolB},tReq,teacher));
 assert.throws(()=>assertMatchingOfficialExportProjection({...reply,schoolYearId:schoolB},tReq,teacher));
 assert.throws(()=>assertMatchingOfficialExportProjection({...reply,format:"xlsx"},tReq,teacher));
 assert.throws(()=>assertMatchingOfficialExportProjection({...reply,documentState:"published"},tReq,teacher));
 assert.throws(()=>assertMatchingOfficialExportProjection({...reply,completionUnit:"matières"},tReq,teacher));
 assert.throws(()=>assertMatchingOfficialExportProjection({...reply,students:reply.students.map(x=>({...x,score:5}))},tReq,teacher));
 assert.throws(()=>assertMatchingOfficialExportProjection({...reply,students:reply.students.map(x=>({...x,studentId:studentA}))},tReq,teacher));
});
test("S4-D.2c.1: server format, state and type cannot masquerade",()=>{
 const r={...reply,kind:"class_general",subjectId:null,completionUnit:"matières"};
 const valid=assertMatchingOfficialExportProjection(r,aReq,admin);
 assert.equal(valid.kind,"class_general");
 assert.throws(()=>assertMatchingOfficialExportProjection(r,tReq,teacher));
 assert.throws(()=>assertMatchingOfficialExportProjection({...r,completionUnit:"évaluations"},aReq,admin));
 assert.throws(()=>assertMatchingOfficialExportProjection({...r,students:[...r.students,{...r.students[0]}]},aReq,admin));
});
test("S4-D.2c.1: only absent PostgREST function is classified activation-pending",()=>{
 assert.equal(isExportRpcNotInstalled({code:"PGRST202"}),true);
 assert.equal(isExportRpcNotInstalled({code:"42883"}),true);
 for(const error of [{code:"42501"},{code:"PGRST205"},null,{},new Error("network")])
  assert.equal(isExportRpcNotInstalled(error),false);
});
test("S4-D.2c.1: runtime gate refuses any real request without invoking transport",async()=>{
 assert.equal(SCHOOLNET_REAL_EXPORTS_RELEASED,false);
 let calls=0;
 const transport=async()=>{calls++;return{data:reply,error:null}};
 await assert.rejects(reviewOfficialExportWithRpc(tReq,teacher,transport),/Activation SQL/);
 await assert.rejects(reviewOfficialExportWithRpc(aReq,admin,transport),/Activation SQL/);
 await assert.rejects(reviewOfficialExportWithRpc({...tReq,subjectId:"bad"},teacher,transport));
 assert.equal(calls,0,"no JWT call, audit or identifiable student data sent before release");
});
test("S4-D.2c.1: production/DEV has no page integration, no fallback and no Vercel build",()=>{
 const bridge=path("src/features/official-documents/lib/schoolOfficialExportPreviewBridge.ts");
 const hub=path("src/features/official-documents/pages/SchoolOfficialDocumentsHub.tsx");
 const model=path("src/features/official-documents/lib/schoolOfficialExportProjectionModel.ts");
 const vercel=JSON.parse(path("vercel.json"));
 const pkg=JSON.parse(path("package.json"));
 assert.ok(bridge.includes("SCHOOLNET_REAL_EXPORTS_RELEASED = false"));
 assert.ok(!hub.includes("schoolOfficialExportPreviewBridge"));
 assert.ok(!hub.includes("schoolnet_official_export_preview"));
 assert.ok(!bridge.includes("schoolFictitiousExport"));
 assert.ok(!bridge.includes("assessment_submissions"));
 assert.ok(!bridge.includes("supabase.from("));
 assert.ok(model.includes("isOfficialExportProjection"));
 assert.equal(vercel.git.deploymentEnabled["feature/schoolnet-s4d2c1-provisional-export-api-20261126"],false);
 assert.equal(pkg.scripts["qa:s4d2c1"],
  "node --experimental-strip-types --test scripts/test-schoolnet-s4d2c1-export-bridge.mjs");
});
